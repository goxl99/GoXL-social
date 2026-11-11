import { getContext, publicUrl } from '@/lib/context';
import { updateBusiness } from '@/app/actions';
import Flash from '@/components/Flash';

export default async function BusinessPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { db, business, canEdit } = await getContext();
  const { data: b } = await db.from('businesses').select('*').eq('id', business.id).single();
  const v = (k: string) => (b?.[k] ?? '') as string;
  const logo = publicUrl(b?.logo_path);
  return (
    <>
      <div className="head"><div><h1>My Business</h1><p>Everything the AI assistant and your creatives know about you.</p></div></div>
      <Flash searchParams={searchParams} />
      {!canEdit && <div className="note" style={{ marginBottom: 16 }}>Only owners and managers can edit the profile.</div>}
      <form action={updateBusiness} className="stack">
        <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
          <div className="card">
            <h2 style={{ marginBottom: 12 }}>Basics</h2>
            <div className="grid g2">
              <label className="f">Business name<input id="name" name="name" defaultValue={v('name')} required /></label>
              <label className="f">Category<input id="category" name="category" defaultValue={v('category')} /></label>
              <label className="f">WhatsApp number<input id="phone" name="phone" defaultValue={v('phone')} /></label>
              <label className="f">Business email<input id="email" name="email" type="email" defaultValue={v('email')} /></label>
              <label className="f">City<input id="city" name="city" defaultValue={v('city')} /></label>
              <label className="f">Delivery areas<input id="delivery_areas" name="delivery_areas" defaultValue={v('delivery_areas')} /></label>
            </div>
            <label className="f">Description<textarea id="description" name="description" defaultValue={v('description')} /></label>
            <label className="f">Target customer<input id="target_customer" name="target_customer" defaultValue={v('target_customer')} /></label>
          </div>
          <div className="card">
            <h2 style={{ marginBottom: 12 }}>Brand</h2>
            <div className="row" style={{ marginBottom: 12 }}>
              <div className="thumb" style={{ width: 64, height: 64, borderRadius: '50%' }}>{/* eslint-disable-next-line @next/next/no-img-element */}{logo ? <img src={logo} alt="Logo" /> : (v('name')[0] ?? 'B')}</div>
              <label className="f" style={{ flex: 1, margin: 0 }}>Logo (JPG, PNG or WebP, up to 5 MB)<input id="logo" name="logo" type="file" accept="image/jpeg,image/png,image/webp" /></label>
            </div>
            <div className="grid g3">
              <label className="f">Brand colour<input id="brand_primary" name="brand_primary" type="color" defaultValue={v('brand_primary')} /></label>
              <label className="f">Accent colour<input id="brand_accent" name="brand_accent" type="color" defaultValue={v('brand_accent')} /></label>
              <label className="f">Customer language<select id="language" name="language" defaultValue={v('language')}><option value="en">English</option><option value="hi">Hindi</option><option value="gu">Gujarati</option></select></label>
            </div>
            <label className="f">Tone of voice<select id="tone" name="tone" defaultValue={v('tone')}><option>Warm and simple</option><option>Professional</option><option>Playful</option></select></label>
          </div>
          <div className="card">
            <h2 style={{ marginBottom: 12 }}>Policies</h2>
            <div className="grid g2">
              <label className="f">Free delivery above (₹)<input id="free_delivery_threshold" name="free_delivery_threshold" type="number" min="0" defaultValue={v('free_delivery_threshold')} /></label>
              <label className="f">Delivery charge below that (₹)<input id="delivery_fee" name="delivery_fee" type="number" min="0" defaultValue={v('delivery_fee')} /></label>
            </div>
            <label className="f">Shipping policy<input id="shipping_policy" name="shipping_policy" defaultValue={v('shipping_policy')} /></label>
            <label className="f">Return policy<input id="return_policy" name="return_policy" defaultValue={v('return_policy')} /></label>
            <label className="f">Frequently asked questions (one per line: question? answer)<textarea id="faq" name="faq" defaultValue={v('faq')} style={{ minHeight: 110 }} /></label>
          </div>
          {canEdit && <div><button className="btn pri">Save business profile</button></div>}
        </fieldset>
      </form>
    </>
  );
}
