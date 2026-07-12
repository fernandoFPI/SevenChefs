import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext.jsx';
import { api } from '@/lib/api.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ── Helpers ───────────────────────────────────────────────────────────────────

function countDays(dateFrom, dateTo) {
  if (!dateFrom || !dateTo || dateTo < dateFrom) return 0;
  const start = new Date(dateFrom + 'T00:00:00Z');
  const end   = new Date(dateTo   + 'T00:00:00Z');
  let n = 0;
  const d = new Date(start);
  while (d <= end) { n++; d.setUTCDate(d.getUTCDate() + 1); }
  return n;
}

// ── Grant Time Off Modal ──────────────────────────────────────────────────────

function GrantModal({ year, onClose, onDone }) {
  const { t } = useTranslation();
  const [employees, setEmployees]     = useState([]);
  const [empFilter, setEmpFilter]     = useState('');
  const [employeeId, setEmployeeId]   = useState('');
  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [deduct, setDeduct]           = useState(true);
  const [reason, setReason]           = useState('');
  const [balance, setBalance]         = useState(null);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  useEffect(() => {
    api.get('/employees?is_active=true').then(setEmployees).catch(() => {});
  }, []);

  useEffect(() => {
    if (!employeeId) { setBalance(null); return; }
    api.get(`/time-off/balance?employee_id=${employeeId}&year=${year}`)
      .then(setBalance)
      .catch(() => setBalance(null));
  }, [employeeId, year]);

  const estimatedDays = countDays(dateFrom, dateTo);
  const remaining     = balance ? Number(balance.remaining) : null;
  const exceedsBy     = deduct && remaining !== null && estimatedDays > remaining
    ? estimatedDays - remaining : 0;

  const filtered = employees.filter(e =>
    !empFilter ||
    e.name.toLowerCase().includes(empFilter.toLowerCase()) ||
    e.employee_code?.toLowerCase().includes(empFilter.toLowerCase())
  );

  async function handleGrant() {
    if (!employeeId || !dateFrom || !dateTo) { setError('All fields are required'); return; }
    setSaving(true); setError('');
    try {
      const res = await api.post('/time-off/grant', {
        employee_id: employeeId, date_from: dateFrom, date_to: dateTo,
        reason, deduct_from_balance: deduct,
      });
      onDone(res);
    } catch (err) {
      setError(err.data?.message || err.message || 'Error');
    } finally {
      setSaving(false);
    }
  }

  const selectCls = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md space-y-4 p-6 max-h-[90dvh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900">{t('timeOff.grantTimeOff')}</h2>

        {/* Employee search + select */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">{t('timeOff.grantFor')}</label>
          <Input
            placeholder={t('employees.searchPlaceholder')}
            value={empFilter}
            onChange={e => setEmpFilter(e.target.value)}
            className="mb-1"
          />
          <select
            value={employeeId}
            onChange={e => setEmployeeId(e.target.value)}
            className={selectCls}
            size={4}
          >
            <option value="">—</option>
            {filtered.map(e => (
              <option key={e.id} value={e.id}>{e.name} ({e.employee_code})</option>
            ))}
          </select>
        </div>

        {/* Date range */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">{t('request.dateFrom')}</label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">{t('request.dateTo')}</label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} min={dateFrom} />
          </div>
        </div>

        {/* Working days estimate */}
        {estimatedDays > 0 && (
          <p className="text-sm text-gray-600">
            {t('request.workingDays')}: <span className="font-medium">{estimatedDays} {t('common.days', 'days')}</span>
            <span className="text-xs text-gray-400 ml-1">(estimate)</span>
          </p>
        )}

        {/* Deduct toggle */}
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <button
              type="button"
              role="switch"
              aria-checked={deduct}
              onClick={() => setDeduct(d => !d)}
              className={`relative inline-flex h-5 w-10 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${deduct ? 'bg-brand-500' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${deduct ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm text-gray-700">{t('timeOff.deductFromBalance')}</span>
          </label>

          {deduct && balance && (
            <div className="text-sm text-gray-600 bg-gray-50 rounded-md px-3 py-2">
              {t('timeOff.currentBalance')}: <span className="font-medium">{balance.remaining} / {balance.allowance}</span>
              {exceedsBy > 0 && (
                <p className="text-amber-600 text-xs mt-1">
                  {t('timeOff.exceedsBalance', { n: exceedsBy })}
                </p>
              )}
            </div>
          )}
          {!deduct && (
            <p className="text-xs text-gray-500 bg-blue-50 rounded-md px-3 py-2">{t('timeOff.bonusLeave')}</p>
          )}
        </div>

        {/* Reason */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">{t('requests.note')}</label>
          <textarea
            rows={2}
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button size="sm" onClick={handleGrant} disabled={saving || !employeeId || !dateFrom || !dateTo}>
            {saving ? '…' : t('timeOff.grantTimeOff')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Adjust Balance Modal ──────────────────────────────────────────────────────

function AdjustModal({ employee, year, onClose, onDone }) {
  const { t }        = useTranslation();
  const [delta, setDelta]   = useState('');
  const [note, setNote]     = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleSave() {
    const d = parseInt(delta, 10);
    if (isNaN(d) || d === 0) { setError('Enter a non-zero integer'); return; }
    setSaving(true);
    try {
      await api.put(`/time-off/balances/${employee.employee_id}/adjust`, { delta: d, year, note });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4 max-h-[90dvh] overflow-y-auto">
        <h2 className="text-lg font-semibold">{t('timeOff.adjust')} — {employee.employee_name}</h2>
        <p className="text-sm text-gray-500">
          {t('timeOff.used')}: {employee.used_days} / {employee.allowance} &nbsp;·&nbsp; {t('timeOff.remaining')}: {employee.remaining}
        </p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">{t('timeOff.adjustDelta')}</Label>
            <Input
              type="number"
              placeholder="+2 or -1"
              value={delta}
              onChange={e => setDelta(e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-gray-400 mt-1">{t('timeOff.adjustDeltaHint')}</p>
          </div>
          <div>
            <Label className="text-xs">{t('common.description')}</Label>
            <Input value={note} onChange={e => setNote(e.target.value)} className="mt-1" />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? '…' : t('common.save')}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TimeOffBalancesPage() {
  const { t }    = useTranslation();
  const { user } = useAuth();
  const isAdmin    = user?.role === 'ADMIN';
  const canGrant   = ['ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(user?.role);

  const currentYear = new Date().getFullYear();
  const [year, setYear]         = useState(currentYear);
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [adjusting, setAdjusting] = useState(null);
  const [granting, setGranting]   = useState(false);
  const [toast, setToast]         = useState('');

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/time-off/balances?year=${year}`);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const employees = data?.employees || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t('nav.timeOffBalances')}</h1>
        <div className="flex items-center gap-2">
          {canGrant && (
            <Button size="sm" onClick={() => setGranting(true)}>
              {t('timeOff.grantTimeOff')}
            </Button>
          )}
          <Label className="text-xs text-gray-500">{t('common.year', 'Year')}</Label>
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value, 10))}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: t('timeOff.totalEmployees', 'Total Employees'), value: employees.length, color: 'text-gray-700' },
          { label: t('timeOff.fullBalance', 'Full Balance'), value: employees.filter(e => e.remaining === e.allowance).length, color: 'text-green-700' },
          { label: t('timeOff.partiallyUsed', 'Partially Used'), value: employees.filter(e => e.used_days > 0 && e.remaining > 0).length, color: 'text-orange-700' },
          { label: t('timeOff.fullyUsed', 'Fully Used'), value: employees.filter(e => e.remaining <= 0).length, color: 'text-red-700' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="py-3 text-center">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{year} — {employees.length} {t('employees.title', 'Employees')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-center text-muted-foreground">{t('common.loading')}</p>
          ) : employees.length === 0 ? (
            <p className="p-6 text-sm text-center text-muted-foreground">{t('common.noData')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left">
                    <th className="px-4 py-2 font-medium text-muted-foreground">{t('employees.fullName')}</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground text-center">{t('timeOff.allowance')}</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground text-center">{t('timeOff.used')}</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground text-center">{t('timeOff.remaining')}</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">{t('common.status')}</th>
                    {isAdmin && <th className="px-4 py-2 font-medium text-muted-foreground">{t('common.actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => {
                    const pct = emp.allowance > 0
                      ? Math.min(100, Math.round((emp.used_days / emp.allowance) * 100))
                      : 0;
                    const barColor = pct >= 100 ? 'bg-red-500' : pct >= 70 ? 'bg-orange-400' : 'bg-green-500';

                    return (
                      <tr key={emp.employee_id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2">
                          <p className="font-medium text-gray-900">{emp.employee_name}</p>
                          <p className="text-xs text-muted-foreground">{emp.employee_code}</p>
                        </td>
                        <td className="px-4 py-2 text-center text-gray-700">{emp.allowance}</td>
                        <td className="px-4 py-2 text-center text-gray-700">{emp.used_days}</td>
                        <td className={`px-4 py-2 text-center font-medium ${emp.remaining <= 0 ? 'text-red-600' : emp.remaining <= 3 ? 'text-orange-600' : 'text-green-700'}`}>
                          {emp.remaining}
                        </td>
                        <td className="px-4 py-2 w-40">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
                          </div>
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-2">
                            <Button size="sm" variant="outline" onClick={() => setAdjusting(emp)}>
                              {t('timeOff.adjust')}
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {adjusting && (
        <AdjustModal
          employee={adjusting}
          year={year}
          onClose={() => setAdjusting(null)}
          onDone={() => { setAdjusting(null); load(); }}
        />
      )}

      {granting && (
        <GrantModal
          year={year}
          onClose={() => setGranting(false)}
          onDone={res => {
            setGranting(false);
            load();
            showToast(t('timeOff.grantSuccess', { employee: res.employee_name }));
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
