import Link from 'next/link';
import { getContext } from '@/lib/context';
import Flash from '@/components/Flash';

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { db, business } = await getContext();
  const cnt = async (t: string, f?: (q: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    let q = db.from(t).select('*', { count: 'exact', head: true }).eq('business_id', business.id);
    if (f) q = f(q);
    const { count } = await q;
    return count ?? 0;
  };
  const [products, low, members, connected, orders, pending, convs, b] = await Promise.all([
    cnt('products'), cnt('products', (q) => q.lte('stock', 5)), cnt('members'), cnt('social_accounts', (q) => q.eq('status', 'connected')),
    cnt('orders'), cnt('orders', (q) => q.eq('status', 'payment_pending')), cnt('conversations'),
    db.from('businesses').select('phone,description,shipping_policy,return_policy').eq('id', business.id).single(),
  ]);
  const prof = b.data;
  const steps: [string, boolean, string][] = [
    ['Business profile has contact details and policies', !!(prof?.phone && prof?.description && prof?.shipping_policy && prof?.return_policy), '/business'],
    ['Add your first product with a photo', products > 0, '/products/new'],
    ['Connect a social account', connected > 0, '/social'],
    ['Invite a team member', members > 1, '/team'],
  ];
  const done = steps.filter((s) => s[1]).length;
  return (
    <>
      <div className="head"><div><h1>Welcome, {business.name}</h1><p>Create once. Promote everywhere. Convert every opportunity.</p></div></div>
      <Flash searchParams={searchParams} />
      <div className="tiles">
        <div className="tile hero"><div className="l">Products live</div><div className="v">{products}</div><div className="s">{low} low on stock</div></div>
        <div className="tile"><div className="l">Total inquiries</div><div className="v">{convs}</div><div className="s">arrives with the inbox</div></div>
        <div className="tile"><div className="l">Orders</div><div className="v">{orders}</div><div className="s">{pending} awaiting payment</div></div>
        <div className="tile"><div className="l">Connected accounts</div><div className="v">{connected}</div><div className="s">of 3 platforms</div></div>
        <div className="tile"><div className="l">Team members</div><div className="v">{members}</div></div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="row sb"><h2>Getting started</h2><span className="pill">{done} of {steps.length} done</span></div>
        <div className="bar" style={{ margin: '10px 0 12px' }}><span style={{ width: `${(done / steps.length) * 100}%`, display: 'block' }} /></div>
        <div className="steps">
          {steps.map(([t, ok, href]) => (
            <Link key={t} href={href} className={'step' + (ok ? ' done' : '')}><span className="ck">{ok ? '✓' : ''}</span><span className="t">{t}</span></Link>
          ))}
        </div>
      </div>
    </>
  );
}
