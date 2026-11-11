import { cache } from 'react';
import { redirect } from 'next/navigation';
import { admin, hasAdmin } from '@/lib/supabase/admin';
import { getUser } from '@/lib/supabase/server';
import { decrypt, encrypt } from '@/lib/crypto';

export type PlatformSecretName = 'ai_anthropic_key' | 'ai_openai_key' | 'meta_app_secret';
export const PLATFORM_SECRET_NAMES: PlatformSecretName[] = ['ai_anthropic_key', 'ai_openai_key', 'meta_app_secret'];

/** True when this user is a GoXL platform administrator (platform_admins table, or SUPER_ADMIN_EMAILS as a bootstrap). Never throws. */
export const isSuperAdmin = cache(async function isSuperAdmin(userId: string, email?: string | null): Promise<boolean> {
  if (!hasAdmin()) return false;
  try {
    const listed = (process.env.SUPER_ADMIN_EMAILS ?? '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
    if (email && listed.includes(email.toLowerCase())) return true;
    const { data } = await admin().from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle();
    return !!data;
  } catch { return false; }
});

/** Gate for every admin page and action. Redirects non-admins away; returns the signed-in admin. */
export async function requireSuperAdmin() {
  const user = await getUser();
  if (!user) redirect('/login');
  if (!(await isSuperAdmin(user.id, user.email))) redirect('/dashboard');
  return { user, email: user.email ?? '' };
}

export async function audit(actor: { user: { id: string }; email: string }, action: string, businessId: string | null, detail?: string) {
  try { await admin().from('admin_audit').insert({ actor_id: actor.user.id, actor_email: actor.email, business_id: businessId, action, detail: detail?.slice(0, 500) ?? null }); } catch { /* audit is best-effort */ }
}

export async function getPlatformSecret(name: PlatformSecretName): Promise<string | null> {
  const { data } = await admin().from('platform_secrets').select('value').eq('name', name).maybeSingle();
  if (!data) return null;
  try { return decrypt(data.value); } catch { return null; }
}
export async function setPlatformSecret(name: PlatformSecretName, value: string, userId: string) {
  const { error } = await admin().from('platform_secrets').upsert({ name, value: encrypt(value), updated_by: userId, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
export async function clearPlatformSecret(name: PlatformSecretName) {
  await admin().from('platform_secrets').delete().eq('name', name);
}
export async function platformSecretStatus(): Promise<Record<PlatformSecretName, { set: boolean; hint: string; at: string | null }>> {
  const { data } = await admin().from('platform_secrets').select('name,value,updated_at');
  const out = {} as Record<PlatformSecretName, { set: boolean; hint: string; at: string | null }>;
  for (const n of PLATFORM_SECRET_NAMES) out[n] = { set: false, hint: '', at: null };
  for (const r of data ?? []) {
    let hint = '';
    try { const v = decrypt(r.value); hint = v.length > 8 ? '…' + v.slice(-4) : ''; } catch { hint = 'unreadable'; }
    out[r.name as PlatformSecretName] = { set: true, hint, at: r.updated_at };
  }
  return out;
}
