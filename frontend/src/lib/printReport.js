function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatMins(decimalHours) {
  const total = Math.round((parseFloat(decimalHours) || 0) * 60);
  const h = Math.floor(Math.abs(total) / 60);
  const m = Math.abs(total) % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function formatMoney(amount, currency) {
  const n = parseFloat(amount) || 0;
  if (currency === 'USD') {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USD';
  }
  return Math.round(n).toLocaleString('en-US') + ' IQD';
}

function punchTimeToHHMM(punchTime) {
  if (!punchTime) return null;
  const d = new Date(punchTime);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function pageHeader(sal, companyName, companyLogo, dateFrom, dateTo, t) {
  const logoHtml = companyLogo
    ? `<img src="${companyLogo}" style="max-height:60px; object-fit:contain; vertical-align:middle;" />`
    : '';
  return `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
      <div style="display:flex; align-items:center; gap:12px;">
        ${logoHtml}
        <div style="font-size:16pt; font-weight:bold;">${esc(companyName)}</div>
      </div>
      <div style="text-align:right; font-size:9pt; color:#333; line-height:1.6;">
        <div style="font-weight:bold;">${esc(companyName)} Attendance &amp; Payroll Report</div>
        <div>${t('print.employee')}: ${esc(sal.employee_name)} (ID: ${esc(sal.employee_code)})</div>
        <div>${t('print.period')}: ${dateFrom} — ${dateTo}</div>
      </div>
    </div>
    <hr style="border:none; border-top:2px solid #3D2B1F; margin-bottom:16px;" />
  `;
}

export function buildPrintHTML({
  approvedRecords,
  dailyByEmployee,
  rawByEmployeeDate,
  corrections,
  companyName,
  companyLogo,
  month,
  t,
}) {
  const [year, monthNum] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNum, 0).getDate();
  const dateFrom = `${month}-01`;
  const dateTo   = `${month}-${String(lastDay).padStart(2, '0')}`;

  return approvedRecords.map((sal, idx) => {
    const dayRecords = (dailyByEmployee[sal.employee_id] || [])
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));
    const isLast = idx === approvedRecords.length - 1;
    const pageClass = isLast ? 'employee-report employee-report-last' : 'employee-report';

    // ── Attendance rows ───────────────────────────────────────────
    const nonOffDays = dayRecords.filter(d => d.status !== 'OFF');
    const attendanceRows = nonOffDays.map((d, rowIdx) => {
      let checkIn = '—', checkOut = '—';
      const cor = corrections[d.id];

      if (cor) {
        checkIn  = cor.corrected_check_in  || cor.original_check_in  || '—';
        checkOut = cor.corrected_check_out || cor.original_check_out || '—';
      } else {
        const key = `${d.employee_id}_${d.date}`;
        const dayPunches = rawByEmployeeDate[key] || [];
        const checkInPunch = dayPunches.find(p => String(p.punch_state) === '0');
        const checkOutPunches = dayPunches.filter(p => String(p.punch_state) === '1');
        const checkOutPunch = checkOutPunches.length ? checkOutPunches[checkOutPunches.length - 1] : null;
        checkIn  = punchTimeToHHMM(checkInPunch?.punch_time)  || '—';
        checkOut = punchTimeToHHMM(checkOutPunch?.punch_time) || '—';
      }

      let statusText = '';
      if (d.status === 'PRESENT') {
        const late = parseFloat(d.late_hours) || 0;
        statusText = late === 0
          ? t('print.onTime')
          : `${t('print.under')}: ${formatMins(late)} ${t('print.short')}`;
      } else if (d.status === 'ABSENT') {
        statusText = t('print.noRecord');
      } else if (d.status === 'LEAVE_PAID') {
        statusText = t('print.paidLeave');
      } else if (d.status === 'LEAVE_UNPAID') {
        statusText = t('print.unpaidLeave');
      }

      const bg = rowIdx % 2 === 1 ? '#F5F5F5' : '#FFFFFF';
      const hoursDisplay = d.status === 'ABSENT' ? '0h 00m' : formatMins(d.hours_worked);
      return `
        <tr style="background:${bg};">
          <td style="padding:4px 8px; border-bottom:1px solid #E0E0E0; font-size:9pt;">${esc(d.date)}</td>
          <td style="padding:4px 8px; border-bottom:1px solid #E0E0E0; font-size:9pt;">${checkIn}</td>
          <td style="padding:4px 8px; border-bottom:1px solid #E0E0E0; font-size:9pt;">${checkOut}</td>
          <td style="padding:4px 8px; border-bottom:1px solid #E0E0E0; font-size:9pt;">${hoursDisplay}</td>
          <td style="padding:4px 8px; border-bottom:1px solid #E0E0E0; font-size:9pt;">${esc(statusText)}</td>
        </tr>`;
    }).join('');

    // ── Salary summary row ────────────────────────────────────────
    const currency     = sal.currency || 'IQD';
    const presentDays  = dayRecords.filter(d => d.status === 'PRESENT').length;
    const absentDays   = dayRecords.filter(d => d.status === 'ABSENT').length;
    const paidLeave    = dayRecords.filter(d => d.status === 'LEAVE_PAID').length;
    const unpaidLeave  = dayRecords.filter(d => d.status === 'LEAVE_UNPAID').length;
    const offDays      = dayRecords.filter(d => d.status === 'OFF').length;
    const totalHours   = dayRecords.reduce((s, d) => s + (parseFloat(d.hours_worked) || 0), 0);
    const totalLateHrs = dayRecords.reduce((s, d) => s + (parseFloat(d.late_hours) || 0), 0);

    const hourlyRate   = parseFloat(sal.hourly_rate)              || 0;
    const unapprLate   = parseFloat(sal.unapproved_late_hours)    || 0;
    const apprLate     = parseFloat(sal.approved_late_hours)      || 0;
    const latePenUnapp = parseFloat(sal.late_penalty_unapproved)  || 1.5;
    const latePenApp   = parseFloat(sal.late_penalty_approved)    || 1.0;
    const dailyRate    = parseFloat(sal.daily_rate)               || 0;
    const absentCount  = parseInt(sal.total_absent_days)          || 0;
    const unpaidCount  = parseInt(sal.total_unpaid_leave_days)    || 0;
    const baseSalary   = parseFloat(sal.base_salary)              || 0;
    const approvedOt   = parseFloat(sal.approved_ot_hours)        || 0;
    const bonus        = parseFloat(sal.bonus)                    || 0;

    const basePay  = baseSalary - (absentCount * dailyRate) - (unpaidCount * dailyRate);
    const lateDed  = (unapprLate * hourlyRate * latePenUnapp) + (apprLate * hourlyRate * latePenApp);

    const summaryCols = [
      { labelKey: 'print.presentDays',  value: presentDays },
      { labelKey: 'print.absentDays',   value: absentDays },
      { labelKey: 'print.leave',        value: paidLeave + unpaidLeave },
      { labelKey: 'print.offDays',      value: offDays },
      { labelKey: 'print.hoursWorked',  value: formatMins(totalHours) },
      { labelKey: 'print.baseSalary',   value: formatMoney(basePay,          currency) },
      { labelKey: 'print.hourlyPay',    value: formatMoney(hourlyRate,        currency) },
      { labelKey: 'print.otHrs',        value: approvedOt.toFixed(2) + 'h' },
      { labelKey: 'print.lateHrs',      value: formatMins(totalLateHrs) },
      { labelKey: 'print.bonus',        value: bonus > 0 ? formatMoney(bonus, currency) : '—' },
      { labelKey: 'print.deductions',   value: lateDed > 0 ? formatMoney(lateDed, currency) : '—' },
      { labelKey: 'print.netSalary',    value: formatMoney(sal.net_salary, currency), bold: true },
    ];

    const summaryHeaderCells = summaryCols.map(c =>
      `<th style="padding:6px 8px; font-size:8pt; text-align:left; font-weight:bold; white-space:nowrap;">${esc(t(c.labelKey))}</th>`
    ).join('');
    const summaryDataCells = summaryCols.map(c =>
      `<td style="padding:4px 8px; border-bottom:1px solid #E0E0E0; font-size:${c.bold ? '10pt' : '8pt'}; font-weight:${c.bold ? 'bold' : 'normal'}; white-space:nowrap;">${esc(c.value)}</td>`
    ).join('');

    const header = pageHeader(sal, companyName, companyLogo, dateFrom, dateTo, t);

    return `
      <div class="${pageClass}">
        ${header}

        <div style="font-size:12pt; font-weight:bold; margin-bottom:8px;">${t('print.attendance')}</div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
          <thead>
            <tr style="background:#3D2B1F; color:white;">
              <th style="padding:6px 8px; font-size:9pt; text-align:left; font-weight:bold;">Date</th>
              <th style="padding:6px 8px; font-size:9pt; text-align:left; font-weight:bold;">Check In</th>
              <th style="padding:6px 8px; font-size:9pt; text-align:left; font-weight:bold;">Check Out</th>
              <th style="padding:6px 8px; font-size:9pt; text-align:left; font-weight:bold;">Hours</th>
              <th style="padding:6px 8px; font-size:9pt; text-align:left; font-weight:bold;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${attendanceRows || `<tr><td colspan="5" style="padding:8px; font-size:9pt; text-align:center; color:#666;">No attendance data</td></tr>`}
          </tbody>
        </table>

        <div style="font-size:12pt; font-weight:bold; margin-bottom:8px;">${t('print.salarySummary')}</div>
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="background:#3D2B1F; color:white;">${summaryHeaderCells}</tr>
          </thead>
          <tbody>
            <tr style="background:#FFFFFF;">${summaryDataCells}</tr>
          </tbody>
        </table>

        <div style="display:flex; justify-content:space-between; margin-top:60px;">
          <div style="text-align:center; width:200px;">
            <div style="border-top:1px solid #000; padding-top:8px; font-size:9pt;">
              ${t('print.employeeSignature')}
            </div>
          </div>
          <div style="text-align:center; width:200px;">
            <div style="border-top:1px solid #000; padding-top:8px; font-size:9pt;">
              ${t('print.authorizedSignature')}
            </div>
          </div>
        </div>
        <div style="text-align:center; margin-top:20px; font-size:8pt; color:#666;">
          ${t('print.signatureNote')}
        </div>
      </div>`;
  }).join('');
}
