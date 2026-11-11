import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin';
import { signOut } from '@/app/actions';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireSuperAdmin();
  return (
    <div className="shell">
      <input type="checkbox" id="navtoggle" className="navtoggle" aria-label="Toggle menu" />
      <aside className="side">
        <div className="brand"><div className="mark">GX</div><div><b>GoXL Super Admin</b><span>CLARITY BEFORE ACTION</span></div></div>
        <nav>
          <div className="grp">Platform</div>
          <Link className="nav" href="/admin"><i>01</i>Accounts</Link>
          <Link className="nav" href="/admin/team"><i>02</i>Default keys &amp; admins</Link>
          <div className="grp">Go to</div>
          <Link className="nav" href="/dashboard"><i>03</i>My dashboard</Link>
        </nav>
        <div className="sidefoot">Every account is activated here, after its keys are connected.</div>
      </aside>
      <label htmlFor="navtoggle" className="scrim" />
      <div className="main">
        <div className="top">
          <label htmlFor="navtoggle" className="burger" aria-label="Open menu">&#9776;</label>
          <b>Super admin</b><span className="pill good">GoXL</span>
          <span className="sp" />
          <span className="muted" style={{ fontSize: 12 }}>{email}</span>
          <form action={signOut}><button className="btn sec sm">Sign out</button></form>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
