import Link from 'next/link';
import { getContext } from '@/lib/context';
import { bp } from '@/lib/path';
import { CATEGORIES } from '@/lib/creative';
import Flash from '@/components/Flash';

export default async function Studio({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { db, business, canEdit } = await getContext();
  const { data } = await db.from('creatives').select('id,headline,category,approved,language,created_at').eq('business_id', business.id).order('created_at', { ascending: false });
  return (
    <>
      <div className="head"><div><h1>AI Creative Studio</h1><p>Branded images and captions built from your catalogue. Prices always come from the product, never from the AI.</p></div>{canEdit && <Link className="btn pri" href="/studio/new">New creative</Link>}</div>
      <Flash searchParams={searchParams} />
      {data?.length ? (
        <div className="cgrid">
          {data.map((c) => (
            <Link key={c.id} href={`/studio/${c.id}`} className="ccard">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bp(`/api/creative/${c.id}/image?r=square`)} alt={c.headline} loading="lazy" />
              <div className="b"><b>{c.headline}</b><div className="row" style={{ marginTop: 4 }}><span className={'pill ' + (c.approved ? 'good' : 'warn')}>{c.approved ? 'Approved' : 'Needs approval'}</span><span className="muted" style={{ fontSize: 11.5 }}>{CATEGORIES[c.category]}</span></div></div>
            </Link>
          ))}
        </div>
      ) : <div className="card"><h2>No creatives yet</h2><p className="muted" style={{ margin: '6px 0 12px' }}>Pick a product and a post type and the studio drafts the image and caption.</p>{canEdit && <Link className="btn pri" href="/studio/new">Create your first</Link>}</div>}
    </>
  );
}
