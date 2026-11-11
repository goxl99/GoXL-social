import { randomBytes } from 'node:crypto';
import { admin } from '@/lib/supabase/admin';
import { decrypt, encrypt } from '@/lib/crypto';

export type SecretName = 'ai_anthropic_key' | 'ai_openai_key' | 'meta_app_secret' | 'razorpay_key_id' | 'razorpay_key_secret' | 'razorpay_webhook_secret';
export const SECRET_NAMES: SecretName[] = ['ai_anthropic_key', 'ai_openai_key', 'meta_app_secret', 'razorpay_key_id', 'razorpay_key_secret', 'razorpay_webhook_secret'];

export async function getSecret(bid: string, name: SecretName): Promise<string | null> {
  const { data } = await admin().from('secrets').select('value').eq('business_id', bid).eq('name', name).maybeSingle();
  if (!data) return null;
  try { return decrypt(data.value); } catch { return null; }
}
export async function setSecret(bid: string, name: SecretName, value: string, userId: string | null) {
  const { error } = await admin().from('secrets').upsert({ business_id: bid, name, value: encrypt(value), updated_by: userId, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
export async function clearSecret(bid: string, name: SecretName) {
  await admin().from('secrets').delete().eq('business_id', bid).eq('name', name);
}
/** Which secrets are set, with a masked hint (last 4 characters). The value itself never leaves the server. */
export async function secretStatus(bid: string): Promise<Record<SecretName, { set: boolean; hint: string; at: string | null }>> {
  const { data } = await admin().from('secrets').select('name,value,updated_at').eq('business_id', bid);
  const out = {} as Record<SecretName, { set: boolean; hint: string; at: string | null }>;
  for (const n of SECRET_NAMES) out[n] = { set: false, hint: '', at: null };
  for (const r of data ?? []) {
    let hint = '';
    try { const v = decrypt(r.value); hint = v.length > 8 ? '…' + v.slice(-4) : ''; } catch { hint = 'unreadable'; }
    out[r.name as SecretName] = { set: true, hint, at: r.updated_at };
  }
  return out;
}

export async function getChannelToken(bid: string, platform: 'instagram' | 'facebook' | 'whatsapp'): Promise<string | null> {
  const { data } = await admin().from('channel_secrets').select('access_token').eq('business_id', bid).eq('platform', platform).maybeSingle();
  if (!data) return null;
  try { return decrypt(data.access_token); } catch { return null; }
}
export async function setChannelToken(bid: string, platform: string, token: string) {
  const { error } = await admin().from('channel_secrets').upsert({ business_id: bid, platform, access_token: encrypt(token), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/** Each business has its own WhatsApp webhook verify token, created on first use. */
export async function getVerifyToken(bid: string): Promise<string> {
  const db = admin();
  const { data } = await db.from('channel_config').select('wa_verify_token').eq('business_id', bid).maybeSingle();
  if (data) return data.wa_verify_token;
  const token = 'gx_' + randomBytes(16).toString('hex');
  await db.from('channel_config').upsert({ business_id: bid, wa_verify_token: token }, { onConflict: 'business_id', ignoreDuplicates: true });
  return (await db.from('channel_config').select('wa_verify_token').eq('business_id', bid).single()).data!.wa_verify_token;
}
