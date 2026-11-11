import Link from 'next/link';
import { getContext } from '@/lib/context';
import Flash from '@/components/Flash';

const TONE: Record<string, string> = { published: 'good', shared: 'good', failed: 'bad', scheduled: 'warn', share_manually: 'warn', publishing: 'warn', draft: '' };
const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000);
const key = (d: Date) => ist(d).toISOString().slice(0, 10);

export default async function Calendar({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; m?: string }> }) {
  const sp = await searchParams;
  const { db, business } = await getContext();
  const now = ist(new Date());
  const [y, m] = /^\d{4}-\d{2}$/.test(sp.m ?? '') ? sp.m!.split('-').map(Number) : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const start = new Date(first.getTime() - ((first.getUTCDay() + 6) % 7) * 86400_000); // weeks start on Monday
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * 86400_000));
  const from = new Date(days[0].getTime() - 5.5 * 3600_000).toISOString(), to = new Date(days[41].getTime() + 18.5 * 3600_000).toISOString();
  const { data: posts } = await db.from('posts').select('id,campaign_id,platform,format,status,scheduled_for,published_at,campaign:campaigns(name)').eq('business_id', business.id).or(`and(scheduled_for.gte.${from},scheduled_for.lte.${to}),and(published_at.gte.${from},published_at.lte.${to})`);
  const by = new Map<string, typeof posts>();
  for (const p of posts ?? []) { const k = key(new Date((p.published_at ?? p.scheduled_for)!)); by.set(k, [...(by.get(k) ?? []), p]); }
  const prev = new Date(Date.UTC(y, m - 2, 1)), next = new Date(Date.UTC(y, m, 1));
  const q = (d: Date) => `/calendar?m=${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const today = key(new Date());
  return (
    <>
      <div className="head"><div><h1>Content Calendar</h1><p>Scheduled and published posts, in Indian time.</p></div><div className="row"><Link className="btn sec sm" href={q(prev)}>Previous</Link><b>{first.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</b><Link className="btn sec sm" href={q(next)}>Next</Link></div></div>
      <Flash searchParams={searchParams} />
      <div className="cal">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="dh">{d}</div>)}
        {days.map((d) => {
          const k = d.toISOString().slice(0, 10);
          return (
            <div key={k} className={(d.getUTCMonth() + 1 !== m ? 'out ' : '') + (k === today ? 'today' : '')}>
              <div className="dn">{d.getUTCDate()}</div>
              {by.get(k)?.map((p) => <Link key={p.id} href={`/campaigns/${p.campaign_id}`} className={'chip ' + (TONE[p.status] ?? '')} title={`${(p.campaign as unknown as { name: string })?.name} · ${p.status}`}>{p.platform.slice(0, 2).toUpperCase()} {p.format}</Link>)}
            </div>
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Scheduled posts are sent by a background job every few minutes. See the README for setting it up.</p>
    </>
  );
}
