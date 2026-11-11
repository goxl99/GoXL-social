import Link from 'next/link';
import { admin } from '@/lib/supabase/admin';
import { requireSuperAdmin } from '@/lib/admin';
import { setAccountStatus } from '@/app/admin/actions';
import { fmtD } from '@/lib/path';
import Flash from '@/components/Flash';
import { label } from '@/lib/accountType';

export const dynamic = 'force-dynamic';

export default async function Accounts({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; s?: string }> }) {
  await requireSuperAdmin();
  const { s } = await searchParams;
  const db = admin();
  const [{ data: biz }, { data: owners }, { data: secrets }, { data: chans }] = await Promise.all([
    db.from('businesses').select('id,name,category,city,status,account_type,onboarded,ai_provider,created_at').order('created_at', { ascending: false }).limit(500),
    db.from('members').select('business_id,email,display_name').eq('role', 'owner'),
    db.from('secrets').select('business_id,name'),
    db.from('social_accounts').select('business_id,platform,status'),
  ]);
  const rows = (biz ?? []).map((b) => {
    const keys = new Set((secrets ?? []).filter((x) => x.business_id === b.id).map((x) => x.name));
    const live = (chans ?? []).filter((c) => c.business_id === b.id && c.status === 'connected').map((c) => c.platform);
    const owner = (owners ?? []).find((o) => o.business_id === b.id);
    return {
      ...b, owner: owner?.email ?? '-',
      ai: keys.has(b.ai_provider === 'openai' ? 'ai_openai_key' : 'ai_anthropic_key'),
      wa: live.includes('whatsapp'), meta: keys.has('meta_app_secret'),
      pay: keys.has('razorpay_key_id') && keys.has('razorpay_key_secret') && keys.has('razorpay_webhook_secret'),
      social: live.filter((p) => p !== 'whatsapp').length,
    };
  });
  const count = (st: string) => rows.filter((r) => r.status === st).length;
  const shown = s && ['pending', 'active', 'suspended'].includes(s) ? rows.filter((r) => r.status === s) : rows;
  const Tick = ({ ok }: { ok: boolean }) => <span className={'pill ' + (ok ? 'good' : '')}>{ok ? 'Set' : 'Missing'}</span>;
  return (
    <>
      <div className="head"><div><h1>Accounts</h1><p>Every business on GoXL Commerce. Open an account to add its keys, then activate it.</p></div></div>
      <Flash searchParams={searchParams} />
      <div className="tiles" style={{ marginBottom: 16 }}>
        <Link href="/admin" className="tile hero"><div className="l">All accounts</div><div className="v">{rows.length}</div></Link>
        <Link href="/admin?s=pending" className="tile"><div className="l">Awaiting activation</div><div className="v">{count('pending')}</div></Link>
        <Link href="/admin?s=active" className="tile"><div className="l">Active</div><div className="v">{count('active')}</div></Link>
        <Link href="/admin?s=suspended" className="tile"><div className="l">Paused</div><div className="v">{count('suspended')}</div></Link>
      </div>
      {shown.length ? (
        <div className="tw"><table>
          <thead><tr><th>Account</th><th>Owner</th><th>Status</th><th>AI key</th><th>WhatsApp</th><th>Meta secret</th><th>Razorpay</th><th>IG/FB</th><th>Created</th><th></th></tr></thead>
          <tbody>{shown.map((r) => (
            <tr key={r.id}>
              <td><Link href={`/admin/accounts/${r.id}`}><b>{r.name}</b></Link><div className="muted" style={{ fontSize: 11.5 }}><span className={'pill ' + (r.account_type === 'agency' ? 'warn' : r.account_type === 'creator' ? 'good' : '')}>{label(r.account_type)}</span> {[r.category, r.city].filter(Boolean).join(' · ') || (r.onboarded ? '' : 'Onboarding not finished')}</div></td>
              <td style={{ fontSize: 12.5 }}>{r.owner}</td>
              <td><span className={'pill ' + (r.status === 'active' ? 'good' : r.status === 'suspended' ? 'bad' : 'warn')}>{r.status === 'pending' ? 'Awaiting activation' : r.status === 'suspended' ? 'Paused' : 'Active'}</span></td>
              <td><Tick ok={r.ai} /></td><td><Tick ok={r.wa} /></td><td><Tick ok={r.meta} /></td><td><Tick ok={r.pay} /></td>
              <td>{r.social}/2</td>
              <td>{fmtD(r.created_at)}</td>
              <td>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <Link className="btn sec sm" href={`/admin/accounts/${r.id}`}>Manage</Link>
                  {r.status !== 'active' && <form action={setAccountStatus}><input type="hidden" name="bid" value={r.id} /><input type="hidden" name="status" value="active" /><input type="hidden" name="from" value="list" /><button className="btn sm">Activate</button></form>}
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <div className="card"><h2>No accounts here</h2><p className="muted" style={{ marginTop: 6 }}>New businesses appear as soon as someone signs up and finishes onboarding.</p></div>}
    </>
  );
}
