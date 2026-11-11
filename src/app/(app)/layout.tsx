import Link from 'next/link';
import { getContext, publicUrl } from '@/lib/context';
import { signOut, switchBusiness } from '@/app/actions';
import NavLinks from '@/components/NavLinks';
import { isSuperAdmin } from '@/lib/admin';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { memberships, business, role, user } = await getContext();
  const superAdmin = await isSuperAdmin(user.id, user.email);
  return (
    <div className="shell">
      <input type="checkbox" id="navtoggle" className="navtoggle" aria-label="Toggle menu" />
      <aside className="side">
        <div className="brand"><div className="mark">GX</div><div><b>GoXL Commerce</b><span>CLARITY BEFORE ACTION</span></div></div>
        <form action={switchBusiness} className="switch">
          <select name="id" defaultValue={business.id} aria-label="Business">
            {memberships.map((m) => <option key={m.business.id} value={m.business.id}>{m.business.name}</option>)}
          </select>
          <div className="row" style={{ marginTop: 6 }}>
            {memberships.length > 1 && <button className="btn sm">Switch</button>}
            <Link className="btn sm sec" style={{ color: '#DCE8DF', borderColor: '#4d6b5a' }} href="/onboarding">Add business</Link>
          </div>
        </form>
        <NavLinks />
        {superAdmin && <Link className="btn sm" style={{ margin: '12px 8px 0' }} href="/admin">Super admin console</Link>}
        <div className="sidefoot">Promote everywhere. Respond instantly. Convert intelligently. Deliver successfully.</div>
      </aside>
      <label htmlFor="navtoggle" className="scrim" />
      <div className="main">
        <div className="top">
          <label htmlFor="navtoggle" className="burger" aria-label="Open menu">&#9776;</label>
          {publicUrl(business.logo_path) && /* eslint-disable-next-line @next/next/no-img-element */ <img src={publicUrl(business.logo_path)!} alt="" width={28} height={28} style={{ borderRadius: '50%', objectFit: 'cover' }} />}
          <b>{business.name}</b><span className="pill">{role}</span>
          <span className="sp" />
          <span className="muted" style={{ fontSize: 12 }}>{user.email}</span>
          <form action={signOut}><button className="btn sec sm">Sign out</button></form>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
