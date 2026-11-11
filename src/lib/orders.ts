import { createHmac, timingSafeEqual } from 'node:crypto';
import { admin } from '@/lib/supabase/admin';
import { getChannelToken, getSecret } from '@/lib/secrets';
import { sendWhatsAppText } from '@/lib/meta';

const TEST_PHONE = '910000000000';
const inr = (n: number) => '₹' + Number(n).toLocaleString('en-IN');
export type ItemInput = { productId: string; variant?: string | null; size?: string | null; qty: number };

/** Sends a WhatsApp message to a customer and records it in the conversation. Never throws. */
export async function notifyCustomer(bid: string, customerId: string, text: string, conversationId?: string | null) {
  const db = admin();
  try {
    const { data: c } = await db.from('customers').select('phone').eq('id', customerId).eq('business_id', bid).single();
    if (!c || c.phone === TEST_PHONE) return { sent: false };
    const [token, { data: acct }] = await Promise.all([getChannelToken(bid, 'whatsapp'), db.from('social_accounts').select('external_id').eq('business_id', bid).eq('platform', 'whatsapp').maybeSingle()]);
    if (!token || !acct?.external_id) return { sent: false };
    await sendWhatsAppText(acct.external_id, token, c.phone, text);
    if (conversationId) await db.from('messages').insert({ business_id: bid, conversation_id: conversationId, sender: 'system', body: `Sent to customer: ${text}` });
    return { sent: true };
  } catch (e) {
    return { sent: false, error: (e as Error).message };
  }
}

const setStage = (bid: string, conversationId: string | null | undefined, stage: string) =>
  conversationId ? admin().from('conversations').update({ stage, last_message_at: new Date().toISOString() }).eq('id', conversationId).eq('business_id', bid) : Promise.resolve();

export async function createOrder(a: { bid: string; customerId: string; conversationId?: string | null; campaignId?: string | null; platform?: string | null; items: ItemInput[]; address: string }): Promise<{ id: string } | { error: string }> {
  const db = admin();
  if (!a.items.length) return { error: 'Add at least one item.' };
  if (a.address.trim().length < 10 || !/\b\d{6}\b/.test(a.address)) return { error: 'Enter the full delivery address including the 6-digit pincode.' };
  const ids = [...new Set(a.items.map((i) => i.productId))];
  const [{ data: prods }, { data: biz }] = await Promise.all([
    db.from('products').select('id,name,price,discount_price,active,stock,variants,sizes').eq('business_id', a.bid).in('id', ids),
    db.from('businesses').select('free_delivery_threshold,delivery_fee').eq('id', a.bid).single(),
  ]);
  if (!biz) return { error: 'Business not found.' };
  let gross = 0, savings = 0;
  const lines: { p: NonNullable<typeof prods>[number]; i: ItemInput; unit: number }[] = [];
  for (const i of a.items) {
    const p = prods?.find((x) => x.id === i.productId);
    if (!p || !p.active) return { error: 'One of the products is not available.' };
    if (!Number.isInteger(i.qty) || i.qty < 1 || i.qty > 50) return { error: 'Quantity must be between 1 and 50.' };
    const price = Number(p.price), unit = p.discount_price && Number(p.discount_price) < price ? Number(p.discount_price) : price;
    gross += price * i.qty; savings += (price - unit) * i.qty;
    lines.push({ p, i, unit });
  }
  const net = gross - savings;
  const delivery = net >= Number(biz.free_delivery_threshold) ? 0 : Number(biz.delivery_fee);
  const total = net + delivery;

  const reserved: { id: string; qty: number }[] = [];
  const release = async () => { for (const r of reserved) await db.rpc('release_stock', { p_product: r.id, p_business: a.bid, p_qty: r.qty }); };
  for (const l of lines) {
    const { data: ok } = await db.rpc('reserve_stock', { p_product: l.p.id, p_business: a.bid, p_qty: l.i.qty });
    if (!ok) { await release(); return { error: `Not enough stock for ${l.p.name}.` }; }
    reserved.push({ id: l.p.id, qty: l.i.qty });
  }
  const { data: code, error: ce } = await db.rpc('next_code', { bid: a.bid, p_kind: 'order', prefix: 'GX-O-' });
  if (ce) { await release(); return { error: ce.message }; }
  const { data: order, error } = await db.from('orders').insert({
    business_id: a.bid, code, conversation_id: a.conversationId ?? null, customer_id: a.customerId, campaign_id: a.campaignId ?? null, platform: a.platform ?? null,
    address: a.address.trim(), subtotal: gross, discount: savings, delivery_charge: delivery, total,
  }).select('id').single();
  if (error) { await release(); return { error: error.message }; }
  const { error: ie } = await db.from('order_items').insert(lines.map((l) => ({ business_id: a.bid, order_id: order.id, product_id: l.p.id, name: l.p.name, variant: l.i.variant || null, size: l.i.size || null, quantity: l.i.qty, unit_price: l.unit })));
  if (ie) { await db.from('orders').delete().eq('id', order.id); await release(); return { error: ie.message }; }
  await setStage(a.bid, a.conversationId, 'order_created');
  return { id: order.id };
}

