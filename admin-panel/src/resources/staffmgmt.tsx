import { useEffect, useState } from 'react';
import { Title, useNotify } from 'react-admin';
import { adminAction } from '../dataProvider';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const tok = () => localStorage.getItem('olomipay_admin_at') ?? '';

const ALL_ROLES = [
  'SUPER_ADMIN',
  'FINANCE_HEAD', 'FINANCE_STAFF',
  'IT_HEAD', 'IT_STAFF',
  'SUPPORT_HEAD', 'SUPPORT_STAFF',
  'MARKETING_HEAD', 'MARKETING_STAFF',
];
const label = (r: string) => r.replace('_', ' — ').replace('HEAD', 'Head').replace('STAFF', 'Staff')
  .replace('SUPER — ADMIN', 'Super Admin');

export const StaffMgmtList = () => {
  const notify = useNotify();
  const [me, setMe]   = useState<any>(null);
  const [rows, setRows] = useState<any[] | null>(null);
  const [form, setForm] = useState({ username: '', name: '', password: '', role: '' });
  const [busy, setBusy] = useState(false);

  const loadMe = () => fetch(`${API}/api/admin/staff/me`, { headers: { Authorization: `Bearer ${tok()}` } })
    .then(r => r.json()).then(r => {
      if (r.success) { setMe(r.data); setForm(f => ({ ...f, role: r.data.canCreateRoles?.[0] ?? '' })); }
    });
  const load = () => fetch(`${API}/api/admin/staff`, { headers: { Authorization: `Bearer ${tok()}` } })
    .then(r => r.json()).then(r => setRows(r.success ? r.data.staff : []));
  useEffect(() => { loadMe(); load(); }, []);

  const create = async () => {
    setBusy(true);
    try {
      const r: any = await adminAction('/staff', form);
      notify(r.executed === false
        ? `Queued — needs ${r.requiredApprovals ?? 3} admin approvals`
        : (r.message ?? 'Staff created'), { type: 'success' });
      setForm({ username: '', name: '', password: '', role: me?.canCreateRoles?.[0] ?? '' });
      load();
    } catch (e: any) { notify(e.message, { type: 'error' }); }
    finally { setBusy(false); }
  };

  const setRole = async (id: string, role: string) => {
    try { await adminAction(`/staff/${id}/role`, { role }); notify('Role updated', { type: 'success' }); load(); }
    catch (e: any) { notify(e.message, { type: 'error' }); }
  };
  const toggleActive = async (id: string, active: boolean) => {
    try { await adminAction(`/staff/${id}/active`, { active }); notify(active ? 'Activated' : 'Deactivated', { type: 'success' }); load(); }
    catch (e: any) { notify(e.message, { type: 'error' }); }
  };
  const resetPw = async (id: string) => {
    const pw = prompt('New password (min 8 chars):'); if (!pw) return;
    try { await adminAction(`/staff/${id}/reset-password`, { password: pw }); notify('Password reset', { type: 'success' }); }
    catch (e: any) { notify(e.message, { type: 'error' }); }
  };
  const del = async (id: string, username: string) => {
    if (!confirm(`Delete staff "${username}"? This cannot be undone.`)) return;
    try {
      const r = await fetch(`${API}/api/admin/staff/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok()}` } });
      const j = await r.json();
      if (!j.success) throw new Error(j.error ?? 'Delete failed');
      notify('Staff deleted', { type: 'success' }); load();
    } catch (e: any) { notify(e.message, { type: 'error' }); }
  };

  const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1' };
  const canCreate = (me?.canCreateRoles ?? []) as string[];
  const canManage = !!me?.canManageStaff;

  return (
    <div style={{ padding: 16, display: 'grid', gap: 16, maxWidth: 860 }}>
      <Title title="Staff" />
      <h2 style={{ margin: 0 }}>Staff accounts</h2>
      <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
        {me ? <>You are <b>{label(me.role)}</b>{me.department ? ` (${me.department})` : ''}. </> : ''}
        {canManage
          ? 'As SUPER_ADMIN you can add, edit and remove any staff.'
          : 'You can add staff in your department; additions need 3 admin approvals. Editing roles & deleting is super-admin only.'}
      </p>

      {/* Create — only roles you're allowed to create are shown */}
      {canCreate.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
          <h3 style={{ marginTop: 0 }}>Add staff member</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>
            <input style={inp} placeholder="username (login)" value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value.toLowerCase() })} />
            <input style={inp} placeholder="Full name" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} />
            <input style={inp} type="password" placeholder="password (min 8)" value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })} />
            <select style={inp} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              {canCreate.map(r => <option key={r} value={r}>{label(r)}</option>)}
            </select>
          </div>
          <button onClick={create} disabled={busy || !form.username || form.password.length < 8 || !form.role}
            style={{ marginTop: 12, background: '#2563eb', color: '#fff', border: 0, borderRadius: 8, padding: '10px 18px', fontWeight: 600 }}>
            {busy ? 'Working…' : canManage ? 'Create staff' : 'Propose staff (needs approval)'}
          </button>
        </div>
      )}

      {/* List */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
        <h3 style={{ marginTop: 0 }}>Staff{me && !canManage ? ` — ${me.department} department` : ''}</h3>
        {!rows ? 'Loading…' : rows.length === 0 ? <p style={{ color: '#94a3b8' }}>No staff yet.</p> : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: '#64748b' }}>
              <th>Username</th><th>Name</th><th>Role</th><th>Status</th><th>Last login</th>{canManage && <th></th>}
            </tr></thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.id} style={{ borderTop: '1px solid #eee', opacity: s.isActive ? 1 : 0.5 }}>
                  <td style={{ fontWeight: 600 }}>{s.username}</td>
                  <td>{s.name}</td>
                  <td>
                    {canManage ? (
                      <select value={s.role} onChange={e => setRole(s.id, e.target.value)} style={{ padding: '3px 6px', borderRadius: 6 }}>
                        {ALL_ROLES.map(r => <option key={r} value={r}>{label(r)}</option>)}
                      </select>
                    ) : label(s.role)}
                  </td>
                  <td>{s.isActive ? '✅ active' : '⛔ disabled'}</td>
                  <td style={{ fontSize: 12 }}>{s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString() : '—'}</td>
                  {canManage && (
                    <td style={{ display: 'flex', gap: 6, padding: '6px 0' }}>
                      <button onClick={() => toggleActive(s.id, !s.isActive)}
                        style={{ border: 0, borderRadius: 6, padding: '4px 10px', background: s.isActive ? '#fee2e2' : '#dcfce7', color: s.isActive ? '#991b1b' : '#166534' }}>
                        {s.isActive ? 'Disable' : 'Enable'}
                      </button>
                      <button onClick={() => resetPw(s.id)} style={{ border: 0, borderRadius: 6, padding: '4px 10px', background: '#e2e8f0' }}>Reset PW</button>
                      <button onClick={() => del(s.id, s.username)} style={{ border: 0, borderRadius: 6, padding: '4px 10px', background: '#fee2e2', color: '#991b1b' }}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
