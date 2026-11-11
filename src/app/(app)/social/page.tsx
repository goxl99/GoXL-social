import { getContext } from '@/lib/context';
import { connectChannel, disconnectChannel } from '@/app/actions2';
import Flash from '@/components/Flash';

const INFO: Record<string, { name: string; idLabel: string; tokenLabel: string; note: string }> = {
  instagram: { name: 'Instagram', idLabel: 'Instagram user ID (numeric)', tokenLabel: 'Access token with instagram_content_publish', note: 'Publishes posts and stories. Needs an Instagram professional account linked to a Facebook Page. Reels need video and are not supported yet.' },
  facebook: { name: 'Facebook Page', idLabel: 'Page ID (numeric)', tokenLabel: 'Page access token with pages_manage_posts', note: 'Publishes photo posts and stories to your Page.' },
  whatsapp: { name: 'WhatsApp', idLabel: 'Phone number ID (numeric)', tokenLabel: 'Permanent access token for the WhatsApp Cloud API', note: 'Receives customer messages and sends the AI assistant replies. WhatsApp Status cannot be posted by API, so the app gives you the image and caption to share.' },
};

export default async function Social({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { db, business, canEdit } = await getContext();
  const { data } = await db.from('social_accounts').select('*').eq('business_id', business.id);
  const rows = ['instagram', 'facebook', 'whatsapp'].map((p) => data?.find((d) => d.platform === p) ?? { platform: p, status: 'disconnected', handle: null, connected_at: null });
  const app = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  return (
    <>
      <div className="head"><div><h1>Social Accounts</h1><p>Connect your own Instagram, Facebook Page and WhatsApp number using the official Meta APIs.</p></div></div>
      <Flash searchParams={searchParams} />
      <div className="note" style={{ marginBottom: 16 }}>For accounts you own, you can connect with an ID and access token from your Meta app. We check them with Meta before saving, and the token is stored where only the server can read it. Connecting accounts that belong to other people needs Meta app review.</div>
      <div className="grid g3">
        {rows.map((r) => {
          const i = INFO[r.platform];
          const ok = r.status === 'connected';
          return (
            <div className="card" key={r.platform}>
              <div className="row sb"><h2>{i.name}</h2><span className={'pill ' + (ok ? 'good' : r.status === 'expired' ? 'bad' : '')}>{ok ? 'Connected' : r.status === 'expired' ? 'Token expired' : 'Not connected'}</span></div>
              <p style={{ margin: '10px 0 4px', fontSize: 13 }}><b>Account:</b> {r.handle ?? 'None'}</p>
              <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>{i.note}</p>
              {canEdit && (
                <details open={!ok}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 12.5 }}>{ok ? 'Replace token' : 'Connect'}</summary>
                  <form action={connectChannel} style={{ marginTop: 10 }}>
                    <input type="hidden" name="platform" value={r.platform} />
                    <label className="f">{i.idLabel}<input name="external_id" inputMode="numeric" required /></label>
                    <label className="f">{i.tokenLabel}<input name="token" type="password" autoComplete="off" required /></label>
                    <button className="btn pri sm">Verify and connect</button>
                  </form>
                </details>
              )}
              {canEdit && ok && (
                <form action={disconnectChannel} style={{ marginTop: 10 }}><input type="hidden" name="platform" value={r.platform} /><button className="btn bad sm">Disconnect and delete token</button></form>
              )}
            </div>
          );
        })}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2>WhatsApp webhook</h2>
        <p className="muted" style={{ fontSize: 13, margin: '6px 0' }}>In your Meta app, open WhatsApp, then Configuration, and set:</p>
        <ul style={{ fontSize: 13, paddingLeft: 18 }}>
          <li>Callback URL: <span className="mono">{app ? `${app}/api/webhooks/whatsapp` : 'set NEXT_PUBLIC_APP_URL first'}</span></li>
          <li>Verify token: the value of <span className="mono">WHATSAPP_VERIFY_TOKEN</span> in your hosting settings</li>
          <li>Subscribe to the <span className="mono">messages</span> field</li>
        </ul>
      </div>
    </>
  );
}
