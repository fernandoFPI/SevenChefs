import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

function timeToDecimal(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h + m / 60;
}

// ── New OT / Off Request Modal ────────────────────────────────────────────────

function NewRequestModal({ onClose, onDone }) {
  const { t } = useTranslation();
  const [type, setType]         = useState('OT_REQUEST');
  const [date, setDate]         = useState('');
  const [hours, setHours]       = useState('');
  const [reason, setReason]     = useState('');
  const [subtype, setSubtype]   = useState('FULL_DAY');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const partialHours = (type === 'OFF_REQUEST' && subtype === 'PARTIAL_DAY' && timeFrom && timeTo)
    ? Math.max(0, timeToDecimal(timeTo) - timeToDecimal(timeFrom))
    : null;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (type === 'OFF_REQUEST' && subtype === 'PARTIAL_DAY') {
      if (!timeFrom || !timeTo) { setError('Time from and time to are required for partial day'); return; }
      if (partialHours <= 0)    { setError('End time must be after start time'); return; }
    }
    setLoading(true);
    try {
      const body = {
        type,
        attendance_date: date,
        hours_requested: type === 'OT_REQUEST' ? parseFloat(hours) : undefined,
        reason: reason.trim() || undefined,
      };
      if (type === 'OFF_REQUEST') {
        body.request_subtype = subtype;
        if (subtype === 'PARTIAL_DAY') {
          body.time_from     = timeFrom;
          body.time_to       = timeTo;
          body.partial_hours = partialHours;
        }
      }
      await api.post('/requests', body);
      onDone();
    } catch (err) {
      setError(err.data?.error || 'Error submitting request');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('requests.newRequest')}</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>{t('requests.type')}</Label>
            <select
              value={type}
              onChange={e => { setType(e.target.value); setSubtype('FULL_DAY'); }}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="OT_REQUEST">{t('requests.OT_REQUEST')}</option>
              <option value="OFF_REQUEST">{t('requests.OFF_REQUEST')}</option>
            </select>
          </div>

          <div>
            <Label>{t('requests.attendanceDate')}</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} required className="mt-1" />
          </div>

          {type === 'OT_REQUEST' && (
            <div>
              <Label>{t('requests.hoursRequested')}</Label>
              <Input type="number" step="0.5" min="0.5" value={hours} onChange={e => setHours(e.target.value)} required className="mt-1" />
            </div>
          )}

          {type === 'OFF_REQUEST' && (
            <div>
              <Label>{t('requests.dayType')}</Label>
              <div className="mt-1 flex gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" value="FULL_DAY" checked={subtype === 'FULL_DAY'} onChange={() => setSubtype('FULL_DAY')} />
                  <span className="text-sm">{t('requests.fullDay')}</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" value="PARTIAL_DAY" checked={subtype === 'PARTIAL_DAY'} onChange={() => setSubtype('PARTIAL_DAY')} />
                  <span className="text-sm">{t('requests.partialDay')}</span>
                </label>
              </div>
            </div>
          )}

          {type === 'OFF_REQUEST' && subtype === 'PARTIAL_DAY' && (
            <div className="space-y-3 bg-gray-50 rounded-md p-3 border border-gray-200">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">{t('requests.timeFrom')}</Label>
                  <Input type="time" value={timeFrom} onChange={e => setTimeFrom(e.target.value)} required className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">{t('requests.timeTo')}</Label>
                  <Input type="time" value={timeTo} onChange={e => setTimeTo(e.target.value)} required className="mt-1" />
                </div>
              </div>
              {partialHours !== null && partialHours > 0 && (
                <p className="text-xs text-gray-600">
                  {t('requests.duration')}: <span className="font-medium">{partialHours.toFixed(2)} hrs</span>
                </p>
              )}
            </div>
          )}

          <div>
            <Label>{t('requests.reason')}</Label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>{t('common.cancel')}</Button>
            <Button type="submit" size="sm" disabled={loading}>{loading ? t('common.loading') : t('common.save')}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── New Time Off Request Modal ─────────────────────────────────────────────────

