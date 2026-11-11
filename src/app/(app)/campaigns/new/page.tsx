import Link from 'next/link';
import { getContext } from '@/lib/context';
import { createCampaign } from '@/app/actions2';
import { TARGET_LABELS } from '@/lib/creative';
import Flash from '@/components/Flash';

export default async function NewCampaign({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { db, business, canEdit } = await getContext();
  if (!canEdit) return <div className="card">Only owners and managers can create campaigns.</div>;
  const { data: creatives } = await db.from('creatives').select('id,headline').eq('business_id', business.id).eq('approved', true).order('created_at', { ascending: false });
  const { data: accts } = await db.from('social_accounts').select('platform,status').eq('business_id', business.id);
  const ok = (p: string) => p === 'whatsapp' || accts?.find((a) => a.platform === p)?.status === 'connected';
  if (!creatives?.length) return <div className="card"><h2>Approve a creative first</h2><p className="muted" style={{ margin: '6px 0 12px' }}>Campaigns publish approved creatives only.</p><Link className="btn pri" href="/studio">Open the studio</Link></div>;
  return (
    <>
      <div className="head"><div><h1>New campaign</h1></div></div>
      <Flash searchParams={searchParams} />
      <form action={createCampaign} className="card" style={{ maxWidth: 620 }}>
        <label className="f">Campaign name<input name="name" required placeholder="Diwali kurta sale" /></label>
        <label className="f">Creative<select name="creative_id">{creatives.map((c) => <option key={c.id} value={c.id}>{c.headline}</option>)}</select></label>
        <div className="f" style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Post to
          {Object.entries(TARGET_LABELS).map(([k, v]) => {
            const p = k.split('_')[0];
            return <label key={k} className="opt"><input type="checkbox" name="targets" value={k} disabled={!ok(p)} /> {v}{!ok(p) && <span className="muted"> (connect {p} first)</span>}</label>;
          })}
        </div>
        <label className="f">Goal (optional)<input name="objective" placeholder="Get 20 inquiries" /></label>
        <label className="f">Offer (optional)<input name="offer" /></label>
        <label className="f">Budget in ₹ (optional, for your records)<input name="budget" type="number" min="0" step="1" /></label>
        <div className="f" style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>When
          <label className="opt"><input type="radio" name="when" value="now" defaultChecked /> Publish now</label>
          <label className="opt"><input type="radio" name="when" value="later" /> Schedule (Indian time) <input type="datetime-local" name="schedule_at" style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 4 }} /></label>
          <label className="opt"><input type="radio" name="when" value="draft" /> Save as draft</label>
        </div>
        <button className="btn pri">Create campaign</button>
      </form>
    </>
  );
}
