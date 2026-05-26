import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api.js';
import { formatHours } from '@/lib/formatHours.js';

const STATUS_COLORS = {
  PRESENT:      'bg-green-100 text-green-800',
  ABSENT:       'bg-red-100 text-red-800',
  LEAVE_PAID:   'bg-blue-100 text-blue-800',
  LEAVE_UNPAID: 'bg-orange-100 text-orange-800',
  OFF:          'bg-gray-100 text-gray-600',
};

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function dayName(dateStr) {
  if (!dateStr) return '';
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return days[new Date(dateStr + 'T00:00:00Z').getUTCDay()];
}

function SummaryCard({ label, value, color }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default function MyAttendancePage() {
  const { t } = useTranslation();
  const [month, setMonth]   = useState(new Date().toISOString().slice(0, 7));
  const [records, setRecs]  = useState([]);
  const [loading, setLoad]  = useState(false);
  const [error, setError]   = useState('');

  const fetchRecords = useCallback(() => {
    setLoad(true);
    setError('');
    api.get(`/employees/me/attendance?month=${month}`)
      .then(r => setRecs(r.data || []))
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoad(false));
  }, [month]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const present    = records.filter(r => r.status === 'PRESENT').length;
  const absent     = records.filter(r => r.status === 'ABSENT').length;
  const hoursTotal = records.reduce((s, r) => s + (parseFloat(r.hours_worked) || 0), 0);
  const otTotal    = records.reduce((s, r) => s + (parseFloat(r.ot_hours)    || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">{t('myAttendance.title')}</h1>
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label={t('report.presentDays')}  value={present}             color="text-green-600" />
        <SummaryCard label={t('report.absentDays')}   value={absent}              color="text-red-600" />
        <SummaryCard label={t('attendance.hoursWorked')} value={formatHours(hoursTotal)} color="text-gray-800" />
        <SummaryCard label={t('attendance.otHours')}  value={formatHours(otTotal)} color="text-purple-600" />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.status')}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('attendance.hoursWorked')}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('attendance.otHours')}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('attendance.lateHours')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">{t('common.loading')}</td></tr>
            ) : error ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center">
                  <p className="text-sm text-gray-500 mb-2">{error}</p>
                  <button onClick={fetchRecords} className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs text-white hover:bg-brand-600">Retry</button>
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">{t('common.noData')}</td></tr>
            ) : records.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <p className="font-medium">{fmtDate(r.date)}</p>
                  <p className="text-xs text-gray-400">{dayName(r.date)}</p>
                </td>
                <td className="px-4 py-2">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'}`}>
                    {t(`status.${r.status}`, r.status)}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  {parseFloat(r.hours_worked) > 0 ? formatHours(r.hours_worked) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2 text-right text-purple-700">
                  {parseFloat(r.ot_hours) > 0 ? formatHours(r.ot_hours) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2 text-right text-amber-700">
                  {parseFloat(r.late_hours) > 0 ? formatHours(r.late_hours) : <span className="text-gray-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
