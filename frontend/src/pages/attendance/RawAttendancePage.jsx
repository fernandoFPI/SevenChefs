import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext.jsx';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

const SYNC_ROLES = ['ADMIN', 'ACCOUNTANT'];

// ── Punch state config ───────────────────────────────────────────────────────
const PUNCH_STATE_CONFIG = {
  '0': { labelKey: 'punchState.checkIn',  color: 'bg-green-100 text-green-800'  },
  '1': { labelKey: 'punchState.checkOut', color: 'bg-blue-100 text-blue-800'    },
  '2': { labelKey: 'punchState.breakOut', color: 'bg-orange-100 text-orange-800'},
  '3': { labelKey: 'punchState.breakIn',  color: 'bg-orange-100 text-orange-800'},
  '4': { labelKey: 'punchState.otIn',     color: 'bg-purple-100 text-purple-800'},
  '5': { labelKey: 'punchState.otOut',    color: 'bg-purple-100 text-purple-800'},
};

// ── Utilities ────────────────────────────────────────────────────────────────
function relativeTime(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m} minute${m > 1 ? 's' : ''} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? 's' : ''} ago`;
}

function fmtDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString();
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const dd  = String(d.getDate()).padStart(2, '0');
  const mm  = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh  = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss  = String(d.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const { t } = useTranslation();
  const cfg = {
    SUCCESS: { cls: 'bg-green-100 text-green-800', label: 'SUCCESS' },
    FAILED:  { cls: 'bg-red-100 text-red-800',     label: 'FAILED'  },
    RUNNING: { cls: 'bg-yellow-100 text-yellow-800', label: 'RUNNING' },
  }[status] || { cls: 'bg-gray-100 text-gray-700', label: status };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>
      {status === 'RUNNING' && (
        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
      )}
      {cfg.label}
    </span>
  );
}

function PunchStateBadge({ state }) {
  const { t } = useTranslation();
  const cfg = PUNCH_STATE_CONFIG[String(state)];
  if (!cfg) {
    return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-gray-100 text-gray-700">{t('punchState.unknown')}</span>;
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      {t(cfg.labelKey)}
    </span>
  );
}

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);
  const colors = type === 'success' ? 'bg-green-600' : 'bg-red-600';
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${colors}`}>
      <span>{message}</span>
      <button onClick={onClose} className="ml-1 opacity-70 hover:opacity-100">✕</button>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function RawAttendancePage() {
  const { t }    = useTranslation();
  const { user } = useAuth();
  const canSync  = SYNC_ROLES.includes(user?.role);

  // Sync status
  const [syncStatus, setSyncStatus]   = useState(null);
  const [syncing, setSyncing]         = useState(false);
  const pollIntervalRef               = useRef(null);

  // Records
  const [records, setRecords]         = useState([]);
  const [pagination, setPagination]   = useState({ total: 0, page: 1, page_size: 50, total_pages: 0 });

  // Filters
  const [employees, setEmployees]     = useState([]);
  const [filters, setFilters]         = useState({ employee_id: '', date_from: '', date_to: '', unmatched: false });
  const [applied, setApplied]         = useState({ employee_id: '', date_from: '', date_to: '', unmatched: false });
  const [pageNum, setPageNum]         = useState(1);
  const [pageSize, setPageSize]       = useState(50);

  // Sync history drawer
  const [showHistory, setShowHistory] = useState(false);
  const [syncLogs, setSyncLogs]       = useState([]);

  // Toast
  const [toast, setToast]             = useState(null);

  // ── Data fetchers ──────────────────────────────────────────────────────────

  const fetchStatus = useCallback(() => {
    api.get('/attendance/sync/status').then(setSyncStatus).catch(() => {});
  }, []);

  const fetchRecords = useCallback(() => {
    const params = new URLSearchParams({ page: pageNum, page_size: pageSize });
    if (applied.employee_id) params.set('employee_id', applied.employee_id);
    if (applied.date_from)   params.set('date_from',   applied.date_from);
    if (applied.date_to)     params.set('date_to',     applied.date_to);
    if (applied.unmatched)   params.set('unmatched',   'true');
    api.get(`/attendance/raw?${params}`).then(res => {
      setRecords(res.data);
      setPagination(res.pagination);
    }).catch(() => {});
  }, [pageNum, pageSize, applied]);

  useEffect(() => {
    fetchStatus();
    fetchRecords();
    api.get('/employees').then(setEmployees).catch(() => {});
    const timer = setInterval(fetchStatus, 60_000);
    return () => clearInterval(timer);
  }, [fetchStatus, fetchRecords]);

  // ── Sync Now ───────────────────────────────────────────────────────────────

  async function handleSyncNow() {
    setSyncing(true);
    try {
      await api.post('/attendance/sync');
      setToast({ message: t('attendance.syncSuccess'), type: 'success' });
      fetchStatus();
      fetchRecords();
    } catch (err) {
      setToast({ message: `${t('attendance.syncFailed')}: ${err.message}`, type: 'error' });
    } finally {
      setSyncing(false);
    }
  }

  // ── Filters ────────────────────────────────────────────────────────────────

  function handleSearch() {
    setApplied({ ...filters });
    setPageNum(1);
  }

  function handleClear() {
    const empty = { employee_id: '', date_from: '', date_to: '', unmatched: false };
    setFilters(empty);
    setApplied(empty);
    setPageNum(1);
  }

  // ── History drawer ─────────────────────────────────────────────────────────

  function openHistory() {
    api.get('/attendance/sync/logs').then(res => setSyncLogs(res.data)).catch(() => {});
    setShowHistory(true);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const { total, page_size: ps, total_pages } = pagination;
  const fromRecord = total === 0 ? 0 : (pageNum - 1) * pageSize + 1;
  const toRecord   = Math.min(pageNum * pageSize, total);

  const lastSync = syncStatus?.last_sync;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('nav.rawAttendance')}</h1>
        <button
          onClick={openHistory}
          className="text-sm text-blue-600 hover:underline"
        >
          {t('attendance.viewSyncHistory')}
        </button>
      </div>

      {/* ── Sync Status Bar ── */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Left side */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-gray-700">{t('attendance.lastSync')}:</span>
              {lastSync ? (
                <>
                  <StatusBadge status={lastSync.status} />
                  <span className="text-sm text-gray-600" title={fmtDateTime(lastSync.completed_at || lastSync.started_at)}>
                    {fmtDateTime(lastSync.completed_at || lastSync.started_at)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t('attendance.fetched')}: {lastSync.records_fetched} &nbsp;|&nbsp;
                    {t('attendance.inserted')}: {lastSync.records_inserted} &nbsp;|&nbsp;
                    {t('attendance.skipped')}: {lastSync.records_skipped}
                  </span>
                  {lastSync.error_message && (
                    <span className="text-xs text-destructive">{lastSync.error_message}</span>
                  )}
                </>
              ) : (
                <span className="text-sm text-muted-foreground">{t('common.loading')}</span>
              )}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {syncStatus?.next_sync_in_minutes != null && (
                <span className="text-sm text-muted-foreground">
                  {t('attendance.nextSync')}: ~{syncStatus.next_sync_in_minutes} {t('attendance.minutes')}
                </span>
              )}
              {canSync && (
                <Button
                  size="sm"
                  onClick={handleSyncNow}
                  disabled={syncing || lastSync?.status === 'RUNNING'}
                >
                  {syncing ? t('attendance.syncing') : t('attendance.syncNow')}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Filters ── */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">{t('attendance.dateFrom')}</Label>
              <Input
                type="date"
                value={filters.date_from}
                onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('attendance.dateTo')}</Label>
              <Input
                type="date"
                value={filters.date_to}
                onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('employees.fullName')}</Label>
              <select
                value={filters.employee_id}
                onChange={e => setFilters(f => ({ ...f, employee_id: e.target.value }))}
                className="flex h-10 w-52 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">— {t('common.all')} —</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_code})</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <input
                id="unmatched-filter"
                type="checkbox"
                checked={filters.unmatched}
                onChange={e => setFilters(f => ({ ...f, unmatched: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="unmatched-filter" className="text-sm">{t('attendance.unmatchedOnly')}</label>
            </div>
            <Button size="sm" onClick={handleSearch}>{t('common.search')}</Button>
            <Button size="sm" variant="outline" onClick={handleClear}>{t('attendance.clear')}</Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Table ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {total > 0
              ? `${t('common.search')}: ${fromRecord}–${toRecord} / ${total}`
              : t('attendance.noRecords')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {records.length === 0 ? (
            <div className="p-8 text-center space-y-1">
              <p className="text-sm font-medium text-muted-foreground">{t('attendance.noRecords')}</p>
              <p className="text-xs text-muted-foreground">{t('attendance.runSyncHint')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left">
                    <th className="px-4 py-2 font-medium text-muted-foreground">{t('attendance.zkCode')}</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">{t('attendance.employee')}</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">{t('attendance.punchTime')}</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">{t('attendance.state')}</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">{t('attendance.device')}</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">{t('attendance.syncedAt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id} className="border-b hover:bg-gray-50">
                      {/* ZKBio Code */}
                      <td className="px-4 py-2">
                        <span className="font-mono">{r.zk_emp_code}</span>
                        {r.is_off_day_punch && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium">
                            {t('attendance.offDay')}
                          </span>
                        )}
                      </td>
                      {/* Employee */}
                      <td className="px-4 py-2">
                        {r.employee_name
                          ? <span>{r.employee_name}</span>
                          : <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium">
                              {t('attendance.unmatched')}
                            </span>
                        }
                      </td>
                      {/* Punch Time */}
                      <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">
                        {fmtDate(r.punch_time)}
                      </td>
                      {/* State */}
                      <td className="px-4 py-2">
                        <PunchStateBadge state={r.punch_state} />
                      </td>
                      {/* Device */}
                      <td className="px-4 py-2 text-muted-foreground">
                        {r.terminal_alias || r.terminal_sn || '—'}
                      </td>
                      {/* Synced At */}
                      <td className="px-4 py-2" title={fmtDateTime(r.synced_at)}>
                        <span className="text-xs text-muted-foreground">{relativeTime(r.synced_at)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Pagination ── */}
      {total_pages > 1 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {fromRecord}–{toRecord} / {total}
            </span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPageNum(1); }}
              className="h-8 rounded border border-input bg-background px-2 text-sm"
            >
              {[25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={pageNum === 1} onClick={() => setPageNum(p => p - 1)}>
              ‹ Prev
            </Button>
            <span className="text-sm">{pageNum} / {total_pages}</span>
            <Button variant="outline" size="sm" disabled={pageNum === total_pages} onClick={() => setPageNum(p => p + 1)}>
              Next ›
            </Button>
          </div>
        </div>
      )}

      {/* ── Sync History Drawer ── */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/40" onClick={() => setShowHistory(false)} />
          {/* Panel */}
          <div className="w-full max-w-2xl bg-white shadow-xl flex flex-col h-full">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">{t('attendance.syncHistory')}</h2>
              <button
                onClick={() => setShowHistory(false)}
                className="text-muted-foreground hover:text-gray-900 text-xl leading-none"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-2 py-1 text-muted-foreground">Started</th>
                    <th className="px-2 py-1 text-muted-foreground">Trigger</th>
                    <th className="px-2 py-1 text-muted-foreground">Status</th>
                    <th className="px-2 py-1 text-muted-foreground">Fetched</th>
                    <th className="px-2 py-1 text-muted-foreground">Inserted</th>
                    <th className="px-2 py-1 text-muted-foreground">Skipped</th>
                    <th className="px-2 py-1 text-muted-foreground">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {syncLogs.map(log => (
                    <tr key={log.id} className="border-b hover:bg-gray-50">
                      <td className="px-2 py-1.5 whitespace-nowrap">{fmtDateTime(log.started_at)}</td>
                      <td className="px-2 py-1.5">{log.trigger}</td>
                      <td className="px-2 py-1.5"><StatusBadge status={log.status} /></td>
                      <td className="px-2 py-1.5">{log.records_fetched}</td>
                      <td className="px-2 py-1.5">{log.records_inserted}</td>
                      <td className="px-2 py-1.5">{log.records_skipped}</td>
                      <td className="px-2 py-1.5 max-w-xs" title={log.error_message || ''}>
                        {log.error_message
                          ? <span className="text-destructive truncate block">{log.error_message}</span>
                          : '—'}
                      </td>
                    </tr>
                  ))}
                  {syncLogs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-2 py-4 text-center text-muted-foreground">
                        {t('common.noData')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
