'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { admin, hasAdmin } from '@/lib/supabase/admin';
import { audit, clearPlatformSecret, PLATFORM_SECRET_NAMES, requireSuperAdmin, setPlatformSecret, type PlatformSecretName } from '@/lib/admin';
import { clearSecret, getSecret, setChannelToken, setSecret, SECRET_NAMES, type SecretName } from '@/lib/secrets';
import { verifyInstagram, verifyPage, verifyWhatsApp } from '@/lib/meta';
import { complete, resolveAI } from '@/lib/ai/llm';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const go = (path: string, kind: 'msg' | 'err', text: string): never => redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}`);
const prep = (path: string) => {
  if (!hasAdmin()) go(path, 'err', 'SUPABASE_SERVICE_ROLE_KEY is missing on the server.');
  if (!process.env.SECRETS_ENCRYPTION_KEY) go(path, 'err', 'SECRETS_ENCRYPTION_KEY is missing on the server.');
};
const bidOf = (f: FormData) => { const id = str(f, 'bid'); if (!uuid.test(id)) redirect('/admin'); return id; };
const back = (bid: string) => `/admin/accounts/${bid}`;

/* ---------- activation ---------- */
export async function setAccountStatus(f: FormData) {
  const a = await requireSuperAdmin();
  const bid = bidOf(f), status = str(f, 'status'), notes = str(f, 'admin_notes');
  const to = str(f, 'from') === 'list' ? '/admin' : back(bid);
  if (!['pending', 'active', 'suspended'].includes(status)) go(to, 'err', 'Unknown status.');
  prep(to);
  const patch: Record<string, unknown> = { status, admin_notes: notes || null };
  if (status === 'active') { patch.activated_at = new Date().toISOString(); patch.activated_by = a.user.id; }
  const { error } = await admin().from('businesses').update(patch).eq('id', bid);
  if (error) go(to, 'err', error.message);
  await audit(a, `status:${status}`, bid, notes);
  revalidatePath('/admin');
  go(to, 'msg', status === 'active' ? 'Account activated. The owner can now sign in to the dashboard.' : status === 'suspended' ? 'Account paused.' : 'Account set back to pending.');
}

/* ---------- per-account keys ---------- */
export async function saveAccountAI(f: FormData) {
  const a = await requireSuperAdmin();
  const bid = bidOf(f), to = back(bid);
  prep(to);
  const provider = str(f, 'ai_provider') === 'openai' ? 'openai' : 'anthropic';
  const { error } = await admin().from('businesses').update({ ai_provider: provider, ai_model: str(f, 'ai_model') || null }).eq('id', bid);
  if (error) go(to, 'err', error.message);
  await audit(a, 'ai_settings', bid, `${provider} ${str(f, 'ai_model')}`);
  go(to, 'msg', 'AI provider saved.');
}

export async function saveAccountSecret(f: FormData) {
  const a = await requireSuperAdmin();
  const bid = bidOf(f), to = back(bid), name = str(f, 'name') as SecretName, value = str(f, 'value');
  if (!SECRET_NAMES.includes(name)) go(to, 'err', 'Unknown setting.');
  if (value.length < 8) go(to, 'err', 'That value looks too short. Paste the full key.');
  prep(to);
  try { await setSecret(bid, name, value, a.user.id); } catch (e) { go(to, 'err', (e as Error).message); }
  await audit(a, `secret:set:${name}`, bid);
  go(to, 'msg', 'Saved securely. The value is hidden from now on.');
}

export async function clearAccountSecret(f: FormData) {
  const a = await requireSuperAdmin();
  const bid = bidOf(f), to = back(bid), name = str(f, 'name') as SecretName;
  if (!SECRET_NAMES.includes(name)) go(to, 'err', 'Unknown setting.');
  prep(to);
  await clearSecret(bid, name);
  await audit(a, `secret:clear:${name}`, bid);
  go(to, 'msg', 'Key removed.');
}

export async function connectAccountChannel(f: FormData) {
  const a = await requireSuperAdmin();
  const bid = bidOf(f), to = back(bid);
  const platform = str(f, 'platform') as 'instagram' | 'facebook' | 'whatsapp', id = str(f, 'external_id'), token = str(f, 'token');
  if (!['instagram', 'facebook', 'whatsapp'].includes(platform)) go(to, 'err', 'Unknown platform.');
  if (!/^\d{5,25}$/.test(id)) go(to, 'err', 'The ID must be the numeric ID from Meta.');
  if (token.length < 20) go(to, 'err', 'Paste the full access token.');
  prep(to);
  let handle: string;
  try {
    if (platform === 'whatsapp') { const r = await verifyWhatsApp(id, token); handle = r.display_phone_number ?? r.verified_name ?? id; }
    else if (platform === 'facebook') handle = (await verifyPage(id, token)).name ?? id;
    else handle = '@' + ((await verifyInstagram(id, token)).username ?? id);
  } catch (e) { return go(to, 'err', `Meta rejected these details: ${(e as Error).message}`); }
  try { await setChannelToken(bid, platform, token); } catch (e) { go(to, 'err', (e as Error).message); }
  const { error } = await admin().from('social_accounts').upsert({ business_id: bid, platform, status: 'connected', handle, external_id: id, connected_at: new Date().toISOString() }, { onConflict: 'business_id,platform' });
  if (error) go(to, 'err', error.message.includes('social_wa_number_uidx') ? 'That WhatsApp number is already connected to another business.' : error.message);
  await audit(a, `channel:connect:${platform}`, bid, handle);
  go(to, 'msg', `${handle} connected.`);
}

export async function disconnectAccountChannel(f: FormData) {
  const a = await requireSuperAdmin();
  const bid = bidOf(f), to = back(bid), platform = str(f, 'platform');
  if (!['instagram', 'facebook', 'whatsapp'].includes(platform)) go(to, 'err', 'Unknown platform.');
  prep(to);
  const db = admin();
  await db.from('channel_secrets').delete().eq('business_id', bid).eq('platform', platform);
  await db.from('social_accounts').update({ status: 'disconnected', handle: null, external_id: null, connected_at: null }).eq('business_id', bid).eq('platform', platform);
  await audit(a, `channel:disconnect:${platform}`, bid);
  go(to, 'msg', 'Disconnected and the stored token was deleted.');
}

export async function testAccountAI(f: FormData) {
  await requireSuperAdmin();
  const bid = bidOf(f), to = back(bid);
  prep(to);
  const ai = await resolveAI(bid);
  if (!ai) go(to, 'err', 'No AI key is available for this account (its own, the GoXL default, or the server key).');
  const r = await complete(ai!, 'Reply with the JSON object {"ok":true} and nothing else.', [{ role: 'user', content: 'ping' }], 30, 15000);
  if ('error' in r) go(to, 'err', `${ai!.provider === 'openai' ? 'OpenAI' : 'Anthropic'} rejected the request: ${r.error}`);
  go(to, 'msg', `AI connection works (${ai!.provider === 'openai' ? 'OpenAI' : 'Claude'}, model ${ai!.model}).`);
}

export async function testAccountRazorpay(f: FormData) {
  await requireSuperAdmin();
  const bid = bidOf(f), to = back(bid);
  prep(to);
  const [id, secret] = await Promise.all([getSecret(bid, 'razorpay_key_id'), getSecret(bid, 'razorpay_key_secret')]);
  if (!id || !secret) go(to, 'err', 'Save both the Razorpay key ID and key secret first.');
  const res = await fetch('https://api.razorpay.com/v1/payment_links?count=1', { headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64') } });
  if (!res.ok) go(to, 'err', `Razorpay rejected these keys (${res.status}).`);
  go(to, 'msg', `Razorpay keys work (${id!.startsWith('rzp_live') ? 'live' : 'test'} mode).`);
}

/* ---------- GoXL-wide default keys ---------- */
export async function savePlatformSecret(f: FormData) {
  const a = await requireSuperAdmin();
  const name = str(f, 'name') as PlatformSecretName, value = str(f, 'value'), to = '/admin/team';
  if (!PLATFORM_SECRET_NAMES.includes(name)) go(to, 'err', 'Unknown setting.');
  if (value.length < 8) go(to, 'err', 'That value looks too short. Paste the full key.');
  prep(to);
  try { await setPlatformSecret(name, value, a.user.id); } catch (e) { go(to, 'err', (e as Error).message); }
  await audit(a, `platform_secret:set:${name}`, null);
  go(to, 'msg', 'Default key saved securely.');
}
export async function clearPlatformSecretAction(f: FormData) {
  const a = await requireSuperAdmin();
  const name = str(f, 'name') as PlatformSecretName, to = '/admin/team';
  if (!PLATFORM_SECRET_NAMES.includes(name)) go(to, 'err', 'Unknown setting.');
  prep(to);
  await clearPlatformSecret(name);
  await audit(a, `platform_secret:clear:${name}`, null);
  go(to, 'msg', 'Default key removed.');
}

/* ---------- super admins ---------- */
export async function addSuperAdmin(f: FormData) {
  const a = await requireSuperAdmin();
  const email = str(f, 'email').toLowerCase(), to = '/admin/team';
  if (!email.includes('@')) go(to, 'err', 'Enter a valid email.');
  prep(to);
  const db = admin();
  const { data: uid } = await db.rpc('find_user_by_email', { p_email: email });
  if (!uid) go(to, 'err', 'No user with that email yet. Ask them to sign up first, then add them here.');
  const { error } = await db.from('platform_admins').upsert({ user_id: uid as string, email });
  if (error) go(to, 'err', error.message);
  await audit(a, 'super_admin:add', null, email);
  go(to, 'msg', `${email} is now a super admin.`);
}

export async function removeSuperAdmin(f: FormData) {
  const a = await requireSuperAdmin();
  const id = str(f, 'user_id'), to = '/admin/team';
  if (!uuid.test(id)) go(to, 'err', 'Unknown user.');
  if (id === a.user.id) go(to, 'err', 'You cannot remove yourself.');
  prep(to);
  await admin().from('platform_admins').delete().eq('user_id', id);
  await audit(a, 'super_admin:remove', null, id);
  go(to, 'msg', 'Super admin removed.');
}
