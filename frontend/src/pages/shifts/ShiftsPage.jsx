import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { formatHours } from '@/lib/formatHours.js';

const EMPTY_FORM = { name: '', shift_type: 'FIXED', shift_start: '', shift_end: '', std_hours_per_day: '', description: '' };

function computeHours(start, end) {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMins = sh * 60 + sm;
  const endMins   = eh * 60 + em;
  const duration  = endMins > startMins ? endMins - startMins : (24 * 60 - startMins) + endMins;
  return duration / 60;
}

function ShiftModal({ open, title, form, errors, loading, onChange, onSave, onClose }) {
  const { t } = useTranslation();
  if (!open) return null;

  const isDuration    = form.shift_type === 'DURATION';
  const computedHours = isDuration ? null : computeHours(form.shift_start, form.shift_end);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold mb-4">{title}</h2>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="s-name">{t('common.name')}</Label>
            <Input
              id="s-name"
              value={form.name}
              onChange={e => onChange('name', e.target.value)}
              disabled={loading}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="space-y-1">
            <Label>{t('shifts.shiftType')}</Label>
            <div className="flex gap-4 mt-1">
              {['FIXED', 'DURATION'].map(type => (
                <label key={type} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="shift_type"
                    value={type}
                    checked={form.shift_type === type}
                    onChange={() => onChange('shift_type', type)}
                    disabled={loading}
                  />
                  <span className="text-sm">{t(`shifts.type_${type}`)}</span>
                </label>
              ))}
            </div>
          </div>
          {isDuration && (
            <div className="space-y-1">
              <Label htmlFor="s-hours">{t('shifts.stdHours')}</Label>
              <Input
                id="s-hours"
                type="number"
                min="0.5"
                max="24"
                step="0.5"
                placeholder={t('shifts.stdHoursHint')}
                value={form.std_hours_per_day}
                onChange={e => onChange('std_hours_per_day', e.target.value)}
                disabled={loading}
              />
              {errors.std_hours_per_day && <p className="text-xs text-destructive">{errors.std_hours_per_day}</p>}
            </div>
          )}
          {!isDuration && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="s-start">{t('shifts.shiftStart')}</Label>
                <Input
                  id="s-start"
                  type="time"
                  value={form.shift_start}
                  onChange={e => onChange('shift_start', e.target.value)}
                  disabled={loading}
                />
                {errors.shift_start && <p className="text-xs text-destructive">{errors.shift_start}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="s-end">{t('shifts.shiftEnd')}</Label>
                <Input
                  id="s-end"
                  type="time"
                  value={form.shift_end}
                  onChange={e => onChange('shift_end', e.target.value)}
                  disabled={loading}
                />
                {errors.shift_end && <p className="text-xs text-destructive">{errors.shift_end}</p>}
              </div>
            </div>
          )}
          {computedHours !== null && (
            <p className="text-sm text-gray-600">
              {t('shifts.totalHours')}: <span className="font-medium">{formatHours(computedHours)}</span>
            </p>
          )}
          <div className="space-y-1">
            <Label htmlFor="s-desc">{t('common.description')}</Label>
            <textarea
              id="s-desc"
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

export default function ShiftsPage() {
  const { t } = useTranslation();
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/shifts');
      setShifts(data);
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

  function openEdit(shift) {
    setEditing(shift);
    setForm({
      name:             shift.name,
      shift_type:       shift.shift_type || 'FIXED',
      shift_start:      shift.shift_start ? shift.shift_start.slice(0, 5) : '',
      shift_end:        shift.shift_end   ? shift.shift_end.slice(0, 5)   : '',
      std_hours_per_day: shift.shift_type === 'DURATION' ? String(shift.std_hours_per_day || '') : '',
      description:      shift.description || '',
    });
    setErrors({});
    setModalOpen(true);
  }

  function handleChange(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: undefined }));
  }

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = t('common.name') + ' is required';
    if (form.shift_type === 'FIXED') {
      if (!form.shift_start) e.shift_start = t('shifts.shiftStart') + ' is required';
      if (!form.shift_end)   e.shift_end   = t('shifts.shiftEnd')   + ' is required';
      if (form.shift_start && form.shift_end) {
        const h = computeHours(form.shift_start, form.shift_end);
        if (h === null || h < 1 || h > 24) e.shift_end = 'Duration must be 1–24 hours';
      }
    } else {
      const h = Number(form.std_hours_per_day);
      if (!form.std_hours_per_day || h <= 0 || h > 24)
        e.std_hours_per_day = 'Standard hours must be between 0.5 and 24';
    }
    return e;
  }

  async function handleSave() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    try {
      const payload = {
        name:             form.name.trim(),
        shift_type:       form.shift_type,
        shift_start:      form.shift_type === 'FIXED' ? form.shift_start      : null,
        shift_end:        form.shift_type === 'FIXED' ? form.shift_end         : null,
        std_hours_per_day: form.shift_type === 'DURATION' ? Number(form.std_hours_per_day) : undefined,
        description:      form.description.trim() || null,
      };
      if (editing) {
        await api.put(`/shifts/${editing.id}`, payload);
      } else {
        await api.post('/shifts', payload);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setErrors({ _general: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(shift) {
    if (!window.confirm(t('common.confirm'))) return;
    await api.delete(`/shifts/${shift.id}`);
    await load();
  }

  async function handleReactivate(shift) {
    await api.put(`/shifts/${shift.id}`, {
      name:        shift.name,
      shift_type:  shift.shift_type || 'FIXED',
      shift_start: shift.shift_start ? shift.shift_start.slice(0, 5) : null,
      shift_end:   shift.shift_end   ? shift.shift_end.slice(0, 5)   : null,
      description: shift.description,
      is_active:   true,
    });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('shifts.title')}</h1>
        <Button onClick={openAdd}>{t('shifts.addShift')}</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : shifts.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">{t('shifts.noShifts')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-gray-600">{t('common.name')}</th>
                    <th className="px-4 py-3 text-start font-medium text-gray-600">{t('shifts.shiftStart')} – {t('shifts.shiftEnd')}</th>
                    <th className="px-4 py-3 text-start font-medium text-gray-600">{t('shifts.totalHours')}</th>
                    <th className="px-4 py-3 text-start font-medium text-gray-600">{t('common.description')}</th>
                    <th className="px-4 py-3 text-start font-medium text-gray-600">{t('common.status')}</th>
                    <th className="px-4 py-3 text-start font-medium text-gray-600">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shifts.map(shift => {
                    const hrs = shift.std_hours_per_day ? formatHours(shift.std_hours_per_day) : '—';
                    const isDurationShift = shift.shift_type === 'DURATION';
                    const timeRange = isDurationShift
                      ? <span className="text-xs font-medium text-blue-700 bg-blue-50 rounded px-1.5 py-0.5">{t('shifts.type_DURATION')}</span>
                      : (shift.shift_start && shift.shift_end
                          ? `${shift.shift_start.slice(0, 5)} – ${shift.shift_end.slice(0, 5)}`
                          : '—');
                    return (
                      <tr key={shift.id} className={shift.is_active ? '' : 'opacity-60'}>
                        <td className="px-4 py-3 font-medium">{shift.name}</td>
                        <td className="px-4 py-3 font-mono text-sm">{timeRange}</td>
                        <td className="px-4 py-3">{hrs}</td>
                        <td className="px-4 py-3 text-muted-foreground">{shift.description || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            shift.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {shift.is_active ? t('common.active') : t('common.inactive')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEdit(shift)}>
                              {t('common.edit')}
                            </Button>
                            {shift.is_active ? (
                              <Button variant="outline" size="sm" onClick={() => handleDeactivate(shift)}>
                                {t('common.deactivate')}
                              </Button>
                            ) : (
                              <Button variant="outline" size="sm" onClick={() => handleReactivate(shift)}>
                                {t('common.reactivate')}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ShiftModal
        open={modalOpen}
        title={editing ? t('shifts.editShift') : t('shifts.addShift')}
        form={form}
        errors={errors}
        loading={saving}
        onChange={handleChange}
        onSave={handleSave}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
