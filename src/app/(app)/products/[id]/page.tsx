import { notFound } from 'next/navigation';
import { getContext } from '@/lib/context';
import ProductForm from '@/components/ProductForm';
import Flash from '@/components/Flash';

export default async function EditProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { id } = await params;
  const { db, business, canEdit } = await getContext();
  const { data: p } = await db.from('products').select('*').eq('id', id).eq('business_id', business.id).maybeSingle();
  if (!p) notFound();
  return (<><div className="head"><div><h1>{p.name}</h1><p className="mono">{p.sku}</p></div></div><Flash searchParams={searchParams} /><ProductForm p={p} canEdit={canEdit} /></>);
}
