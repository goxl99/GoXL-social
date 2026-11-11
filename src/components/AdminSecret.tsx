import { fmtD } from '@/lib/path';

type Status = { set: boolean; hint: string; at: string | null };

/** One key field: shows only a masked hint of what is stored, and lets an administrator replace or remove it. */
export default function AdminSecret({ name, label, help, status, bid, save, clear, plain }: {
  name: string; label: string; help?: string; status: Status; bid?: string;
  save: (f: FormData) => Promise<void>; clear: (f: FormData) => Promise<void>; plain?: boolean;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="row sb"><b style={{ fontSize: 13 }}>{label}</b><span className={'pill ' + (status.set ? 'good' : '')}>{status.set ? `Saved ${status.hint}${status.at ? ' · ' + fmtD(status.at) : ''}` : 'Not set'}</span></div>
      {help && <p className="muted" style={{ fontSize: 12, margin: '2px 0 6px' }}>{help}</p>}
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <form action={save} className="row" style={{ flex: 1, flexWrap: 'nowrap' }}>
          {bid && <input type="hidden" name="bid" value={bid} />}
          <input type="hidden" name="name" value={name} />
          <input name="value" type={plain ? 'text' : 'password'} autoComplete="off" placeholder={status.set ? 'Paste a new value to replace' : 'Paste here'} style={{ flex: 1, minWidth: 0, border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px' }} />
          <button className="btn sm">Save</button>
        </form>
        {status.set && <form action={clear}>{bid && <input type="hidden" name="bid" value={bid} />}<input type="hidden" name="name" value={name} /><button className="btn bad sm">Remove</button></form>}
      </div>
    </div>
  );
}
