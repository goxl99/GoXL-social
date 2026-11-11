import { createHmac, timingSafeEqual } from 'node:crypto';
import { admin } from '@/lib/supabase/admin';
import { decide, type Biz, type Draft, type Product, type Turn } from '@/lib/ai/assistant';
import { sendWhatsAppImage, sendWhatsAppText } from '@/lib/meta';

export const BUCKET = 'gx-business-assets';
const pub = (path: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

/** Public base URL of this app including the base path, e.g. https://goxl.in/business-live */
export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');

type WaMessage = { id: string; from: string; type: string; text?: { body: string }; button?: { text: string }; interactive?: { button_reply?: { title: string }; list_reply?: { title: string } } };

function textOf(m: WaMessage): string {
  if (m.type === 'text') return m.text?.body ?? '';
  if (m.type === 'button') return m.button?.text ?? '';
  if (m.type === 'interactive') return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '';
  return '';
}

/** Handles one WhatsApp Cloud API webhook payload (already signature-verified). */
export async function handleWhatsAppPayload(payload: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const db = admin();
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value;
      const phoneNumberId: string | undefined = v?.metadata?.phone_number_id;
      if (!phoneNumberId || !Array.isArray(v?.messages)) continue;
      const { data: acct } = await db.from('social_accounts').select('business_id').eq('platform', 'whatsapp').eq('external_id', phoneNumberId).maybeSingle();
      if (!acct) continue;
      const bid = acct.business_id as string;
      for (const m of v.messages as WaMessage[]) {
        const name: string = v.contacts?.find((c: any) => c.wa_id === m.from)?.profile?.name ?? m.from; // eslint-disable-line @typescript-eslint/no-explicit-any
        const body = textOf(m) || (m.type === 'image' ? '[Customer sent an image]' : `[Unsupported message: ${m.type}]`);
        await ingest(bid, m.from, name, body, m.id, false);
      }
    }
  }
}

/** Stores a customer message, creates customer and conversation when needed, then runs the assistant. Returns the conversation id. */
export async function ingest(bid: string, phone: string, name: string, body: string, externalId: string | null, isTest: boolean) {
  const db = admin();
  const digits = phone.replace(/\D/g, '');
  const { data: cust } = await db.from('customers').upsert({ business_id: bid, phone: digits, name }, { onConflict: 'business_id,phone', ignoreDuplicates: true }).select('id').maybeSingle();
  const customerId = cust?.id ?? (await db.from('customers').select('id').eq('business_id', bid).eq('phone', digits).single()).data!.id;

  let { data: conv } = await db.from('conversations').select('*').eq('business_id', bid).eq('customer_id', customerId).eq('platform', 'whatsapp').eq('is_test', isTest).not('stage', 'in', '(delivered,lost)').order('created_at', { ascending: false }).limit(1).maybeSingle();
  let attribution: 'exact' | 'link_based' | 'unattributed' = 'unattributed';
  let campaignId: string | null = null;
  const ref = body.match(/Ref\s+(GX-C-\d{4})/i);
  if (ref) {
    const { data: c } = await db.from('campaigns').select('id,product_id').eq('business_id', bid).eq('code', ref[1].toUpperCase()).maybeSingle();
    if (c) { campaignId = c.id; attribution = 'link_based'; }
  }
  if (!conv) {
    const { data: created, error } = await db.from('conversations').insert({ business_id: bid, customer_id: customerId, platform: 'whatsapp', campaign_id: campaignId, attribution, is_test: isTest }).select('*').single();
    if (error) throw error;
    conv = created;
  } else if (campaignId && !conv.campaign_id) {
    await db.from('conversations').update({ campaign_id: campaignId, attribution }).eq('id', conv.id);
  }
  const { error: msgErr } = await db.from('messages').insert({ business_id: bid, conversation_id: conv!.id, sender: 'customer', body, external_id: externalId });
  if (msgErr) { if (msgErr.code === '23505') return conv!.id; throw msgErr; } // duplicate delivery from Meta
  await db.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conv!.id);
  if (conv!.ai_enabled && !conv!.needs_human) await runAssistant(conv!.id, isTest);
  return conv!.id as string;
}

