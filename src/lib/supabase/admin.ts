import { createClient } from '@supabase/supabase-js';

/** Service-role client for server-only jobs (webhooks, cron, publishing, channel secrets). Bypasses RLS: always scope queries by business_id. */
export function admin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: 'gx' } });
}
export const hasAdmin = () => !!process.env.SUPABASE_SERVICE_ROLE_KEY;
