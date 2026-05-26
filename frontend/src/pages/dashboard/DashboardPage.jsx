import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api.js';
import { formatHours } from '@/lib/formatHours.js';

const PUNCH_STATE_LABELS = { '0': 'Check-In', '1': 'Check-Out', '2': 'Break-Out', '3': 'Break-In', '4': 'OT-In', '5': 'OT-Out' };
const SYNC_STATUS_COLORS = { SUCCESS: 'bg-green-100 text-green-700', FAILED: 'bg-red-100 text-red-700', RUNNING: 'bg-blue-100 text-blue-700' };

function StatCard({ label, value, color = 'text-gray-900', sub }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-gray-200" />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-gray-200" />
        ))}
      </div>
    </div>
  );
}

function AdminDashboard({ data, t }) {
  const today = data.today;
  const month = data.current_month;
  const sync  = data.sync_status;

  function fmtSync(iso) {
    if (!iso) return t('dashboard.noSync');
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="space-y-6">
      {/* Today's snapshot */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          {today.date} — Today
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label={t('dashboard.todayPresent')}   value={today.present}          color="text-green-600" />
          <StatCard label={t('dashboard.todayAbsent')}    value={today.absent}           color="text-red-600" />
          <StatCard label={t('dashboard.onLeave')}        value={today.on_leave}         color="text-blue-600" />
          <StatCard label={t('dashboard.notYetPunched')}  value={today.not_yet_punched}  color="text-amber-600" />
        </div>
      </div>

      {/* Current month */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          {t('dashboard.thisMonth')}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label={t('dashboard.totalEmployees')} value={month.total_employees} />
          <StatCard label={t('dashboard.avgAttendance')}  value={`${month.avg_attendance_rate}%`} color="text-green-600" />
          <StatCard label={t('dashboard.totalOtHours')}   value={formatHours(month.total_ot_hours)}   color="text-purple-600" />
          <StatCard label={t('dashboard.totalLateHours')} value={formatHours(month.total_late_hours)} color="text-amber-600" />
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pending requests */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
          <p className="font-semibold text-gray-800">{t('dashboard.pendingRequests')}</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{t('dashboard.pendingOT')}</span>
              <span className="font-bold text-purple-700">{month.pending_ot_requests}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{t('dashboard.pendingOff')}</span>
              <span className="font-bold text-brand-700">{month.pending_off_requests}</span>
            </div>
          </div>
          <Link to="/requests" className="inline-flex items-center text-xs font-medium text-brand-600 hover:underline">
            {t('dashboard.viewRequests')} →
          </Link>
        </div>

        {/* Sync status */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
          <p className="font-semibold text-gray-800">{t('dashboard.syncStatus')}</p>
          <div className="flex items-center gap-2">
            {sync.status && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SYNC_STATUS_COLORS[sync.status] || 'bg-gray-100 text-gray-600'}`}>
                {sync.status}
              </span>
            )}
            <span className="text-sm text-gray-600">{fmtSync(sync.last_sync)}</span>
          </div>
          <Link to="/attendance/raw" className="inline-flex items-center text-xs font-medium text-brand-600 hover:underline">
            {t('dashboard.viewRawAttendance')} →
          </Link>
        </div>
      </div>
    </div>
  );
}

function EmployeeDashboard({ data, t }) {
  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const month   = data.current_month;
  const punches = data?.recent_punches ?? [];

  function fmtPunchTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="space-y-6">
      {/* Month summary */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('dashboard.thisMonth')}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label={t('dashboard.daysPresent')}  value={month?.days_present        ?? 0}  color="text-green-600" />
          <StatCard label={t('dashboard.daysAbsent')}   value={month?.days_absent         ?? 0}  color="text-red-600" />
          <StatCard label={t('dashboard.hoursWorked')}  value={formatHours(month?.total_hours_worked ?? 0)}  color="text-gray-800" />
          <StatCard label={t('dashboard.otHours')}      value={formatHours(month?.ot_hours ?? 0)}            color="text-purple-600" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recent punches */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="font-semibold text-gray-800 mb-3">{t('dashboard.recentPunches')}</p>
          {punches.length === 0 ? (
            <p className="text-sm text-gray-400">{t('dashboard.noPunches')}</p>
          ) : (
            <ul className="space-y-2">
              {punches.map((p, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{fmtPunchTime(p.punch_time)}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                    {PUNCH_STATE_LABELS[String(p.punch_state)] || p.punch_state}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pending requests + shortcuts */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
          <p className="font-semibold text-gray-800">{t('dashboard.pendingRequests')}</p>
          <p className="text-3xl font-bold text-brand-600">{data?.pending_requests ?? 0}</p>
          <div className="flex flex-col gap-2 pt-1">
            <Link to="/my-requests" className="rounded-lg bg-brand-500 px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-brand-600">
              {t('dashboard.submitOtRequest')}
            </Link>
            <Link to="/my-requests" className="rounded-lg bg-brand-600 px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-brand-700">
              {t('dashboard.submitOffRequest')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user }  = useAuth();
  const { t }     = useTranslation();
  const [data, setData]     = useState(null);
  const [loading, setLoad]  = useState(true);
  const [error, setError]   = useState('');

  function load() {
    setLoad(true);
    setError('');
    api.get('/dashboard')
      .then(setData)
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoad(false));
  }

  useEffect(() => { load(); }, []);

  if (loading) return <Skeleton />;
  if (error) return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-500">
      <p className="text-sm">{error}</p>
      <button onClick={load} className="rounded-lg bg-brand-500 px-4 py-2 text-sm text-white hover:bg-brand-600">
        Retry
      </button>
    </div>
  );
  if (!data) return null;

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold text-gray-900 mb-4">
        {t('dashboard.welcome', { name: user?.username })}
      </h1>
      {user?.role === 'EMPLOYEE'
        ? <EmployeeDashboard data={data} t={t} />
        : <AdminDashboard    data={data} t={t} />
      }
    </div>
  );
}
