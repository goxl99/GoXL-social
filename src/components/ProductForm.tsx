import { saveProduct, deleteProduct, removeProductImage } from '@/app/actions';
import { publicUrl } from '@/lib/context';

type P = {
  id: string; sku: string; name: string; category: string | null; description: string | null; price: number; discount_price: number | null;
  variants: string[]; sizes: string[]; stock: number; delivery_info: string | null; active: boolean; image_paths: string[];
};

export default function ProductForm({ p, canEdit }: { p?: P; canEdit: boolean }) {
  const dis = !canEdit;
  return (
    <div className="stack">
      <form action={saveProduct} className="card">
        {p && <input type="hidden" name="id" value={p.id} />}
        <fieldset disabled={dis} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="grid g3">
            <label className="f">Name<input id="name" name="name" defaultValue={p?.name} required /></label>
            <label className="f">SKU<input id="sku" name="sku" defaultValue={p?.sku} required /></label>
            <label className="f">Category<input id="category" name="category" defaultValue={p?.category ?? ''} /></label>
            <label className="f">Selling price (₹)<input id="price" name="price" type="number" step="0.01" min="0.01" defaultValue={p?.price} required /></label>
            <label className="f">Discounted price (₹)<input id="discount_price" name="discount_price" type="number" step="0.01" min="0.01" defaultValue={p?.discount_price ?? ''} /></label>
            <label className="f">Stock<input id="stock" name="stock" type="number" min="0" step="1" defaultValue={p && p.stock < 100000 ? p.stock : 0} />
              <span className="opt" style={{ marginTop: 8, marginBottom: 0 }}><input type="checkbox" name="unlimited" defaultChecked={!!p && p.stock >= 100000} /> Unlimited: a service, course, booking or digital offer</span></label>
            <label className="f">Variants (comma separated)<input id="variants" name="variants" defaultValue={p?.variants.join(', ')} placeholder="Indigo, Mustard" /></label>
            <label className="f">Sizes (comma separated)<input id="sizes" name="sizes" defaultValue={p?.sizes.join(', ')} placeholder="S, M, L" /></label>
            <label className="f">Delivery information<input id="delivery_info" name="delivery_info" defaultValue={p?.delivery_info ?? ''} /></label>
          </div>
          <label className="f">Description<textarea id="description" name="description" defaultValue={p?.description ?? ''} /></label>
          <label className="f">Add photos (JPG, PNG or WebP, up to 5 MB each, 6 per product)<input id="images" name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple /></label>
          <label className="row" style={{ marginBottom: 14 }}><input type="checkbox" name="active" defaultChecked={p ? p.active : true} /> Available to customers and the AI assistant</label>
          {canEdit && <button className="btn pri">{p ? 'Save product' : 'Add product'}</button>}
        </fieldset>
      </form>
      {p && p.image_paths.length > 0 && (
        <div className="card">
          <h2 style={{ marginBottom: 10 }}>Photos</h2>
          <div className="imgs">
            {p.image_paths.map((path) => (
              <figure key={path}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={publicUrl(path)!} alt={p.name} />
                {canEdit && <figcaption><form action={removeProductImage}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="path" value={path} /><button className="btn bad sm">Remove</button></form></figcaption>}
              </figure>
            ))}
          </div>
        </div>
      )}
      {p && canEdit && (
        <form action={deleteProduct} className="card row sb">
          <div><h3>Delete this product</h3><p className="muted">Existing orders keep their line items. The product leaves your catalogue and its photos are removed.</p></div>
          <input type="hidden" name="id" value={p.id} /><button className="btn bad">Delete product</button>
        </form>
      )}
    </div>
  );
}
