'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getContext } from '@/lib/context';
import { hasAdmin } from '@/lib/supabase/admin';
import { clearSecret, getSecret, setSecret, SECRET_NAMES, type SecretName } from '@/lib/secrets';
import { complete, resolveAI } from '@/lib/ai/llm';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const go = (path: string, kind: 'msg' | 'err', text: string): never => redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}`);
const need = () => { if (!hasAdmin()) go('/settings', 'err', 'The server is missing SUPABASE_SERVICE_ROLE_KEY. Ask the GoXL administrator to add it in hosting settings.'); };

export async function saveAISettings(f: FormData) {
  const { db, business, canEdit } = await getContext();
  if (!canEdit) go('/settings', 'err', 'Only owners and managers can change AI settings.');
  const provider = str(f, 'ai_provider') === 'openai' ? 'openai' : 'anthropic';
  const { error } = await db.from('businesses').update({ ai_provider: provider, ai_model: str(f, 'ai_model') || null }).eq('id', business.id);
  if (error) go('/settings', 'err', error.message);
  go('/settings', 'msg', 'AI settings saved.');
}

export async function saveSecretValue(f: FormData) {
  const { business, role, user } = await getContext();
  const name = str(f, 'name') as SecretName, value = str(f, 'value');
  if (role !== 'owner') go('/settings', 'err', 'Only the account owner can change keys.');
  if (!SECRET_NAMES.includes(name)) go('/settings', 'err', 'Unknown setting.');
  if (value.length < 8) go('/settings', 'err', 'That value looks too short. Paste the full key.');
  need();
  try { await setSecret(business.id, name, value, user.id); } catch (e) { go('/settings', 'err', (e as Error).message); }
  revalidatePath('/settings');
  go('/settings', 'msg', 'Saved securely. The key is hidden from now on; paste a new one to replace it.');
}

export async function clearSecretValue(f: FormData) {
  const { business, role } = await getContext();
  const name = str(f, 'name') as SecretName;
  if (role !== 'owner') go('/settings', 'err', 'Only the account owner can change keys.');
  if (!SECRET_NAMES.includes(name)) go('/settings', 'err', 'Unknown setting.');
  need();
  await clearSecret(business.id, name);
  go('/settings', 'msg', 'Key removed.');
}

export async function testAI() {
  const { business, canEdit } = await getContext();
  if (!canEdit) go('/settings', 'err', 'Only owners and managers can run this test.');
  need();
  const ai = await resolveAI(business.id);
  if (!ai) go('/settings', 'err', 'No AI key is set for this account yet.');
  const r = await complete(ai!, 'Reply with the JSON object {"ok":true} and nothing else.', [{ role: 'user', content: 'ping' }], 30, 15000);
  if ('error' in r) go('/settings', 'err', `${ai!.provider === 'openai' ? 'OpenAI' : 'Anthropic'} rejected the request: ${r.error}`);
  go('/settings', 'msg', `AI connection works (${ai!.provider === 'openai' ? 'OpenAI' : 'Claude'}, model ${ai!.model}).`);
}

export async function testRazorpay() {
  const { business, canEdit } = await getContext();
  if (!canEdit) go('/settings', 'err', 'Only owners and managers can run this test.');
  need();
  const [id, secret] = await Promise.all([getSecret(business.id, 'razorpay_key_id'), getSecret(business.id, 'razorpay_key_secret')]);
  if (!id || !secret) go('/settings', 'err', 'Save both the Razorpay key ID and key secret first.');
  const res = await fetch('https://api.razorpay.com/v1/payment_links?count=1', { headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64') } });
  if (!res.ok) go('/settings', 'err', `Razorpay rejected these keys (${res.status}). Check that the key ID and secret belong together and are for the same mode.`);
  go('/settings', 'msg', `Razorpay keys work (${id!.startsWith('rzp_live') ? 'live' : 'test'} mode).`);
}
