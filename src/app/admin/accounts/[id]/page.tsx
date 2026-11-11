import Link from 'next/link';
import { notFound } from 'next/navigation';
import { admin } from '@/lib/supabase/admin';
import { requireSuperAdmin, platformSecretStatus } from '@/lib/admin';
import { secretStatus, getVerifyToken, type SecretName } from '@/lib/secrets';
import { DEFAULT_MODEL } from '@/lib/ai/llm';
import {
  setAccountStatus, saveAccountAI, saveAccountSecret, clearAccountSecret, connectAccountChannel, disconnectAccountChannel, testAccountAI, testAccountRazorpay,
} from '@/app/admin/actions';
import AdminSecret from '@/components/AdminSecret';
import { fmtDT } from '@/lib/path';
import Flash from '@/components/Flash';
import { label } from '@/lib/accountType';

export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CH = [
  ['whatsapp', 'WhatsApp Cloud API', 'Phone number ID', 'Meta, WhatsApp, API setup. Use a permanent system-user token.'],
  ['instagram', 'Instagram', 'Instagram business account ID', 'Needs instagram_content_publish permission.'],
  ['facebook', 'Facebook Page', 'Page ID', 'Needs pages_manage_posts permission.'],
] as const;

export default async function AccountDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const db = admin();
  const [{ data: b }, { data: members }, { data: accts }] = await Promise.all([
    db.from('businesses').select('*').eq('id', id).maybeSingle(),
    db.from('members').select('email,display_name,role').eq('business_id', id).order('created_at'),
    db.from('social_accounts').select('platform,status,handle,external_id,connected_at').eq('business_id', id),
  ]);
  if (!b) notFound();
  const encrypted = !!process.env.SECRETS_ENCRYPTION_KEY;
  const [st, defaults, verify, { data: audit }] = await Promise.all([
    encrypted ? secretStatus(id) : null,
    encrypted ? platformSecretStatus() : null,
    encrypted ? getVerifyToken(id) : null,
    db.from('admin_audit').select('actor_email,action,detail,created_at').eq('business_id', id).order('created_at', { ascending: false }).limit(15),
  ]);
  const app = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  const provider = (b.ai_provider === 'openai' ? 'openai' : 'anthropic') as 'anthropic' | 'openai';
  const aiKey: SecretName = provider === 'openai' ? 'ai_openai_key' : 'ai_anthropic_key';
  const fallback = defaults?.[aiKey]?.set ? 'GoXL default key' : (provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY) ? 'server key' : null;
  const owner = (members ?? []).find((m) => m.role === 'owner');
  const waLive = (accts ?? []).some((a) => a.platform === 'whatsapp' && a.status === 'connected');
  const checks: [string, boolean, string][] = st ? [
    ['AI key', !!st[aiKey].set || !!fallback, st[aiKey].set ? 'own key' : fallback ? `uses ${fallback}` : 'none: rules-only replies'],
    ['WhatsApp number', waLive, waLive ? 'connected' : 'not connected'],
    ['Meta app secret', st.meta_app_secret.set || !!defaults?.meta_app_secret.set || !!process.env.META_APP_SECRET, st.meta_app_secret.set ? 'own secret' : 'shared secret'],
    ['Razorpay', st.razorpay_key_id.set && st.razorpay_key_secret.set && st.razorpay_webhook_secret.set, 'key ID, secret and webhook secret'],
  ] : [];
  const Status = ({ to, label, cls }: { to: string; label: string; cls?: string }) => (
    <button className={'btn ' + (cls ?? '')} formAction={setAccountStatus} name="status" value={to}>{label}</button>
  );
  return (
    <>
      <div className="head"><div>
        <p><Link href="/admin">← All accounts</Link></p>
        <h1>{b.name} <span className={'pill ' + (b.status === 'active' ? 'good' : b.status === 'suspended' ? 'bad' : 'warn')}>{b.status === 'pending' ? 'Awaiting activation' : b.status === 'suspended' ? 'Paused' : 'Active'}</span></h1>
        <p>{[label(b.account_type), b.category, b.city, b.phone, owner?.email].filter(Boolean).join(' · ')}{!b.onboarded && ' · onboarding not finished'}</p>
      </div></div>
      <Flash searchParams={searchParams} />
      {!encrypted && <div className="flash err">The server is missing SECRETS_ENCRYPTION_KEY, so keys cannot be saved.</div>}
      <div className="stack">
        <div className="card">
          <h2>Activation</h2>
          {checks.length > 0 && <ul style={{ margin: '10px 0', paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 6 }}>{checks.map(([l, ok, note]) => <li key={l} className="row"><span className={'pill ' + (ok ? 'good' : 'warn')}>{ok ? 'Ready' : 'Missing'}</span><b style={{ fontSize: 13 }}>{l}</b><span className="muted" style={{ fontSize: 12 }}>{note}</span></li>)}</ul>}
          <form className="stack" style={{ gap: 10 }}>
            <input type="hidden" name="bid" value={b.id} />
            <label className="f">Internal notes (never shown to the customer)<textarea name="admin_notes" rows={2} defaultValue={b.admin_notes ?? ''} /></label>
            <div className="row">
              {b.status !== 'active' && <Status to="active" label="Activate account" />}
              {b.status === 'active' && <Status to="suspended" label="Pause account" cls="bad" />}
              {b.status === 'suspended' && <Status to="pending" label="Back to pending" cls="sec" />}
              {b.status === 'active' && <Status to="active" label="Save notes" cls="sec" />}
            </div>
          </form>
          {b.activated_at && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Activated {fmtDT(b.activated_at)}</p>}
        </div>

        {st && (
          <>
            <div className="card">
              <h2>AI assistant and creative studio</h2>
              <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 12px' }}>The account&apos;s own key is used first, then the GoXL default key, then the server key.</p>
              <form action={saveAccountAI} className="grid g3" style={{ alignItems: 'end' }}>
                <input type="hidden" name="bid" value={b.id} />
                <label className="f">Provider<select name="ai_provider" defaultValue={provider}><option value="anthropic">Claude (Anthropic)</option><option value="openai">GPT (OpenAI)</option></select></label>
                <label className="f">Model (optional)<input name="ai_model" defaultValue={b.ai_model ?? ''} placeholder={`Default: ${DEFAULT_MODEL[provider]}`} /></label>
                <div style={{ marginBottom: 12 }}><button className="btn">Save provider</button></div>
              </form>
              <AdminSecret bid={b.id} name="ai_anthropic_key" label="Claude API key" help="Starts with sk-ant-." status={st.ai_anthropic_key} save={saveAccountSecret} clear={clearAccountSecret} />
              <AdminSecret bid={b.id} name="ai_openai_key" label="OpenAI API key" help="Starts with sk-." status={st.ai_openai_key} save={saveAccountSecret} clear={clearAccountSecret} />
              <form action={testAccountAI}><input type="hidden" name="bid" value={b.id} /><button className="btn sec sm">Test the selected provider</button></form>
            </div>

            <div className="card">
              <h2>Channels</h2>
              <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 12px' }}>Details are checked against Meta before they are saved. Tokens are stored encrypted and never shown again.</p>
              {CH.map(([p, label, idLabel, help]) => {
                const a = (accts ?? []).find((x) => x.platform === p);
                const on = a?.status === 'connected';
                return (
                  <div key={p} style={{ borderTop: '1px solid var(--line)', padding: '12px 0' }}>
                    <div className="row sb"><b>{label}</b><span className={'pill ' + (on ? 'good' : '')}>{on ? `Connected ${a?.handle ?? ''}` : 'Not connected'}</span></div>
                    <p className="muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>{help}</p>
                    <form action={connectAccountChannel} className="grid g3" style={{ alignItems: 'end' }}>
                      <input type="hidden" name="bid" value={b.id} /><input type="hidden" name="platform" value={p} />
                      <label className="f">{idLabel}<input name="external_id" inputMode="numeric" autoComplete="off" /></label>
                      <label className="f">Access token<input name="token" type="password" autoComplete="off" /></label>
                      <div style={{ marginBottom: 12 }} className="row"><button className="btn sm">{on ? 'Replace' : 'Connect'}</button></div>
                    </form>
                    {on && <form action={disconnectAccountChannel}><input type="hidden" name="bid" value={b.id} /><input type="hidden" name="platform" value={p} /><button className="btn bad sm">Disconnect</button></form>}
                  </div>
                );
              })}
            </div>

            <div className="card">
              <h2>Webhooks</h2>
              <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 12px' }}>Enter these in the customer&apos;s Meta app (WhatsApp, Configuration; subscribe to <span className="mono">messages</span>) and in Razorpay (event <span className="mono">payment_link.paid</span>).</p>
              <ul style={{ fontSize: 13, paddingLeft: 18, marginBottom: 12, lineHeight: 1.9 }}>
                <li>WhatsApp callback URL: <span className="mono" style={{ wordBreak: 'break-all' }}>{app ? `${app}/api/webhooks/whatsapp` : 'NEXT_PUBLIC_APP_URL is not set'}</span></li>
                <li>Verify token: <span className="mono">{verify}</span></li>
                <li>Razorpay webhook URL: <span className="mono" style={{ wordBreak: 'break-all' }}>{app ? `${app}/api/webhooks/razorpay?b=${b.id}` : 'NEXT_PUBLIC_APP_URL is not set'}</span></li>
              </ul>
              <AdminSecret bid={b.id} name="meta_app_secret" label="Meta app secret" help="Leave empty to use the GoXL shared one." status={st.meta_app_secret} save={saveAccountSecret} clear={clearAccountSecret} />
            </div>

            <div className="card">
              <h2>Payments (Razorpay)</h2>
              <AdminSecret bid={b.id} name="razorpay_key_id" label="Key ID" help="Starts with rzp_test_ or rzp_live_." status={st.razorpay_key_id} save={saveAccountSecret} clear={clearAccountSecret} plain />
              <AdminSecret bid={b.id} name="razorpay_key_secret" label="Key secret" status={st.razorpay_key_secret} save={saveAccountSecret} clear={clearAccountSecret} />
              <AdminSecret bid={b.id} name="razorpay_webhook_secret" label="Webhook secret" status={st.razorpay_webhook_secret} save={saveAccountSecret} clear={clearAccountSecret} />
              <form action={testAccountRazorpay}><input type="hidden" name="bid" value={b.id} /><button className="btn sec sm">Test Razorpay keys</button></form>
            </div>
          </>
        )}

        <div className="card">
          <h2>People on this account</h2>
          <ul style={{ fontSize: 13, paddingLeft: 18, marginTop: 8, lineHeight: 1.9 }}>{(members ?? []).map((m) => <li key={m.email ?? m.display_name}>{m.display_name ?? m.email} <span className="muted">· {m.email} · {m.role}</span></li>)}</ul>
        </div>
        {audit && audit.length > 0 && (
          <div className="card">
            <h2>Recent admin activity</h2>
            <ul style={{ fontSize: 12.5, paddingLeft: 18, marginTop: 8, lineHeight: 1.9 }}>{audit.map((a, i) => <li key={i}><span className="mono">{a.action}</span> {a.detail ? `· ${a.detail} ` : ''}<span className="muted">· {a.actor_email} · {fmtDT(a.created_at)}</span></li>)}</ul>
          </div>
        )}
      </div>
    </>
  );
}
