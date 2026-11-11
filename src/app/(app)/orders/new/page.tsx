import { getContext } from '@/lib/context';
import { createManualOrder } from '@/app/actions4';
import Flash from '@/components/Flash';

export default async function NewOrder({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { db, business, role } = await getContext();
  if (role === 'fulfilment') return <div className="card">Your role cannot create orders.</div>;
  const { data: products } = await db.from('products').select('id,name,sku,price,discount_price,stock').eq('business_id', business.id).eq('active', true).order('name');
  return (
    <>
      <div className="head"><div><h1>New order</h1><p>For orders that arrive by phone or in person. Prices come from the catalogue and stock is reserved.</p></div></div>
      <Flash searchParams={searchParams} />
      <form action={createManualOrder} className="card" style={{ maxWidth: 620 }}>
        <div className="grid g2">
          <label className="f">Customer name<input name="name" required /></label>
          <label className="f">WhatsApp number with country code<input name="phone" inputMode="numeric" placeholder="919876543210" required /></label>
        </div>
        <label className="f">Product<select name="product_id" required>{products?.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku}) · ₹{Number(p.discount_price ?? p.price)} · {p.stock} in stock</option>)}</select></label>
        <div className="grid g3">
          <label className="f">Variant (optional)<input name="variant" /></label>
          <label className="f">Size (optional)<input name="size" /></label>
          <label className="f">Quantity<input name="qty" type="number" min="1" max="50" defaultValue={1} required /></label>
        </div>
        <label className="f">Delivery address with 6-digit pincode<textarea name="address" required /></label>
        <button className="btn pri">Create order</button>
      </form>
    </>
  );
}
