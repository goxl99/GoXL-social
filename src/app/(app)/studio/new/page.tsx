import Link from 'next/link';
import { getContext } from '@/lib/context';
import { generateCreative } from '@/app/actions2';
import { CATEGORIES, LANGS, STYLES } from '@/lib/creative';
import Flash from '@/components/Flash';

export default async function NewCreative({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { db, business, canEdit } = await getContext();
  const { data: products } = await db.from('products').select('id,name,sku').eq('business_id', business.id).eq('active', true).order('name');
  const { data: b } = await db.from('businesses').select('language').eq('id', business.id).single();
  if (!canEdit) return <div className="card">Only owners and managers can create creatives.</div>;
  if (!products?.length) return <div className="card"><h2>Add a product first</h2><p className="muted" style={{ margin: '6px 0 12px' }}>Creatives are built from your catalogue.</p><Link className="btn pri" href="/products/new">Add product</Link></div>;
  return (
    <>
      <div className="head"><div><h1>New creative</h1><p>Choose what to promote. You can edit the copy afterwards.</p></div></div>
      <Flash searchParams={searchParams} />
      <form action={generateCreative} className="card" style={{ maxWidth: 560 }}>
        <label className="f">Product<select name="product_id" required>{products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</select></label>
        <label className="f">Post type<select name="category">{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="f">Language<select name="language" defaultValue={b?.language ?? 'en'}>{Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="f">Look<select name="style">{Object.entries(STYLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <button className="btn pri">Generate</button>
      </form>
    </>
  );
}
