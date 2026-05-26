import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext.jsx';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api.js';

const ROLE_COLORS = {
  ADMIN:      'bg-red-100 text-red-700',
  MANAGER:    'bg-brand-100 text-brand-700',
  ACCOUNTANT: 'bg-green-100 text-green-700',
  EMPLOYEE:   'bg-gray-100 text-gray-600',
};

const inputClass = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

function UserModal({ user: editing, onClose, onSaved, t }) {
  const isEdit = !!editing;
  const [form, setForm] = useState({
    username: editing?.username || '',
    role:     editing?.role     || 'MANAGER',
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const payload = { username: form.username, role: form.role };
      if (form.password) payload.password = form.password;
      if (isEdit) {
        await api.put(`/users/${editing.id}`, payload);
      } else {
        if (!form.password) { setError('Password is required'); setSaving(false); return; }
        await api.post('/users', payload);
      }
      onSaved();
      onClose();
    } catch (e) { setError(e.message || 'Error'); }
    finally { setSaving(false); }
  }

  const selectClass = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
        <h2 className="text-base font-semibold text-gray-900">
          {isEdit ? t('users.editUser') : t('users.addUser')}
        </h2>
        {!isEdit && (
          <p className="text-xs text-gray-500 bg-brand-50 border border-brand-100 rounded p-2">
            {t('users.employeeAccountNote')}
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('auth.username')}</label>
            <input type="text" value={form.username}
              onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
              className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('employees.role')}</label>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className={selectClass}>
              <option value="ADMIN">Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="ACCOUNTANT">Accountant</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {isEdit ? t('users.resetPassword') : t('auth.password')}
            </label>
            <input type="password" value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              placeholder={isEdit ? '(leave blank to keep current)' : ''}
              className={inputClass} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            {t('common.cancel')}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
            {saving ? '...' : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { t }       = useTranslation();
  const { user: me } = useAuth();

  const [users,   setUsers]   = useState([]);
  const [loading, setLoad]    = useState(true);
  const [error,   setError]   = useState('');
  const [modal,   setModal]   = useState(null); // null | 'add' | user object
  const [toast,   setToast]   = useState('');

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  function load() {
    setLoad(true);
    setError('');
    api.get('/users')
      .then(r => setUsers(r.data || []))
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoad(false));
  }

  useEffect(() => { load(); }, []);

  async function handleToggle(u) {
    if (u.id === me?.id) return;
    const msg = u.is_active ? t('users.confirmDeactivate') : t('common.confirm');
    if (!window.confirm(msg)) return;
    try {
      const r = await api.put(`/users/${u.id}/toggle-active`);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: r.is_active } : x));
      showToast(t('users.toggled'));
    } catch (e) { showToast(e.message || 'Error'); }
  }

  if (loading) return (
    <div className="space-y-3 animate-pulse">
      <div className="h-10 w-40 rounded-md bg-gray-200" />
      {[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded bg-gray-100" />)}
    </div>
  );
  if (error) return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-500">
      <p className="text-sm">{error}</p>
      <button onClick={load} className="rounded-lg bg-brand-500 px-4 py-2 text-sm text-white hover:bg-brand-600">Retry</button>
    </div>
  );

  return (
    <div className="space-y-4 max-w-4xl">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/settings" className="text-sm text-gray-500 hover:text-gray-700">← {t('nav.settings')}</Link>
          <h1 className="text-xl font-semibold text-gray-900">{t('nav.userManagement')}</h1>
        </div>
        <button
          onClick={() => setModal('add')}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          + {t('users.addUser')}
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('auth.username')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('employees.role')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('users.linkedEmployee')}</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.status')}</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">{t('users.noUsers')}</td></tr>
            ) : users.map(u => {
              const isSelf = u.id === me?.id;
              return (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{u.username}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-600'}`}>
                      {t(`roles.${u.role}`, u.role)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {u.employee_name ? `${u.employee_name} (${u.employee_code})` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {u.is_active ? t('common.active') : t('common.inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    {isSelf ? (
                      <span className="text-xs text-gray-400" title={t('users.cannotModifySelf')}>
                        {t('users.cannotModifySelf')}
                      </span>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setModal(u)}
                          className="rounded px-2 py-0.5 text-xs font-medium bg-brand-50 text-brand-700 hover:bg-brand-100"
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          onClick={() => handleToggle(u)}
                          className={`rounded px-2 py-0.5 text-xs font-medium ${u.is_active ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
                        >
                          {u.is_active ? t('users.deactivate') : t('users.activate')}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <UserModal
          user={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { load(); showToast(modal === 'add' ? t('users.created') : t('users.updated')); }}
          t={t}
        />
      )}
    </div>
  );
}
