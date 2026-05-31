import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext.jsx';
import { api } from '@/lib/api.js';
import { Button } from '@/components/ui/button';

const STATUS_COLORS = {
  PENDING_MANAGER: 'bg-yellow-100 text-yellow-800',
  PENDING_ADMIN:   'bg-blue-100 text-blue-800',
  APPROVED:        'bg-green-100 text-green-800',
  REJECTED:        'bg-red-100 text-red-800',
  AUTO_REJECTED:   'bg-gray-100 text-gray-600',
};

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

function ActionModal({ request, role, onClose, onDone }) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  async function act(action) {
    setLoading(true);
    try {
      const endpoint = role === 'MANAGER'
        ? `/requests/${request.id}/manager-action`
        : `/requests/${request.id}/admin-action`;
      await api.put(endpoint, { action, note: note.trim() || undefined });
      onDone();
    } catch (err) {
      alert(err.data?.error || 'Error');
    } finally {
      setLoading(false);
    }
  }

  const isTimeOff = request.type === 'TIME_OFF_REQUEST';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">{request.employee_name}</h2>
        <p className="text-sm text-gray-500 mb-1">
          {t(`requests.${request.type}`)}
          {isTimeOff
            ? ` — ${fmtDate(request.date_from)} → ${fmtDate(request.date_to)} (${request.total_days} ${t('common.days', 'days')})`
            : ` — ${fmtDate(request.attendance_date)}${request.hours_requested ? ` (${request.hours_requested}h)` : ''}`
          }
        </p>
        {request.reason && (
          <p className="text-sm text-gray-600 mb-3 bg-gray-50 rounded p-2">{request.reason}</p>
        )}
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('requests.note')}</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          {role === 'MANAGER' ? (
            <>
              <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50"
                onClick={() => act('REJECT')} disabled={loading}>
                {t('requests.reject')}
              </Button>
              <Button size="sm" onClick={() => act('FORWARD')} disabled={loading}>
                {t('requests.forward')}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50"
                onClick={() => act('REJECT')} disabled={loading}>
                {t('requests.reject')}
              </Button>
              <Button size="sm" className="bg-green-600 hover:bg-green-700"
                onClick={() => act('APPROVE')} disabled={loading}>
                {t('requests.approve')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RequestsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [requests, setRequests]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [statusFilter, setStatus]       = useState('');
  const [typeFilter, setType]           = useState('');
  const [selected, setSelected]         = useState(null);
  const [autoRejectEnabled, setAutoRejectEnabled] = useState(true);
  const [bannerDismissed, setBannerDismissed]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter)   params.set('type',   typeFilter);
      const [data, settingsData] = await Promise.allSettled([
        api.get(`/requests?${params}`),
        api.get('/settings'),
      ]);
      if (data.status === 'fulfilled')     setRequests(data.value);
      if (settingsData.status === 'fulfilled') {
        setAutoRejectEnabled(settingsData.value.auto_reject_enabled !== 'false');
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const pendingStatus = user?.role === 'MANAGER' ? 'PENDING_MANAGER' : 'PENDING_ADMIN';

  const relevantRequests = requests.filter(r => {
    if (statusFilter) return true;
    return ['PENDING_MANAGER','PENDING_ADMIN','APPROVED','REJECTED','AUTO_REJECTED'].includes(r.status);
  });

  function canAct(r) {
    if (user?.role === 'MANAGER') return r.status === 'PENDING_MANAGER';
    if (user?.role === 'ADMIN')   return r.status === 'PENDING_ADMIN';
    return false;
  }

  const selectCls = 'border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div>
      {!autoRejectEnabled && !bannerDismissed && (
        <div className="flex items-start justify-between gap-3 mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span>{t('requests.autoRejectDisabledBanner')}</span>
          <button onClick={() => setBannerDismissed(true)} className="flex-shrink-0 text-blue-500 hover:text-blue-700 font-medium leading-none">✕</button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('requests.title')}</h1>
        <div className="flex gap-2">
          <select value={typeFilter} onChange={e => setType(e.target.value)} className={selectCls}>
            <option value="">{t('common.all')} ({t('requests.type')})</option>
            <option value="OT_REQUEST">{t('requests.OT_REQUEST')}</option>
            <option value="OFF_REQUEST">{t('requests.OFF_REQUEST')}</option>
            <option value="TIME_OFF_REQUEST">{t('request.timeOffRequest')}</option>
          </select>
          <select value={statusFilter} onChange={e => setStatus(e.target.value)} className={selectCls}>
            <option value="">{t('common.all')}</option>
            {['PENDING_MANAGER','PENDING_ADMIN','APPROVED','REJECTED','AUTO_REJECTED'].map(s => (
              <option key={s} value={s}>{t(`requests.${s}`)}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">{t('common.loading')}</p>
      ) : relevantRequests.length === 0 ? (
        <div className="text-center py-16 text-gray-400">{t('requests.noRequests')}</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('employees.fullName')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('requests.type')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('requests.attendanceDate')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('requests.hoursRequested')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('requests.status')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {relevantRequests.map(r => {
                const isTimeOff = r.type === 'TIME_OFF_REQUEST';
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.employee_name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {isTimeOff ? t('request.timeOffRequest') : t(`requests.${r.type}`)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {isTimeOff
                        ? <span>{fmtDate(r.date_from)} → {fmtDate(r.date_to)}</span>
                        : fmtDate(r.attendance_date)
                      }
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {isTimeOff
                        ? <span className="font-medium">{r.total_days} {t('common.days', 'days')}</span>
                        : (r.hours_requested ?? '—')
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'}`}>
                        {t(`requests.${r.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {canAct(r) ? (
                        <Button size="sm" variant="outline" onClick={() => setSelected(r)}>
                          {t('common.actions')}
                        </Button>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <ActionModal
          request={selected}
          role={user?.role}
          onClose={() => setSelected(null)}
          onDone={() => { setSelected(null); load(); }}
        />
      )}
    </div>
  );
}
