import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getClient } from '@/lib/supabase/server';

export type Role = 'owner' | 'manager' | 'sales' | 'fulfilment';
export type Business = {
  id: string; name: string; brand_primary: string; brand_accent: string; logo_path: string | null; onboarded: boolean;
};
export type Membership = { role: Role; business: Business };

export const BUCKET = 'gx-business-assets';
export const publicUrl = (path: string | null | undefined) =>
  path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}` : null;

/** Resolves the signed-in user, their businesses and the active business. Redirects when anything is missing. */
export async function getContext() {
  const client = await getClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect('/login');
  const db = client.schema('gx');
  const load = async () => {
    const { data } = await db.from('members').select('role, business:businesses(id,name,brand_primary,brand_accent,logo_path,onboarded)').eq('user_id', user.id);
    return ((data ?? []) as unknown as Membership[]).filter((m) => m.business);
  };
  let memberships = await load();
  if (!memberships.length) {
    await db.rpc('accept_invites');
    memberships = await load();
  }
  if (!memberships.length) redirect('/onboarding');
  const wanted = (await cookies()).get('gx_biz')?.value;
  const current = memberships.find((m) => m.business.id === wanted) ?? memberships[0];
  if (!current.business.onboarded) redirect('/onboarding?finish=' + current.business.id);
  return { client, db, user, memberships, current, business: current.business, role: current.role, canEdit: current.role === 'owner' || current.role === 'manager' };
}