const rzAuth = async (bid: string) => {
  const [id, secret] = await Promise.all([getSecret(bid, 'razorpay_key_id'), getSecret(bid, 'razorpay_key_secret')]);
  return id && secret ? 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64') : null;
};

export async function createPaymentLink(bid: string, orderId: string): Promise<{ url: string; sent: boolean } | { error: string }> {
  const db = admin();
  const { data: o } = await db.from('orders').select('id,code,status,total,conversation_id,customer:customers(id,name,phone)').eq('id', orderId).eq('business_id', bid).single();
  if (!o) return { error: 'Order not found.' };
  if (o.status !== 'payment_pending') return { error: 'This order is not waiting for payment.' };
  const customer = o.customer as unknown as { id: string; name: string; phone: string };
  const { data: existing } = await db.from('payments').select('link_url').eq('order_id', orderId).eq('business_id', bid).eq('status', 'pending').not('link_url', 'is', null).limit(1).maybeSingle();
  let url = existing?.link_url as string | undefined;
  if (!url) {
    const auth = await rzAuth(bid);
    if (!auth) return { error: 'Add your Razorpay keys in Settings first.' };
    const { data: b } = await db.from('businesses').select('name').eq('id', bid).single();
    const res = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Math.round(Number(o.total) * 100), currency: 'INR', accept_partial: false, reference_id: o.code,
        description: `Order ${o.code} from ${b?.name ?? 'our store'}`, customer: { name: customer.name, contact: '+' + customer.phone.replace(/\D/g, '') },
        notify: { sms: false, email: false }, reminder_enable: false, expire_by: Math.floor(Date.now() / 1000) + 7 * 86400,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { error: `Razorpay: ${j?.error?.description ?? res.status}` };
    const { error } = await db.from('payments').insert({ business_id: bid, order_id: orderId, provider: 'razorpay', provider_link_id: j.id, link_url: j.short_url, status: 'pending', amount: o.total });
    if (error) return { error: error.message };
    url = j.short_url as string;
  }
  await setStage(bid, o.conversation_id, 'payment_pending');
  const n = await notifyCustomer(bid, customer.id, `Your order ${o.code} is ready. Total ${inr(Number(o.total))}. Pay securely here: ${url}`, o.conversation_id);
  return { url, sent: n.sent };
}

/** Marks a payment verified and the order paid. Safe to call repeatedly. */
export async function recordPaid(bid: string, paymentId: string, providerPaymentId: string | null, raw: unknown) {
  const db = admin();
  const { data: p } = await db.from('payments').select('id,order_id,status,amount').eq('id', paymentId).eq('business_id', bid).single();
  if (!p || p.status === 'paid') return false;
  const { error } = await db.from('payments').update({ status: 'paid', verified_at: new Date().toISOString(), provider_payment_id: providerPaymentId, raw: raw ?? null }).eq('id', paymentId).eq('status', 'pending');
  if (error) return false;
  const { data: o } = await db.from('orders').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', p.order_id).eq('business_id', bid).eq('status', 'payment_pending').select('code,total,conversation_id,customer_id').maybeSingle();
  if (o) {
    await setStage(bid, o.conversation_id, 'paid');
    await notifyCustomer(bid, o.customer_id, `Payment of ${inr(Number(o.total))} received for order ${o.code}. Thank you! We will share tracking details when it ships.`, o.conversation_id);
  }
  return true;
}

