import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext.jsx';
import { api } from '@/lib/api.js';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { buildPrintHTML } from '@/lib/printReport.js';

function getPrevMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

const STATUS_COLORS = {
  DRAFT:     'bg-gray-100 text-gray-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED:  'bg-green-100 text-green-700',
  REJECTED:  'bg-red-100 text-red-700',
};

function EditModal({ record, onClose, onSaved }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    ot_hours_override:  record.ot_hours_override  ?? '',
    late_hours_override: record.late_hours_override ?? '',
    bonus:      record.bonus      || 0,
    deductions: record.deductions || 0,
    note:       record.note       || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const payload = {
        ot_hours_override:  form.ot_hours_override  === '' ? null : parseFloat(form.ot_hours_override),
        late_hours_override: form.late_hours_override === '' ? null : parseFloat(form.late_hours_override),
        bonus:      parseFloat(form.bonus)      || 0,
        deductions: parseFloat(form.deductions) || 0,
        note:       form.note || null,
      };
      const updated = await api.put(`/salary/${record.id}`, payload);
      onSaved(updated);
      onClose();
    } catch (e) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">{t('salary.editRecord')}</h2>
        <p className="mb-4 text-sm text-gray-600 font-medium">{record.employee_name}</p>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="space-y-3">
          {[
            { key: 'ot_hours_override',   label: t('salary.otOverride') },
            { key: 'late_hours_override', label: t('salary.lateOverride') },
            { key: 'bonus',               label: t('salary.bonus') },
            { key: 'deductions',          label: t('salary.deductions') },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form[key]}
                onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={key.includes('override') ? '(blank = auto)' : '0'}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('salary.note')}</label>
            <textarea
              value={form.note}
              onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {saving ? '...' : t('salary.saveChanges')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SalaryPage() {
  const { t }     = useTranslation();
  const { user }  = useAuth();
  const isAdmin   = user?.role === 'ADMIN';

  const [month, setMonth]       = useState(getPrevMonth());
  const [records, setRecords]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [calculating, setCalc]  = useState(false);
  const [printing, setPrinting] = useState(false);
  const [editRecord, setEdit]   = useState(null);
  const [toast, setToast]       = useState('');
  const [expandedRow, setExpandedRow] = useState(null);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const canViewFormula = isAdmin || user?.role === 'ACCOUNTANT';

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/salary?month=${month}`);
      setRecords(res.data || []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  async function handleCalculate() {
    if (!window.confirm(t('common.confirm'))) return;
    setCalc(true);
    try {
      await api.post('/salary/calculate', { month });
      showToast(t('salary.calculateSuccess'));
      fetchRecords();
    } catch (e) {
      showToast(e.message || 'Error');
    } finally {
      setCalc(false);
    }
  }

  async function handleSubmit() {
    if (!window.confirm(t('salary.confirmSubmit'))) return;
    try {
      await api.post('/salary/submit', { month });
      showToast(t('salary.submitted'));
      fetchRecords();
    } catch (e) { showToast(e.message || 'Error'); }
  }

  async function handleApproveAll() {
    if (!window.confirm(t('salary.confirmApproveAll'))) return;
    try {
      await api.post('/salary/approve-all', { month });
      showToast(t('salary.approved'));
      fetchRecords();
    } catch (e) { showToast(e.message || 'Error'); }
  }

  async function handleApproveOne(id) {
    if (!window.confirm(t('salary.confirmApprove'))) return;
    try {
      await api.post(`/salary/${id}/approve`);
      showToast(t('salary.approved'));
      fetchRecords();
    } catch (e) { showToast(e.message || 'Error'); }
  }

  async function handleReject(id) {
    if (!window.confirm(t('salary.confirmReject'))) return;
    try {
      await api.post(`/salary/${id}/reject`, {});
      fetchRecords();
    } catch (e) { showToast(e.message || 'Error'); }
  }

  function handleExport(format) {
    window.open(
      `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/salary/export?month=${month}&format=${format}`,
      '_blank'
    );
  }

  function handleEditSaved(updated) {
    setRecords(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
  }

  async function handlePrint() {
    setPrinting(true);
    try {
      const approvedRecords = records.filter(r => r.status === 'APPROVED');
      const [year, monthNum] = month.split('-').map(Number);
      const lastDay = new Date(year, monthNum, 0).getDate();
      const dateFrom = `${month}-01`;
      const dateTo   = `${month}-${String(lastDay).padStart(2, '0')}`;

      const [dailyRes, rawRes, settingsRes] = await Promise.all([
        api.get(`/attendance/daily?month=${month}`),
        api.get(`/attendance/raw?date_from=${dateFrom}&date_to=${dateTo}&page_size=5000`),
        api.get('/settings'),
      ]);

      const dailyRecords = dailyRes.data || [];
      const rawPunches   = rawRes.data   || [];

      // Build raw punches lookup: { `${employeeId}_${YYYY-MM-DD}`: [...punches] }
      const rawByEmployeeDate = {};
      rawPunches.forEach(p => {
        if (!p.employee_id) return;
        const d = new Date(p.punch_time);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const key = `${p.employee_id}_${dateStr}`;
        if (!rawByEmployeeDate[key]) rawByEmployeeDate[key] = [];
        rawByEmployeeDate[key].push(p);
      });

      // Fetch corrections for records that have them
      const withCorrections = dailyRecords.filter(r => r.has_punch_correction);
      const corrEntries = await Promise.all(
        withCorrections.map(r =>
          api.get(`/attendance/corrections/${r.id}`)
            .then(c => [r.id, c])
            .catch(() => [r.id, null])
        )
      );
      const corrections = Object.fromEntries(corrEntries.filter(([, c]) => c !== null));

      // Group daily records by employee
      const dailyByEmployee = {};
      dailyRecords.forEach(d => {
        if (!dailyByEmployee[d.employee_id]) dailyByEmployee[d.employee_id] = [];
        dailyByEmployee[d.employee_id].push(d);
      });

      const html = buildPrintHTML({
        approvedRecords,
        dailyByEmployee,
        rawByEmployeeDate,
        corrections,
        companyName: settingsRes.company_name || '',
        companyLogo: settingsRes.company_logo || '',
        month,
        t,
      });

      const container = document.getElementById('print-container');
      container.innerHTML = html;

      // Wait for images (logo) to load before printing
      await new Promise(resolve => {
        const imgs = container.querySelectorAll('img');
        if (!imgs.length) return resolve();
        let loaded = 0;
        imgs.forEach(img => {
          img.onload = img.onerror = () => { if (++loaded === imgs.length) resolve(); };
        });
      });

      // Move container to body level to escape #root (which gets hidden by @media print)
      const originalParent  = container.parentNode;
      const originalSibling = container.nextSibling;
      document.body.appendChild(container);
      container.style.display = 'block';

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            window.print();
            // Restore to original position inside React tree
            container.style.display = 'none';
            if (originalSibling) {
              originalParent.insertBefore(container, originalSibling);
            } else {
              originalParent.appendChild(container);
            }
            setPrinting(false);
          }, 500);
        });
      });
    } catch (e) {
      showToast(e.message || 'Print failed');
      setPrinting(false);
    }
    // Note: setPrinting(false) in the success path is called inside setTimeout
    // after the print dialog closes, so no finally block here.
  }

  const hasDraft     = records.some(r => r.status === 'DRAFT');
  const hasSubmitted = records.some(r => r.status === 'SUBMITTED');
  const hasApproved  = records.some(r => r.status === 'APPROVED');
  const hasLocked    = records.some(r => r.status === 'SUBMITTED' || r.status === 'APPROVED');

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">{t('salary.title')}</h1>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />

          <button
            onClick={handleCalculate}
            disabled={calculating || hasLocked}
            title={hasLocked ? t('salary.lockedHint') : undefined}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {calculating ? t('salary.calculating') : t('salary.calculateAll')}
          </button>

          {hasDraft && (
            <button
              onClick={handleSubmit}
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
            >
              {t('salary.submitAll')}
            </button>
          )}

          {isAdmin && hasSubmitted && (
            <button
              onClick={handleApproveAll}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            >
              {t('salary.approveAll')}
            </button>
          )}

          {records.length > 0 && (
            <>
              {(isAdmin || user?.role === 'ACCOUNTANT') && (
                <button
                  onClick={handlePrint}
                  disabled={!hasApproved || printing}
                  title={!hasApproved ? t('salary.printNotAvailable') : undefined}
                  className="rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {printing && (
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  )}
                  {printing ? t('salary.preparing') : t('salary.printReports')}
                </button>
              )}
              <button
                onClick={() => handleExport('excel')}
                disabled={!hasApproved}
                title={!hasApproved ? t('salary.exportDisabledHint') : undefined}
                className="rounded-md bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('salary.exportExcel')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Amendment 3 — Status banners */}
      {hasDraft && !hasSubmitted && !hasApproved && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {t('salary.draftBanner')}
        </div>
      )}
      {hasSubmitted && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t('salary.submittedBanner')}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-8 text-center text-gray-400 text-sm">
          {t('common.loading')}
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-8 text-center text-gray-400 text-sm">
          {t('salary.noRecords')}
        </div>
      ) : (
        (() => {
          const currencies = [...new Set(records.map(r => r.currency || 'IQD'))].sort();
          return currencies.map(cur => {
            const group = records.filter(r => (r.currency || 'IQD') === cur);
            const totalNet = group.reduce((s, r) => s + (parseFloat(r.net_salary) || 0), 0);
            return (
              <div key={cur} className="space-y-1">
                <div className={`flex items-center justify-between px-4 py-2 rounded-lg text-sm font-semibold ${cur === 'USD' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                  <span>{t(`salary.${cur.toLowerCase()}_employees`, `${cur} ${t('attendance.employee')}s`)}</span>
                  <span>{t('salary.netSalary')}: {formatCurrency(totalNet, cur)}</span>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('attendance.employee')}</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('salary.baseSalary')}</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('salary.presentDays')}</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('salary.absentDays')}</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('salary.approvedOtHours')}</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('salary.overclaimDeduction')}</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('salary.lateHours')}</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('salary.bonus')}</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('salary.deductions')}</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('salary.netSalary')}</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('salary.status')}</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('salary.actions')}</th>
                        {canViewFormula && (
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('salary.formula')}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {group.map(r => {
                        const effOt     = r.ot_hours_override   !== null ? parseFloat(r.ot_hours_override)   : parseFloat(r.approved_ot_hours);
                        const effLate   = r.late_hours_override  !== null ? parseFloat(r.late_hours_override)  : (parseFloat(r.unapproved_late_hours) + parseFloat(r.approved_late_hours));
                        const overclaim = parseFloat(r.overclaim_deduction) || 0;

                        const stdDays       = parseFloat(r.std_days_per_month)      || 26;
                        const stdHours      = parseFloat(r.std_hours_per_day)       || 8;
                        const otMult        = parseFloat(r.ot_multiplier)           || 1.5;
                        const penUnapp      = parseFloat(r.late_penalty_unapproved) || 1.5;
                        const penApp        = parseFloat(r.late_penalty_approved)   || 1.0;
                        const dailyRate     = parseFloat(r.daily_rate)              || 0;
                        const hourlyRate    = parseFloat(r.hourly_rate)             || 0;
                        const baseSal       = parseFloat(r.base_salary)             || 0;
                        const absentCount   = parseInt(r.total_absent_days)         || 0;
                        const unpaidCount   = parseInt(r.total_unpaid_leave_days)   || 0;
                        const effectiveDays = stdDays - absentCount - unpaidCount;
                        const basePay       = baseSal - (absentCount + unpaidCount) * dailyRate;
                        const effOtHrs      = r.ot_hours_override !== null ? parseFloat(r.ot_hours_override) : (parseFloat(r.approved_ot_hours) || 0);
                        const otPay         = effOtHrs * hourlyRate * otMult;
                        const unapprLate    = parseFloat(r.unapproved_late_hours)   || 0;
                        const apprLate      = parseFloat(r.approved_late_hours)     || 0;
                        const hasLateOvr    = r.late_hours_override !== null;
                        const lateDedUnapp  = hasLateOvr ? 0 : (unapprLate * hourlyRate * penUnapp);
                        const lateDedApp    = hasLateOvr ? 0 : (apprLate   * hourlyRate * penApp);
                        const lateDedOvr    = hasLateOvr ? (parseFloat(r.late_hours_override) * hourlyRate * penUnapp) : 0;
                        const totalLateDed  = lateDedUnapp + lateDedApp + lateDedOvr;
                        const bonusAmt      = parseFloat(r.bonus)      || 0;
                        const deductAmt     = parseFloat(r.deductions)  || 0;
                        const netSalary     = parseFloat(r.net_salary)  || 0;

                        return (
                          <React.Fragment key={r.id}>
                            <tr className="hover:bg-gray-50">
                              <td className="px-4 py-2 font-medium text-gray-900">
                                <div>{r.employee_name}</div>
                                <div className="text-xs text-gray-400">{r.employee_code}</div>
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-xs">{formatCurrency(r.base_salary, cur)}</td>
                              <td className="px-4 py-2 text-right text-green-700">{r.total_present_days}</td>
                              <td className="px-4 py-2 text-right text-red-600">{r.total_absent_days}</td>
                              <td className="px-4 py-2 text-right text-purple-700">
                                {effOt.toFixed(2)}
                                {r.ot_hours_override !== null && (
                                  <span className="ml-1 text-[10px] text-purple-400">(override)</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right">
                                {overclaim > 0 ? (
                                  <span className="text-red-600 font-medium font-mono text-xs">-{formatCurrency(overclaim, cur)}</span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right text-amber-700">
                                {effLate.toFixed(2)}
                                {r.late_hours_override !== null && (
                                  <span className="ml-1 text-[10px] text-amber-400">(override)</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right text-green-600 font-mono text-xs">{formatCurrency(r.bonus, cur)}</td>
                              <td className="px-4 py-2 text-right text-red-500 font-mono text-xs">{formatCurrency(r.deductions, cur)}</td>
                              <td className="px-4 py-2 text-right font-semibold text-gray-900 font-mono text-xs">{formatCurrency(r.net_salary, cur)}</td>
                              <td className="px-4 py-2 text-center">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'}`}>
                                  {t(`salary.${r.status}`, r.status)}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  {r.status === 'DRAFT' && (
                                    <button
                                      onClick={() => setEdit(r)}
                                      className="rounded px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100"
                                    >
                                      {t('salary.edit')}
                                    </button>
                                  )}
                                  {r.status === 'SUBMITTED' && (
                                    <>
                                      <span className="text-[10px] text-amber-600 text-center leading-tight max-w-[110px]">
                                        {t('salary.submittedLocked')}
                                      </span>
                                      {isAdmin && (
                                        <div className="flex gap-1 mt-0.5">
                                          <button
                                            onClick={() => handleApproveOne(r.id)}
                                            className="rounded px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100"
                                          >
                                            {t('salary.approve')}
                                          </button>
                                          <button
                                            onClick={() => handleReject(r.id)}
                                            className="rounded px-2 py-0.5 text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100"
                                          >
                                            {t('salary.reject')}
                                          </button>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>
                              {canViewFormula && (
                                <td className="px-4 py-2 text-center">
                                  <button
                                    onClick={() => { setExpandedRow(prev => prev === r.id ? null : r.id); setSnapshotOpen(false); }}
                                    className="rounded px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 whitespace-nowrap"
                                  >
                                    {t('salary.formulaBreakdown')} {expandedRow === r.id ? '▲' : '▾'}
                                  </button>
                                </td>
                              )}
                            </tr>
                            {canViewFormula && expandedRow === r.id && (
                              <tr className="bg-indigo-50/30 border-b border-indigo-100">
                                <td colSpan={13} className="p-0">
                                  <div className="px-6 py-4">
                                    <div className="text-sm font-semibold text-indigo-900 mb-3">{t('salary.calculationBreakdown')} — {r.employee_name}</div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">

                                      {/* Step 1: Rates */}
                                      <div className="bg-white rounded-lg border border-indigo-100 p-3">
                                        <div className="text-xs font-semibold text-indigo-700 mb-2 pb-1 border-b border-indigo-50">{t('salary.step1Rates')}</div>
                                        <div className="space-y-2 text-xs">
                                          <div>
                                            <div className="text-gray-500 font-medium">{t('salary.dailyRate')}</div>
                                            <div className="text-gray-400 font-mono text-[10px]">{formatCurrency(baseSal, cur)} ÷ {stdDays}d</div>
                                            <div className="font-semibold text-gray-800">{formatCurrency(dailyRate, cur)}</div>
                                          </div>
                                          <div className="border-t border-gray-100 pt-2">
                                            <div className="text-gray-500 font-medium">{t('salary.hourlyRate')}</div>
                                            <div className="text-gray-400 font-mono text-[10px]">{formatCurrency(dailyRate, cur)} ÷ {stdHours}h</div>
                                            <div className="font-semibold text-gray-800">{formatCurrency(hourlyRate, cur)}</div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Step 2: Base Pay */}
                                      <div className="bg-white rounded-lg border border-indigo-100 p-3">
                                        <div className="text-xs font-semibold text-indigo-700 mb-2 pb-1 border-b border-indigo-50">{t('salary.step2Base')}</div>
                                        <div className="space-y-2 text-xs">
                                          <div>
                                            <div className="text-gray-500 font-medium">{t('salary.effectiveDays')}</div>
                                            <div className="text-gray-400 font-mono text-[10px]">{stdDays} − {absentCount} − {unpaidCount}</div>
                                            <div className="font-semibold text-gray-800">{effectiveDays} days</div>
                                          </div>
                                          <div className="border-t border-gray-100 pt-2">
                                            <div className="text-gray-500 font-medium">{t('salary.basePay')}</div>
                                            <div className="text-gray-400 font-mono text-[10px]">{effectiveDays} × {formatCurrency(dailyRate, cur)}</div>
                                            <div className="font-semibold text-gray-800">{formatCurrency(basePay, cur)}</div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Step 3: OT */}
                                      <div className="bg-white rounded-lg border border-indigo-100 p-3">
                                        <div className="text-xs font-semibold text-indigo-700 mb-2 pb-1 border-b border-indigo-50">{t('salary.step3OT')}</div>
                                        <div className="space-y-2 text-xs">
                                          {r.ot_hours_override !== null && (
                                            <div className="text-[10px] text-purple-600 bg-purple-50 rounded px-1.5 py-1">{t('salary.otOverrideNote')}</div>
                                          )}
                                          <div>
                                            <div className="text-gray-500 font-medium">{t('salary.otPay')}</div>
                                            <div className="text-gray-400 font-mono text-[10px]">{effOtHrs.toFixed(2)}h × {formatCurrency(hourlyRate, cur)} × {otMult}</div>
                                            <div className="font-semibold text-purple-700">{formatCurrency(otPay, cur)}</div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Step 4: Late Deduction */}
                                      <div className="bg-white rounded-lg border border-indigo-100 p-3">
                                        <div className="text-xs font-semibold text-indigo-700 mb-2 pb-1 border-b border-indigo-50">{t('salary.step4Late')}</div>
                                        <div className="space-y-2 text-xs">
                                          {hasLateOvr ? (
                                            <>
                                              <div className="text-[10px] text-amber-600 bg-amber-50 rounded px-1.5 py-1">{t('salary.lateOverrideNote')}</div>
                                              <div>
                                                <div className="text-gray-400 font-mono text-[10px]">{parseFloat(r.late_hours_override).toFixed(2)}h × {formatCurrency(hourlyRate, cur)} × {penUnapp}</div>
                                                <div className="font-semibold text-red-600">{formatCurrency(lateDedOvr, cur)}</div>
                                              </div>
                                            </>
                                          ) : (
                                            <>
                                              <div>
                                                <div className="text-gray-500 font-medium">{t('salary.unapprovedLate')}</div>
                                                <div className="text-gray-400 font-mono text-[10px]">{unapprLate.toFixed(2)}h × {formatCurrency(hourlyRate, cur)} × {penUnapp}</div>
                                                <div className="font-mono text-gray-700">{formatCurrency(lateDedUnapp, cur)}</div>
                                              </div>
                                              <div className="border-t border-gray-100 pt-2">
                                                <div className="text-gray-500 font-medium">{t('salary.approvedLate')}</div>
                                                <div className="text-gray-400 font-mono text-[10px]">{apprLate.toFixed(2)}h × {formatCurrency(hourlyRate, cur)} × {penApp}</div>
                                                <div className="font-mono text-gray-700">{formatCurrency(lateDedApp, cur)}</div>
                                              </div>
                                              <div className="border-t border-indigo-100 pt-2">
                                                <div className="text-gray-500 font-medium">{t('salary.totalLateDeduction')}</div>
                                                <div className="font-semibold text-red-600">{formatCurrency(totalLateDed, cur)}</div>
                                              </div>
                                            </>
                                          )}
                                        </div>
                                      </div>

                                      {/* Step 5: Net */}
                                      <div className="bg-white rounded-lg border border-indigo-100 p-3">
                                        <div className="text-xs font-semibold text-indigo-700 mb-2 pb-1 border-b border-indigo-50">{t('salary.step5Net')}</div>
                                        <div className="space-y-1 text-xs">
                                          <div className="flex justify-between gap-2">
                                            <span className="text-gray-500">{t('salary.basePay')}</span>
                                            <span className="font-mono text-gray-800">{formatCurrency(basePay, cur)}</span>
                                          </div>
                                          <div className="flex justify-between gap-2">
                                            <span className="text-gray-500">+ OT</span>
                                            <span className="font-mono text-purple-700">+{formatCurrency(otPay, cur)}</span>
                                          </div>
                                          <div className="flex justify-between gap-2">
                                            <span className="text-gray-500">− {t('salary.lateHours')}</span>
                                            <span className="font-mono text-red-600">−{formatCurrency(totalLateDed, cur)}</span>
                                          </div>
                                          {bonusAmt > 0 && (
                                            <div className="flex justify-between gap-2">
                                              <span className="text-gray-500">+ {t('salary.bonus')}</span>
                                              <span className="font-mono text-green-600">+{formatCurrency(bonusAmt, cur)}</span>
                                            </div>
                                          )}
                                          {deductAmt > 0 && (
                                            <div className="flex justify-between gap-2">
                                              <span className="text-gray-500">− {t('salary.deductions')}</span>
                                              <span className="font-mono text-red-500">−{formatCurrency(deductAmt, cur)}</span>
                                            </div>
                                          )}
                                          {overclaim > 0 && (
                                            <div className="flex justify-between gap-2">
                                              <span className="text-gray-500">− {t('salary.overclaimDeduction')}</span>
                                              <span className="font-mono text-red-500">−{formatCurrency(overclaim, cur)}</span>
                                            </div>
                                          )}
                                          <div className="border-t border-indigo-200 pt-1.5 mt-1">
                                            <div className="flex justify-between font-semibold">
                                              <span>{t('salary.netSalary')}</span>
                                              <span className="text-indigo-800">{formatCurrency(netSalary, cur)}</span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                    </div>

                                    {/* Snapshot */}
                                    <div className="mt-3">
                                      <button
                                        onClick={() => setSnapshotOpen(prev => !prev)}
                                        className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                                      >
                                        {t('salary.viewSnapshot')} {snapshotOpen ? '▲' : '▾'}
                                      </button>
                                      {snapshotOpen && (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          {[
                                            { label: t('salary.calculatedAt'), value: r.calculated_at ? new Date(r.calculated_at).toLocaleString() : '—' },
                                            { label: t('salary.stdDaysUsed'), value: stdDays },
                                            { label: t('salary.stdHoursUsed'), value: stdHours },
                                            { label: t('salary.otMultiplierUsed'), value: `×${otMult}` },
                                            { label: t('salary.latePenaltyUnapprovedUsed'), value: `×${penUnapp}` },
                                            { label: t('salary.latePenaltyApprovedUsed'), value: `×${penApp}` },
                                          ].map(({ label, value }) => (
                                            <div key={label} className="bg-white rounded border border-gray-100 px-3 py-1.5 min-w-[120px]">
                                              <div className="text-[10px] text-gray-400">{label}</div>
                                              <div className="text-xs font-mono font-medium text-gray-700">{String(value)}</div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          });
        })()
      )}

      {editRecord && (
        <EditModal
          record={editRecord}
          onClose={() => setEdit(null)}
          onSaved={handleEditSaved}
        />
      )}

      {/* Hidden container populated before window.print() */}
      <div id="print-container" />
    </div>
  );
}
