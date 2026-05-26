import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api.js';

function getPrevMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function SummaryCard({ label, value, color }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 bg-white shadow-sm">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default function MonthlyReportPage() {
  const { t } = useTranslation();
  const [month, setMonth]     = useState(getPrevMonth());
  const [data, setData]       = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchReport();
  }, [month]);

  async function fetchReport() {
    setLoading(true);
    try {
      const res = await api.get(`/reports/monthly?month=${month}`);
      setData(res.data || []);
      setSummary(res.summary || null);
    } catch {
      setData([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  function handleExport(format) {
    window.open(
      `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/reports/monthly/export?month=${month}&format=${format}`,
      '_blank'
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">{t('report.title')}</h1>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            onClick={() => handleExport('pdf')}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            disabled={!data.length}
          >
            {t('report.exportPdf')}
          </button>
          <button
            onClick={() => handleExport('excel')}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            disabled={!data.length}
          >
            {t('report.exportExcel')}
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <SummaryCard label={t('summary.totalPresent')}   value={summary.totalPresent}                       color="text-green-600" />
          <SummaryCard label={t('summary.totalAbsent')}    value={summary.totalAbsent}                        color="text-red-600" />
          <SummaryCard label={t('summary.totalLeave')}     value={summary.totalLeave}                         color="text-blue-600" />
          <SummaryCard label={t('summary.totalOtHours')}   value={Number(summary.totalOtHours).toFixed(2)}    color="text-purple-600" />
          <SummaryCard label={t('summary.totalLateHours')} value={Number(summary.totalLateHours).toFixed(2)}  color="text-amber-600" />
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('attendance.employee')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('employees.code')}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('report.presentDays')}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('report.absentDays')}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('report.paidLeave')}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('report.unpaidLeave')}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('report.offDays')}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('report.hoursWorked')}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('report.approvedOtHours')}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('report.unapprovedLateHours')}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('report.approvedLateHours')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-gray-400">{t('common.loading')}</td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-gray-400">{t('report.noData')}</td>
              </tr>
            ) : data.map(row => (
              <tr key={row.employee_id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-900">{row.employee_name}</td>
                <td className="px-4 py-2 text-gray-500">{row.employee_code}</td>
                <td className="px-4 py-2 text-right text-green-700 font-medium">{row.present_days}</td>
                <td className="px-4 py-2 text-right text-red-600">{row.absent_days}</td>
                <td className="px-4 py-2 text-right text-blue-600">{row.paid_leave_days}</td>
                <td className="px-4 py-2 text-right text-orange-600">{row.unpaid_leave_days}</td>
                <td className="px-4 py-2 text-right text-gray-500">{row.off_days}</td>
                <td className="px-4 py-2 text-right">{Number(row.total_hours_worked).toFixed(2)}</td>
                <td className="px-4 py-2 text-right text-purple-700">{Number(row.approved_ot_hours).toFixed(2)}</td>
                <td className="px-4 py-2 text-right text-amber-700">{Number(row.unapproved_late_hours).toFixed(2)}</td>
                <td className="px-4 py-2 text-right text-amber-600">{Number(row.approved_late_hours).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
