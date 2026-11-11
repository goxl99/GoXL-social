import { getContext } from '@/lib/context';

const INFO: Record<string, { name: string; needs: string[]; note: string }> = {
  instagram: { name: 'Instagram', needs: ['Instagram professional account', 'Linked Facebook Page', 'Meta app with Instagram API and app review for content publishing and messaging'], note: 'Posts, stories and reels publish through the official API. Direct messages arrive by webhook.' },
  facebook: { name: 'Facebook Page', needs: ['Facebook Page you manage', 'Meta app with pages_manage_posts and pages_messaging after app review'], note: 'Posts, photos, videos and stories publish through the API. Messenger inquiries arrive by webhook.' },
  whatsapp: { name: 'WhatsApp', needs: ['WhatsApp Business Platform (Cloud API) number', 'Verified business and approved message templates'], note: 'Receives and sends customer messages. Status updates cannot be published by API, so you share them from the app.' },
};

export default async function Social() {
  const { db, business } = await getContext();
  const { data } = await db.from('social_accounts').select('*').eq('business_id', business.id);
  const rows = ['instagram', 'facebook', 'whatsapp'].map((p) => data?.find((d) => d.platform === p) ?? { platform: p, status: 'disconnected', handle: null, token_expires_at: null });
  return (
    <>
      <div className="head"><div><h1>Social Accounts</h1><p>Connections to Instagram, Facebook and WhatsApp through the official Meta APIs.</p></div></div>
      <div className="note" style={{ marginBottom: 16 }}>The connect buttons switch on when your Meta app credentials are added (see README, "Connecting Meta"). Meta requires app review before it allows publishing and messaging for other people's accounts, and that cannot be skipped from the code side. Until then this screen shows the real connection state and what each platform needs.</div>
      <div className="grid g3">
        {rows.map((r) => {
          const i = INFO[r.platform];
          const ok = r.status === 'connected';
          return (
            <div className="card" key={r.platform}>
              <div className="row sb"><h2>{i.name}</h2><span className={'pill ' + (ok ? 'good' : r.status === 'expired' ? 'bad' : '')}>{ok ? 'Connected' : r.status === 'expired' ? 'Token expired' : 'Not connected'}</span></div>
              <dl style={{ margin: '12px 0', fontSize: 13 }}>
                <dt className="muted" style={{ fontWeight: 600 }}>Account</dt><dd style={{ margin: '0 0 8px' }}>{r.handle ?? 'None'}</dd>
                <dt className="muted" style={{ fontWeight: 600 }}>Token valid until</dt><dd style={{ margin: 0 }}>{r.token_expires_at ? new Date(r.token_expires_at).toLocaleDateString('en-IN') : '-'}</dd>
              </dl>
              <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>{i.note}</p>
              <details><summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 12.5 }}>What you need</summary><ul style={{ fontSize: 12.5, paddingLeft: 18 }}>{i.needs.map((n) => <li key={n}>{n}</li>)}</ul></details>
              <button className="btn" style={{ marginTop: 12 }} disabled title="Needs Meta app credentials">Connect</button>
            </div>
          );
        })}
      </div>
    </>
  );
}
