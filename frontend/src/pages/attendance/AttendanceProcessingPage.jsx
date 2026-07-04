import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { formatHours } from '@/lib/formatHours.js';
import { useAuth } from '@/context/AuthContext.jsx';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ADMIN_ACCOUNTANT = ['ADMIN', 'ACCOUNTANT'];
const CAN_ACT_ROLES    = ['ADMIN', 'ACCOUNTANT', 'MANAGER'];

// ── Utilities ────────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function dayName(dateStr) {
  if (!dateStr) return '';
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return days[new Date(dateStr + 'T00:00:00Z').getUTCDay()];
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  PRESENT:      'bg-green-100 text-green-800',
  ABSENT:       'bg-red-100 text-red-800',
  LEAVE_PAID:   'bg-blue-100 text-blue-800',
  LEAVE_UNPAID: 'bg-orange-100 text-orange-800',
  OFF:          'bg-gray-100 text-gray-600',
};

function StatusBadge({ status }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
      {t(`status.${status}`, status)}
    </span>
  );
}

// ── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
      <span>{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100">✕</button>
    </div>
  );
}

// ── Row Actions Dropdown ─────────────────────────────────────────────────────

function RowActionsDropdown({ record, userRole, isOpen, onToggle, onAction }) {
  const { t } = useTranslation();
  const isAdminOrAcc = ADMIN_ACCOUNTANT.includes(userRole);
  const hasOt   = parseFloat(record.ot_hours)  > 0;
  const hasLate = parseFloat(record.late_hours) > 0;
  const isLeave = record.status === 'LEAVE_PAID' || record.status === 'LEAVE_UNPAID';
  const showApprovals = hasOt || hasLate;

  return (
    <div className="relative inline-block" onClick={e => e.stopPropagation()}>
      <button
        onClick={onToggle}
        className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
      >
        {t('attendance.actions')} ▾
      </button>

      {isOpen && (
        <div className="absolute right-0 z-30 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg py-1">

          {/* Approvals */}
          {showApprovals && (
            <>
              {hasOt && (
                <button
                  onClick={() => onAction('toggle_ot')}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 text-left"
                >
                  <span className={`w-3 text-center text-green-600 font-bold ${record.ot_approved ? 'visible' : 'invisible'}`}>✓</span>
                  {t('attendance.approveOT')}
                </button>
              )}
              {hasLate && (
                <button
                  onClick={() => onAction('toggle_late')}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 text-left"
                >
                  <span className={`w-3 text-center text-orange-600 font-bold ${record.late_approved ? 'visible' : 'invisible'}`}>✓</span>
                  {t('attendance.approveLate')}
                </button>
              )}
              <div className="my-1 border-t border-gray-100" />
            </>
          )}

          {/* Leave flags */}
          {record.status !== 'LEAVE_PAID' && (
            <button
              onClick={() => onAction('flag_paid')}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 text-left"
            >
              <span className="w-3" />
              {t('attendance.flagPaidLeave')}
            </button>
          )}
          {record.status !== 'LEAVE_UNPAID' && (
            <button
              onClick={() => onAction('flag_unpaid')}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 text-left"
            >
              <span className="w-3" />
              {t('attendance.flagUnpaidLeave')}
            </button>
          )}
          {isLeave && (
            <button
              onClick={() => onAction('remove_leave')}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 text-left"
            >
              <span className="w-3" />
              {t('attendance.removeLeaveFlag')}
            </button>
          )}

          {/* Edit */}
          {isAdminOrAcc && (
            <>
              <div className="my-1 border-t border-gray-100" />
              <button
                onClick={() => onAction('edit')}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 text-left"
              >
                <span className="w-3" />
                {t('common.edit')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Edit Modal ───────────────────────────────────────────────────────────────

const STD_PUNCH_STATES = new Set(['0', '1', '2', '3']);

function EditModal({ record, onClose, onSaved, userRole }) {
  const { t } = useTranslation();
  const isAdmin      = userRole === 'ADMIN';
  const isAdminOrAcc = ['ADMIN', 'ACCOUNTANT'].includes(userRole);

  const [form, setForm] = useState({
    status:       record.status,
    hours_worked: record.hours_worked,
    note:         record.note || '',
  });
  const [correction, setCorrection] = useState({
    corrected_check_in:    '',
    corrected_check_out:   '',
    corrected_check_in_2:  '',
    corrected_check_out_2: '',
    corrected_ot_in:       '',
    corrected_ot_out:      '',
    note: '',
  });
  const [rawPunches,        setRawPunches]        = useState([]);
  const [isTwoShift,        setIsTwoShift]        = useState(false);
  const [existingCorrection, setExistingCorrection] = useState(null);
  const [loadingPunches,    setLoadingPunches]    = useState(true);
  const [saving,            setSaving]            = useState(false);
  const [removing,          setRemoving]          = useState(false);
  const [originalTimes,     setOriginalTimes]     = useState({
    checkIn: null, checkOut: null, checkIn2: null, checkOut2: null, otIn: null, otOut: null,
  });
  const [originalValues]    = useState({ status: record.status, hours_worked: record.hours_worked });

  function punchToTime(punch) {
    if (!punch) return null;
    const d = new Date(punch.punch_time);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  useEffect(() => {
    const dateStr = String(record.date).slice(0, 10);
    Promise.allSettled([
      api.get(`/attendance/day-punches?employee_id=${record.employee_id}&date=${dateStr}`),
      api.get(`/attendance/corrections/${record.id}`),
    ]).then(([dayResult, corrResult]) => {
      let originals = { checkIn: null, checkOut: null, checkIn2: null, checkOut2: null, otIn: null, otOut: null };

      if (dayResult.status === 'fulfilled') {
        const body    = dayResult.value;
        const punches = (body?.punches ?? []).slice().sort((a, b) => new Date(a.punch_time) - new Date(b.punch_time));
        setRawPunches(punches);
        setIsTwoShift(!!body?.isTwoShift);

        const otInPunch  = punches.find(p => String(p.punch_state) === '4');
        const otOutAll   = punches.filter(p => String(p.punch_state) === '5');
        const otOutPunch = otOutAll.length ? otOutAll[otOutAll.length - 1] : null;
        const seg1 = body?.segments?.[0] || {};
        const seg2 = body?.segments?.[1] || {};

        originals = {
          checkIn:   seg1.checkIn  || null,
          checkOut:  seg1.checkOut || null,
          checkIn2:  seg2.checkIn  || null,
          checkOut2: seg2.checkOut || null,
          otIn:      punchToTime(otInPunch),
          otOut:     punchToTime(otOutPunch),
        };
        setOriginalTimes(originals);
      }

      if (corrResult.status === 'fulfilled' && corrResult.value) {
        const corrRes = corrResult.value;
        setExistingCorrection(corrRes);
        setCorrection({
          corrected_check_in:    corrRes.corrected_check_in    || '',
          corrected_check_out:   corrRes.corrected_check_out   || '',
          corrected_check_in_2:  corrRes.corrected_check_in_2  || '',
          corrected_check_out_2: corrRes.corrected_check_out_2 || '',
          corrected_ot_in:       corrRes.corrected_ot_in       || '',
          corrected_ot_out:      corrRes.corrected_ot_out      || '',
          note: corrRes.note || '',
        });
      } else {
        setCorrection(c => ({
          ...c,
          corrected_check_in:    originals.checkIn    || '',
          corrected_check_out:   originals.checkOut   || '',
          corrected_check_in_2:  originals.checkIn2   || '',
          corrected_check_out_2: originals.checkOut2  || '',
          corrected_ot_in:       originals.otIn       || '',
          corrected_ot_out:      originals.otOut      || '',
        }));
      }
    }).finally(() => setLoadingPunches(false));
  }, [record.id, record.employee_id, record.date]);

  const origCheckIn   = originalTimes.checkIn;
  const origCheckOut  = originalTimes.checkOut;
  const origCheckIn2  = originalTimes.checkIn2;
  const origCheckOut2 = originalTimes.checkOut2;
  const origOtIn      = originalTimes.otIn;
  const origOtOut     = originalTimes.otOut;

  const showOtSection = origOtIn || origOtOut || correction.corrected_ot_in || correction.corrected_ot_out;

  const hasCorrectedTime = existingCorrection != null || [
    [correction.corrected_check_in,    originalTimes.checkIn],
    [correction.corrected_check_out,   originalTimes.checkOut],
    [correction.corrected_check_in_2,  originalTimes.checkIn2],
    [correction.corrected_check_out_2, originalTimes.checkOut2],
    [correction.corrected_ot_in,       originalTimes.otIn],
    [correction.corrected_ot_out,      originalTimes.otOut],
  ].some(([corr, orig]) => corr && corr !== (orig || ''));

  async function handleSave() {
    setSaving(true);
    try {
      if (hasCorrectedTime) {
        await api.post('/attendance/corrections', {
          attendance_daily_id: record.id,
          corrected_check_in:    correction.corrected_check_in    || undefined,
          corrected_check_out:   correction.corrected_check_out   || undefined,
          corrected_check_in_2:  isTwoShift ? (correction.corrected_check_in_2  || undefined) : undefined,
          corrected_check_out_2: isTwoShift ? (correction.corrected_check_out_2 || undefined) : undefined,
          corrected_ot_in:     correction.corrected_ot_in     || undefined,
          corrected_ot_out:    correction.corrected_ot_out    || undefined,
          note: correction.note || undefined,
        });
      }

      const payload = { note: form.note };
      if (isAdminOrAcc) payload.status = form.status;
      if (isAdminOrAcc && !hasCorrectedTime)
        payload.hours_worked = form.hours_worked;

      await api.put(`/attendance/daily/${record.id}`, payload);
      onSaved(hasCorrectedTime ? t('attendance.correctionSaved') : null);
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveCorrection() {
    if (!window.confirm(t('attendance.confirmRemoveCorrection'))) return;
    setRemoving(true);
    try {
      await api.delete(`/attendance/corrections/${record.id}`);
      onSaved(t('attendance.correctionRemoved'));
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setRemoving(false);
    }
  }

  const selectClass   = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const timeInputClass = 'flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold">{record.employee_name} — {fmtDate(record.date)}</h2>

        {/* Correction banner */}
        {record.has_punch_correction && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start justify-between gap-2">
            <span>{t('attendance.hasPunchCorrection')}</span>
            {isAdmin && (
              <button
                onClick={handleRemoveCorrection}
                disabled={removing}
                className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-200 disabled:opacity-50"
              >
                {removing ? '…' : t('attendance.removeCorrection')}
              </button>
            )}
          </div>
        )}

        {/* Was manually edited banner */}
        {record.is_manually_edited && !record.has_punch_correction && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
            {t('attendance.wasManuallyEdited')}
          </div>
        )}

        {/* Punch Times section */}
        <div className="rounded-md border border-gray-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">{t('attendance.punchTimes')}</p>

          {loadingPunches ? (
            <div className="text-xs text-gray-400">Loading punch data…</div>
          ) : (
            <div className="space-y-3">
              {/* All raw punches */}
              {rawPunches.length > 0 && (() => {
                const STATE_LABELS = { '0':'Check-In','1':'Check-Out','2':'Break-Out','3':'Break-In','4':'OT-In','5':'OT-Out' };
                const STATE_COLORS = { '0':'text-green-700','1':'text-red-700','2':'text-orange-600','3':'text-blue-600','4':'text-purple-700','5':'text-purple-500' };
                return (
                  <div className="rounded bg-gray-50 border border-gray-100 p-2">
                    <p className="text-xs font-medium text-gray-500 mb-1.5">All Punches ({rawPunches.length})</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {rawPunches.map((p, i) => {
                        const d = new Date(p.punch_time);
                        const hhmm = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                        const s = String(p.punch_state ?? '');
                        return (
                          <span key={i} className="text-xs font-mono">
                            <span className={`font-medium ${STATE_COLORS[s] || 'text-gray-600'}`}>{STATE_LABELS[s] || `State ${s}`}</span>
                            <span className="text-gray-500 ml-1">{hhmm}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {isTwoShift && (
                <p className="text-xs font-semibold text-gray-500">{t('attendance.shift1')}</p>
              )}

              {/* Check-In row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-500">{t('attendance.checkIn')} — {t('attendance.original')}</Label>
                  <div className="mt-1 text-sm text-gray-600 font-mono">{origCheckIn || '—'}</div>
                </div>
                <div>
                  <Label className="text-xs">{t('attendance.checkIn')} — {t('attendance.corrected')}</Label>
                  <input type="time" value={correction.corrected_check_in}
                    onChange={e => setCorrection(c => ({ ...c, corrected_check_in: e.target.value }))}
                    className={timeInputClass} />
                </div>
              </div>

              {/* Check-Out row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-500">{t('attendance.checkOut')} — {t('attendance.original')}</Label>
                  <div className="mt-1 text-sm text-gray-600 font-mono">{origCheckOut || '—'}</div>
                </div>
                <div>
                  <Label className="text-xs">{t('attendance.checkOut')} — {t('attendance.corrected')}</Label>
                  <input type="time" value={correction.corrected_check_out}
                    onChange={e => setCorrection(c => ({ ...c, corrected_check_out: e.target.value }))}
                    className={timeInputClass} />
                  {correction.corrected_check_out && correction.corrected_check_in &&
                    parseInt(correction.corrected_check_out.split(':')[0], 10) < 8 && (
                    <p className="text-xs text-blue-600 mt-0.5">+1 (next day)</p>
                  )}
                </div>
              </div>

              {isTwoShift && (
                <>
                  <p className="text-xs font-semibold text-gray-500 pt-1">{t('attendance.shift2')}</p>

                  {/* Shift 2 Check-In row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-gray-500">{t('attendance.checkIn')} — {t('attendance.original')}</Label>
                      <div className="mt-1 text-sm text-gray-600 font-mono">{origCheckIn2 || '—'}</div>
                    </div>
                    <div>
                      <Label className="text-xs">{t('attendance.checkIn')} — {t('attendance.corrected')}</Label>
                      <input type="time" value={correction.corrected_check_in_2}
                        onChange={e => setCorrection(c => ({ ...c, corrected_check_in_2: e.target.value }))}
                        className={timeInputClass} />
                    </div>
                  </div>

                  {/* Shift 2 Check-Out row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-gray-500">{t('attendance.checkOut')} — {t('attendance.original')}</Label>
                      <div className="mt-1 text-sm text-gray-600 font-mono">{origCheckOut2 || '—'}</div>
                    </div>
                    <div>
                      <Label className="text-xs">{t('attendance.checkOut')} — {t('attendance.corrected')}</Label>
                      <input type="time" value={correction.corrected_check_out_2}
                        onChange={e => setCorrection(c => ({ ...c, corrected_check_out_2: e.target.value }))}
                        className={timeInputClass} />
                      {correction.corrected_check_out_2 && correction.corrected_check_in_2 &&
                        parseInt(correction.corrected_check_out_2.split(':')[0], 10) < 8 && (
                        <p className="text-xs text-blue-600 mt-0.5">+1 (next day)</p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* OT rows — only when OT punches exist or a correction already has OT times */}
              {showOtSection && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-gray-500">{t('attendance.otCheckIn')} — {t('attendance.original')}</Label>
                      <div className="mt-1 text-sm text-gray-600 font-mono">{origOtIn || '—'}</div>
                    </div>
                    <div>
                      <Label className="text-xs">{t('attendance.otCheckIn')} — {t('attendance.corrected')}</Label>
                      <input type="time" value={correction.corrected_ot_in}
                        onChange={e => setCorrection(c => ({ ...c, corrected_ot_in: e.target.value }))}
                        className={timeInputClass} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-gray-500">{t('attendance.otCheckOut')} — {t('attendance.original')}</Label>
                      <div className="mt-1 text-sm text-gray-600 font-mono">{origOtOut || '—'}</div>
                    </div>
                    <div>
                      <Label className="text-xs">{t('attendance.otCheckOut')} — {t('attendance.corrected')}</Label>
                      <input type="time" value={correction.corrected_ot_out}
                        onChange={e => setCorrection(c => ({ ...c, corrected_ot_out: e.target.value }))}
                        className={timeInputClass} />
                      {correction.corrected_ot_out && correction.corrected_ot_in &&
                        parseInt(correction.corrected_ot_out.split(':')[0], 10) < 8 && (
                        <p className="text-xs text-blue-600 mt-0.5">+1 (next day)</p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Correction note */}
              <div>
                <Label className="text-xs">{t('salary.note')}</Label>
                <Input value={correction.note}
                  onChange={e => setCorrection(c => ({ ...c, note: e.target.value }))}
                  placeholder="Reason for correction…" />
              </div>
            </div>
          )}
        </div>

        {/* Status / Hours / Note fields */}
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
          {t('attendance.manualEditWarning')}
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
              {t('attendance.originalValue')}: <StatusBadge status={originalValues.status} />
            </p>
            <Label>{t('common.status')}</Label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={selectClass}>
              {['PRESENT','ABSENT','LEAVE_PAID','LEAVE_UNPAID','OFF'].map(s => (
                <option key={s} value={s}>{t(`status.${s}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">
              {t('attendance.originalValue')}: {formatHours(originalValues.hours_worked)}
            </p>
            <Label>{t('attendance.hoursWorked')}</Label>
            <Input type="number" min="0" step="0.5" value={form.hours_worked}
              disabled={hasCorrectedTime}
              onChange={e => setForm(f => ({ ...f, hours_worked: e.target.value }))} />
            {hasCorrectedTime && (
              <p className="text-xs text-amber-600 mt-1">{t('attendance.hoursRecalculated')}</p>
            )}
          </div>
          <div>
            <Label>{t('common.description')}</Label>
            <textarea
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving || removing}>{saving ? '…' : t('common.save')}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AttendanceProcessingPage() {
  const { t }    = useTranslation();
  const { user } = useAuth();
  const isAdmin  = ADMIN_ACCOUNTANT.includes(user?.role);
  const canAct   = CAN_ACT_ROLES.includes(user?.role);

  const currentMonth = new Date().toISOString().slice(0, 7);

  const [month, setMonth]               = useState(currentMonth);
  const [employeeId, setEmployeeId]     = useState('');
  const [statusFilter, setStatus]       = useState('');
  const [employees, setEmployees]       = useState([]);
  const [records, setRecords]           = useState([]);
  const [recalculating, setRecalc]      = useState(false);
  const [clearing, setClearing]         = useState(false);
  const [toast, setToast]               = useState(null);
  const [editRecord, setEditRecord]     = useState(null);
  const [openDropdownId, setOpenDropdownId] = useState(null);

  useEffect(() => {
    api.get('/employees').then(setEmployees).catch(() => {});
  }, []);

  const fetchRecords = useCallback(() => {
    const [y, mo] = month.split('-').map(Number);
    const dateFrom = `${month}-01`;
    const dateTo   = `${month}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`;

    const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    if (employeeId)   params.set('employee_id', employeeId);
    if (statusFilter) params.set('status', statusFilter);
    api.get(`/attendance/daily?${params}`).then(res => setRecords(res.data)).catch(() => {});
  }, [month, employeeId, statusFilter]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!openDropdownId) return;
    function close() { setOpenDropdownId(null); }
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openDropdownId]);

  async function handleClear() {
    if (!employeeId) return;
    const emp = employees.find(e => String(e.id) === String(employeeId));
    const label = emp ? `${emp.name} — ${month}` : month;
    if (!window.confirm(`Clear and reprocess attendance for ${label}?\n\nThis will permanently delete all records and punch corrections for this employee/month and rebuild from raw punches.`)) return;
    setClearing(true);
    try {
      await api.post('/attendance/daily/clear', { employee_id: employeeId, month });
      setToast({ message: `Cleared and reprocessed ${label}`, type: 'success' });
      fetchRecords();
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setClearing(false);
    }
  }

  async function handleRecalculate() {
    setRecalc(true);
    try {
      const body = { month };
      if (employeeId) body.employee_id = employeeId;
      await api.post('/attendance/daily/recalculate', body);
      setToast({ message: t('attendance.recalculateSuccess'), type: 'success' });
      fetchRecords();
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setRecalc(false);
    }
  }

  async function handleAction(record, action) {
    setOpenDropdownId(null);
    try {
      switch (action) {
        case 'toggle_ot':
          await api.put(`/attendance/daily/${record.id}`, { ot_approved: !record.ot_approved });
          setToast({ message: t('attendance.approvalToggled'), type: 'success' });
          break;
        case 'toggle_late':
          await api.put(`/attendance/daily/${record.id}`, { late_approved: !record.late_approved });
          setToast({ message: t('attendance.approvalToggled'), type: 'success' });
          break;
        case 'flag_paid':
          await api.post('/attendance/leaves', {
            employee_id: record.employee_id,
            date:        String(record.date).slice(0, 10),
            leave_type:  'PAID',
          });
          setToast({ message: t('leave.recorded'), type: 'success' });
          break;
        case 'flag_unpaid':
          await api.post('/attendance/leaves', {
            employee_id: record.employee_id,
            date:        String(record.date).slice(0, 10),
            leave_type:  'UNPAID',
          });
          setToast({ message: t('leave.recorded'), type: 'success' });
          break;
        case 'remove_leave':
          if (!window.confirm(t('attendance.confirmRemoveLeave'))) return;
          await api.delete('/attendance/leaves', {
            employee_id: record.employee_id,
            date:        String(record.date).slice(0, 10),
          });
          setToast({ message: t('leave.removed'), type: 'success' });
          break;
        case 'edit':
          setEditRecord(record);
          return;
        default:
          return;
      }
      fetchRecords();
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  const totalPresent   = records.filter(r => r.status === 'PRESENT').length;
  const totalAbsent    = records.filter(r => r.status === 'ABSENT').length;
  const totalLeave     = records.filter(r => r.status === 'LEAVE_PAID' || r.status === 'LEAVE_UNPAID').length;
  const totalOtHours   = records.reduce((s, r) => s + parseFloat(r.ot_hours   || 0), 0);
  const totalLateHours = records.reduce((s, r) => s + parseFloat(r.late_hours || 0), 0);

  const selectClass = 'flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('attendance.processing')}</h1>
      </div>

      {/* ── Filters ── */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">{t('common.status')} / Month</Label>
              <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('employees.fullName')}</Label>
              <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className={`${selectClass} w-52`}>
                <option value="">— {t('common.all')} —</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.name} ({e.employee_code})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('common.status')}</Label>
              <select value={statusFilter} onChange={e => setStatus(e.target.value)} className={`${selectClass} w-40`}>
                <option value="">— {t('common.all')} —</option>
                {['PRESENT','ABSENT','LEAVE_PAID','LEAVE_UNPAID','OFF'].map(s => (
                  <option key={s} value={s}>{t(`status.${s}`)}</option>
                ))}
              </select>
            </div>
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={handleRecalculate} disabled={recalculating}>
                {recalculating ? t('attendance.recalculating') : t('attendance.recalculate')}
              </Button>
            )}
            {isAdmin && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleClear}
                disabled={clearing || !employeeId}
                title={!employeeId ? 'Select an employee first' : undefined}
                className="border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-40"
              >
                {clearing ? 'Clearing…' : 'Clear & Reprocess'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: t('summary.totalPresent'),   value: totalPresent,   color: 'text-green-700' },
          { label: t('summary.totalAbsent'),    value: totalAbsent,    color: 'text-red-700'   },
          { label: t('summary.totalLeave'),     value: totalLeave,     color: 'text-blue-700'  },
          { label: t('summary.totalOtHours'),   value: formatHours(totalOtHours),   color: 'text-purple-700' },
          { label: t('summary.totalLateHours'), value: formatHours(totalLateHours), color: 'text-orange-700' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="py-3 text-center">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Table ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{records.length} {t('common.noData') === t('common.noData') ? 'records' : ''}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {records.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">{t('common.noData')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left">
                    {!employeeId && <th className="px-3 py-2 font-medium text-muted-foreground">{t('attendance.employee')}</th>}
                    <th className="px-3 py-2 font-medium text-muted-foreground">{t('attendance.punchTime')}</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">{t('attendance.hoursWorked')}</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">{t('common.status')}</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">{t('attendance.lateHours')}</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground">{t('attendance.otHours')}</th>
                    {canAct && <th className="px-3 py-2 font-medium text-muted-foreground">{t('attendance.actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => {
                    const bothFlags = r.is_manually_edited && r.has_punch_correction;
                    const rowBg = bothFlags            ? 'bg-purple-50 hover:bg-purple-100'
                                : r.has_punch_correction ? 'bg-blue-50 hover:bg-blue-100'
                                : r.is_manually_edited   ? 'bg-amber-50 hover:bg-amber-100'
                                : 'hover:bg-gray-50';
                    const rowBorderStyle = bothFlags            ? { borderLeft: '3px solid #8B5CF6' }
                                        : r.has_punch_correction ? { borderLeft: '3px solid #3B82F6' }
                                        : r.is_manually_edited   ? { borderLeft: '3px solid #F59E0B' }
                                        : {};
                    return (
                    <tr key={r.id} className={`border-b ${rowBg}`} style={rowBorderStyle}>
                      {/* Employee */}
                      {!employeeId && (
                        <td className="px-3 py-2">
                          <p className="font-medium">{r.employee_name}</p>
                          <p className="text-xs text-muted-foreground">{r.employee_code}</p>
                        </td>
                      )}
                      {/* Date + edit badges */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <p>{fmtDate(r.date)}</p>
                        <p className="text-xs text-muted-foreground">{dayName(r.date)}</p>
                        {(r.is_manually_edited || r.has_punch_correction) && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {r.is_manually_edited && (
                              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                bothFlags ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                {t('attendance.editedBadge')}
                              </span>
                            )}
                            {r.has_punch_correction && (
                              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                bothFlags ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                              }`}>
                                {t('attendance.timeCorrectedBadge')}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      {/* Hours worked */}
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-0.5">
                          <div>
                            <span className={parseFloat(r.hours_worked) === 0 ? 'text-muted-foreground' : ''}>
                              {formatHours(r.hours_worked)}
                            </span>
                          </div>
                          {r.missing_punch === 'IN' && (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700">
                              {t('attendance.missingCheckIn')}
                            </span>
                          )}
                          {r.missing_punch === 'OUT' && (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700">
                              {t('attendance.missingCheckOut')}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Status */}
                      <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                      {/* Late hours — orange if approved, red if not */}
                      <td className="px-3 py-2">
                        {parseFloat(r.late_hours) > 0
                          ? <span className={`font-medium flex items-center gap-1 ${r.late_approved ? 'text-orange-600' : 'text-red-600'}`}>
                              {formatHours(r.late_hours)}
                              {r.late_approved && <span className="text-orange-600 font-bold text-xs">✓</span>}
                            </span>
                          : <span className="text-muted-foreground">—</span>
                        }
                      </td>
                      {/* OT hours — green if approved, gray if not */}
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-0.5">
                          {parseFloat(r.ot_hours) > 0
                            ? <span className={`font-medium flex items-center gap-1 ${r.ot_approved ? 'text-green-600' : 'text-gray-500'}`}>
                                {formatHours(r.ot_hours)}
                                {r.ot_approved && <span className="text-green-600 font-bold text-xs">✓</span>}
                              </span>
                            : <span className="text-muted-foreground">—</span>
                          }
                          {r.missing_punch === 'OT_IN' && (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700">
                              {t('attendance.missingOtCheckIn')}
                            </span>
                          )}
                          {r.missing_punch === 'OT_OUT' && (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700">
                              {t('attendance.missingOtCheckOut')}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Actions dropdown */}
                      {canAct && (
                        <td className="px-3 py-2">
                          <RowActionsDropdown
                            record={r}
                            userRole={user?.role}
                            isOpen={openDropdownId === r.id}
                            onToggle={() => setOpenDropdownId(prev => prev === r.id ? null : r.id)}
                            onAction={action => handleAction(r, action)}
                          />
                        </td>
                      )}
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Modals ── */}
      {editRecord && (
        <EditModal
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSaved={(msg) => { fetchRecords(); if (msg) setToast({ message: msg, type: 'success' }); }}
          userRole={user?.role}
        />
      )}

      {/* ── Toast ── */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
