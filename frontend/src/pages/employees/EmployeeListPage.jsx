import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/formatCurrency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

export default function EmployeeListPage() {
  const { t } = useTranslation();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter !== 'all' ? `?is_active=${statusFilter === 'active'}` : '';
      const data = await api.get(`/employees${params}`);
      setEmployees(data);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleDeactivate(emp) {
    if (!window.confirm(t('common.confirm'))) return;
    await api.delete(`/employees/${emp.id}`);
    await load();
  }

  const filtered = employees.filter(e => {
    const q = search.toLowerCase();
    return !q || e.name.toLowerCase().includes(q) || e.employee_code.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('employees.title')}</h1>
        <Button asChild>
          <Link to="/employees/new">{t('employees.addEmployee')}</Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder={t('employees.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="all">{t('common.all')}</option>
          <option value="active">{t('common.active')}</option>
          <option value="inactive">{t('common.inactive')}</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">{t('employees.noEmployees')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">{t('employees.code')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">{t('employees.fullName')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">{t('employees.shift')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">{t('employees.schedule')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">{t('employees.salary')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.status')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(emp => (
                    <tr key={emp.id} className={emp.is_active ? '' : 'opacity-60'}>
                      <td className="px-4 py-3 font-mono text-xs">{emp.employee_code}</td>
                      <td className="px-4 py-3 font-medium">{emp.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{emp.shift_name || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{emp.schedule_name || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{formatCurrency(emp.monthly_salary, emp.currency || 'IQD')}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          emp.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {emp.is_active ? t('common.active') : t('common.inactive')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/employees/${emp.id}`}>{t('common.view')}</Link>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/employees/${emp.id}/edit`}>{t('common.edit')}</Link>
                          </Button>
                          {emp.is_active && (
                            <Button variant="outline" size="sm" onClick={() => handleDeactivate(emp)}>
                              {t('common.deactivate')}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
