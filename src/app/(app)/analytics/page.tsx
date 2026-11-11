import { getContext } from '@/lib/context';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const STAGES: [string, string][] = [['new_inquiry', 'New inquiry'], ['ai_responded', 'AI responded'], ['interested', 'Interested'], ['follow_up', 'Follow-up'], ['order_created', 'Order created'], ['payment_pending', 'Payment pending'], ['paid', 'Paid'], ['dispatched', 'Dispatched'], ['delivered', 'Delivered'], ['lost', 'Lost']];

export default async function Analytics({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.d)) ? Number(sp.d) : 30;
  const { db, business } = await getContext();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const [{ data: convs }, { data: orders }, { data: camps }, { data: items }, { data: posts }] = await Promise.all([
    db.from('conversations').select('stage,campaign_id,attribution,created_at').eq('business_id', business.id).eq('is_test', false).gte('created_at', since),
    db.from('orders').select('id,status,total,campaign_id,created_at').eq('business_id', business.id).gte('created_at', since),
    db.from('campaigns').select('id,code,name').eq('business_id', business.id),
    db.from('order_items').select('name,quantity,unit_price,order:orders(status,created_at)').eq('business_id', business.id),
    db.from('posts').select('status,platform').eq('business_id', business.id).gte('created_at', since),
  ]);
  const real = (orders ?? []).filter((o) => o.status !== 'cancelled');
  const revenue = real.filter((o) => ['paid', 'dispatched', 'delivered'].includes(o.status)).reduce((s, o) => s + Number(o.total), 0);
  const paidCount = real.filter((o) => ['paid', 'dispatched', 'delivered'].includes(o.status)).length;
  const inquiries = convs?.length ?? 0;
  const conv = inquiries ? Math.round((paidCount / inquiries) * 100) : 0;
  const byStage = new Map<string, number>();
  for (const c of convs ?? []) byStage.set(c.stage, (byStage.get(c.stage) ?? 0) + 1);
  const camp = (camps ?? []).map((c) => {
    const cv = (convs ?? []).filter((x) => x.campaign_id === c.id).length;
    const os = real.filter((o) => o.campaign_id === c.id && ['paid', 'dispatched', 'delivered'].includes(o.status));
    return { ...c, inquiries: cv, orders: os.length, revenue: os.reduce((s, o) => s + Number(o.total), 0) };
  }).filter((c) => c.inquiries || c.orders).sort((a, b) => b.revenue - a.revenue);
  const prod = new Map<string, { q: number; r: number }>();
  for (const i of items ?? []) {
    const o = i.order as unknown as { status: string; created_at: string } | null;
    if (!o || o.created_at < since || !['paid', 'dispatched', 'delivered'].includes(o.status)) continue;
    const p = prod.get(i.name) ?? { q: 0, r: 0 };
    p.q += i.quantity; p.r += i.quantity * Number(i.unit_price); prod.set(i.name, p);
  }
  const top = [...prod.entries()].sort((a, b) => b[1].r - a[1].r).slice(0, 8);
  const max = Math.max(1, ...STAGES.map(([k]) => byStage.get(k) ?? 0));
  const published = (posts ?? []).filter((p) => ['published', 'shared'].includes(p.status)).length;
  return (
    <>
      <div className="head"><div><h1>Analytics</h1><p>Last {days} days. Revenue counts verified payments only.</p></div><div className="row">{[7, 30, 90].map((d) => <a key={d} href={`?d=${d}`} className={'btn sm ' + (d === days ? '' : 'sec')}>{d} days</a>)}</div></div>
      <div className="tiles">
        <div className="tile hero"><div className="l">Revenue</div><div className="v">{inr(revenue)}</div><div className="s">{paidCount} paid orders</div></div>
        <div className="tile"><div className="l">Inquiries</div><div className="v">{inquiries}</div></div>
        <div className="tile"><div className="l">Inquiry to paid</div><div className="v">{conv}%</div></div>
        <div className="tile"><div className="l">Average order</div><div className="v">{paidCount ? inr(revenue / paidCount) : '-'}</div></div>
        <div className="tile"><div className="l">Posts published</div><div className="v">{published}</div></div>
      </div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card"><h2>Lead stages</h2>
          {STAGES.map(([k, l]) => <div key={k} style={{ margin: '8px 0' }}><div className="row sb" style={{ fontSize: 12.5 }}><span>{l}</span><b>{byStage.get(k) ?? 0}</b></div><div className="bar"><span style={{ display: 'block', width: `${((byStage.get(k) ?? 0) / max) * 100}%` }} /></div></div>)}
        </div>
        <div className="stack">
          <div className="card"><h2>Campaign results</h2>
            {camp.length ? <table style={{ width: '100%', fontSize: 13, marginTop: 8 }}><thead><tr><th align="left">Campaign</th><th align="right">Inquiries</th><th align="right">Orders</th><th align="right">Revenue</th></tr></thead><tbody>{camp.map((c) => <tr key={c.id}><td>{c.name}<div className="mono muted" style={{ fontSize: 11 }}>{c.code}</div></td><td align="right">{c.inquiries}</td><td align="right">{c.orders}</td><td align="right">{inr(c.revenue)}</td></tr>)}</tbody></table> : <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Results appear once customers message from a campaign link.</p>}
          </div>
          <div className="card"><h2>Top products</h2>
            {top.length ? <table style={{ width: '100%', fontSize: 13, marginTop: 8 }}><tbody>{top.map(([n, v]) => <tr key={n}><td>{n}</td><td align="right">{v.q} sold</td><td align="right">{inr(v.r)}</td></tr>)}</tbody></table> : <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>No paid orders in this period.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
