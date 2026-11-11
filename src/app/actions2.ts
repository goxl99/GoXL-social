'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getContext, BUCKET } from '@/lib/context';
import { admin, hasAdmin } from '@/lib/supabase/admin';
import { verifyInstagram, verifyPage, verifyWhatsApp } from '@/lib/meta';
import { generateCopy, CATEGORIES, TARGETS } from '@/lib/creative';
import { resolveAI } from '@/lib/ai/llm';
import { setChannelToken } from '@/lib/secrets';
import { publishPost, postCaption } from '@/lib/publish';
import { ingest, runAssistant, sendHumanReply } from '@/lib/inbound';
import type { Product } from '@/lib/ai/assistant';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const go = (path: string, kind: 'msg' | 'err', text: string): never => {
  redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}`);
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const needAdmin = (back: string) => { if (!hasAdmin()) go(back, 'err', 'The server is missing SUPABASE_SERVICE_ROLE_KEY. Add it in your hosting settings and redeploy.'); };

/* ---------- channel connections ---------- */
export async function connectChannel(f: FormData) {
  const { canEdit, business } = await getContext();
  const platform = str(f, 'platform') as 'instagram' | 'facebook' | 'whatsapp';
  const id = str(f, 'external_id'), token = str(f, 'token');
  if (!canEdit) go('/social', 'err', 'Only owners and managers can connect accounts.');
  if (!['instagram', 'facebook', 'whatsapp'].includes(platform)) go('/social', 'err', 'Unknown platform.');
  if (!/^\d{5,25}$/.test(id)) go('/social', 'err', 'The ID must be the numeric ID from Meta.');
  if (token.length < 20) go('/social', 'err', 'Paste the full access token.');
  needAdmin('/social');
  let handle: string;
  try {
    if (platform === 'whatsapp') { const r = await verifyWhatsApp(id, token); handle = r.display_phone_number ?? r.verified_name ?? id; }
    else if (platform === 'facebook') handle = (await verifyPage(id, token)).name ?? id;
    else handle = '@' + ((await verifyInstagram(id, token)).username ?? id);
  } catch (e) { return go('/social', 'err', `Meta rejected these details: ${(e as Error).message}`); }
  const db = admin();
  try { await setChannelToken(business.id, platform, token); } catch (e) { go('/social', 'err', (e as Error).message); }
  const { error: e2 } = await db.from('social_accounts').upsert({ business_id: business.id, platform, status: 'connected', handle, external_id: id, connected_at: new Date().toISOString() }, { onConflict: 'business_id,platform' });
  if (e2) go('/social', 'err', e2.message.includes('social_wa_number_uidx') ? 'That WhatsApp number is already connected to another business.' : e2.message);
  revalidatePath('/social');
  go('/social', 'msg', `${handle} connected.`);
}

export async function disconnectChannel(f: FormData) {
  const { canEdit, business } = await getContext();
  const platform = str(f, 'platform');
  if (!canEdit) go('/social', 'err', 'Only owners and managers can disconnect accounts.');
  needAdmin('/social');
  const db = admin();
  await db.from('channel_secrets').delete().eq('business_id', business.id).eq('platform', platform);
  await db.from('social_accounts').update({ status: 'disconnected', handle: null, external_id: null, connected_at: null }).eq('business_id', business.id).eq('platform', platform);
  go('/social', 'msg', 'Disconnected and the stored token was deleted.');
}

/* ---------- creative studio ---------- */
export async function generateCreative(f: FormData) {
  const { db, business, canEdit, user } = await getContext();
  if (!canEdit) go('/studio', 'err', 'Only owners and managers can create creatives.');
  const pid = str(f, 'product_id'), category = str(f, 'category'), lang = (['en', 'hi', 'gu'].includes(str(f, 'language')) ? str(f, 'language') : 'en') as 'en' | 'hi' | 'gu';
  const style = ['brand', 'forest', 'paper'].includes(str(f, 'style')) ? str(f, 'style') : 'brand';
  if (!uuid.test(pid)) go('/studio', 'err', 'Choose a product.');
  if (!CATEGORIES[category]) go('/studio', 'err', 'Choose a post type.');
  const [{ data: p }, { data: b }] = await Promise.all([
    db.from('products').select('*').eq('id', pid).eq('business_id', business.id).single(),
    db.from('businesses').select('name,city,phone,tone').eq('id', business.id).single(),
  ]);
  if (!p || !b) return go('/studio', 'err', 'Product not found.');
  const prod = { ...p, price: Number(p.price), discount_price: p.discount_price == null ? null : Number(p.discount_price) } as Product;
  const copy = await generateCopy(b, prod, category, lang, hasAdmin() ? await resolveAI(business.id) : null);
  const { data, error } = await db.from('creatives').insert({ business_id: business.id, product_id: pid, category, language: lang, headline: copy.headline, caption: copy.caption, hashtags: copy.hashtags, style, created_by: user.id }).select('id').single();
  if (error) go('/studio', 'err', error.message);
  go(`/studio/${data!.id}`, 'msg', copy.source === 'ai' ? 'Creative generated. Review the copy, then approve it.' : 'Creative generated from a template (add an AI key in Settings for AI-written copy). Review it, then approve.');
}

export async function saveCreative(f: FormData) {
  const { client, db, business, canEdit } = await getContext();
  const id = str(f, 'id'), back = `/studio/${id}`;
  if (!canEdit) go('/studio', 'err', 'Only owners and managers can edit creatives.');
  const headline = str(f, 'headline'), caption = str(f, 'caption');
  if (!headline || !caption) go(back, 'err', 'Headline and caption are required.');
  const patch: Record<string, unknown> = { headline: headline.slice(0, 60), caption, hashtags: str(f, 'hashtags') || null, style: ['brand', 'forest', 'paper'].includes(str(f, 'style')) ? str(f, 'style') : 'brand', approved: false };
  const file = f.get('extra');
  if (file instanceof File && file.size > 0) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) go(back, 'err', 'Use a JPG, PNG or WebP under 5 MB.');
    const path = `${business.id}/creatives/${id}/${crypto.randomUUID()}.${file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'}`;
    const { error } = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (error) go(back, 'err', error.message);
    patch.extra_image_path = path;
  }
  const { error } = await db.from('creatives').update(patch).eq('id', id).eq('business_id', business.id);
  if (error) go(back, 'err', error.message);
  go(back, 'msg', 'Saved. Changes reset approval, so approve it again before publishing.');
}

