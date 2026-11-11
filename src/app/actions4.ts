'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getContext } from '@/lib/context';
import { admin, hasAdmin } from '@/lib/supabase/admin';
import { cancelOrder, createOrder, createPaymentLink, deliverOrder, dispatchOrder, recordManualPayment, syncPayment } from '@/lib/orders';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
function go(path: string, kind: 'msg' | 'err', text: string): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}`);
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SALES = ['owner', 'manager', 'sales'], MANAGE = ['owner', 'manager'], SHIP = ['owner', 'manager', 'fulfilment'];

async function gate(roles: string[], back: string) {
  const ctx = await getContext();
  if (!roles.includes(ctx.role)) go(back, 'err', 'Your role does not allow this action.');
  if (!hasAdmin()) go(back, 'err', 'The server is missing SUPABASE_SERVICE_ROLE_KEY.');
  return ctx;
}
async function ownOrder(ctx: Awaited<ReturnType<typeof getContext>>, id: string) {
  if (!uuid.test(id)) go('/orders', 'err', 'Order not found.');
  const { data } = await ctx.db.from('orders').select('id').eq('id', id).eq('business_id', ctx.business.id).maybeSingle();
  if (!data) go('/orders', 'err', 'Order not found.');
}

export async function createManualOrder(f: FormData) {
  const ctx = await gate(SALES, '/orders');
  const phone = str(f, 'phone').replace(/\D/g, ''), name = str(f, 'name'), pid = str(f, 'product_id');
  if (phone.length < 10) go('/orders/new', 'err', 'Enter the customer phone number with country code, for example 919876543210.');
  if (!name) go('/orders/new', 'err', 'Enter the customer name.');
  if (!uuid.test(pid)) go('/orders/new', 'err', 'Choose a product.');
  const db = admin();
  await db.from('customers').upsert({ business_id: ctx.business.id, phone, name }, { onConflict: 'business_id,phone', ignoreDuplicates: true });
  const { data: c } = await db.from('customers').select('id').eq('business_id', ctx.business.id).eq('phone', phone).single();
  const r = await createOrder({ bid: ctx.business.id, customerId: c!.id, items: [{ productId: pid, variant: str(f, 'variant'), size: str(f, 'size'), qty: Number(str(f, 'qty')) || 1 }], address: str(f, 'address') });
  if ('error' in r) go('/orders/new', 'err', r.error);
  revalidatePath('/orders');
  go(`/orders/${r.id}`, 'msg', 'Order created. Send the payment link next.');
}

export async function createOrderFromConversation(f: FormData) {
  const ctx = await gate(SALES, '/inbox');
  const cid = str(f, 'id'), back = `/inbox?c=${cid}`;
  if (!uuid.test(cid)) go('/inbox', 'err', 'Conversation not found.');
  const db = admin();
  const { data: conv } = await db.from('conversations').select('id,customer_id,campaign_id,platform,draft_order').eq('id', cid).eq('business_id', ctx.business.id).single();
  const d = (conv?.draft_order ?? {}) as { sku?: string; variant?: string; size?: string; qty?: number; address?: string };
  if (!conv || !d.sku || !d.address) go(back, 'err', 'The order draft is missing the product or the address.');
  const { data: p } = await db.from('products').select('id').eq('business_id', ctx.business.id).eq('sku', d.sku!).maybeSingle();
  if (!p) go(back, 'err', 'The drafted product no longer exists.');
  const { data: dup } = await db.from('orders').select('id').eq('conversation_id', cid).neq('status', 'cancelled').limit(1).maybeSingle();
  if (dup) go(`/orders/${dup.id}`, 'msg', 'An order already exists for this conversation.');
  const r = await createOrder({ bid: ctx.business.id, customerId: conv!.customer_id, conversationId: cid, campaignId: conv!.campaign_id, platform: conv!.platform, items: [{ productId: p!.id, variant: d.variant, size: d.size, qty: d.qty ?? 1 }], address: d.address! });
  if ('error' in r) go(back, 'err', r.error);
  go(`/orders/${r.id}`, 'msg', 'Order created from the conversation. Send the payment link next.');
}

export async function sendPaymentLink(f: FormData) {
  const ctx = await gate(SALES, '/orders');
  const id = str(f, 'id'); await ownOrder(ctx, id);
  const r = await createPaymentLink(ctx.business.id, id);
  if ('error' in r) go(`/orders/${id}`, 'err', r.error);
  go(`/orders/${id}`, 'msg', r.sent ? 'Payment link created and sent to the customer on WhatsApp.' : 'Payment link created. It was not sent on WhatsApp (not connected, or a test customer), so copy it and share it yourself.');
}

export async function checkPayment(f: FormData) {
  const ctx = await gate(SALES, '/orders');
  const id = str(f, 'id'); await ownOrder(ctx, id);
  const r = await syncPayment(ctx.business.id, id);
  if ('error' in r) go(`/orders/${id}`, 'err', r.error);
  go(`/orders/${id}`, 'msg', r.status === 'paid' ? 'Payment confirmed by Razorpay. Order marked paid.' : `Razorpay says the link is ${r.status}. Nothing has been paid yet.`);
}

export async function markPaidManually(f: FormData) {
  const ctx = await gate(MANAGE, '/orders');
  const id = str(f, 'id'), note = str(f, 'note'); await ownOrder(ctx, id);
  if (note.length < 3) go(`/orders/${id}`, 'err', 'Write how the money was received, for example "UPI to shop account, ref 1234".');
  const r = await recordManualPayment(ctx.business.id, id, note);
  if ('error' in r) go(`/orders/${id}`, 'err', r.error);
  go(`/orders/${id}`, 'msg', 'Payment recorded and the order is marked paid.');
}

export async function dispatchAction(f: FormData) {
  const ctx = await gate(SHIP, '/orders');
  const id = str(f, 'id'), courier = str(f, 'courier'), tracking = str(f, 'tracking'); await ownOrder(ctx, id);
  if (!courier || !tracking) go(`/orders/${id}`, 'err', 'Enter the courier and the tracking number.');
  const r = await dispatchOrder(ctx.business.id, id, courier, tracking);
  if ('error' in r) go(`/orders/${id}`, 'err', r.error);
  go(`/orders/${id}`, 'msg', 'Dispatched. The customer has been sent the tracking details when WhatsApp is connected.');
}

export async function deliverAction(f: FormData) {
  const ctx = await gate(SHIP, '/orders');
  const id = str(f, 'id'); await ownOrder(ctx, id);
  const r = await deliverOrder(ctx.business.id, id);
  if ('error' in r) go(`/orders/${id}`, 'err', r.error);
  go(`/orders/${id}`, 'msg', 'Marked as delivered.');
}

export async function cancelAction(f: FormData) {
  const ctx = await gate(SALES, '/orders');
  const id = str(f, 'id'); await ownOrder(ctx, id);
  const r = await cancelOrder(ctx.business.id, id, str(f, 'reason'));
  if ('error' in r) go(`/orders/${id}`, 'err', r.error);
  go(`/orders/${id}`, 'msg', 'Order cancelled and the stock was put back.');
}
