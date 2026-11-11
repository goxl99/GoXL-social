'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const GROUPS: [string, [string, string, boolean][]][] = [
  ['Set up', [['/dashboard', 'Overview', true], ['/business', 'My Business', true], ['/social', 'Social Accounts', true]]],
  ['Promote', [['/studio', 'AI Creative Studio', false], ['/campaigns', 'Campaigns', false], ['/calendar', 'Content Calendar', false]]],
  ['Convert', [['/inbox', 'Unified Inbox', false], ['/assistant', 'AI Sales Assistant', false], ['/products', 'Products & Catalogue', true], ['/leads', 'Leads & CRM', false], ['/orders', 'Orders', false], ['/payments', 'Payments', false], ['/deliveries', 'Deliveries', false], ['/automation', 'Automation Centre', false]]],
  ['Manage', [['/analytics', 'Analytics', false], ['/team', 'Team Management', true], ['/agency', 'Agency Management', false], ['/settings', 'Settings', false]]],
];

export default function NavLinks() {
  const path = usePathname();
  let n = 0;
  return (
    <nav>
      {GROUPS.map(([g, items]) => (
        <div key={g}>
          <div className="grp">{g}</div>
          {items.map(([href, label, live]) => {
            n++;
            const num = <i>{String(n).padStart(2, '0')}</i>;
            return live ? (
              <Link key={href} href={href} className={'nav' + (path === href || (href !== '/dashboard' && path.startsWith(href)) ? ' on' : '')}>{num}{label}</Link>
            ) : (
              <span key={href} className="nav off" aria-disabled="true">{num}{label}<span className="soon">Soon</span></span>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
