import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext.jsx';
import { useCompany } from '@/context/CompanyContext.jsx';
import { api } from '@/lib/api.js';

const LOGO_MAX_BYTES = 500 * 1024;
const MASKED = '••••••••';

const DEFAULTS = {
  company_name:            '',
  company_logo:            '',
  zk_host:                 '',
  zk_port:                 '',
  zk_username:             '',
  sync_interval_minutes:   '30',
  sync_lookback_days:      '3',
  std_days_per_month:      '30',
  ot_multiplier:           '2.0',
  late_penalty_unapproved: '1.5',
  late_penalty_approved:   '1.0',
  ot_calculation_mode:        'OT_PUNCH',
  grace_period_enabled:       'true',
  grace_period_minutes:       '10',
  time_off_allowance_days:    '15',
};

const TABS = ['company', 'zkbio', 'payroll', 'attendance', 'backup', 'users'];

const ROLE_COLORS = {
  ADMIN:      'bg-red-100 text-red-700',
  MANAGER:    'bg-brand-100 text-brand-700',
  ACCOUNTANT: 'bg-green-100 text-green-700',
  EMPLOYEE:   'bg-gray-100 text-gray-600',
};

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

function Field({ label, children, hint }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function SaveButton({ onClick, saving, label }) {
  return (
    <div className="flex justify-end pt-4 border-t border-gray-100 mt-2">
      <button
        onClick={onClick}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {saving && <Spinner />}
        {label}
      </button>
    </div>
  );
}

function AmberWarning({ children }) {
  return (
    <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
      {children}
    </div>
  );
}

const inputClass = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const { setCompanyName, setCompanyLogo } = useCompany();

  const [activeTab,      setActiveTab]      = useState('company');
  const [settings,       setSettings]       = useState(DEFAULTS);
  const [loadedSettings, setLoadedSettings] = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');
  const [toast,          setToast]          = useState('');
  const [logoError,      setLogoError]      = useState('');
  const [zkPassword,     setZkPassword]     = useState('');

  const [savingCompany,  setSavingCompany]  = useState(false);
  const [savingZkbio,    setSavingZkbio]    = useState(false);
  const [savingPayroll,  setSavingPayroll]  = useState(false);
  const [savingOtMode,   setSavingOtMode]   = useState(false);
  const [testing,        setTesting]        = useState(false);
  const [testResult,     setTestResult]     = useState(null);
  const [showPassword,   setShowPassword]   = useState(false);

  const [historicalFrom,    setHistoricalFrom]    = useState(`${new Date().getFullYear()}-01-01`);
  const [historicalRunning, setHistoricalRunning] = useState(false);
  const pollRef = useRef(null);

  // Backup & Restore state
  const [backups,           setBackups]           = useState([]);
  const [backupsLoading,    setBackupsLoading]    = useState(false);
  const [backupNotes,       setBackupNotes]       = useState('');
  const [creatingBackup,    setCreatingBackup]    = useState(false);
  const [deletingBackupId,  setDeletingBackupId]  = useState(null);
  const [restoreFile,       setRestoreFile]       = useState(null);
  const [restoreConfirm1,   setRestoreConfirm1]   = useState(false);
  const [restoreConfirm2,   setRestoreConfirm2]   = useState(false);
  const [restoreTypeValue,  setRestoreTypeValue]  = useState('');
  const [restoring,         setRestoring]         = useState('');
  const [restoreSuccess,    setRestoreSuccess]    = useState(false);
  const restoreFileRef = useRef(null);

  // Users tab state
  const [users,       setUsers]       = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError,  setUsersError]  = useState('');
  const [userModal,   setUserModal]   = useState(null); // null | 'add' | user object

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  function set(key) {
    return e => setSettings(prev => ({ ...prev, [key]: e.target.value }));
  }

  function loadSettings() {
    setLoading(true);
    setError('');
    api.get('/settings')
      .then(s => {
        setSettings({ ...DEFAULTS, ...s });
        setLoadedSettings({ ...DEFAULTS, ...s });
        setZkPassword('');
      })
      .catch(e => setError(e.message || 'Failed to load settings'))
      .finally(() => setLoading(false));
  }

  async function loadBackups() {
    setBackupsLoading(true);
    try {
      const { data } = await api.get('/backups');
      setBackups(data || []);
    } catch { /* ignore */ }
    finally { setBackupsLoading(false); }
  }

  async function loadUsers() {
    setUsersLoading(true);
    setUsersError('');
    try {
      const r = await api.get('/users');
      setUsers(r.data || []);
    } catch (e) {
      setUsersError(e.message || 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }

  async function handleToggleUser(u) {
    if (u.id === me?.id) return;
    const msg = u.is_active ? t('users.confirmDeactivate') : t('common.confirm');
    if (!window.confirm(msg)) return;
    try {
      const r = await api.put(`/users/${u.id}/toggle-active`);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: r.is_active } : x));
      showToast(t('users.toggled'));
    } catch (e) { showToast(e.message || 'Error'); }
  }

  useEffect(() => { loadSettings(); loadBackups(); }, []);

  // Load users lazily when the tab is first opened
  useEffect(() => {
    if (activeTab === 'users' && users.length === 0 && !usersLoading) {
      loadUsers();
    }
  }, [activeTab]);

  async function saveCompany() {
    setSavingCompany(true);
    try {
      await api.put('/settings', {
        company_name: settings.company_name,
        company_logo: settings.company_logo,
      });
      setCompanyName(settings.company_name);
      setCompanyLogo(settings.company_logo);
      showToast(t('settings.saved'));
    } catch (e) { showToast(e.message || 'Error'); }
    finally { setSavingCompany(false); }
  }

  function handleLogoFile(e) {
    setLogoError('');
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError('Logo must be under 500KB');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => setSettings(prev => ({ ...prev, company_logo: ev.target.result }));
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function saveZkbio() {
    setSavingZkbio(true);
    try {
      const payload = {
        zk_host:               settings.zk_host,
        zk_port:               settings.zk_port,
        zk_username:           settings.zk_username,
        sync_interval_minutes: settings.sync_interval_minutes,
        sync_lookback_days:    settings.sync_lookback_days,
      };
      if (zkPassword) payload.zk_password = zkPassword;
      await api.put('/settings', payload);
      setZkPassword('');
      showToast(t('settings.saved'));
    } catch (e) { showToast(e.message || 'Error'); }
    finally { setSavingZkbio(false); }
  }

  async function savePayroll() {
    setSavingPayroll(true);
    try {
      await api.put('/settings', {
        std_days_per_month:      settings.std_days_per_month,
        ot_multiplier:           settings.ot_multiplier,
        late_penalty_unapproved: settings.late_penalty_unapproved,
        late_penalty_approved:   settings.late_penalty_approved,
      });
      showToast(t('settings.saved'));
    } catch (e) { showToast(e.message || 'Error'); }
    finally { setSavingPayroll(false); }
  }

  async function saveOtMode() {
    setSavingOtMode(true);
    try {
      await api.put('/settings', {
        ot_calculation_mode:      settings.ot_calculation_mode,
        grace_period_enabled:     settings.grace_period_enabled,
        grace_period_minutes:     settings.grace_period_minutes,
        time_off_allowance_days:  settings.time_off_allowance_days,
      });
      setLoadedSettings(prev => ({
        ...(prev || DEFAULTS),
        ot_calculation_mode:      settings.ot_calculation_mode,
        grace_period_enabled:     settings.grace_period_enabled,
        grace_period_minutes:     settings.grace_period_minutes,
        time_off_allowance_days:  settings.time_off_allowance_days,
      }));
      showToast(t('settings.saved'));
    } catch (e) { showToast(e.message || 'Error'); }
    finally { setSavingOtMode(false); }
  }

  async function handleHistoricalSync() {
    if (!window.confirm(t('settings.confirmHistoricalSync', { date: historicalFrom }))) return;
    setHistoricalRunning(true);
    showToast(t('settings.historicalSyncStarted'));
    try {
      const { sync_log_id } = await api.post('/attendance/sync/historical', { from_date: historicalFrom });
      pollRef.current = setInterval(async () => {
        try {
          const status = await api.get('/attendance/sync/status');
          const log = status.last_sync;
          if (log && log.id === sync_log_id && log.status !== 'RUNNING') {
            clearInterval(pollRef.current);
            setHistoricalRunning(false);
            if (log.status === 'SUCCESS') {
              showToast(t('settings.historicalSyncComplete', { inserted: log.records_inserted }));
            } else {
              showToast(log.error_message || 'Historical sync failed');
            }
          }
        } catch {
          clearInterval(pollRef.current);
          setHistoricalRunning(false);
        }
      }, 5000);
    } catch (e) {
      setHistoricalRunning(false);
      showToast(e.data?.message || e.message || 'Failed to start sync');
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      await api.post('/settings/test-connection', {});
      setTestResult({ ok: true, msg: t('settings.connectionSuccess') });
    } catch (e) {
      setTestResult({ ok: false, msg: e.data?.message || t('settings.connectionFailed') });
    } finally {
      setTesting(false);
    }
  }

  async function handleCreateBackup() {
    if (!window.confirm(t('settings.confirmBackup'))) return;
    setCreatingBackup(true);
    try {
      const record = await api.post('/backups', { notes: backupNotes });
      setBackupNotes('');
      showToast(`${t('settings.backupSuccess')} (${record.file_size_formatted})`);
      await loadBackups();
    } catch (e) {
      showToast(e.data?.message || e.message || 'Failed to create backup');
    } finally {
      setCreatingBackup(false);
    }
  }

  async function handleDeleteBackup(id) {
    if (!window.confirm(t('settings.confirmDeleteBackup'))) return;
    setDeletingBackupId(id);
    try {
      await api.delete(`/backups/${id}`);
      showToast(t('settings.backupDeleted'));
      setBackups(prev => prev.filter(b => b.id !== id));
    } catch (e) {
      showToast(e.data?.message || e.message || 'Failed to delete backup');
    } finally {
      setDeletingBackupId(null);
    }
  }

  async function handleRestore() {
    if (!restoreFile) return;
    setRestoreConfirm2(false);
    setRestoring(t('settings.restoreUploading'));
    try {
      const formData = new FormData();
      formData.append('file', restoreFile);
      setRestoring(t('settings.restoring'));
      await api.postForm('/backups/restore', formData);
      setRestoring('');
      setRestoreSuccess(true);
    } catch (e) {
      setRestoring('');
      showToast(e.data?.message || e.message || 'Restore failed');
    }
  }

  const loaded = loadedSettings || DEFAULTS;
  const attendanceChanged =
    settings.ot_calculation_mode      !== loaded.ot_calculation_mode      ||
    settings.grace_period_enabled     !== loaded.grace_period_enabled     ||
    settings.grace_period_minutes     !== loaded.grace_period_minutes     ||
    settings.time_off_allowance_days  !== loaded.time_off_allowance_days;

  const gracePeriodOn = settings.grace_period_enabled === 'true';

  if (loading) return (
    <div className="space-y-3 animate-pulse max-w-3xl">
      <div className="h-10 rounded-lg bg-gray-200 w-96" />
      <div className="h-64 rounded-xl bg-gray-200" />
    </div>
  );
  if (error) return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-500">
      <p className="text-sm">{error}</p>
      <button onClick={loadSettings} className="rounded-lg bg-brand-500 px-4 py-2 text-sm text-white hover:bg-brand-600">Retry</button>
    </div>
  );

  return (
    <div className="max-w-3xl space-y-0">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>
      )}

      {/* Page header */}
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">{t('nav.settings')}</h1>
      </div>

      {/* Tab container */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">

        {/* Tab bar */}
        <div className="flex items-center border-b border-gray-200 px-2 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t(`settings.tabs.${tab}`)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="px-6 py-6">

          {/* ── TAB 1: Company ─────────────────────────────────────────── */}
          {activeTab === 'company' && (
            <div className="space-y-5">
              <Field label={t('settings.companyName')}>
                <input
                  type="text"
                  value={settings.company_name}
                  onChange={set('company_name')}
                  className={inputClass}
                  placeholder={t('settings.companyNamePlaceholder')}
                />
              </Field>

              <Field label={t('settings.companyLogo')} hint={t('settings.logoHint')}>
                <div className="space-y-2">
                  {settings.company_logo && (
                    <div className="flex items-center gap-3">
                      <img
                        src={settings.company_logo}
                        alt="logo preview"
                        style={{ maxHeight: 80, objectFit: 'contain' }}
                        className="rounded border border-gray-200 p-1"
                      />
                      <button
                        type="button"
                        onClick={() => setSettings(prev => ({ ...prev, company_logo: '' }))}
                        className="text-sm text-red-600 hover:underline"
                      >
                        {t('settings.removeLogo')}
                      </button>
                    </div>
                  )}
                  <label className="cursor-pointer inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <input type="file" accept="image/png,image/jpeg" onChange={handleLogoFile} className="hidden" />
                    {t('settings.uploadLogo')}
                  </label>
                  {logoError && <p className="text-xs text-red-600">{logoError}</p>}
                </div>
              </Field>

              <SaveButton onClick={saveCompany} saving={savingCompany} label={t('settings.saveCompany')} />
            </div>
          )}

          {/* ── TAB 2: ZKBio ────────────────────────────────────────────── */}
          {activeTab === 'zkbio' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('settings.host')}>
                  <input type="text" value={settings.zk_host} onChange={set('zk_host')}
                    className={inputClass} placeholder="192.168.1.100" />
                </Field>
                <Field label={t('settings.port')}>
                  <input type="number" value={settings.zk_port} onChange={set('zk_port')}
                    className={inputClass} placeholder="8090" />
                </Field>
              </div>

              <Field label={t('auth.username')}>
                <input type="text" value={settings.zk_username} onChange={set('zk_username')}
                  className={inputClass} />
              </Field>

              <Field label={t('settings.password')} hint={t('settings.leaveBlankPassword')}>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={zkPassword}
                    onChange={e => setZkPassword(e.target.value)}
                    className={inputClass + ' pr-16'}
                    placeholder={MASKED}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-600 hover:underline"
                  >
                    {showPassword ? t('settings.hidePassword') : t('settings.showPassword')}
                  </button>
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label={t('settings.syncInterval')} hint="min 5 – max 1440">
                  <input type="number" min="5" max="1440" value={settings.sync_interval_minutes}
                    onChange={set('sync_interval_minutes')} className={inputClass} />
                </Field>
                <Field label={t('settings.lookbackDays')} hint="min 1 – max 30">
                  <input type="number" min="1" max="30" value={settings.sync_lookback_days}
                    onChange={set('sync_lookback_days')} className={inputClass} />
                </Field>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {testing ? '...' : t('settings.testConnection')}
                </button>
                {testResult && (
                  <span className={`text-sm font-medium ${testResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                    {testResult.msg}
                  </span>
                )}
              </div>

              {/* Historical Sync */}
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <p className="text-sm font-medium text-gray-700">{t('settings.dataManagement')}</p>
                <p className="text-sm text-gray-500">{t('settings.historicalSyncDesc')}</p>
                <AmberWarning>{t('settings.historicalSyncWarning')}</AmberWarning>
                <Field label={t('settings.fromDate')}>
                  <input
                    type="date"
                    value={historicalFrom}
                    onChange={e => setHistoricalFrom(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <button
                  onClick={handleHistoricalSync}
                  disabled={historicalRunning}
                  className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  {historicalRunning && <Spinner />}
                  {t('settings.startHistoricalSync')}
                </button>
              </div>

              <SaveButton onClick={saveZkbio} saving={savingZkbio} label={t('settings.saveZkbio')} />
            </div>
          )}

          {/* ── TAB 3: Payroll ──────────────────────────────────────────── */}
          {activeTab === 'payroll' && (
            <div className="space-y-5">
              <AmberWarning>{t('settings.payrollWarning')}</AmberWarning>

              <Field
                label={t('settings.stdDaysPerMonth')}
                hint={t('settings.stdDaysHint')}
              >
                <input type="number" min="1" max="31" value={settings.std_days_per_month}
                  onChange={set('std_days_per_month')} className={inputClass} />
              </Field>

              <Field
                label={t('settings.otMultiplier')}
                hint={t('settings.otMultiplierHint')}
              >
                <input type="number" step="0.1" min="1" max="5" value={settings.ot_multiplier}
                  onChange={set('ot_multiplier')} className={inputClass} />
              </Field>

              <Field
                label={t('settings.latePenaltyUnapproved')}
                hint={t('settings.latePenaltyUnapprovedHint')}
              >
                <input type="number" step="0.1" min="0" max="5" value={settings.late_penalty_unapproved}
                  onChange={set('late_penalty_unapproved')} className={inputClass} />
              </Field>

              <Field
                label={t('settings.latePenaltyApproved')}
                hint={t('settings.latePenaltyApprovedHint')}
              >
                <input type="number" step="0.1" min="0" max="5" value={settings.late_penalty_approved}
                  onChange={set('late_penalty_approved')} className={inputClass} />
              </Field>

              <SaveButton onClick={savePayroll} saving={savingPayroll} label={t('settings.savePayroll')} />
            </div>
          )}

          {/* ── TAB 4: Attendance ───────────────────────────────────────── */}
          {activeTab === 'attendance' && (
            <div className="space-y-5">

              {/* OT Calculation Mode card */}
              <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-800">{t('settings.otCalculationMode')}</p>
                {[
                  { value: 'OT_PUNCH',   labelKey: 'otPunchMode',    descKey: 'otPunchModeDesc'    },
                  { value: 'CALCULATED', labelKey: 'calculatedMode', descKey: 'calculatedModeDesc' },
                ].map(({ value, labelKey, descKey }) => {
                  const selected = settings.ot_calculation_mode === value;
                  return (
                    <label
                      key={value}
                      className={`flex items-start gap-3 cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                        selected ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="ot_calculation_mode"
                        value={value}
                        checked={selected}
                        onChange={() => setSettings(prev => ({ ...prev, ot_calculation_mode: value }))}
                        className="mt-0.5 accent-brand-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{t(`settings.${labelKey}`)}</p>
                        <p className="text-xs text-gray-500 mt-1">{t(`settings.${descKey}`)}</p>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Grace Period card */}
              <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-800">{t('settings.gracePeriod')}</p>
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={gracePeriodOn}
                    onClick={() => setSettings(prev => ({ ...prev, grace_period_enabled: gracePeriodOn ? 'false' : 'true' }))}
                    className={`relative inline-flex h-5 w-10 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${gracePeriodOn ? 'bg-brand-500' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${gracePeriodOn ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                  <span className="text-sm text-gray-700">{t('settings.enableGracePeriod')}</span>
                </label>
                {gracePeriodOn ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-gray-700 flex-shrink-0">{t('settings.gracePeriodMinutes')}</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={settings.grace_period_minutes}
                        onChange={set('grace_period_minutes')}
                        className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      <span className="text-sm text-gray-500">{t('settings.gracePeriodMinutesUnit')}</span>
                    </div>
                    <p className="text-xs text-gray-400">{t('settings.gracePeriodHint')}</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">{t('settings.gracePeriodDisabledHint')}</p>
                )}
              </div>

              {/* Time Off Allowance card */}
              <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-800">{t('settings.timeOffAllowance')}</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={settings.time_off_allowance_days}
                    onChange={set('time_off_allowance_days')}
                    className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <span className="text-sm text-gray-500">{t('common.days', 'days')}</span>
                </div>
                <p className="text-xs text-gray-400">{t('settings.timeOffAllowanceHint')}</p>
              </div>

              {attendanceChanged && (
                <AmberWarning>{t('settings.attendanceWarning')}</AmberWarning>
              )}

              <SaveButton onClick={saveOtMode} saving={savingOtMode} label={t('settings.saveAttendance')} />
            </div>
          )}

          {/* ── TAB 5: Backup ───────────────────────────────────────────── */}
          {activeTab === 'backup' && (
            <div className="space-y-6">

              {/* Create Backup */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-gray-800">{t('settings.backupRestore')}</p>
                <Field label={t('settings.backupNotes')}>
                  <input
                    type="text"
                    value={backupNotes}
                    onChange={e => setBackupNotes(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <button
                  onClick={handleCreateBackup}
                  disabled={creatingBackup}
                  className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  {creatingBackup && <Spinner />}
                  {t('settings.createBackup')}
                </button>
              </div>

              {/* Backup List */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-gray-800">{t('settings.backupList')}</p>
                {backupsLoading ? (
                  <div className="text-sm text-gray-400">...</div>
                ) : backups.length === 0 ? (
                  <p className="text-sm text-gray-400">{t('settings.noBackups')}</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('common.date')}</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('settings.filename')}</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('settings.fileSize')}</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('common.notes')}</th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">{t('common.actions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {backups.map(b => (
                          <tr key={b.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 whitespace-nowrap text-gray-600">
                              {new Date(b.created_at).toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-gray-800 font-mono text-xs">{b.filename}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-gray-600">{b.file_size_formatted}</td>
                            <td className="px-4 py-2 text-gray-500">{b.notes || '—'}</td>
                            <td className="px-4 py-2">
                              <div className="flex items-center justify-center gap-2">
                                <a
                                  href={`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/backups/${b.id}/download`}
                                  className="rounded px-2 py-1 text-xs font-medium bg-brand-50 text-brand-600 hover:bg-brand-100"
                                  download
                                >
                                  {t('settings.downloadBackup')}
                                </a>
                                <button
                                  onClick={() => handleDeleteBackup(b.id)}
                                  disabled={deletingBackupId === b.id}
                                  className="rounded px-2 py-1 text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                                >
                                  {t('settings.deleteBackup')}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Restore Section */}
              <div className="rounded-lg border border-red-200 bg-red-50 p-5 space-y-4">
                <p className="text-sm font-semibold text-red-700">{t('settings.restoreBackup')}</p>

                <div className="rounded-md bg-red-100 border border-red-200 p-3 text-sm text-red-800">
                  {t('settings.restoreWarning')}
                </div>

                {restoreSuccess ? (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-green-700">{t('settings.restoreSuccess')}</p>
                    <button
                      onClick={() => window.location.reload()}
                      className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
                    >
                      {t('settings.refreshPage')}
                    </button>
                  </div>
                ) : restoring ? (
                  <div className="flex items-center gap-3 text-sm text-red-700">
                    <Spinner />
                    {restoring}
                  </div>
                ) : restoreConfirm2 ? (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-red-800">{t('settings.typeRestore')}</p>
                    <input
                      type="text"
                      value={restoreTypeValue}
                      onChange={e => setRestoreTypeValue(e.target.value)}
                      className="w-full rounded-md border border-red-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
                      placeholder="RESTORE"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setRestoreConfirm2(false); setRestoreTypeValue(''); }}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={handleRestore}
                        disabled={restoreTypeValue !== 'RESTORE'}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
                      >
                        {t('settings.restoreButton')}
                      </button>
                    </div>
                  </div>
                ) : restoreConfirm1 ? (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-red-800">{t('settings.confirmRestore')}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setRestoreConfirm1(false)}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={() => { setRestoreConfirm1(false); setRestoreConfirm2(true); }}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                      >
                        {t('settings.confirmRestoreYes')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Field label={t('settings.selectBackupFile')}>
                      <input
                        ref={restoreFileRef}
                        type="file"
                        accept=".sql"
                        onChange={e => setRestoreFile(e.target.files?.[0] || null)}
                        className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                      />
                    </Field>
                    <button
                      onClick={() => setRestoreConfirm1(true)}
                      disabled={!restoreFile}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
                    >
                      {t('settings.restoreButton')}
                    </button>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ── TAB 6: Users ────────────────────────────────────────────── */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-800">{t('nav.userManagement')}</p>
                <button
                  onClick={() => setUserModal('add')}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
                >
                  + {t('users.addUser')}
                </button>
              </div>

              {usersLoading ? (
                <div className="space-y-2 animate-pulse">
                  {[1,2,3].map(i => <div key={i} className="h-10 rounded bg-gray-100" />)}
                </div>
              ) : usersError ? (
                <div className="flex flex-col items-center gap-3 py-10 text-gray-500">
                  <p className="text-sm">{usersError}</p>
                  <button onClick={loadUsers} className="rounded-lg bg-brand-500 px-4 py-2 text-sm text-white hover:bg-brand-600">Retry</button>
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200 overflow-x-auto">
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
                                <span className="text-xs text-gray-400">{t('users.cannotModifySelf')}</span>
                              ) : (
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => setUserModal(u)}
                                    className="rounded px-2 py-0.5 text-xs font-medium bg-brand-50 text-brand-700 hover:bg-brand-100"
                                  >
                                    {t('common.edit')}
                                  </button>
                                  <button
                                    onClick={() => handleToggleUser(u)}
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
              )}

              {userModal && (
                <UserModal
                  user={userModal === 'add' ? null : userModal}
                  onClose={() => setUserModal(null)}
                  onSaved={() => {
                    loadUsers();
                    showToast(userModal === 'add' ? t('users.created') : t('users.updated'));
                  }}
                  t={t}
                />
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
