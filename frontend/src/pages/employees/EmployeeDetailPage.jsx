import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DAYS_OF_WEEK } from '@/components/ShiftPatternEditor';

function Field({ label, value }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/employees/${id}`)
      .then(setEmployee)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!employee) return null;

  const workingDays = (employee.schedule_working_days || [])
    .map(Number).sort((a, b) => a - b)
    .map(d => t(`schedules.days.${d}`))
    .join(', ');

  const hasPattern = employee.shift_pattern && employee.shift_pattern.length > 0;
  const patternMap = hasPattern
    ? new Map(employee.shift_pattern.map(p => [p.day_of_week, p]))
    : null;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{employee.name}</h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={`/employees/${id}/edit`}>{t('common.edit')}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/employees">{t('nav.goBack')}</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('employees.employeeInfo')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Field label={t('employees.code')} value={employee.employee_code} />
          <Field label={t('employees.fullName')} value={employee.name} />
          <Field label={t('employees.salary')} value={Number(employee.monthly_salary).toFixed(2)} />
          <Field
            label={t('common.status')}
            value={employee.is_active ? t('common.active') : t('common.inactive')}
          />
          {hasPattern ? (
            <div className="col-span-2 space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('employees.shiftPattern')}</p>
              <div className="rounded-md border border-gray-200 overflow-hidden mt-1">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('common.day')}</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('employees.shift')}</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('shifts.totalHours')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {DAYS_OF_WEEK.map(day => {
                      const entry = patternMap.get(day.value);
                      const isOff = !entry || !entry.shift_id;
                      return (
                        <tr key={day.value} className={isOff ? 'bg-gray-50' : ''}>
                          <td className="px-3 py-2 font-medium text-gray-700">{t(`days.${day.key}`)}</td>
                          <td className="px-3 py-2 text-gray-600">
                            {isOff
                              ? <span className="text-xs text-gray-400">{t('employees.offDay')}</span>
                              : entry.shift_name
                            }
                          </td>
                          <td className="px-3 py-2 text-gray-500">
                            {isOff ? '—' : `${entry.std_hours} ${t('shifts.hoursPerDay')}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <>
              <Field
                label={t('employees.shift')}
                value={employee.shift_name
                  ? `${employee.shift_name} (${employee.shift_hours} ${t('shifts.hoursPerDay')})`
                  : '—'}
              />
              <Field
                label={t('employees.schedule')}
                value={employee.schedule_name ? `${employee.schedule_name} — ${workingDays}` : '—'}
              />
            </>
          )}
          <Field
            label={t('employees.zkBioId')}
            value={employee.zk_employee_id || t('employees.notSet')}
          />
          <Field
            label={t('employees.createdAt')}
            value={new Date(employee.created_at).toLocaleDateString()}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('employees.accountInfo')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Field label={t('auth.username')} value={employee.username || '—'} />
          <Field label={t('employees.role')} value={employee.user_role ? t(`roles.${employee.user_role}`) : '—'} />
          <Field
            label={t('common.status')}
            value={employee.password_changed
              ? t('employees.passwordChanged')
              : t('employees.passwordNotChanged')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