export async function runAssistant(conversationId: string, isTest = false) {
  const db = admin();
  const { data: conv } = await db.from('conversations').select('*, customer:customers(phone,name)').eq('id', conversationId).single();
  if (!conv) return;
  const bid = conv.business_id as string;
  const [{ data: bizRow }, { data: prods }, { data: msgs }] = await Promise.all([
    db.from('businesses').select('name,language,tone,shipping_policy,return_policy,faq,free_delivery_threshold,delivery_fee,delivery_areas').eq('id', bid).single(),
    db.from('products').select('id,sku,name,category,description,price,discount_price,variants,sizes,stock,delivery_info,image_paths').eq('business_id', bid).eq('active', true),
    db.from('messages').select('sender,body').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(16),
  ]);
  if (!bizRow) return;
  const products = (prods ?? []).map((p) => ({ ...p, price: Number(p.price), discount_price: p.discount_price == null ? null : Number(p.discount_price) })) as Product[];
  const biz = { ...bizRow, free_delivery_threshold: Number(bizRow.free_delivery_threshold), delivery_fee: Number(bizRow.delivery_fee) } as Biz;
  const history = ((msgs ?? []) as Turn[]).reverse();
  const draft = (conv.draft_order ?? {}) as Draft;
  const currentSku = products.find((p) => p.id === conv.product_id)?.sku ?? null;

  const d = await decide(biz, products, history, draft, currentSku);
  const product = products.find((p) => p.sku === (d.product_sku ?? d.draft.sku)) ?? null;

  await db.from('messages').insert({ business_id: bid, conversation_id: conversationId, sender: 'ai', body: d.reply, product_id: product?.id ?? null });

  const patch: Record<string, unknown> = { last_message_at: new Date().toISOString(), draft_order: Object.keys(d.draft).length ? d.draft : null };
  if (product) patch.product_id = product.id;
  if (d.handoff) { patch.needs_human = true; patch.ai_enabled = false; }
  const early = ['new_inquiry', 'ai_responded'].includes(conv.stage);
  if (d.ready_to_order) { patch.stage = 'interested'; patch.follow_up_at = null; }
  else if (early) patch.stage = ['price', 'variant', 'stock', 'buy', 'product', 'photo'].includes(d.intent) ? 'interested' : 'ai_responded';
  await db.from('conversations').update(patch).eq('id', conversationId);
  if (d.ready_to_order) {
    await db.from('messages').insert({ business_id: bid, conversation_id: conversationId, sender: 'system', body: `Ready to order: ${JSON.stringify(d.draft)}. Review and create the order.` });
  }
  if (d.handoff) {
    await db.from('messages').insert({ business_id: bid, conversation_id: conversationId, sender: 'system', body: 'Assistant handed this conversation to a person.' });
  }

  if (isTest || conv.is_test) return;
  const { data: sec } = await db.from('channel_secrets').select('access_token').eq('business_id', bid).eq('platform', 'whatsapp').maybeSingle();
  const { data: acct } = await db.from('social_accounts').select('external_id').eq('business_id', bid).eq('platform', 'whatsapp').maybeSingle();
  const to = (conv.customer as { phone: string } | null)?.phone;
  if (!sec || !acct?.external_id || !to) return;
  try {
    await sendWhatsAppText(acct.external_id, sec.access_token, to, d.reply);
    if (d.send_photo && product?.image_paths[0]) await sendWhatsAppImage(acct.external_id, sec.access_token, to, pub(product.image_paths[0]), product.name);
  } catch (e) {
    await db.from('messages').insert({ business_id: bid, conversation_id: conversationId, sender: 'system', body: `WhatsApp delivery failed: ${(e as Error).message}` });
  }
}

/** Sends a human reply from the inbox. */
export async function sendHumanReply(conversationId: string, text: string) {
  const db = admin();
  const { data: conv } = await db.from('conversations').select('business_id,is_test,customer:customers(phone)').eq('id', conversationId).single();
  if (!conv) throw new Error('Conversation not found');
  const bid = conv.business_id as string;
  if (conv.is_test) return;
  const { data: sec } = await db.from('channel_secrets').select('access_token').eq('business_id', bid).eq('platform', 'whatsapp').maybeSingle();
  const { data: acct } = await db.from('social_accounts').select('external_id').eq('business_id', bid).eq('platform', 'whatsapp').maybeSingle();
  const to = (conv.customer as unknown as { phone: string } | null)?.phone;
  if (!sec || !acct?.external_id || !to) throw new Error('WhatsApp is not connected, so this reply was saved but not delivered.');
  await sendWhatsAppText(acct.external_id, sec.access_token, to, text);
}

export function signatureOk(raw: string, header: string | null, secret: string | undefined) {
  if (!secret || !header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  const given = Buffer.from(header.slice(7), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

