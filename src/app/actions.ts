'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getClient, getUser } from '@/lib/supabase/server';
import { getContext, BUCKET, type Role } from '@/lib/context';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const csv = (s: string) => [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))];
const go = (path: string, kind: 'msg' | 'err', text: string): never => {
  const sep = path.includes('?') ? '&' : '?';
  redirect(`${path}${sep}${kind}=${encodeURIComponent(text)}`);
};
const friendly = (m: string) =>
  m.includes('products_business_id_sku_key') ? 'That SKU already exists in your catalogue.'
  : m.includes('discount_price') ? 'The discounted price must be above zero and not higher than the selling price.'
  : m.includes('at least one owner') ? 'A business needs at least one owner.'
  : m.includes('row-level security') ? 'Your role does not allow this action.'
  : m;

export async function signOut() {
  const c = await getClient();
  await c.auth.signOut();
  redirect('/login');
}

export async function switchBusiness(f: FormData) {
  (await cookies()).set('gx_biz', str(f, 'id'), { path: process.env.NEXT_PUBLIC_BASE_PATH ?? '/business-live', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
  redirect('/dashboard');
}

/* ---------- onboarding and business profile ---------- */
const BUSINESS_FIELDS = ['category', 'description', 'phone', 'email', 'city', 'delivery_areas', 'target_customer', 'tone', 'shipping_policy', 'return_policy', 'faq'] as const;

function businessPatch(f: FormData) {
  const patch: Record<string, unknown> = {};
  for (const k of BUSINESS_FIELDS) if (f.has(k)) patch[k] = str(f, k) || null;
  if (f.has('language')) patch.language = ['en', 'hi', 'gu'].includes(str(f, 'language')) ? str(f, 'language') : 'en';
  for (const k of ['brand_primary', 'brand_accent']) if (f.has(k)) patch[k] = /^#[0-9a-fA-F]{6}$/.test(str(f, k)) ? str(f, k) : undefined;
  if (f.has('free_delivery_threshold')) patch.free_delivery_threshold = Math.max(0, Number(str(f, 'free_delivery_threshold')) || 0);
  if (f.has('delivery_fee')) patch.delivery_fee = Math.max(0, Number(str(f, 'delivery_fee')) || 0);
  return patch;
}

export async function completeOnboarding(f: FormData) {
  const client = await getClient();
  const user = await getUser();
  if (!user) redirect('/login');
  const db = client.schema('gx');
  const name = str(f, 'name');
  let bid = str(f, 'bid');
  if (!name) go('/onboarding' + (bid ? `?finish=${bid}` : ''), 'err', 'Please enter your business name.');
  if (!bid) {
    const { data, error } = await db.rpc('create_business', { p_name: name, p_category: str(f, 'category'), p_phone: str(f, 'phone'), p_city: str(f, 'city') });
    if (error) go('/onboarding', 'err', friendly(error.message));
    bid = data as string;
  }
  const accountType = str(f, 'account_type') === 'agency' ? 'agency' : 'business';
  const patch = { ...businessPatch(f), name, onboarded: true, account_type: accountType };
  const { error } = await db.from('businesses').update(patch).eq('id', bid);
  if (error) go(`/onboarding?finish=${bid}`, 'err', friendly(error.message));
  await db.from('social_accounts').upsert(['instagram', 'facebook', 'whatsapp'].map((platform) => ({ business_id: bid, platform })), { onConflict: 'business_id,platform', ignoreDuplicates: true });
  (await cookies()).set('gx_biz', bid, { path: process.env.NEXT_PUBLIC_BASE_PATH ?? '/business-live', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
  redirect('/pending');
}

async function uploadImage(client: Awaited<ReturnType<typeof getClient>>, path: string, file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Images must be JPG, PNG or WebP.';
  if (file.size > 5 * 1024 * 1024) return 'Each image must be under 5 MB.';
  const { error } = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  return error ? error.message : null;
}
const extOf = (file: File) => (file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg');

export async function updateBusiness(f: FormData) {
  const { client, db, business, canEdit } = await getContext();
  if (!canEdit) go('/business', 'err', 'Only owners and managers can edit the business profile.');
  const name = str(f, 'name');
  if (!name) go('/business', 'err', 'Business name is required.');
  const patch: Record<string, unknown> = { ...businessPatch(f), name };
  const logo = f.get('logo');
  if (logo instanceof File && logo.size > 0) {
    const path = `${business.id}/logo/${crypto.randomUUID()}.${extOf(logo)}`;
    const err = await uploadImage(client, path, logo);
    if (err) go('/business', 'err', err);
    patch.logo_path = path;
  }
  const { error } = await db.from('businesses').update(patch).eq('id', business.id);
  if (error) go('/business', 'err', friendly(error.message));
  revalidatePath('/', 'layout');
  go('/business', 'msg', 'Business profile saved.');
}

/* ---------- products ---------- */
export async function saveProduct(f: FormData) {
  const { client, db, business, canEdit } = await getContext();
  const id = str(f, 'id');
  const back = id ? `/products/${id}` : '/products/new';
  if (!canEdit) go('/products', 'err', 'Only owners and managers can change the catalogue.');
  const name = str(f, 'name'), sku = str(f, 'sku');
  const price = Number(str(f, 'price')), disc = str(f, 'discount_price') ? Number(str(f, 'discount_price')) : null, stock = Math.trunc(Number(str(f, 'stock') || '0'));
  if (!name) go(back, 'err', 'Enter a product name.');
  if (!sku) go(back, 'err', 'Enter a SKU.');
  if (!(price > 0)) go(back, 'err', 'Enter a selling price above zero.');
  if (disc !== null && !(disc > 0 && disc <= price)) go(back, 'err', 'The discounted price must be above zero and not higher than the selling price.');
  if (!(stock >= 0)) go(back, 'err', 'Stock cannot be negative.');
  const row = {
    business_id: business.id, name, sku, category: str(f, 'category') || null, description: str(f, 'description') || null,
    price, discount_price: disc, stock, variants: csv(str(f, 'variants')), sizes: csv(str(f, 'sizes')),
    delivery_info: str(f, 'delivery_info') || null, active: f.get('active') === 'on',
  };
  let pid = id;
  if (id) {
    const { error } = await db.from('products').update(row).eq('id', id).eq('business_id', business.id);
    if (error) go(back, 'err', friendly(error.message));
  } else {
    const { data, error } = await db.from('products').insert(row).select('id').single();
    if (error) go(back, 'err', friendly(error.message));
    pid = data!.id;
  }
  const files = f.getAll('images').filter((x): x is File => x instanceof File && x.size > 0);
  if (files.length) {
    const { data: cur } = await db.from('products').select('image_paths').eq('id', pid).single();
    const paths: string[] = [...(cur?.image_paths ?? [])];
    for (const file of files.slice(0, 6 - paths.length)) {
      const path = `${business.id}/products/${pid}/${crypto.randomUUID()}.${extOf(file)}`;
      const err = await uploadImage(client, path, file);
      if (err) { await db.from('products').update({ image_paths: paths }).eq('id', pid); go(`/products/${pid}`, 'err', `Product saved, but an image failed: ${err}`); }
      paths.push(path);
    }
    await db.from('products').update({ image_paths: paths }).eq('id', pid);
  }
  revalidatePath('/products');
  go(`/products/${pid}`, 'msg', id ? 'Product saved.' : 'Product added.');
}

export async function removeProductImage(f: FormData) {
  const { client, db, business, canEdit } = await getContext();
  const id = str(f, 'id'), path = str(f, 'path');
  if (!canEdit) go(`/products/${id}`, 'err', 'Only owners and managers can change the catalogue.');
  if (!path.startsWith(business.id + '/')) go(`/products/${id}`, 'err', 'Invalid image.');
  const { data: cur } = await db.from('products').select('image_paths').eq('id', id).eq('business_id', business.id).single();
  await db.from('products').update({ image_paths: (cur?.image_paths ?? []).filter((p: string) => p !== path) }).eq('id', id);
  await client.storage.from(BUCKET).remove([path]);
  go(`/products/${id}`, 'msg', 'Image removed.');
}

export async function deleteProduct(f: FormData) {
  const { client, db, business, canEdit } = await getContext();
  const id = str(f, 'id');
  if (!canEdit) go('/products', 'err', 'Only owners and managers can change the catalogue.');
  const { data: cur } = await db.from('products').select('image_paths').eq('id', id).eq('business_id', business.id).single();
  const { error } = await db.from('products').delete().eq('id', id).eq('business_id', business.id);
  if (error) go('/products', 'err', friendly(error.message));
  if (cur?.image_paths?.length) await client.storage.from(BUCKET).remove(cur.image_paths);
  revalidatePath('/products');
  go('/products', 'msg', 'Product deleted.');
}

export async function updateStock(f: FormData) {
  const { db, business, canEdit } = await getContext();
  const stock = Math.trunc(Number(str(f, 'stock')));
  if (!canEdit) go('/products', 'err', 'Only owners and managers can change the catalogue.');
  if (!(stock >= 0)) go('/products', 'err', 'Stock cannot be negative.');
  const { error } = await db.from('products').update({ stock }).eq('id', str(f, 'id')).eq('business_id', business.id);
  if (error) go('/products', 'err', friendly(error.message));
  revalidatePath('/products');
  go('/products', 'msg', 'Stock updated.');
}

/* ---------- team ---------- */
const ROLES: Role[] = ['owner', 'manager', 'sales', 'fulfilment'];
export async function inviteMember(f: FormData) {
  const { db, user, business, role } = await getContext();
  if (role !== 'owner') go('/team', 'err', 'Only owners can invite people.');
  const email = str(f, 'email').toLowerCase(), r = str(f, 'role') as Role;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) go('/team', 'err', 'Enter a valid email address.');
  if (!ROLES.includes(r) || r === 'owner') go('/team', 'err', 'Choose a role for the invite.');
  const { data: dup } = await db.from('members').select('user_id').eq('business_id', business.id).eq('email', email).maybeSingle();
  if (dup) go('/team', 'err', 'That person is already on the team.');
  const { error } = await db.from('invites').upsert({ business_id: business.id, email, role: r, invited_by: user.id }, { onConflict: 'business_id,email' });
  if (error) go('/team', 'err', friendly(error.message));
  go('/team', 'msg', `Invite saved. ${email} joins automatically when they sign up or sign in with that email.`);
}
export async function cancelInvite(f: FormData) {
  const { db, business, role } = await getContext();
  if (role !== 'owner') go('/team', 'err', 'Only owners can manage invites.');
  await db.from('invites').delete().eq('id', str(f, 'id')).eq('business_id', business.id);
  go('/team', 'msg', 'Invite cancelled.');
}
export async function changeRole(f: FormData) {
  const { db, business, role } = await getContext();
  const r = str(f, 'role') as Role;
  if (role !== 'owner') go('/team', 'err', 'Only owners can change roles.');
  if (!ROLES.includes(r)) go('/team', 'err', 'Unknown role.');
  const { error } = await db.from('members').update({ role: r }).eq('business_id', business.id).eq('user_id', str(f, 'user_id'));
  if (error) go('/team', 'err', friendly(error.message));
  go('/team', 'msg', 'Role updated.');
}
export async function removeMember(f: FormData) {
  const { db, business, user } = await getContext();
  const uid = str(f, 'user_id');
  const { error } = await db.from('members').delete().eq('business_id', business.id).eq('user_id', uid);
  if (error) go('/team', 'err', friendly(error.message));
  if (uid === user.id) redirect('/dashboard');
  go('/team', 'msg', 'Member removed.');
}
