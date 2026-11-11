import { redirect } from 'next/navigation';
import { getClient, getUser } from '@/lib/supabase/server';
import { signOut } from '@/app/actions';

export const dynamic = 'force-dynamic';

export default async function Pending() {
  const client = await getClient();
  const user = await getUser();
  if (!user) redirect('/login');
  const { data } = await client.schema('gx').from('members').select('business:businesses(id,name,status,onboarded)').eq('user_id', user.id);
  const list = ((data ?? []) as unknown as { business: { id: string; name: string; status: string; onboarded: boolean } }[]).map((m) => m.business).filter(Boolean);
  if (!list.length) redirect('/onboarding');
  if (list.some((b) => b.status === 'active')) redirect('/dashboard');
  const suspended = list.every((b) => b.status === 'suspended');
  return (
    <div className="wiz">
      <div className="brand" style={{ padding: '0 0 14px' }}><div className="mark">GX</div><div><b>GoXL Commerce</b><span>CLARITY BEFORE ACTION</span></div></div>
      <div className="card">
        <h1>{suspended ? 'Your account is paused' : 'Your account is being activated'}</h1>
        <p className="muted" style={{ margin: '8px 0 14px' }}>
          {suspended
            ? 'This account has been paused by GoXL. Please contact your GoXL account manager to resume it.'
            : 'Thank you for setting up your business. The GoXL team is connecting your AI assistant, WhatsApp and payments. You will be able to sign in to your dashboard as soon as that is done.'}
        </p>
        <ul style={{ fontSize: 14, paddingLeft: 18, marginBottom: 16, lineHeight: 1.8 }}>
          {list.map((b) => <li key={b.id}><b>{b.name}</b> <span className={'pill ' + (b.status === 'suspended' ? 'bad' : 'warn')}>{b.status === 'suspended' ? 'Paused' : 'Awaiting activation'}</span></li>)}
        </ul>
        <div className="row">
          <a className="btn" href="">Check again</a>
          <form action={signOut}><button className="btn sec">Sign out</button></form>
        </div>
      </div>
    </div>
  );
}
