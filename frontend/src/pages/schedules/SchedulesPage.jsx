import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';

const DAYS = [0, 1, 2, 3, 4, 5, 6];
const EMPTY_FORM = { name: '', working_days: [], description: '' };

function ScheduleModal({ open, title, form, errors, loading, onChange, onToggleDay, onSave, onClose }) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold mb-4">{title}</h2>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="sc-name">{t('common.name')}</Label>
            <Input
              id="sc-name"
              value={form.name}
              onChange={e => onChange('name', e.target.value)}
              disabled={loading}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label>{t('schedules.workingDays')}</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(d => {
                const active = form.working_days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={loading}
                    onClick={() => onToggleDay(d)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      active
                        ? 'bg-brand-500 text-white border-brand-500'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-brand-50'
                    }`}
                  >
                    {t(`schedules.days.${d}`)}
                  </button>
                );
              })}
            </div>
            {errors.working_days && <p className="text-xs text-destructive">{errors.working_days}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="sc-desc">{t('common.description')}</Label>
            <textarea
              id="sc-desc"
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={form.description}
              onChange={e => onChange('description', e.target.value)}
              disabled={loading}
            />
          </div>
        </div>
        {errors._general && (
          <p className="mt-3 text-sm text-destructive">{errors._general}</p>
        )}
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={loading}>{t('common.cancel')}</Button>
          <Button onClick={onSave} disabled={loading}>{loading ? '…' : t('common.save')}</Button>
        </div>
      </div>
    </div>
  );
}

export default function SchedulesPage() {
  const { t } = useTranslation();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/schedules');
      setSchedules(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(schedule) {
    setEditing(schedule);
    setForm({
      name: schedule.name,
      working_days: [...schedule.working_days].map(Number).sort(),
      description: schedule.description || '',
    });
    setErrors({});
    setModalOpen(true);
  }

  function handleChange(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: undefined }));
  }

  function handleToggleDay(day) {
    setForm(f => {
      const days = f.working_days.includes(day)
        ? f.working_days.filter(d => d !== day)
        : [...f.working_days, day].sort((a, b) => a - b);
      return { ...f, working_days: days };
    });
    setErrors(e => ({ ...e, working_days: undefined }));
  }

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = t('common.name') + ' is required';
    if (!form.working_days.length) e.working_days = t('schedules.selectAtLeastOneDay');
    return e;
  }

  async function handleSave() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        working_days: form.working_days,
        description: form.description.trim() || null,
      };
      if (editing) {
        await api.put(`/schedules/${editing.id}`, payload);
      } else {
        await api.post('/schedules', payload);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setErrors({ _general: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(schedule) {
    if (!window.confirm(t('common.confirm'))) return;
    await api.delete(`/schedules/${schedule.id}`);
    await load();
  }

  async function handleReactivate(schedule) {
    await api.put(`/schedules/${schedule.id}`, {
      name: schedule.name,
      working_days: schedule.working_days,
      description: schedule.description,
      is_active: true,
    });
    await load();
  }

  function renderDays(days) {
    return days.map(Number).sort((a, b) => a - b).map(d => t(`schedules.days.${d}`)).join(', ');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('schedules.title')}</h1>
        <Button onClick={openAdd}>{t('schedules.addSchedule')}</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : schedules.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">{t('schedules.noSchedules')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.name')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">{t('schedules.workingDays')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.description')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.status')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {schedules.map(sc => (
                    <tr key={sc.id} className={sc.is_active ? '' : 'opacity-60'}>
                      <td className="px-4 py-3 font-medium">{sc.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{renderDays(sc.working_days)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{sc.description || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          sc.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {sc.is_active ? t('common.active') : t('common.inactive')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(sc)}>
                            {t('common.edit')}
                          </Button>
                          {sc.is_active ? (
                            <Button variant="outline" size="sm" onClick={() => handleDeactivate(sc)}>
                              {t('common.deactivate')}
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => handleReactivate(sc)}>
                              {t('common.reactivate')}
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

      <ScheduleModal
        open={modalOpen}
        title={editing ? t('schedules.editSchedule') : t('schedules.addSchedule')}
        form={form}
        errors={errors}
        loading={saving}
        onChange={handleChange}
        onToggleDay={handleToggleDay}
        onSave={handleSave}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
