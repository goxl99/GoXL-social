import { redirect } from 'next/navigation';
import { getClient } from '@/lib/supabase/server';
import { completeOnboarding } from '@/app/actions';
import Flash from '@/components/Flash';

type SP = Promise<{ finish?: string; msg?: string; err?: string }>;

export default async function Onboarding({ searchParams }: { searchParams: SP }) {
  const client = await getClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect('/login');
  const { finish } = await searchParams;
  let b: Record<string, string | number | null> = {};
  if (finish) {
    const { data } = await client.schema('gx').from('businesses').select('*').eq('id', finish).maybeSingle();
    if (data) b = data;
  }
  const v = (k: string, d = '') => String(b[k] ?? d);
  return (
    <div className="wiz">
      <div className="brand" style={{ padding: '0 0 14px' }}><div className="mark">GX</div><div><b>GoXL Commerce</b><span>CLARITY BEFORE ACTION</span></div></div>
      <h1>Set up your business</h1>
      <p className="muted" style={{ margin: '4px 0 16px' }}>Four short sections. The AI assistant and your creatives will use these details, so you only enter them once.</p>
      <Flash searchParams={searchParams} />
      <form action={completeOnboarding} className="stack">
        {finish && <input type="hidden" name="bid" value={finish} />}
        <div className="card">
          <div className="st"><span className="cur">0 Account type</span></div>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 10px' }}>Which of these describes you? GoXL uses this to set up your account correctly.</p>
          <div className="grid g2">
            <label className="f" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <input type="radio" name="account_type" value="business" defaultChecked={v('account_type', 'business') !== 'agency'} style={{ width: 'auto', marginTop: 3 }} />
              <span><b>Business owner</b><br /><span className="muted" style={{ fontSize: 12.5 }}>I sell my own products or services.</span></span>
            </label>
            <label className="f" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <input type="radio" name="account_type" value="agency" defaultChecked={v('account_type') === 'agency'} style={{ width: 'auto', marginTop: 3 }} />
              <span><b>Agency</b><br /><span className="muted" style={{ fontSize: 12.5 }}>I run marketing and sales for other businesses.</span></span>
            </label>
          </div>
        </div>
        <div className="card">
          <div className="st"><span className="cur">1 Business</span></div>
          <div className="grid g2">
            <label className="f">Business or agency name<input id="name" name="name" defaultValue={v('name')} required /></label>
            <label className="f">Category<input id="category" name="category" defaultValue={v('category')} placeholder="e.g. Home textiles" /></label>
            <label className="f">WhatsApp number<input id="phone" name="phone" defaultValue={v('phone')} placeholder="+91 98765 43210" /></label>
            <label className="f">Business email<input id="email" name="email" type="email" defaultValue={v('email', user.email ?? '')} /></label>
            <label className="f">City<input id="city" name="city" defaultValue={v('city')} /></label>
            <label className="f">Delivery areas<input id="delivery_areas" name="delivery_areas" defaultValue={v('delivery_areas')} placeholder="Gujarat, Maharashtra" /></label>
          </div>
          <label className="f">What do you sell?<textarea id="description" name="description" defaultValue={v('description')} /></label>
          <label className="f">Who are your customers?<input id="target_customer" name="target_customer" defaultValue={v('target_customer')} /></label>
        </div>
        <div className="card">
          <div className="st"><span className="cur">2 Brand and language</span></div>
          <div className="grid g3">
            <label className="f">Brand colour<input id="brand_primary" name="brand_primary" type="color" defaultValue={v('brand_primary', '#1B4332')} /></label>
            <label className="f">Accent colour<input id="brand_accent" name="brand_accent" type="color" defaultValue={v('brand_accent', '#C8E600')} /></label>
            <label className="f">Customer language
              <select id="language" name="language" defaultValue={v('language', 'en')}><option value="en">English</option><option value="hi">Hindi</option><option value="gu">Gujarati</option></select>
            </label>
          </div>
          <label className="f">Tone of voice
            <select id="tone" name="tone" defaultValue={v('tone', 'Warm and simple')}><option>Warm and simple</option><option>Professional</option><option>Playful</option></select>
          </label>
        </div>
        <div className="card">
          <div className="st"><span className="cur">3 Policies</span></div>
          <div className="grid g2">
            <label className="f">Free delivery above (₹)<input id="free_delivery_threshold" name="free_delivery_threshold" type="number" min="0" defaultValue={v('free_delivery_threshold', '999')} /></label>
            <label className="f">Delivery charge below that (₹)<input id="delivery_fee" name="delivery_fee" type="number" min="0" defaultValue={v('delivery_fee', '60')} /></label>
          </div>
          <label className="f">Shipping policy<input id="shipping_policy" name="shipping_policy" defaultValue={v('shipping_policy')} placeholder="We dispatch within 2 working days." /></label>
          <label className="f">Return policy<input id="return_policy" name="return_policy" defaultValue={v('return_policy')} placeholder="7-day exchange on unused items." /></label>
          <label className="f">Frequently asked questions (one per line: question? answer)<textarea id="faq" name="faq" defaultValue={v('faq')} style={{ minHeight: 110 }} /></label>
        </div>
        <button className="btn pri">Finish setup</button>
      </form>
    </div>
  );
}
