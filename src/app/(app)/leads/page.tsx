import Link from 'next/link';
import { getContext } from '@/lib/context';
import { fmtD } from '@/lib/path';
import { setStage } from '@/app/actions2';
import Flash from '@/components/Flash';

const COLS: [string, string][] = [['new_inquiry', 'New inquiry'], ['ai_responded', 'AI responded'], ['interested', 'Interested'], ['follow_up', 'Follow-up'], ['order_created', 'Order created'], ['payment_pending', 'Payment pending'], ['paid', 'Paid'], ['dispatched', 'Dispatched'], ['delivered', 'Delivered'], ['lost', 'Lost']];
const MANUAL = new Set(['new_inquiry', 'ai_responded', 'interested', 'follow_up', 'lost']);

export default async function Leads({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { db, business, role } = await getContext();
  const { data } = await db.from('conversations').select('id,stage,needs_human,follow_up_at,lost_reason,draft_order,attribution,customer_id,customer:customers(name,phone),product:products(name),campaign:campaigns(code)').eq('business_id', business.id).eq('is_test', false).order('last_message_at', { ascending: false }).limit(300);
  const { data: counts } = await db.from('conversations').select('customer_id').eq('business_id', business.id).eq('is_test', false);
  const per = new Map<string, number>();
  for (const c of counts ?? []) per.set(c.customer_id, (per.get(c.customer_id) ?? 0) + 1);
  const score = (c: NonNullable<typeof data>[number]) => {
    let s = ({ new_inquiry: 10, ai_responded: 20, interested: 50, follow_up: 40, order_created: 85, payment_pending: 90, paid: 100, dispatched: 100, delivered: 100, lost: 0 } as Record<string, number>)[c.stage] ?? 0;
    if (c.draft_order && Object.keys(c.draft_order as object).length) s = Math.min(100, s + 15);
    return s;
  };
  const works = role !== 'fulfilment';
  return (
    <>
      <div className="head"><div><h1>Leads & CRM</h1><p>Every conversation is a lead. Order, payment and delivery stages move on their own from the order.</p></div></div>
      <Flash searchParams={searchParams} />
      <div className="kanban">
        {COLS.map(([k, label]) => {
          const items = data?.filter((c) => c.stage === k) ?? [];
          return (
            <div className="kcol" key={k}>
              <h3><span>{label}</span><span>{items.length}</span></h3>
              {items.map((c) => {
                const cu = c.customer as unknown as { name: string; phone: string };
                return (
                  <div className="kcard" key={c.id}>
                    <Link href={`/inbox?c=${c.id}`}><b>{cu.name}</b></Link>
                    <div className="muted">{(c.product as unknown as { name: string } | null)?.name ?? 'No product yet'}</div>
                    <div className="row" style={{ gap: 4, marginTop: 4 }}>
                      <span className="pill">Score {score(c)}</span>
                      {(per.get(c.customer_id) ?? 0) > 1 && <span className="pill good">Repeat</span>}
                      {c.needs_human && <span className="pill bad">Needs a person</span>}
                      {(c.campaign as unknown as { code: string } | null) && <span className="pill">{(c.campaign as unknown as { code: string }).code}</span>}
                    </div>
                    {c.follow_up_at && <div className="muted" style={{ marginTop: 4 }}>Follow up {fmtD(c.follow_up_at)}</div>}
                    {c.lost_reason && <div className="muted" style={{ marginTop: 4 }}>Reason: {c.lost_reason}</div>}
                    {works && MANUAL.has(k) && (
                      <form action={setStage} className="row" style={{ gap: 4, marginTop: 6 }}>
                        <input type="hidden" name="id" value={c.id} /><input type="hidden" name="back" value="/leads" />
                        <select name="stage" defaultValue={k} style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 3, fontSize: 12 }}>{COLS.filter(([s]) => MANUAL.has(s)).map(([s, l]) => <option key={s} value={s}>{l}</option>)}</select>
                        <button className="btn sec sm">Move</button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}
