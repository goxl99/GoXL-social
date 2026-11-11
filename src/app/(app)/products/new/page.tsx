import { getContext } from '@/lib/context';
import ProductForm from '@/components/ProductForm';
import Flash from '@/components/Flash';

export default async function NewProduct({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { canEdit } = await getContext();
  return (<><div className="head"><div><h1>Add product</h1></div></div><Flash searchParams={searchParams} /><ProductForm canEdit={canEdit} /></>);
}
