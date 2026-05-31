import React from 'react';
import { useTranslation } from 'react-i18next';

export const DAYS_OF_WEEK = [
  { value: 0, key: 'monday' },
  { value: 1, key: 'tuesday' },
  { value: 2, key: 'wednesday' },
  { value: 3, key: 'thursday' },
  { value: 4, key: 'friday' },
  { value: 5, key: 'saturday' },
  { value: 6, key: 'sunday' },
];

export function buildDefaultPattern() {
  return DAYS_OF_WEEK.map(d => ({ day_of_week: d.value, shift_id: null }));
}

export function patternFromApi(apiPattern) {
  const map = new Map((apiPattern || []).map(p => [p.day_of_week, p.shift_id ?? null]));
  return DAYS_OF_WEEK.map(d => ({ day_of_week: d.value, shift_id: map.get(d.value) ?? null }));
}

const selectClass = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

export default function ShiftPatternEditor({ shifts, pattern, onRowChange, disabled }) {
  const { t } = useTranslation();

  return (
    <div className="rounded-md border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('common.day')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('employees.shift')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('shifts.totalHours')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {pattern.map(row => {
            const dayConfig    = DAYS_OF_WEEK.find(d => d.value === row.day_of_week);
            const selectedShift = shifts.find(s => s.id === row.shift_id);
            return (
              <tr key={row.day_of_week} className={row.shift_id === null ? 'bg-gray-50' : ''}>
                <td className="px-3 py-2 font-medium text-gray-700 w-28">
                  {t(`days.${dayConfig.key}`)}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={row.shift_id || ''}
                    onChange={e => onRowChange(row.day_of_week, e.target.value || null)}
                    disabled={disabled}
                    className={selectClass}
                  >
                    <option value="">{t('employees.offDay')}</option>
                    {shifts.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.std_hours_per_day} {t('shifts.hoursPerDay')})
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-gray-500 w-24">
                  {selectedShift
                    ? `${selectedShift.std_hours_per_day} ${t('shifts.hoursPerDay')}`
                    : <span className="text-xs text-gray-400">{t('employees.offDay')}</span>
                  }
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
