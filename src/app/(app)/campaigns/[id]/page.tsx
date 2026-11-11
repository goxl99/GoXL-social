import { notFound } from 'next/navigation';
import { getContext } from '@/lib/context';
import { bp, fmtDT } from '@/lib/path';
import { retryPost, markShared, cancelPost } from '@/app/actions2';
import { waLink } from '@/lib/publish';
import Flash from '@/components/Flash';

const TONE: Record<string, string> = { published: 'good', shared: 'good', failed: 'bad', scheduled: 'warn', publishing: 'warn', share_manually: 'warn' };

export default async function Campaign({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { id } = await params;
  const { db, business, canEdit } = await getContext();
  const { data: c } = await db.from('campaigns').select('*, product:products(name)').eq('id', id).eq('business_id', business.id).maybeSingle();
  if (!c) notFound();
  const { data: posts } = await db.from('posts').select('*').eq('campaign_id', id).order('created_at');
  const { data: wa } = await db.from('social_accounts').select('handle').eq('business_id', business.id).eq('platform', 'whatsapp').maybeSingle();
  const { count } = await db.from('conversations').select('id', { count: 'exact', head: true }).eq('campaign_id', id).eq('is_test', false);
  const link = waLink(wa?.handle, c.code);
  return (
    <>
      <div className="head"><div><h1>{c.name}</h1><p><span className="mono">{c.code}</span> · {(c.product as unknown as { name: string } | null)?.name ?? 'No product'} · {count ?? 0} inquiries</p></div></div>
      <Flash searchParams={searchParams} />
      {link && <div className="note" style={{ marginBottom: 16 }}>Campaign link: <span className="mono" style={{ wordBreak: 'break-all' }}>{link}</span>. Customers who message from it are attributed to this campaign.</div>}
      <div className="stack">
        {posts?.map((p) => (
          <div className="card" key={p.id}>
            <div className="row sb">
              <div className="row"><b style={{ textTransform: 'capitalize' }}>{p.platform} {p.format}</b><span className={'pill ' + (TONE[p.status] ?? '')}>{p.status.replace('_', ' ')}</span><span className="muted" style={{ fontSize: 12 }}>{p.status === 'scheduled' ? `Goes out ${fmtDT(p.scheduled_for)} IST` : p.published_at ? `Posted ${fmtDT(p.published_at)}` : ''}</span></div>
              {canEdit && (
                <div className="row">
                  {['draft', 'failed', 'scheduled'].includes(p.status) && p.platform !== 'whatsapp' && <form action={retryPost}><input type="hidden" name="id" value={p.id} /><button className="btn sm">{p.status === 'failed' ? 'Retry' : 'Publish now'}</button></form>}
                  {p.status === 'share_manually' && <form action={markShared}><input type="hidden" name="id" value={p.id} /><button className="btn sm">Mark as shared</button></form>}
                  {!['published', 'shared', 'publishing'].includes(p.status) && <form action={cancelPost}><input type="hidden" name="id" value={p.id} /><button className="btn bad sm">Remove</button></form>}
                </div>
              )}
            </div>
            {p.error && <p style={{ color: 'var(--bad)', fontSize: 12.5, marginTop: 8 }}>{p.error}</p>}
            {p.status === 'share_manually' && p.creative_id && (
              <div style={{ marginTop: 10, fontSize: 13 }}>
                WhatsApp does not allow Status posts through the API. Download the image, post it as your Status, and paste this caption:
                <textarea readOnly rows={4} defaultValue={p.caption} style={{ width: '100%', marginTop: 6, border: '1px solid var(--line)', borderRadius: 8, padding: 8 }} />
                <a className="btn sec sm" href={bp(`/api/creative/${p.creative_id}/image?r=story`)} target="_blank" rel="noreferrer">Open story image</a>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