export async function approveCreative(f: FormData) {
  const { db, business, canEdit } = await getContext();
  const id = str(f, 'id');
  if (!canEdit) go('/studio', 'err', 'Only owners and managers can approve creatives.');
  const approved = str(f, 'approved') === '1';
  await db.from('creatives').update({ approved }).eq('id', id).eq('business_id', business.id);
  go(`/studio/${id}`, 'msg', approved ? 'Approved. You can use it in a campaign.' : 'Approval removed.');
}

export async function deleteCreative(f: FormData) {
  const { db, business, canEdit } = await getContext();
  if (!canEdit) go('/studio', 'err', 'Only owners and managers can delete creatives.');
  await db.from('creatives').delete().eq('id', str(f, 'id')).eq('business_id', business.id);
  go('/studio', 'msg', 'Creative deleted.');
}

/* ---------- campaigns and posts ---------- */
export async function createCampaign(f: FormData) {
  const { client, db, business, canEdit } = await getContext();
  if (!canEdit) go('/campaigns', 'err', 'Only owners and managers can create campaigns.');
  const name = str(f, 'name'), cid = str(f, 'creative_id');
  const targets = f.getAll('targets').map(String).filter((t) => TARGETS[t]);
  const when = str(f, 'when');
  if (!name) go('/campaigns/new', 'err', 'Give the campaign a name.');
  if (!uuid.test(cid)) go('/campaigns/new', 'err', 'Choose an approved creative.');
  if (!targets.length) go('/campaigns/new', 'err', 'Choose at least one place to post.');
  const { data: cre } = await db.from('creatives').select('id,product_id,approved,caption,hashtags').eq('id', cid).eq('business_id', business.id).single();
  if (!cre?.approved) go('/campaigns/new', 'err', 'That creative is not approved yet.');
  let scheduled: Date | null = null;
  if (when === 'later') {
    scheduled = new Date(`${str(f, 'schedule_at')}:00+05:30`); // times are entered in Indian Standard Time
    if (isNaN(scheduled.getTime()) || scheduled.getTime() < Date.now() + 60_000) go('/campaigns/new', 'err', 'Pick a schedule time in the future (Indian time).');
  }
  const { data: code, error: ce } = await client.schema('gx').rpc('next_code', { bid: business.id, p_kind: 'campaign', prefix: 'GX-C-' });
  if (ce) go('/campaigns/new', 'err', ce.message);
  const budget = str(f, 'budget') ? Math.max(0, Number(str(f, 'budget')) || 0) : null;
  const { data: camp, error } = await db.from('campaigns').insert({
    business_id: business.id, code, name, product_id: cre!.product_id, creative_id: cid, objective: str(f, 'objective') || null, offer: str(f, 'offer') || null, budget,
  }).select('id,code').single();
  if (error) go('/campaigns/new', 'err', error.message);
  const { data: wa } = await db.from('social_accounts').select('handle').eq('business_id', business.id).eq('platform', 'whatsapp').maybeSingle();
  const caption = postCaption(cre!, camp!.code, wa?.handle ?? null);
  const rows = targets.map((t) => {
    const [platform, format] = TARGETS[t];
    return { business_id: business.id, campaign_id: camp!.id, creative_id: cid, platform, format, caption,
      status: platform === 'whatsapp' ? 'share_manually' : when === 'later' ? 'scheduled' : 'draft', scheduled_for: scheduled?.toISOString() ?? null };
  });
  const { data: posts, error: pe } = await db.from('posts').insert(rows).select('id,status,platform');
  if (pe) go('/campaigns/new', 'err', pe.message);
  if (when === 'now') {
    if (!hasAdmin()) go(`/campaigns/${camp!.id}`, 'err', 'Campaign saved, but publishing needs SUPABASE_SERVICE_ROLE_KEY on the server.');
    for (const p of posts!.filter((x) => x.platform !== 'whatsapp')) await publishPost(p.id);
    go(`/campaigns/${camp!.id}`, 'msg', 'Campaign created. Check each post below for its result.');
  }
  go(`/campaigns/${camp!.id}`, 'msg', when === 'later' ? 'Campaign scheduled.' : 'Campaign saved as a draft.');
}

