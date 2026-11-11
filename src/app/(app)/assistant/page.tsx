import Link from 'next/link';
import { getContext } from '@/lib/context';
import { hasAdmin } from '@/lib/supabase/admin';
import { resolveAI } from '@/lib/ai/llm';

export default async function Assistant() {
  const { db, business } = await getContext();
  const [{ data: b }, { count: active }, { count: total }, { data: acct }] = await Promise.all([
    db.from('businesses').select('language,tone,shipping_policy,return_policy,faq,delivery_areas,free_delivery_threshold,delivery_fee').eq('id', business.id).single(),
    db.from('products').select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('active', true),
    db.from('products').select('id', { count: 'exact', head: true }).eq('business_id', business.id),
    db.from('social_accounts').select('status,handle').eq('business_id', business.id).eq('platform', 'whatsapp').maybeSingle(),
  ]);
  const ai = hasAdmin() ? await resolveAI(business.id) : null;
  const llm = !!ai;
  const gaps = [!b?.shipping_policy && 'shipping policy', !b?.return_policy && 'return policy', !b?.faq && 'FAQs', !b?.delivery_areas && 'delivery areas'].filter(Boolean) as string[];
  return (
    <>
      <div className="head"><div><h1>AI Sales Assistant</h1><p>Answers customers on WhatsApp using only what you have entered. It hands over to you when it is unsure.</p></div></div>
      <div className="grid g3">
        <div className="card"><h2>Mode</h2><p style={{ margin: '8px 0' }}><span className={'pill ' + (llm ? 'good' : 'warn')}>{llm ? 'AI-powered' : 'Rules only'}</span></p><p className="muted" style={{ fontSize: 12.5 }}>{llm ? `${ai!.provider === 'openai' ? 'OpenAI' : 'Claude'}, model ${ai!.model}. Every reply is checked against your real prices and falls back to the rules engine if anything does not match.` : 'Add a Claude or OpenAI key in Settings for natural conversation in English, Hindi and Gujarati. Until then it answers price, variants, stock, delivery, returns and orders with fixed templates.'}</p></div>
        <div className="card"><h2>Knowledge</h2><p style={{ margin: '8px 0', fontSize: 13 }}>{active ?? 0} active products of {total ?? 0}</p><p className="muted" style={{ fontSize: 12.5 }}>{gaps.length ? `Missing: ${gaps.join(', ')}. The assistant will hand over questions on these.` : 'Policies, FAQs and delivery areas are filled in.'} <Link href="/business">Edit business details</Link> or <Link href="/products">the catalogue</Link>.</p></div>
        <div className="card"><h2>Channel</h2><p style={{ margin: '8px 0' }}><span className={'pill ' + (acct?.status === 'connected' ? 'good' : 'warn')}>{acct?.status === 'connected' ? `WhatsApp ${acct.handle}` : 'WhatsApp not connected'}</span></p><p className="muted" style={{ fontSize: 12.5 }}>You can test the assistant now from the <Link href="/inbox">inbox</Link> without WhatsApp.</p></div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Guardrails</h2>
        <ul style={{ fontSize: 13, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Quotes only prices from your catalogue (and exact multiples). Never invents discounts.</li>
          <li>Never takes payment or confirms an order. At buy intent it collects product, variant, size, quantity and address with pincode, flags the lead, and you confirm.</li>
          <li>Hands over to a person for complaints, requests for a human, and anything it cannot answer from your information.</li>
          <li>Stops replying the moment a team member sends a message. Resume it from the inbox.</li>
          <li>Free delivery above ₹{Number(b?.free_delivery_threshold ?? 0).toLocaleString('en-IN')}, otherwise ₹{Number(b?.delivery_fee ?? 0).toLocaleString('en-IN')}.</li>
        </ul>
      </div>
    </>
  );
}