function NewTimeOffModal({ balance, onClose, onDone }) {
  const { t }               = useTranslation();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [reason, setReason]     = useState('');
  const [workingDays, setWorkingDays] = useState(null);
  const [loadingDays, setLoadingDays] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  // Fetch working-day count from backend whenever date range changes
  useEffect(() => {
    if (!dateFrom || !dateTo || dateTo < dateFrom) {
      setWorkingDays(null);
      return;
    }
    setLoadingDays(true);
    api.get(`/time-off/balance?year=${new Date(dateFrom).getFullYear()}`)
      .then(() => {})
      .catch(() => {})
      .finally(() => setLoadingDays(false));

    // Calculate client-side (same logic as backend — all days, no schedule known here)
    // We show the count optimistically; backend will validate against the real schedule
    const cur = new Date(dateFrom + 'T00:00:00Z');
    const end = new Date(dateTo   + 'T00:00:00Z');
    let count = 0;
    while (cur <= end) { count++; cur.setUTCDate(cur.getUTCDate() + 1); }
    setWorkingDays(count);
    setLoadingDays(false);
  }, [dateFrom, dateTo]);

  const insufficient = workingDays !== null && balance !== null && workingDays > (balance?.remaining ?? 0);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!dateFrom || !dateTo) { setError('Both dates are required'); return; }
    if (dateTo < dateFrom)    { setError('End date must be after start date'); return; }
    setLoading(true);
    try {
      await api.post('/requests', {
        type:      'TIME_OFF_REQUEST',
        date_from:  dateFrom,
        date_to:    dateTo,
        reason:     reason.trim() || undefined,
      });
      onDone();
    } catch (err) {
      setError(err.data?.error || err.message || 'Error submitting request');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('request.submitTimeOff')}</h2>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('request.dateFrom')}</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} required className="mt-1" />
            </div>
            <div>
              <Label>{t('request.dateTo')}</Label>
              <Input type="date" value={dateTo} min={dateFrom} onChange={e => setDateTo(e.target.value)} required className="mt-1" />
            </div>
          </div>

          {/* Live day count + balance info */}
          {dateFrom && dateTo && dateTo >= dateFrom && (
            <div className={`rounded-md p-3 text-sm space-y-1 ${insufficient ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-200'}`}>
              <p className="text-gray-700">
                {t('request.workingDays')}: <span className="font-semibold">{loadingDays ? '…' : workingDays}</span>
              </p>
              {balance && (
                <p className="text-gray-600">
                  {t('request.remainingBalance')}: <span className={`font-semibold ${insufficient ? 'text-red-600' : 'text-green-700'}`}>{balance.remaining}</span>
                </p>
              )}
              {insufficient && (
                <p className="text-red-600 text-xs font-medium">
                  {t('request.insufficientBalance', { remaining: balance?.remaining ?? 0 })}
                </p>
              )}
            </div>
          )}

          <div>
            <Label>{t('requests.reason')}</Label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              required
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>{t('common.cancel')}</Button>
            <Button type="submit" size="sm" disabled={loading || insufficient || !workingDays}>
              {loading ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Time Off Balance Card ─────────────────────────────────────────────────────

function TimeOffBalanceCard({ balance }) {
  const { t } = useTranslation();
  if (!balance) return null;
  const pct = balance.allowance > 0
    ? Math.min(100, Math.round((balance.used_days / balance.allowance) * 100))
    : 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <p className="text-sm font-semibold text-gray-800">{t('timeOff.thisYear')}</p>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">{t('timeOff.used')}: <span className="font-medium">{balance.used_days}</span> / {balance.allowance} {t('common.days', 'days')}</span>
        <span className={`font-semibold ${balance.remaining <= 0 ? 'text-red-600' : balance.remaining <= 3 ? 'text-orange-600' : 'text-green-700'}`}>
          {t('timeOff.remaining')}: {balance.remaining}
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 70 ? 'bg-orange-400' : 'bg-green-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MyRequestsPage() {
  const { t } = useTranslation();
  const [requests, setRequests]         = useState([]);
  const [balance, setBalance]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [showModal, setShowModal]       = useState(false);
  const [showTimeOff, setShowTimeOff]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, bal] = await Promise.allSettled([
        api.get('/requests'),
        api.get('/time-off/balance'),
      ]);
      if (data.status === 'fulfilled')  setRequests(data.value);
      if (bal.status  === 'fulfilled')  setBalance(bal.value);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h1 className="text-2xl font-bold text-gray-900">{t('requests.myRequests')}</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowTimeOff(true)}>
            + {t('request.submitTimeOff')}
          </Button>
          <Button size="sm" onClick={() => setShowModal(true)}>
            + {t('requests.newRequest')}
          </Button>
        </div>
      </div>

      {/* Time Off Balance card */}
      <TimeOffBalanceCard balance={balance} />

      {loading ? (
        <p className="text-sm text-gray-500">{t('common.loading')}</p>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 text-gray-400">{t('requests.noRequests')}</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['requests.type', 'requests.attendanceDate', 'requests.hoursRequested', 'requests.reason', 'requests.status'].map(k => (
                  <th key={k} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map(r => {
                const isTimeOff = r.type === 'TIME_OFF_REQUEST';
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">
                      <div>{isTimeOff ? t('request.timeOffRequest') : t(`requests.${r.type}`)}</div>
                      {r.request_subtype === 'PARTIAL_DAY' && (
                        <div className="text-xs text-gray-400">
                          {t('requests.partialDay')} · {r.time_from?.slice(0,5)}–{r.time_to?.slice(0,5)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {isTimeOff
                        ? `${fmtDate(r.date_from)} → ${fmtDate(r.date_to)}`
                        : fmtDate(r.attendance_date)
                      }
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {isTimeOff
                        ? `${r.total_days} ${t('common.days', 'days')}`
                        : r.partial_hours ? `${parseFloat(r.partial_hours).toFixed(2)} hrs` : (r.hours_requested ?? '—')
                      }
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{r.reason || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'}`}>
                        {t(`requests.${r.status}`)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <NewRequestModal onClose={() => setShowModal(false)} onDone={() => { setShowModal(false); load(); }} />
      )}
      {showTimeOff && (
        <NewTimeOffModal balance={balance} onClose={() => setShowTimeOff(false)} onDone={() => { setShowTimeOff(false); load(); }} />
      )}
    </div>
  );
}
