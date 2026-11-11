import { admin } from '@/lib/supabase/admin';
import { publishFacebook, publishInstagram } from '@/lib/meta';
import { appUrl } from '@/lib/inbound';
import { fullCaption } from '@/lib/creative';
import { getChannelToken } from '@/lib/secrets';

export const waLink = (phone: string | null | undefined, code: string | null | undefined) =>
  phone ? `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi, I saw your post. ${code ? 'Ref ' + code : ''}`.trim())}` : null;

export function imageUrl(creativeId: string, platform: string, format: string) {
  const r = format === 'story' ? 'story' : platform === 'instagram' ? 'post' : 'square';
  return `${appUrl()}/api/creative/${creativeId}/image?r=${r}${platform === 'instagram' ? '&f=jpg' : ''}`;
}

/** Caption as it will be posted: copy, hashtags and a WhatsApp click-to-chat link carrying the campaign code. */
export function postCaption(c: { caption: string; hashtags: string | null }, code: string | null, waPhone: string | null) {
  const link = waLink(waPhone, code);
  return [c.caption, link ? `Order on WhatsApp: ${link}` : '', c.hashtags].filter(Boolean).join('\n\n');
}

/** Publishes one post. Safe to call twice: an optimistic lock moves it to 'publishing' so only one caller proceeds. */
export async function publishPost(postId: string): Promise<{ ok: boolean; error?: string }> {
  const db = admin();
  const { data: locked } = await db.from('posts').update({ status: 'publishing', error: null }).eq('id', postId).in('status', ['scheduled', 'draft', 'failed']).select('*').maybeSingle();
  if (!locked) return { ok: false, error: 'Post is not ready to publish.' };
  const fail = async (error: string) => {
    await db.from('posts').update({ status: 'failed', error: error.slice(0, 500), attempts: locked.attempts + 1 }).eq('id', postId);
    return { ok: false, error };
  };
  try {
    const { data: biz } = await db.from('businesses').select('status').eq('id', locked.business_id).maybeSingle();
    if (biz?.status !== 'active') return await fail('This account is not active.');
    if (!process.env.NEXT_PUBLIC_APP_URL) return await fail('NEXT_PUBLIC_APP_URL is not set, so Meta cannot fetch the image.');
    if (!locked.creative_id) return await fail('This campaign has no creative.');
    const [{ data: acct }, token, { data: camp }, { data: cre }, { data: wa }] = await Promise.all([
      db.from('social_accounts').select('external_id,status').eq('business_id', locked.business_id).eq('platform', locked.platform).maybeSingle(),
      getChannelToken(locked.business_id, locked.platform),
      db.from('campaigns').select('code').eq('id', locked.campaign_id).single(),
      db.from('creatives').select('caption,hashtags,approved').eq('id', locked.creative_id).single(),
      db.from('social_accounts').select('handle').eq('business_id', locked.business_id).eq('platform', 'whatsapp').maybeSingle(),
    ]);
    if (!acct?.external_id || acct.status !== 'connected' || !token) return await fail(`${locked.platform} is not connected.`);
    if (!cre?.approved) return await fail('The creative is not approved.');
    const caption = locked.caption || postCaption(cre, camp?.code ?? null, wa?.handle ?? null);
    const url = imageUrl(locked.creative_id, locked.platform, locked.format);
    const id = locked.platform === 'instagram'
      ? await publishInstagram(acct.external_id, token, locked.format, url, caption)
      : await publishFacebook(acct.external_id, token, locked.format, url, caption);
    await db.from('posts').update({ status: 'published', external_id: String(id), published_at: new Date().toISOString(), attempts: locked.attempts + 1 }).eq('id', postId);
    return { ok: true };
  } catch (e) {
    return await fail((e as Error).message || 'Publishing failed');
  }
}

/** Publishes everything that is due. Called by the cron endpoint. */
export async function publishDue(limit = 10) {
  const db = admin();
  const { data } = await db.from('posts').select('id').eq('status', 'scheduled').lte('scheduled_for', new Date().toISOString()).order('scheduled_for').limit(limit);
  let ok = 0, failed = 0;
  for (const p of data ?? []) (await publishPost(p.id)).ok ? ok++ : failed++;
  return { due: data?.length ?? 0, ok, failed };
}
export { fullCaption };
