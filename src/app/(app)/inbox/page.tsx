import Link from 'next/link';
import { getContext } from '@/lib/context';
import { fmtDT } from '@/lib/path';
import { createOrderFromConversation } from '@/app/actions4';
import { sendReply, toggleAI, claimConversation, setStage, setFollowUp, testMessage, rerunAssistant } from '@/app/actions2';
import AutoRefresh from '@/components/AutoRefresh';
import Flash from '@/components/Flash';

const STAGES: [string, string][] = [['new_inquiry', 'New inquiry'], ['ai_responded', 'AI responded'], ['interested', 'Interested'], ['follow_up', 'Follow-up'], ['lost', 'Lost']];
const STAGE_LABEL: Record<string, string> = { new_inquiry: 'New inquiry', ai_responded: 'AI responded', interested: 'Interested', follow_up: 'Follow-up', order_created: 'Order created', payment_pending: 'Payment pending', paid: 'Paid', dispatched: 'Dispatched', delivered: 'Delivered', lost: 'Lost' };
const FILTERS: [string, string][] = [['all', 'All'], ['human', 'Needs a person'], ['open', 'Open'], ['test', 'Test']];

export default async function Inbox({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; c?: string; f?: string }> }) {
  const sp = await searchParams;
  const { db, business, role, user } = await getContext();
  const f = sp.f ?? 'all';
  let q = db.from('conversations').select('id,stage,ai_enabled,needs_human,is_test,last_message_at,assigned_to,follow_up_at,lost_reason,draft_order,attribution,customer:customers(name,phone),campaign:campaigns(code,name),product:products(name)').eq('business_id', business.id).order('last_message_at', { ascending: false }).limit(60);
  if (f === 'human') q = q.eq('needs_human', true); else if (f === 'open') q = q.not('stage', 'in', '(delivered,lost)').eq('is_test', false); else if (f === 'test') q = q.eq('is_test', true);
  const { data: convs } = await q;
  const sel = convs?.find((c) => c.id === sp.c) ?? null;
  const { data: msgs } = sel ? await db.from('messages').select('id,sender,body,created_at').eq('conversation_id', sel.id).order('created_at').limit(200) : { data: [] };
  const lastBody = new Map<string, string>();
  if (convs?.length) {
    const { data: last } = await db.from('messages').select('conversation_id,body,created_at').in('conversation_id', convs.map((c) => c.id)).order('created_at', { ascending: false }).limit(300);
    for (const m of last ?? []) if (!lastBody.has(m.conversation_id)) lastBody.set(m.conversation_id, m.body);
  }
  const cust = (c: NonNullable<typeof sel>) => c.customer as unknown as { name: string; phone: string };
  const works = role !== 'fulfilment';
  const back = (id: string) => `/inbox?c=${id}${f !== 'all' ? `&f=${f}` : ''}`;
  return (
    <>
      <AutoRefresh />
      <div className="head"><div><h1>Unified Inbox</h1><p>Customer conversations with the AI assistant. A person can take over at any time.</p></div></div>
      <Flash searchParams={searchParams} />
      <div className="row" style={{ marginBottom: 12 }}>{FILTERS.map(([k, v]) => <Link key={k} href={`/inbox?f=${k}`} className={'btn sm ' + (f === k ? '' : 'sec')}>{v}</Link>)}</div>
      <div className="inbox">
        <div className="clist">
          {works && (
            <form action={testMessage} className="citem" style={{ background: '#F6FAEA' }}>
              <b style={{ fontSize: 12 }}>Try the assistant (no WhatsApp needed)</b>
              <div className="row" style={{ flexWrap: 'nowrap', marginTop: 6 }}><input name="text" placeholder="Type as a customer" style={{ flex: 1, minWidth: 0, border: '1px solid var(--line)', borderRadius: 6, padding: 6 }} /><button className="btn sm">Send</button></div>
            </form>
          )}
          {convs?.length ? convs.map((c) => (
            <Link key={c.id} href={back(c.id)} className={'citem' + (sel?.id === c.id ? ' on' : '')}>
              <div className="t"><span>{(c.customer as unknown as { name: string })?.name}{c.is_test ? ' (test)' : ''}</span><span className="muted" style={{ fontWeight: 500, fontSize: 11 }}>{fmtDT(c.last_message_at)}</span></div>
              <div className="s">{lastBody.get(c.id) ?? ''}</div>
              <div className="row" style={{ marginTop: 4, gap: 6 }}>{c.needs_human && <span className="pill bad">Needs a person</span>}<span className="pill">{STAGE_LABEL[c.stage]}</span></div>
            </Link>
          )) : <div className="citem muted">No conversations yet. Messages sent to your connected WhatsApp number appear here.</div>}
        </div>
        {sel ? (
          <div className="thread">
            <div className="row sb" style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
              <div><b>{cust(sel).name}</b> <span className="muted mono" style={{ fontSize: 12 }}>+{cust(sel).phone}</span>
                <div className="muted" style={{ fontSize: 12 }}>{(sel.campaign as unknown as { code: string; name: string } | null) ? `From campaign ${(sel.campaign as unknown as { code: string }).code} (${sel.attribution.replace('_', ' ')})` : 'Not from a campaign'}{(sel.product as unknown as { name: string } | null) ? ` · asking about ${(sel.product as unknown as { name: string }).name}` : ''}</div></div>
              <span className={'pill ' + (sel.ai_enabled ? 'good' : 'warn')}>{sel.ai_enabled ? 'AI replying' : 'AI paused'}</span>
            </div>
            <div className="msgs">
              {msgs?.map((m) => <div key={m.id} className={'bub ' + m.sender}>{m.body}<small>{m.sender === 'ai' ? 'AI assistant' : m.sender === 'human' ? 'Team' : m.sender === 'customer' ? 'Customer' : 'Note'} · {fmtDT(m.created_at)}</small></div>)}
            </div>
            {sel.draft_order && Object.keys(sel.draft_order as object).length > 0 && (
              <div className="note" style={{ margin: '0 14px 10px' }}>
                Order draft: <span className="mono">{JSON.stringify(sel.draft_order)}</span>
                {works && (sel.draft_order as { sku?: string; address?: string }).sku && (sel.draft_order as { address?: string }).address && <form action={createOrderFromConversation} style={{ marginTop: 8 }}><input type="hidden" name="id" value={sel.id} /><button className="btn pri sm">Create order from this draft</button></form>}
              </div>
            )}
            {works && (
              <div style={{ padding: 14, borderTop: '1px solid var(--line)' }} className="stack">
                <form action={sendReply} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
                  <input type="hidden" name="id" value={sel.id} />
                  <textarea name="text" placeholder="Reply as a person (this pauses the AI)" style={{ flex: 1, minHeight: 56, border: '1px solid var(--line)', borderRadius: 8, padding: 8 }} />
                  <button className="btn pri">Send</button>
                </form>
                <div className="row">
                  <form action={toggleAI}><input type="hidden" name="id" value={sel.id} /><input type="hidden" name="on" value={sel.ai_enabled ? '0' : '1'} /><button className="btn sec sm">{sel.ai_enabled ? 'Pause AI' : 'Resume AI'}</button></form>
                  {sel.assigned_to !== user.id && <form action={claimConversation}><input type="hidden" name="id" value={sel.id} /><button className="btn sec sm">Take over</button></form>}
                  {sel.ai_enabled && <form action={rerunAssistant}><input type="hidden" name="id" value={sel.id} /><button className="btn sec sm">Ask AI to reply again</button></form>}
                  <form action={setStage} className="row" style={{ gap: 6 }}>
                    <input type="hidden" name="id" value={sel.id} />
                    <select name="stage" defaultValue={STAGES.some(([k]) => k === sel.stage) ? sel.stage : ''} style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 5 }}>
                      {!STAGES.some(([k]) => k === sel.stage) && <option value="" disabled>{STAGE_LABEL[sel.stage]} (automatic)</option>}
                      {STAGES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input name="lost_reason" placeholder="Reason if lost" style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 5, width: 130 }} />
                    <button className="btn sec sm">Set stage</button>
                  </form>
                  <form action={setFollowUp} className="row" style={{ gap: 6 }}>
                    <input type="hidden" name="id" value={sel.id} />
                    <input type="date" name="follow_up_at" defaultValue={sel.follow_up_at ? sel.follow_up_at.slice(0, 10) : ''} style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 5 }} />
                    <button className="btn sec sm">Follow-up</button>
                  </form>
                </div>
              </div>
            )}
          </div>
        ) : <div className="card muted">Select a conversation, or use the box on the left to try the assistant.</div>}
      </div>
    </>
  );
}
