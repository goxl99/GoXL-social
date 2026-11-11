import Link from 'next/link';
import { getContext } from '@/lib/context';
import { fmtDT } from '@/lib/path';

export default async function Deliveries() {
  const { db, business } = await getContext();
  const { data: orders } = await db.from('orders').select('id,code,status,address,created_at,updated_at,customer:customers(name,phone)').eq('business_id', business.id).in('status', ['paid', 'dispatched']).order('updated_at');
  const { data: ships } = await db.from('shipments').select('order_id,courier,tracking_no,dispatched_at').eq('business_id', business.id);
  const sh = new Map((ships ?? []).map((s) => [s.order_id, s]));
  const ready = orders?.filter((o) => o.status === 'paid') ?? [], transit = orders?.filter((o) => o.status === 'dispatched') ?? [];
  const Row = ({ o }: { o: NonNullable<typeof orders>[number] }) => {
    const c = o.customer as unknown as { name: string; phone: string }, s = sh.get(o.id);
    return <tr><td><Link href={`/orders/${o.id}`} className="mono"><b>{o.code}</b></Link></td><td>{c.name}<div className="muted mono" style={{ fontSize: 11.5 }}>+{c.phone}</div></td><td style={{ maxWidth: 280 }}>{o.address}</td><td>{s ? <>{s.courier}<div className="mono muted" style={{ fontSize: 11.5 }}>{s.tracking_no}</div></> : '-'}</td><td>{fmtDT(s?.dispatched_at ?? o.updated_at)}</td></tr>;
  };
  const Table = ({ rows, empty }: { rows: typeof ready; empty: string }) => rows.length ? <div className="tw"><table><thead><tr><th>Order</th><th>Customer</th><th>Address</th><th>Courier</th><th>Since</th></tr></thead><tbody>{rows.map((o) => <Row key={o.id} o={o} />)}</tbody></table></div> : <div className="card muted">{empty}</div>;
  return (
    <>
      <div className="head"><div><h1>Deliveries</h1><p>Open an order to add the courier and tracking number. The customer is told on WhatsApp.</p></div></div>
      <div className="stack">
        <div><h2 style={{ marginBottom: 8 }}>Ready to dispatch ({ready.length})</h2><Table rows={ready} empty="Nothing waiting. Paid orders appear here." /></div>
        <div><h2 style={{ marginBottom: 8 }}>In transit ({transit.length})</h2><Table rows={transit} empty="Nothing in transit." /></div>
      </div>
    </>
  );
}
