import Link from 'next/link';
import { getContext } from '@/lib/context';
import { fmtDT } from '@/lib/path';
import Flash from '@/components/Flash';

const TONE: Record<string, string> = { payment_pending: 'warn', paid: 'good', dispatched: 'good', delivered: 'good', cancelled: 'bad' };
const inr = (n: number) => '₹' + Number(n).toLocaleString('en-IN');
const FILTERS = [['all', 'All'], ['payment_pending', 'Awaiting payment'], ['paid', 'Ready to dispatch'], ['dispatched', 'Dispatched'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']];

export default async function Orders({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; f?: string }> }) {
  const sp = await searchParams;
  const { db, business, role } = await getContext();
  let q = db.from('orders').select('id,code,status,total,created_at,customer:customers(name,phone),campaign:campaigns(code)').eq('business_id', business.id).order('created_at', { ascending: false }).limit(200);
  if (sp.f && sp.f !== 'all') q = q.eq('status', sp.f);
  const { data } = await q;
  return (
    <>
      <div className="head"><div><h1>Orders</h1><p>From conversation to delivery. Payment is verified before anything ships.</p></div>{role !== 'fulfilment' && <Link className="btn pri" href="/orders/new">New order</Link>}</div>
      <Flash searchParams={searchParams} />
      <div className="row" style={{ marginBottom: 12 }}>{FILTERS.map(([k, v]) => <Link key={k} href={`/orders?f=${k}`} className={'btn sm ' + ((sp.f ?? 'all') === k ? '' : 'sec')}>{v}</Link>)}</div>
      {data?.length ? (
        <div className="tw"><table>
          <thead><tr><th>Order</th><th>Customer</th><th>Campaign</th><th className="n">Total</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>{data.map((o) => {
            const c = o.customer as unknown as { name: string; phone: string };
            return <tr key={o.id}><td><Link href={`/orders/${o.id}`}><b className="mono">{o.code}</b></Link></td><td>{c.name}<div className="muted mono" style={{ fontSize: 11.5 }}>+{c.phone}</div></td><td className="mono">{(o.campaign as unknown as { code: string } | null)?.code ?? '-'}</td><td className="n">{inr(o.total)}</td><td><span className={'pill ' + (TONE[o.status] ?? '')}>{o.status.replace('_', ' ')}</span></td><td>{fmtDT(o.created_at)}</td></tr>;
          })}</tbody>
        </table></div>
      ) : <div className="card"><h2>No orders here</h2><p className="muted" style={{ margin: '6px 0 12px' }}>Orders appear when you create one from an inbox conversation or add one by hand.</p></div>}
    </>
  );
}
