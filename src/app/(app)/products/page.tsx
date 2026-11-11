import Link from 'next/link';
import { getContext, publicUrl } from '@/lib/context';
import { updateStock } from '@/app/actions';
import Flash from '@/components/Flash';

const inr = (n: number | null) => '₹' + Number(n ?? 0).toLocaleString('en-IN');

export default async function Products({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { db, business, canEdit } = await getContext();
  const { data: products } = await db.from('products').select('*').eq('business_id', business.id).order('created_at', { ascending: false });
  return (
    <>
      <div className="head">
        <div><h1>Products & Catalogue</h1><p>The single source of truth for your creatives, the AI assistant and orders. The assistant only quotes what is here.</p></div>
        {canEdit && <Link className="btn pri" href="/products/new">Add product</Link>}
      </div>
      <Flash searchParams={searchParams} />
      {products?.length ? (
        <div className="tw">
          <table>
            <thead><tr><th></th><th>Product</th><th>SKU</th><th className="n">Price</th><th className="n">Offer</th><th>Variants</th><th className="n">Stock</th><th>Status</th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td><div className="thumb">{/* eslint-disable-next-line @next/next/no-img-element */}{p.image_paths[0] ? <img src={publicUrl(p.image_paths[0])!} alt="" /> : p.name[0]}</div></td>
                  <td><Link href={`/products/${p.id}`}><b>{p.name}</b></Link><div className="muted" style={{ fontSize: 12 }}>{p.category}</div></td>
                  <td className="mono">{p.sku}</td>
                  <td className="n">{inr(p.price)}</td>
                  <td className="n">{p.discount_price ? inr(p.discount_price) : '-'}</td>
                  <td>{p.variants.join(', ')}<div className="muted" style={{ fontSize: 12 }}>{p.sizes.join(', ')}</div></td>
                  <td className="n">
                    {canEdit ? (
                      <form action={updateStock} className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        <input type="hidden" name="id" value={p.id} />
                        <input name="stock" type="number" min="0" defaultValue={p.stock >= 100000 ? '' : p.stock} placeholder={p.stock >= 100000 ? 'Unlimited' : undefined} aria-label={`Stock for ${p.name}`} style={{ width: 70, border: '1px solid var(--line)', borderRadius: 6, padding: 4 }} />
                        <button className="btn sec sm">Set</button>
                      </form>
                    ) : p.stock >= 100000 ? 'Unlimited' : p.stock}
                    {p.stock <= 5 && <div><span className="pill warn">Low</span></div>}
                  </td>
                  <td>{p.active ? <span className="pill good">Active</span> : <span className="pill">Hidden</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card"><h2>No products yet</h2><p className="muted" style={{ margin: '6px 0 12px' }}>Add your first product with a photo so customers and the AI assistant have something to show.</p>{canEdit && <Link className="btn pri" href="/products/new">Add your first product</Link>}</div>
      )}
    </>
  );
}
