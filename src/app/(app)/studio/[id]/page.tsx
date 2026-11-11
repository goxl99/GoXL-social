import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getContext } from '@/lib/context';
import { bp } from '@/lib/path';
import { saveCreative, approveCreative, deleteCreative } from '@/app/actions2';
import { STYLES } from '@/lib/creative';
import Flash from '@/components/Flash';

export default async function Creative({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { id } = await params;
  const { db, business, canEdit } = await getContext();
  const { data: c } = await db.from('creatives').select('*').eq('id', id).eq('business_id', business.id).maybeSingle();
  if (!c) notFound();
  return (
    <>
      <div className="head"><div><h1>{c.headline}</h1><p><span className={'pill ' + (c.approved ? 'good' : 'warn')}>{c.approved ? 'Approved' : 'Needs approval'}</span></p></div>{c.approved && <Link className="btn pri" href="/campaigns/new">Use in a campaign</Link>}</div>
      <Flash searchParams={searchParams} />
      <div className="grid g2">
        <div className="stack">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="preview" src={bp(`/api/creative/${c.id}/image?r=square&t=${new Date(c.updated_at).getTime()}`)} alt="Creative preview" />
          <p className="muted" style={{ fontSize: 12 }}>Preview is square. Instagram posts use 4:5 and stories use 9:16 automatically.</p>
        </div>
        <div className="stack">
          <form action={saveCreative} className="card">
            <input type="hidden" name="id" value={c.id} />
            <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
              <label className="f">Headline (max 60)<input name="headline" defaultValue={c.headline} maxLength={60} required /></label>
              <label className="f">Caption<textarea name="caption" defaultValue={c.caption} rows={5} required /></label>
              <label className="f">Hashtags<input name="hashtags" defaultValue={c.hashtags ?? ''} /></label>
              <label className="f">Look<select name="style" defaultValue={c.style}>{Object.entries(STYLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="f">Use a different photo (optional)<input type="file" name="extra" accept="image/jpeg,image/png,image/webp" /></label>
              {canEdit && <button className="btn">Save changes</button>}
            </fieldset>
          </form>
          {canEdit && (
            <div className="row">
              <form action={approveCreative}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="approved" value={c.approved ? '0' : '1'} /><button className="btn pri">{c.approved ? 'Remove approval' : 'Approve for publishing'}</button></form>
              <form action={deleteCreative}><input type="hidden" name="id" value={c.id} /><button className="btn bad">Delete</button></form>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
