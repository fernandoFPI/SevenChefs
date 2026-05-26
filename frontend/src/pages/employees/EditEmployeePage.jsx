import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ASSIGNABLE_ROLES = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'EMPLOYEE'];

function FieldError({ error }) {
  if (!error) return null;
  return <p className="text-xs text-destructive mt-1">{error}</p>;
}

export default function EditEmployeePage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [shifts, setShifts] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get(`/employees/${id}`),
      api.get('/shifts'),
      api.get('/schedules'),
    ]).then(([emp, shiftsRes, schedulesRes]) => {
      setForm({
        employee_code: emp.employee_code,
        name: emp.name,
        monthly_salary: String(emp.monthly_salary),
        shift_id: emp.shift_id || '',
        secondary_shift_id: emp.secondary_shift_id || '',
        schedule_id: emp.schedule_id || '',
        zk_employee_id: emp.zk_employee_id || '',
        username: emp.username || '',
        role: emp.user_role || '',
        currency: emp.currency || 'IQD',
      });
      setShifts(shiftsRes.filter(s => s.is_active || s.id === emp.shift_id || s.id === emp.secondary_shift_id));
      setSchedules(schedulesRes.filter(s => s.is_active || s.id === emp.schedule_id));
    }).finally(() => setLoading(false));
  }, [id]);

  function handleChange(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: undefined, _general: undefined }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await api.put(`/employees/${id}`, { ...form, monthly_salary: Number(form.monthly_salary) });
      navigate(`/employees/${id}`);
    } catch (err) {
      if (err.data?.errors) {
        setErrors(err.data.errors);
      } else {
        setErrors({ _general: err.message });
      }
    } finally {
      setSaving(false);
    }
  }

  const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

  if (loading) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  if (!form) return null;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('employees.editEmployee')}</h1>
        <Button variant="outline" asChild>
          <Link to={`/employees/${id}`}>{t('nav.goBack')}</Link>
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('employees.employeeInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="emp-code">{t('employees.code')}</Label>
                <Input id="emp-code" value={form.employee_code}
                  onChange={e => handleChange('employee_code', e.target.value)} disabled={saving} />
                <FieldError error={errors.employee_code} />
              </div>
              <div>
                <Label htmlFor="emp-name">{t('employees.fullName')}</Label>
                <Input id="emp-name" value={form.name}
                  onChange={e => handleChange('name', e.target.value)} disabled={saving} />
                <FieldError error={errors.name} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="emp-salary">{t('employees.salary')}</Label>
                <Input id="emp-salary" type="number" min="0" step="0.01"
                  value={form.monthly_salary}
                  onChange={e => handleChange('monthly_salary', e.target.value)} disabled={saving} />
                <FieldError error={errors.monthly_salary} />
              </div>
              <div>
                <Label>{t('employees.currency')}</Label>
                <div className="flex gap-3 mt-2">
                  {['IQD', 'USD'].map(cur => (
                    <label key={cur} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="currency"
                        value={cur}
                        checked={form.currency === cur}
                        onChange={() => handleChange('currency', cur)}
                        disabled={saving}
                      />
                      <span className="text-sm">{t(`currency.${cur}`)}</span>
                    </label>
                  ))}
                </div>
                <FieldError error={errors.currency} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="emp-shift">{t('employees.shift')}</Label>
                <select id="emp-shift" value={form.shift_id}
                  onChange={e => handleChange('shift_id', e.target.value)}
                  disabled={saving} className={selectClass}>
                  <option value="">—</option>
                  {shifts.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.std_hours_per_day} {t('shifts.hoursPerDay')})
                    </option>
                  ))}
                </select>
                <FieldError error={errors.shift_id} />
              </div>
              <div>
                <Label htmlFor="emp-shift2">{t('employees.secondaryShift')}</Label>
                <select id="emp-shift2" value={form.secondary_shift_id}
                  onChange={e => handleChange('secondary_shift_id', e.target.value)}
                  disabled={saving} className={selectClass}>
                  <option value="">— {t('common.none')}</option>
                  {shifts.filter(s => s.id !== form.shift_id).map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.std_hours_per_day} {t('shifts.hoursPerDay')})
                    </option>
                  ))}
                </select>
                <FieldError error={errors.secondary_shift_id} />
              </div>
            </div>
            {form.shift_id && form.secondary_shift_id && (() => {
              const p = shifts.find(s => s.id === form.shift_id);
              const sec = shifts.find(s => s.id === form.secondary_shift_id);
              if (!p || !sec) return null;
              const total = (parseFloat(p.std_hours_per_day) || 0) + (parseFloat(sec.std_hours_per_day) || 0);
              return (
                <p className="text-sm text-gray-600">
                  {t('employees.combinedHours')}: <span className="font-medium">{total} {t('shifts.hoursPerDay')}</span>
                </p>
              );
            })()}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="emp-schedule">{t('employees.schedule')}</Label>
                <select id="emp-schedule" value={form.schedule_id}
                  onChange={e => handleChange('schedule_id', e.target.value)}
                  disabled={saving} className={selectClass}>
                  <option value="">—</option>
                  {schedules.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <FieldError error={errors.schedule_id} />
              </div>
            </div>

            <div>
              <Label htmlFor="emp-zk">{t('employees.zkBioId')}</Label>
              <Input id="emp-zk" value={form.zk_employee_id}
                onChange={e => handleChange('zk_employee_id', e.target.value)} disabled={saving} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('employees.accountInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="emp-username">{t('employees.username')}</Label>
                <Input id="emp-username" value={form.username}
                  onChange={e => handleChange('username', e.target.value)} disabled={saving} />
                <FieldError error={errors.username} />
              </div>
              <div>
                <Label htmlFor="emp-role">{t('employees.role')}</Label>
                <select id="emp-role" value={form.role}
                  onChange={e => handleChange('role', e.target.value)}
                  disabled={saving} className={selectClass}>
                  <option value="">—</option>
                  {ASSIGNABLE_ROLES.map(r => (
                    <option key={r} value={r}>{t(`roles.${r}`)}</option>
                  ))}
                </select>
                <FieldError error={errors.role} />
              </div>
            </div>
          </CardContent>
        </Card>

        {errors._general && <p className="text-sm text-destructive">{errors._general}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link to={`/employees/${id}`}>{t('common.cancel')}</Link>
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? '…' : t('common.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
