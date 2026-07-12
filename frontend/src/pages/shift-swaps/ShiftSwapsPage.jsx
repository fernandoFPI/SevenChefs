import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api.js';

const TYPE_COLORS = {
  COVER: 'bg-brand-100 text-brand-700',
  SWAP:  'bg-purple-100 text-purple-700',
};

const STATUS_COLORS = {
  ACTIVE:    'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = String(dateStr).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function RecordModal({ employees, onClose, onSaved }) {
  const { t } = useTranslation();
  const [type, setType]                     = useState('COVER');
  const [coveringId, setCoveringId]         = useState('');
  const [coverDate, setCoverDate]           = useState('');
  const [coveredId, setCoveredId]           = useState('');
  const [coveredDate, setCoveredDate]       = useState('');
  const [swapReturnDate, setSwapReturnDate] = useState('');
  const [note, setNote]                     = useState('');
  const [saving, setSaving]                 = useState(false);
  const [error, setError]                   = useState('');

  async function handleSave() {
    setError('');
    if (!coveringId || !coverDate) { setError(t('shiftSwap.missingRequired')); return; }
    if (type === 'SWAP' && !coveredId) { setError(t('shiftSwap.missingRequired')); return; }
    setSaving(true);
    try {
      await api.post('/shift-swaps', {
        type,
        covering_employee_id: coveringId,
        cover_date:           coverDate,
        covered_employee_id:  coveredId  || undefined,
        covered_date:         coveredDate     || undefined,
        swap_return_date:     swapReturnDate  || undefined,
        note:                 note.trim()     || undefined,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message || 'Error');
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
  const selectClass = inputClass;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl space-y-4 max-h-[90dvh] overflow-y-auto">
        <h2 className="text-base font-semibold text-gray-900">{t('shiftSwap.recordCoverSwap')}</h2>
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('shiftSwap.type')}</label>
          <div className="flex gap-4">
            {['COVER', 'SWAP'].map(v => (
              <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" value={v} checked={type === v} onChange={() => setType(v)} />
                <span className="text-sm">{t(`shiftSwap.${v.toLowerCase()}`)}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('shiftSwap.coveringEmployee')}</label>
            <select value={coveringId} onChange={e => setCoveringId(e.target.value)} className={selectClass}>
              <option value="">— {t('common.all')} —</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.name} ({e.employee_code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('shiftSwap.coverDate')}</label>
            <input type="date" value={coverDate} onChange={e => setCoverDate(e.target.value)} className={inputClass} />
          </div>
        </div>

        {type === 'SWAP' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('shiftSwap.coveredEmployee')}</label>
              <select value={coveredId} onChange={e => setCoveredId(e.target.value)} className={selectClass}>
                <option value="">— select —</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.name} ({e.employee_code})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('shiftSwap.coveredDate')}</label>
              <input type="date" value={coveredDate} onChange={e => setCoveredDate(e.target.value)} className={inputClass} />
            </div>
          </div>
        )}

        {type === 'SWAP' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('shiftSwap.swapReturnDate')}</label>
            <input type="date" value={swapReturnDate} onChange={e => setSwapReturnDate(e.target.value)} className={inputClass} />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('requests.note')}</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            className={inputClass}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
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
            {saving ? '...' : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ShiftSwapsPage() {
  const { t } = useTranslation();
  const [month, setMonth]       = useState(new Date().toISOString().slice(0, 7));
  const [records, setRecords]   = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/shift-swaps?month=${month}`);
      setRecords(res.data || []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/employees').then(d => setEmployees(d || [])).catch(() => {});
  }, []);

  async function handleCancel(id) {
    if (!window.confirm(t('shiftSwap.confirmCancel'))) return;
    try {
      await api.delete(`/shift-swaps/${id}`);
      load();
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">{t('nav.shiftSwaps')}</h1>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            onClick={() => setShowModal(true)}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
          >
            + {t('shiftSwap.recordCoverSwap')}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('shiftSwap.type')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('shiftSwap.coveringEmployee')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('shiftSwap.coverDate')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('shiftSwap.coveredEmployee')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('shiftSwap.coveredDate')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('shiftSwap.swapReturnDate')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('requests.note')}</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.status')}</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">{t('common.loading')}</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">{t('common.noData')}</td></tr>
            ) : records.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[r.type] || 'bg-gray-100 text-gray-600'}`}>
                    {t(`shiftSwap.${r.type.toLowerCase()}`)}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="font-medium">{r.covering_employee_name}</div>
                  <div className="text-xs text-gray-400">{r.covering_employee_code}</div>
                </td>
                <td className="px-4 py-2">{fmtDate(r.cover_date)}</td>
                <td className="px-4 py-2">
                  {r.covered_employee_name
                    ? <><div>{r.covered_employee_name}</div><div className="text-xs text-gray-400">{r.covered_employee_code}</div></>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2">{r.covered_date ? fmtDate(r.covered_date) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-2">{r.swap_return_date ? fmtDate(r.swap_return_date) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-2 text-gray-500 max-w-xs truncate">{r.note || '—'}</td>
                <td className="px-4 py-2 text-center">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-center">
                  {r.status === 'ACTIVE' && (
                    <button
                      onClick={() => handleCancel(r.id)}
                      className="rounded px-2 py-0.5 text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100"
                    >
                      {t('shiftSwap.cancelSwap')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <RecordModal
          employees={employees}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}
