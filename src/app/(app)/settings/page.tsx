import { getContext } from '@/lib/context';
import { hasAdmin } from '@/lib/supabase/admin';
import { secretStatus, getVerifyToken, type SecretName } from '@/lib/secrets';
import { DEFAULT_MODEL } from '@/lib/ai/llm';
import { saveAISettings, saveSecretValue, clearSecretValue, testAI, testRazorpay } from '@/app/actions3';
import { fmtD } from '@/lib/path';
import Flash from '@/components/Flash';

type St = Awaited<ReturnType<typeof secretStatus>>;

function SecretField({ name, label, help, st, owner, plain }: { name: SecretName; label: string; help?: string; st: St; owner: boolean; plain?: boolean }) {
  const s = st[name];
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="row sb"><b style={{ fontSize: 13 }}>{label}</b><span className={'pill ' + (s.set ? 'good' : '')}>{s.set ? `Saved ${s.hint}${s.at ? ' · ' + fmtD(s.at) : ''}` : 'Not set'}</span></div>
      {help && <p className="muted" style={{ fontSize: 12, margin: '2px 0 6px' }}>{help}</p>}
      {owner ? (
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <form action={saveSecretValue} className="row" style={{ flex: 1, flexWrap: 'nowrap' }}>
            <input type="hidden" name="name" value={name} />
            <input name="value" type={plain ? 'text' : 'password'} autoComplete="off" placeholder={s.set ? 'Paste a new value to replace' : 'Paste here'} style={{ flex: 1, minWidth: 0, border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px' }} />
            <button className="btn sm">Save</button>
          </form>
          {s.set && <form action={clearSecretValue}><input type="hidden" name="name" value={name} /><button className="btn bad sm">Remove</button></form>}
        </div>
      ) : <p className="muted" style={{ fontSize: 12 }}>Only the account owner can change this.</p>}
    </div>
  );
}

export default async function Settings({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { business, role, canEdit, db } = await getContext();
  const owner = role === 'owner';
  const server = hasAdmin();
  const encrypted = !!process.env.SECRETS_ENCRYPTION_KEY;
  const { data: b } = await db.from('businesses').select('ai_provider,ai_model').eq('id', business.id).single();
  const st = server ? await secretStatus(business.id) : null;
  const verify = server && encrypted ? await getVerifyToken(business.id) : null;
  const app = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  const provider = (b?.ai_provider ?? 'anthropic') as 'anthropic' | 'openai';
  return (
    <>
      <div className="head"><div><h1>Settings</h1><p>Keys and connections for {business.name}. Each account uses its own, and they are stored encrypted on the server.</p></div></div>
      <Flash searchParams={searchParams} />
      {!server && <div className="flash err">The server is missing SUPABASE_SERVICE_ROLE_KEY, so keys cannot be saved yet.</div>}
      {server && !encrypted && <div className="flash err">The server is missing SECRETS_ENCRYPTION_KEY, so keys cannot be saved yet.</div>}
      {st && encrypted && (
        <div className="stack">
          <div className="card">
            <h2>AI assistant and creative studio</h2>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 12px' }}>Choose the provider this account pays for. Customer replies and post copy use it. Without a key the assistant still works in rules-only mode.</p>
            <form action={saveAISettings} className="grid g3" style={{ alignItems: 'end' }}>
              <label className="f">Provider<select name="ai_provider" defaultValue={provider} disabled={!canEdit}><option value="anthropic">Claude (Anthropic)</option><option value="openai">GPT (OpenAI)</option></select></label>
              <label className="f">Model (optional)<input name="ai_model" defaultValue={b?.ai_model ?? ''} placeholder={`Default: ${DEFAULT_MODEL[provider]}`} disabled={!canEdit} /></label>
              <div style={{ marginBottom: 12 }}>{canEdit && <button className="btn">Save provider</button>}</div>
            </form>
            <SecretField name="ai_anthropic_key" label="Claude API key" help="From console.anthropic.com. Starts with sk-ant-." st={st} owner={owner} />
            <SecretField name="ai_openai_key" label="OpenAI API key" help="From platform.openai.com. Starts with sk-." st={st} owner={owner} />
            {canEdit && <form action={testAI}><button className="btn sec sm">Test the selected provider</button></form>}
          </div>
          <div className="card">
            <h2>WhatsApp and Meta</h2>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 12px' }}>Connect the number itself on the Social Accounts page. These are the webhook details to enter in your Meta app under WhatsApp, Configuration.</p>
            <ul style={{ fontSize: 13, paddingLeft: 18, marginBottom: 12, lineHeight: 1.8 }}>
              <li>Callback URL: <span className="mono" style={{ wordBreak: 'break-all' }}>{app ? `${app}/api/webhooks/whatsapp` : 'NEXT_PUBLIC_APP_URL is not set'}</span></li>
              <li>Verify token: <span className="mono">{verify ?? '-'}</span></li>
              <li>Subscribe to the <span className="mono">messages</span> field</li>
            </ul>
            <SecretField name="meta_app_secret" label="Meta app secret" help="Meta app, Settings, Basic, App secret. Used to confirm that webhook calls really come from Meta." st={st} owner={owner} />
          </div>
          <div className="card">
            <h2>Payments (Razorpay)</h2>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 12px' }}>Customers pay this account directly through Razorpay payment links. In Razorpay, Settings, Webhooks, add the URL below, choose the <span className="mono">payment_link.paid</span> event and set a secret, then save the same secret here.</p>
            <p style={{ fontSize: 13, marginBottom: 12 }}>Webhook URL: <span className="mono" style={{ wordBreak: 'break-all' }}>{app ? `${app}/api/webhooks/razorpay?b=${business.id}` : 'NEXT_PUBLIC_APP_URL is not set'}</span></p>
            <SecretField name="razorpay_key_id" label="Key ID" help="Starts with rzp_test_ or rzp_live_." st={st} owner={owner} plain />
            <SecretField name="razorpay_key_secret" label="Key secret" st={st} owner={owner} />
            <SecretField name="razorpay_webhook_secret" label="Webhook secret" st={st} owner={owner} />
            {canEdit && <form action={testRazorpay}><button className="btn sec sm">Test Razorpay keys</button></form>}
          </div>
        </div>
      )}
    </>
  );
}
