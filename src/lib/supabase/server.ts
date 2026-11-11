import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';

/** Supabase client bound to the signed-in user's session. Row level security applies to everything it does. */
export const getClient = cache(async function getClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* called from a Server Component; middleware refreshes the session instead */
        }
      },
    },
  });
});

export type SessionUser = { id: string; email: string | null };
/** The signed-in user, read once per request. The token signature is verified locally (no round trip to Supabase Auth when keys are asymmetric). */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const client = await getClient();
  const { data } = await client.auth.getClaims();
  const c = data?.claims;
  return c?.sub ? { id: c.sub, email: (c.email as string | undefined) ?? null } : null;
});