async function ownPost(id: string) {
  const ctx = await getContext();
  const { data } = await ctx.db.from('posts').select('id,campaign_id,status,platform').eq('id', id).eq('business_id', ctx.business.id).single();
  return { ctx, post: data };
}

export async function retryPost(f: FormData) {
  const { ctx, post } = await ownPost(str(f, 'id'));
  if (!post || !ctx.canEdit) return go('/campaigns', 'err', 'Not allowed.');
  needAdmin(`/campaigns/${post.campaign_id}`);
  const r = await publishPost(post.id);
  go(`/campaigns/${post.campaign_id}`, r.ok ? 'msg' : 'err', r.ok ? 'Published.' : `Could not publish: ${r.error}`);
}

export async function publishDraftNow(f: FormData) { return retryPost(f); }

export async function markShared(f: FormData) {
  const { ctx, post } = await ownPost(str(f, 'id'));
  if (!post || !ctx.canEdit) return go('/campaigns', 'err', 'Not allowed.');
  await ctx.db.from('posts').update({ status: 'shared', published_at: new Date().toISOString() }).eq('id', post.id);
  go(`/campaigns/${post.campaign_id}`, 'msg', 'Marked as shared.');
}

export async function cancelPost(f: FormData) {
  const { ctx, post } = await ownPost(str(f, 'id'));
  if (!post || !ctx.canEdit) return go('/campaigns', 'err', 'Not allowed.');
  if (!['draft', 'scheduled', 'failed', 'share_manually'].includes(post.status)) go(`/campaigns/${post.campaign_id}`, 'err', 'This post is already live and cannot be cancelled here.');
  await ctx.db.from('posts').delete().eq('id', post.id);
  go(`/campaigns/${post.campaign_id}`, 'msg', 'Post removed.');
}

/* ---------- inbox ---------- */
async function ownConv(id: string) {
  const ctx = await getContext();
  const { data } = await ctx.db.from('conversations').select('id,is_test,ai_enabled,needs_human').eq('id', id).eq('business_id', ctx.business.id).single();
  return { ctx, conv: data };
}
const canWork = (role: string) => role !== 'fulfilment';

