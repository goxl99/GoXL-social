import Link from 'next/link';
import { getContext } from '@/lib/context';
import { fmtDT } from '@/lib/path';

const inr = (n: number) => '₹' + Number(n).toLocaleString('en-IN');

export default async function Payments() {
  const { db, business } = await getContext();
  const { data } = await db.from('payments').select('id,provider,status,amount,verified_at,created_at,order:orders(id,code,customer:customers(name))').eq('business_id', business.id).order('created_at', { ascending: false }).limit(200);
  const paid = (data ?? []).filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0);
  const pending = (data ?? []).filter((p) => p.status === 'pending').reduce((s, p) => s + Number(p.amount), 0);
  return (
    <>
      <div className="head"><div><h1>Payments</h1><p>Only payments verified by Razorpay, or recorded by an owner or manager, move an order forward.</p></div></div>
      <div className="tiles" style={{ marginBottom: 16 }}>
        <div className="tile hero"><div className="l">Collected</div><div className="v">{inr(paid)}</div></div>
        <div className="tile"><div className="l">Awaiting payment</div><div className="v">{inr(pending)}</div></div>
      </div>
      {data?.length ? (
        <div className="tw"><table>
          <thead><tr><th>Order</th><th>Customer</th><th>Method</th><th className="n">Amount</th><th>Status</th><th>Verified</th></tr></thead>
          <tbody>{data.map((p) => {
            const o = p.order as unknown as { id: string; code: string; customer: { name: string } };
            return <tr key={p.id}><td><Link href={`/orders/${o.id}`} className="mono"><b>{o.code}</b></Link></td><td>{o.customer?.name}</td><td>{p.provider}</td><td className="n">{inr(p.amount)}</td><td><span className={'pill ' + (p.status === 'paid' ? 'good' : p.status === 'failed' ? 'bad' : 'warn')}>{p.status}</span></td><td>{p.verified_at ? fmtDT(p.verified_at) : '-'}</td></tr>;
          })}</tbody>
        </table></div>
      ) : <div className="card"><h2>No payments yet</h2><p className="muted" style={{ marginTop: 6 }}>Create an order and send its payment link.</p></div>}
    </>
  );
}
