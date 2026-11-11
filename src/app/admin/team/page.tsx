import { admin } from '@/lib/supabase/admin';
import { requireSuperAdmin, platformSecretStatus } from '@/lib/admin';
import { addSuperAdmin, removeSuperAdmin, savePlatformSecret, clearPlatformSecretAction } from '@/app/admin/actions';
import AdminSecret from '@/components/AdminSecret';
import { fmtDT } from '@/lib/path';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

export default async function Team({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const me = await requireSuperAdmin();
  const encrypted = !!process.env.SECRETS_ENCRYPTION_KEY;
  const db = admin();
  const [defaults, { data: admins }, { data: log }] = await Promise.all([
    encrypted ? platformSecretStatus() : null,
    db.from('platform_admins').select('user_id,email,created_at').order('created_at'),
    db.from('admin_audit').select('actor_email,action,detail,created_at,business:businesses(name)').order('created_at', { ascending: false }).limit(30),
  ]);
  return (
    <>
      <div className="head"><div><h1>Default keys and admins</h1><p>Keys here are used by any account that has not saved its own. Their usage is billed to GoXL.</p></div></div>
      <Flash searchParams={searchParams} />
      {!encrypted && <div className="flash err">The server is missing SECRETS_ENCRYPTION_KEY, so keys cannot be saved.</div>}
      <div className="stack">
        {defaults && (
          <div className="card">
            <h2>GoXL default keys</h2>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 12px' }}>Useful when you want to run AI for customers on your own plan, or when all accounts share one Meta app.</p>
            <AdminSecret name="ai_anthropic_key" label="Claude API key (default)" status={defaults.ai_anthropic_key} save={savePlatformSecret} clear={clearPlatformSecretAction} />
            <AdminSecret name="ai_openai_key" label="OpenAI API key (default)" status={defaults.ai_openai_key} save={savePlatformSecret} clear={clearPlatformSecretAction} />
            <AdminSecret name="meta_app_secret" label="Meta app secret (shared)" status={defaults.meta_app_secret} save={savePlatformSecret} clear={clearPlatformSecretAction} />
          </div>
        )}
        <div className="card">
          <h2>Super admins</h2>
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 12px' }}>They can open every account, see and replace its keys, and activate or pause it. The person must have signed up first.</p>
          <ul style={{ fontSize: 13, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8, marginBottom: 12 }}>
            {(admins ?? []).map((a) => (
              <li key={a.user_id} className="row sb"><span>{a.email}{a.user_id === me.user.id && <span className="pill good" style={{ marginLeft: 8 }}>You</span>}</span>
                {a.user_id !== me.user.id && <form action={removeSuperAdmin}><input type="hidden" name="user_id" value={a.user_id} /><button className="btn bad sm">Remove</button></form>}</li>
            ))}
          </ul>
          <form action={addSuperAdmin} className="row" style={{ flexWrap: 'nowrap' }}>
            <input name="email" type="email" placeholder="email@example.com" required style={{ flex: 1, minWidth: 0, border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px' }} />
            <button className="btn sm">Add super admin</button>
          </form>
        </div>
        <div className="card">
          <h2>Activity log</h2>
          <ul style={{ fontSize: 12.5, paddingLeft: 18, marginTop: 8, lineHeight: 1.9 }}>
            {(log ?? []).map((l, i) => <li key={i}><span className="mono">{l.action}</span> {(l.business as unknown as { name: string } | null)?.name ? `· ${(l.business as unknown as { name: string }).name} ` : ''}{l.detail ? `· ${l.detail} ` : ''}<span className="muted">· {l.actor_email} · {fmtDT(l.created_at)}</span></li>)}
            {!log?.length && <li className="muted">Nothing yet.</li>}
          </ul>
        </div>
      </div>
    </>
  );
}