/** Asks Razorpay directly whether the link was paid (fallback when the webhook is not set up). */
export async function syncPayment(bid: string, orderId: string): Promise<{ status: string } | { error: string }> {
  const db = admin();
  const { data: p } = await db.from('payments').select('id,provider_link_id,amount,status').eq('order_id', orderId).eq('business_id', bid).eq('provider', 'razorpay').not('provider_link_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!p) return { error: 'There is no payment link for this order yet.' };
  if (p.status === 'paid') return { status: 'paid' };
  const auth = await rzAuth(bid);
  if (!auth) return { error: 'Add your Razorpay keys in Settings first.' };
  const res = await fetch(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(p.provider_link_id)}`, { headers: { Authorization: auth } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { error: `Razorpay: ${j?.error?.description ?? res.status}` };
  if (j.status === 'paid' && Number(j.amount_paid) === Math.round(Number(p.amount) * 100)) {
    await recordPaid(bid, p.id, j.payments?.[0]?.payment_id ?? null, j);
    return { status: 'paid' };
  }
  if (j.status === 'expired' || j.status === 'cancelled') await db.from('payments').update({ status: 'failed' }).eq('id', p.id).eq('status', 'pending');
  return { status: j.status as string };
}

/** Owner or manager records a payment taken outside Razorpay (cash, bank transfer, UPI to the shop). */
export async function recordManualPayment(bid: string, orderId: string, note: string): Promise<{ ok: true } | { error: string }> {
  const db = admin();
  const { data: o } = await db.from('orders').select('id,total,status').eq('id', orderId).eq('business_id', bid).single();
  if (!o || o.status !== 'payment_pending') return { error: 'This order is not waiting for payment.' };
  const { data: pay, error } = await db.from('payments').insert({ business_id: bid, order_id: orderId, provider: 'manual', status: 'pending', amount: o.total, raw: { note } }).select('id').single();
  if (error) return { error: error.message };
  await recordPaid(bid, pay.id, null, { note, manual: true });
  return { ok: true as const };
}

export async function dispatchOrder(bid: string, orderId: string, courier: string, tracking: string): Promise<{ ok: true } | { error: string }> {
  const db = admin();
  const { data: o } = await db.from('orders').select('id,code,status,conversation_id,customer_id').eq('id', orderId).eq('business_id', bid).single();
  if (!o) return { error: 'Order not found.' };
  if (o.status !== 'paid') return { error: 'Only paid orders can be dispatched.' };
  const { error } = await db.from('shipments').insert({ business_id: bid, order_id: orderId, courier, tracking_no: tracking });
  if (error) return { error: error.message };
  const { error: e2 } = await db.from('orders').update({ status: 'dispatched', updated_at: new Date().toISOString() }).eq('id', orderId).eq('status', 'paid');
  if (e2) return { error: e2.message };
  await setStage(bid, o.conversation_id, 'dispatched');
  await notifyCustomer(bid, o.customer_id, `Good news! Order ${o.code} has been dispatched via ${courier}. Tracking number: ${tracking}.`, o.conversation_id);
  return { ok: true };
}

export async function deliverOrder(bid: string, orderId: string): Promise<{ ok: true } | { error: string }> {
  const db = admin();
  const { data: o } = await db.from('orders').select('id,code,status,conversation_id,customer_id').eq('id', orderId).eq('business_id', bid).single();
  if (!o || o.status !== 'dispatched') return { error: 'Only dispatched orders can be marked delivered.' };
  await db.from('shipments').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('order_id', orderId);
  await db.from('orders').update({ status: 'delivered', updated_at: new Date().toISOString() }).eq('id', orderId);
  await setStage(bid, o.conversation_id, 'delivered');
  await notifyCustomer(bid, o.customer_id, `Order ${o.code} has been delivered. Thank you for shopping with us! Reply here if anything is not right.`, o.conversation_id);
  return { ok: true };
}

export async function cancelOrder(bid: string, orderId: string, reason: string): Promise<{ ok: true } | { error: string }> {
  const db = admin();
  const { data: o } = await db.from('orders').select('id,status,stock_released,conversation_id').eq('id', orderId).eq('business_id', bid).single();
  if (!o) return { error: 'Order not found.' };
  if (o.status !== 'payment_pending') return { error: 'Only orders waiting for payment can be cancelled here. Paid orders need a refund through Razorpay first.' };
  const { data: links } = await db.from('payments').select('id,provider_link_id,provider').eq('order_id', orderId).eq('status', 'pending');
  const auth = await rzAuth(bid);
  for (const l of links ?? []) {
    if (l.provider === 'razorpay' && l.provider_link_id && auth) await fetch(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(l.provider_link_id)}/cancel`, { method: 'POST', headers: { Authorization: auth } }).catch(() => null);
    await db.from('payments').update({ status: 'failed' }).eq('id', l.id);
  }
  const { error } = await db.from('orders').update({ status: 'cancelled', cancelled_reason: reason || null, stock_released: true, updated_at: new Date().toISOString() }).eq('id', orderId).eq('status', 'payment_pending');
  if (error) return { error: error.message };
  if (!o.stock_released) {
    const { data: items } = await db.from('order_items').select('product_id,quantity').eq('order_id', orderId);
    for (const it of items ?? []) if (it.product_id) await db.rpc('release_stock', { p_product: it.product_id, p_business: bid, p_qty: it.quantity });
  }
  await setStage(bid, o.conversation_id, 'interested');
  return { ok: true };
}

export function razorpaySignatureOk(raw: string, header: string | null, secret: string | null) {
  if (!secret || !header) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}
