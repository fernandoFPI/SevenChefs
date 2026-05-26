import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext.jsx';
import { api } from '@/lib/api.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
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
  const isAdmin  = user?.role === 'ADMIN';

  const currentYear = new Date().getFullYear();
  const [year, setYear]         = useState(currentYear);
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [adjusting, setAdjusting] = useState(null); // employee object

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('nav.timeOffBalances')}</h1>
        <div className="flex items-center gap-2">
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
    </div>
  );
}
