import Link from 'next/link';
import { getContext } from '@/lib/context';
import { fmtD } from '@/lib/path';
import Flash from '@/components/Flash';

export default async function Campaigns({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { db, business, canEdit } = await getContext();
  const { data: camps } = await db.from('campaigns').select('id,code,name,created_at,product:products(name)').eq('business_id', business.id).order('created_at', { ascending: false });
  const { data: posts } = await db.from('posts').select('campaign_id,status').eq('business_id', business.id);
  const { data: convs } = await db.from('conversations').select('campaign_id').eq('business_id', business.id).eq('is_test', false).not('campaign_id', 'is', null);
  return (
    <>
      <div className="head"><div><h1>Campaigns</h1><p>Each campaign gets a code. Customers who message from its link are attributed to it automatically.</p></div>{canEdit && <Link className="btn pri" href="/campaigns/new">New campaign</Link>}</div>
      <Flash searchParams={searchParams} />
      {camps?.length ? (
        <div className="tw"><table>
          <thead><tr><th>Code</th><th>Campaign</th><th>Product</th><th>Posts</th><th className="n">Inquiries</th><th>Created</th></tr></thead>
          <tbody>{camps.map((c) => {
            const ps = posts?.filter((p) => p.campaign_id === c.id) ?? [];
            const live = ps.filter((p) => ['published', 'shared'].includes(p.status)).length;
            return <tr key={c.id}><td className="mono">{c.code}</td><td><Link href={`/campaigns/${c.id}`}><b>{c.name}</b></Link></td><td>{(c.product as unknown as { name: string } | null)?.name ?? '-'}</td><td>{live} of {ps.length} live</td><td className="n">{convs?.filter((x) => x.campaign_id === c.id).length ?? 0}</td><td>{fmtD(c.created_at)}</td></tr>;
          })}</tbody>
        </table></div>
      ) : <div className="card"><h2>No campaigns yet</h2><p className="muted" style={{ margin: '6px 0 12px' }}>Approve a creative, then publish it to Instagram, Facebook or WhatsApp Status.</p>{canEdit && <Link className="btn pri" href="/campaigns/new">Create a campaign</Link>}</div>}
    </>
  );
}
