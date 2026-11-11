import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getContext } from '@/lib/context';
import { fmtDT } from '@/lib/path';
import { sendPaymentLink, checkPayment, markPaidManually, dispatchAction, deliverAction, cancelAction } from '@/app/actions4';
import Flash from '@/components/Flash';

const inr = (n: number) => '₹' + Number(n).toLocaleString('en-IN');
const TONE: Record<string, string> = { payment_pending: 'warn', paid: 'good', dispatched: 'good', delivered: 'good', cancelled: 'bad' };

export default async function Order({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { id } = await params;
  const { db, business, role } = await getContext();
  const { data: o } = await db.from('orders').select('*, customer:customers(name,phone), campaign:campaigns(code,name)').eq('id', id).eq('business_id', business.id).maybeSingle();
  if (!o) notFound();
  const [{ data: items }, { data: pays }, { data: ship }] = await Promise.all([
    db.from('order_items').select('*').eq('order_id', id),
    db.from('payments').select('*').eq('order_id', id).order('created_at', { ascending: false }),
    db.from('shipments').select('*').eq('order_id', id).maybeSingle(),
  ]);
  const c = o.customer as unknown as { name: string; phone: string };
  const sales = ['owner', 'manager', 'sales'].includes(role), manage = ['owner', 'manager'].includes(role), shipper = ['owner', 'manager', 'fulfilment'].includes(role);
  const link = pays?.find((p) => p.status === 'pending' && p.link_url);
  return (
    <>
      <div className="head"><div><h1 className="mono">{o.code}</h1><p><span className={'pill ' + (TONE[o.status] ?? '')}>{o.status.replace('_', ' ')}</span> · {fmtDT(o.created_at)}{(o.campaign as unknown as { code: string } | null) ? ` · from ${(o.campaign as unknown as { code: string }).code}` : ''}</p></div>{o.conversation_id && <Link className="btn sec" href={`/inbox?c=${o.conversation_id}`}>Open conversation</Link>}</div>
      <Flash searchParams={searchParams} />
      <div className="grid g2">
        <div className="stack">
          <div className="card">
            <h2>Items</h2>
            <table style={{ width: '100%', marginTop: 8, fontSize: 13 }}><tbody>
              {items?.map((i) => <tr key={i.id}><td>{i.name}{(i.variant || i.size) && <span className="muted"> · {[i.variant, i.size].filter(Boolean).join(', ')}</span>}</td><td>× {i.quantity}</td><td style={{ textAlign: 'right' }}>{inr(i.unit_price * i.quantity)}</td></tr>)}
              <tr><td colSpan={2} className="muted">Delivery</td><td style={{ textAlign: 'right' }}>{o.delivery_charge ? inr(o.delivery_charge) : 'Free'}</td></tr>
              <tr><td colSpan={2}><b>Total</b></td><td style={{ textAlign: 'right' }}><b>{inr(o.total)}</b></td></tr>
            </tbody></table>
          </div>
          <div className="card"><h2>Customer</h2><p style={{ margin: '8px 0 0', fontSize: 13 }}><b>{c.name}</b> <span className="mono muted">+{c.phone}</span></p><p style={{ margin: '6px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}>{o.address}</p></div>
        </div>
        <div className="stack">
          <div className="card">
            <h2>Payment</h2>
            {pays?.length ? pays.map((p) => <p key={p.id} style={{ fontSize: 13, margin: '8px 0 0' }}><span className={'pill ' + (p.status === 'paid' ? 'good' : p.status === 'failed' ? 'bad' : 'warn')}>{p.status}</span> {p.provider} · {inr(p.amount)}{p.verified_at ? ` · verified ${fmtDT(p.verified_at)}` : ''}</p>) : <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>No payment yet.</p>}
            {link && <p style={{ fontSize: 12.5, marginTop: 8, wordBreak: 'break-all' }}>Link: <a href={link.link_url} target="_blank" rel="noreferrer">{link.link_url}</a></p>}
            {o.status === 'payment_pending' && sales && (
              <div className="row" style={{ marginTop: 12 }}>
                <form action={sendPaymentLink}><input type="hidden" name="id" value={o.id} /><button className="btn pri sm">{link ? 'Send link again' : 'Create and send payment link'}</button></form>
                {link && <form action={checkPayment}><input type="hidden" name="id" value={o.id} /><button className="btn sec sm">Check payment status</button></form>}
              </div>
            )}
            {o.status === 'payment_pending' && manage && (
              <details style={{ marginTop: 12 }}><summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Payment received another way</summary>
                <form action={markPaidManually} style={{ marginTop: 8 }}><input type="hidden" name="id" value={o.id} /><label className="f">How was it received?<input name="note" placeholder="UPI to shop account, ref 1234" required /></label><button className="btn sm">Record payment</button></form>
              </details>
            )}
          </div>
          <div className="card">
            <h2>Delivery</h2>
            {ship ? <p style={{ fontSize: 13, margin: '8px 0 0' }}>{ship.courier} · <span className="mono">{ship.tracking_no}</span><br /><span className="muted">Dispatched {fmtDT(ship.dispatched_at)}{ship.delivered_at ? ` · delivered ${fmtDT(ship.delivered_at)}` : ''}</span></p> : <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>{o.status === 'paid' ? 'Ready to dispatch.' : 'Dispatch opens once payment is verified.'}</p>}
            {o.status === 'paid' && shipper && (
              <form action={dispatchAction} style={{ marginTop: 10 }}><input type="hidden" name="id" value={o.id} />
                <div className="grid g2"><label className="f">Courier<input name="courier" required /></label><label className="f">Tracking number<input name="tracking" required /></label></div>
                <button className="btn pri sm">Mark dispatched</button></form>
            )}
            {o.status === 'dispatched' && shipper && <form action={deliverAction} style={{ marginTop: 10 }}><input type="hidden" name="id" value={o.id} /><button className="btn pri sm">Mark delivered</button></form>}
          </div>
          {o.status === 'payment_pending' && sales && (
            <form action={cancelAction} className="card"><input type="hidden" name="id" value={o.id} /><h2>Cancel order</h2><label className="f" style={{ marginTop: 8 }}>Reason<input name="reason" /></label><button className="btn bad sm">Cancel and restore stock</button></form>
          )}
          {o.status === 'cancelled' && <div className="note">Cancelled{o.cancelled_reason ? `: ${o.cancelled_reason}` : ''}</div>}
        </div>
      </div>
    </>
  );
}
