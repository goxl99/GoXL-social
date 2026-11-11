import { getContext } from '@/lib/context';
import { inviteMember, cancelInvite, changeRole, removeMember } from '@/app/actions';
import Flash from '@/components/Flash';

const ROLES = ['owner', 'manager', 'sales', 'fulfilment'];
const PERMS: [string, boolean[]][] = [
  ['Edit business profile and catalogue', [true, true, false, false]],
  ['Reply to customers and create orders', [true, true, true, false]],
  ['Mark orders dispatched', [true, true, false, true]],
  ['Invite people and change roles', [true, false, false, false]],
];

export default async function Team({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { db, business, role, user } = await getContext();
  const isOwner = role === 'owner';
  const [{ data: members }, { data: invites }] = await Promise.all([
    db.from('members').select('user_id,role,display_name,email,created_at').eq('business_id', business.id).order('created_at'),
    isOwner ? db.from('invites').select('id,email,role,created_at').eq('business_id', business.id) : Promise.resolve({ data: [] as { id: string; email: string; role: string; created_at: string }[] }),
  ]);
  return (
    <>
      <div className="head"><div><h1>Team Management</h1><p>Invite people and control what each role can do. Rules are enforced in the database, not just on screen.</p></div></div>
      <Flash searchParams={searchParams} />
      <div className="tw">
        <table>
          <thead><tr><th>Member</th><th>Email</th><th>Role</th><th></th></tr></thead>
          <tbody>
            {members?.map((m) => (
              <tr key={m.user_id}>
                <td><b>{m.display_name}</b>{m.user_id === user.id && <span className="muted"> (you)</span>}</td>
                <td>{m.email}</td>
                <td>
                  {isOwner ? (
                    <form action={changeRole} className="row" style={{ flexWrap: 'nowrap' }}>
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <select name="role" defaultValue={m.role} aria-label={`Role for ${m.display_name}`} style={{ border: '1px solid var(--line)', borderRadius: 7, padding: 5 }}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
                      <button className="btn sec sm">Save</button>
                    </form>
                  ) : <span className="pill">{m.role}</span>}
                </td>
                <td>{(isOwner || m.user_id === user.id) && <form action={removeMember}><input type="hidden" name="user_id" value={m.user_id} /><button className="btn bad sm">{m.user_id === user.id ? 'Leave' : 'Remove'}</button></form>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isOwner && (
        <div className="grid g2" style={{ marginTop: 16 }}>
          <form action={inviteMember} className="card">
            <h2 style={{ marginBottom: 10 }}>Invite someone</h2>
            <label className="f">Email<input id="email" name="email" type="email" required /></label>
            <label className="f">Role<select id="role" name="role" defaultValue="sales"><option>manager</option><option>sales</option><option>fulfilment</option></select></label>
            <button className="btn pri">Save invite</button>
            <p className="muted" style={{ marginTop: 8, fontSize: 12.5 }}>They join automatically the next time they sign in or sign up with this email. No email is sent yet.</p>
          </form>
          <div className="card">
            <h2 style={{ marginBottom: 10 }}>Pending invites</h2>
            {invites?.length ? invites.map((i) => (
              <form key={i.id} action={cancelInvite} className="row sb" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <span>{i.email} <span className="pill">{i.role}</span></span><input type="hidden" name="id" value={i.id} /><button className="btn bad sm">Cancel</button>
              </form>
            )) : <p className="muted">None.</p>}
          </div>
        </div>
      )}
      <h2 style={{ margin: '22px 0 10px' }}>What each role can do</h2>
      <div className="tw">
        <table>
          <thead><tr><th>Area</th>{ROLES.map((r) => <th key={r}>{r}</th>)}</tr></thead>
          <tbody>{PERMS.map(([a, v]) => <tr key={a}><td>{a}</td>{v.map((x, i) => <td key={i}>{x ? 'Yes' : '-'}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </>
  );
}