export async function sendReply(f: FormData) {
  const id = str(f, 'id'), text = str(f, 'text'), back = `/inbox?c=${id}`;
  const { ctx, conv } = await ownConv(id);
  if (!conv || !canWork(ctx.role)) return go('/inbox', 'err', 'Not allowed.');
  if (!text) go(back, 'err', 'Type a message first.');
  await ctx.db.from('messages').insert({ business_id: ctx.business.id, conversation_id: id, sender: 'human', body: text.slice(0, 2000) });
  await ctx.db.from('conversations').update({ ai_enabled: false, needs_human: false, last_message_at: new Date().toISOString(), assigned_to: ctx.user.id }).eq('id', id);
  if (!conv.is_test) {
    if (!hasAdmin()) go(back, 'err', 'Saved, but sending needs SUPABASE_SERVICE_ROLE_KEY on the server.');
    try { await sendHumanReply(id, text); } catch (e) { go(back, 'err', (e as Error).message); }
  }
  go(back, 'msg', 'Sent. The AI assistant is paused on this conversation.');
}

export async function toggleAI(f: FormData) {
  const id = str(f, 'id');
  const { ctx, conv } = await ownConv(id);
  if (!conv || !canWork(ctx.role)) return go('/inbox', 'err', 'Not allowed.');
  const on = str(f, 'on') === '1';
  await ctx.db.from('conversations').update({ ai_enabled: on, needs_human: on ? false : conv.needs_human }).eq('id', id);
  go(`/inbox?c=${id}`, 'msg', on ? 'AI assistant resumed.' : 'AI assistant paused.');
}

export async function claimConversation(f: FormData) {
  const id = str(f, 'id');
  const { ctx, conv } = await ownConv(id);
  if (!conv || !canWork(ctx.role)) return go('/inbox', 'err', 'Not allowed.');
  await ctx.db.from('conversations').update({ assigned_to: ctx.user.id, needs_human: false, ai_enabled: false }).eq('id', id);
  go(`/inbox?c=${id}`, 'msg', 'Assigned to you. The AI assistant is paused.');
}

const MANUAL_STAGES = ['new_inquiry', 'ai_responded', 'interested', 'follow_up', 'lost'];
export async function setStage(f: FormData) {
  const id = str(f, 'id'), stage = str(f, 'stage'), back = str(f, 'back') || `/inbox?c=${id}`;
  const { ctx, conv } = await ownConv(id);
  if (!conv || !canWork(ctx.role)) return go('/inbox', 'err', 'Not allowed.');
  if (!MANUAL_STAGES.includes(stage)) go(back, 'err', 'Order, payment and delivery stages update automatically from the order.');
  const patch: Record<string, unknown> = { stage };
  if (stage === 'lost') { patch.lost_reason = str(f, 'lost_reason') || 'No reason given'; patch.ai_enabled = false; }
  else patch.lost_reason = null;
  const { error } = await ctx.db.from('conversations').update(patch).eq('id', id);
  if (error) go(back, 'err', error.message);
  go(back, 'msg', 'Stage updated.');
}

export async function setFollowUp(f: FormData) {
  const id = str(f, 'id'), back = str(f, 'back') || `/inbox?c=${id}`;
  const { ctx, conv } = await ownConv(id);
  if (!conv || !canWork(ctx.role)) return go('/inbox', 'err', 'Not allowed.');
  const d = str(f, 'follow_up_at');
  await ctx.db.from('conversations').update({ follow_up_at: d ? new Date(`${d}T09:00:00+05:30`).toISOString() : null, ...(d ? { stage: 'follow_up' } : {}) }).eq('id', id);
  go(back, 'msg', d ? 'Follow-up date set.' : 'Follow-up cleared.');
}

export async function testMessage(f: FormData) {
  const { business, role } = await getContext();
  const text = str(f, 'text');
  if (!canWork(role)) return go('/inbox', 'err', 'Not allowed.');
  needAdmin('/inbox');
  if (!text) go('/inbox?test=1', 'err', 'Type a message to simulate.');
  const cid = await ingest(business.id, '910000000000', 'Test customer', text.slice(0, 1000), null, true);
  go(`/inbox?c=${cid}`, 'msg', 'Simulated customer message handled. Nothing was sent to WhatsApp.');
}

export async function rerunAssistant(f: FormData) {
  const id = str(f, 'id');
  const { ctx, conv } = await ownConv(id);
  if (!conv || !canWork(ctx.role)) return go('/inbox', 'err', 'Not allowed.');
  needAdmin(`/inbox?c=${id}`);
  await runAssistant(id, conv.is_test);
  go(`/inbox?c=${id}`, 'msg', 'Assistant replied.');
}
