const db = require('../config/db');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

async function getMonthlyReport(req, res) {
  try {
    const monthStr = req.query.month || getPrevMonth();
    const [year, monthNum] = monthStr.split('-').map(Number);
    const monthStart = `${monthStr}-01`;
    const lastDay    = new Date(year, monthNum, 0).getDate();
    const monthEnd   = `${monthStr}-${String(lastDay).padStart(2, '0')}`;

    const { rows } = await db.query(
      `SELECT
         e.id AS employee_id,
         e.name AS employee_name,
         e.employee_code,
         e.currency,
         COUNT(*) FILTER (WHERE ad.status = 'PRESENT')      AS present_days,
         COUNT(*) FILTER (WHERE ad.status = 'ABSENT')       AS absent_days,
         COUNT(*) FILTER (WHERE ad.status = 'LEAVE_PAID')   AS paid_leave_days,
         COUNT(*) FILTER (WHERE ad.status = 'LEAVE_UNPAID') AS unpaid_leave_days,
         COUNT(*) FILTER (WHERE ad.status = 'OFF')          AS off_days,
         COALESCE(SUM(ad.hours_worked), 0)                                                              AS total_hours_worked,
         COALESCE(SUM(ad.ot_hours) FILTER (WHERE ad.ot_approved = true), 0)                            AS approved_ot_hours,
         COALESCE(SUM(ad.late_hours) FILTER (WHERE ad.late_approved = false AND ad.status='PRESENT'),0) AS unapproved_late_hours,
         COALESCE(SUM(ad.late_hours) FILTER (WHERE ad.late_approved = true  AND ad.status='PRESENT'),0) AS approved_late_hours
       FROM employees e
       JOIN attendance_daily ad ON ad.employee_id = e.id
       WHERE ad.date >= $1 AND ad.date <= $2 AND e.is_active = true
       GROUP BY e.id, e.name, e.employee_code
       ORDER BY e.name ASC`,
      [monthStart, monthEnd]
    );

    const summary = rows.reduce((s, r) => {
      s.totalPresent      += parseInt(r.present_days)        || 0;
      s.totalAbsent       += parseInt(r.absent_days)         || 0;
      s.totalLeave        += (parseInt(r.paid_leave_days) || 0) + (parseInt(r.unpaid_leave_days) || 0);
      s.totalOtHours      += parseFloat(r.approved_ot_hours) || 0;
      s.totalLateHours    += (parseFloat(r.unapproved_late_hours) || 0) + (parseFloat(r.approved_late_hours) || 0);
      return s;
    }, { totalPresent: 0, totalAbsent: 0, totalLeave: 0, totalOtHours: 0, totalLateHours: 0 });

    res.json({ month: monthStr, summary, data: rows });
  } catch (err) {
    console.error('[reports] getMonthlyReport:', err.message);
    res.status(500).json({ message: 'Failed to fetch monthly report' });
  }
}

async function exportMonthlyReport(req, res) {
  try {
    const monthStr = req.query.month || getPrevMonth();
    const format   = (req.query.format || 'excel').toLowerCase();
    const [year, monthNum] = monthStr.split('-').map(Number);
    const monthStart = `${monthStr}-01`;
    const lastDay    = new Date(year, monthNum, 0).getDate();
    const monthEnd   = `${monthStr}-${String(lastDay).padStart(2, '0')}`;

    const { rows } = await db.query(
      `SELECT
         e.name AS employee_name, e.employee_code, e.currency,
         COUNT(*) FILTER (WHERE ad.status = 'PRESENT')      AS present_days,
         COUNT(*) FILTER (WHERE ad.status = 'ABSENT')       AS absent_days,
         COUNT(*) FILTER (WHERE ad.status = 'LEAVE_PAID')   AS paid_leave_days,
         COUNT(*) FILTER (WHERE ad.status = 'LEAVE_UNPAID') AS unpaid_leave_days,
         COUNT(*) FILTER (WHERE ad.status = 'OFF')          AS off_days,
         COALESCE(SUM(ad.hours_worked), 0)                                                              AS total_hours_worked,
         COALESCE(SUM(ad.ot_hours) FILTER (WHERE ad.ot_approved = true), 0)                            AS approved_ot_hours,
         COALESCE(SUM(ad.late_hours) FILTER (WHERE ad.late_approved = false AND ad.status='PRESENT'),0) AS unapproved_late_hours,
         COALESCE(SUM(ad.late_hours) FILTER (WHERE ad.late_approved = true  AND ad.status='PRESENT'),0) AS approved_late_hours
       FROM employees e
       JOIN attendance_daily ad ON ad.employee_id = e.id
       WHERE ad.date >= $1 AND ad.date <= $2 AND e.is_active = true
       GROUP BY e.id, e.name, e.employee_code
       ORDER BY e.name ASC`,
      [monthStart, monthEnd]
    );

    if (format === 'pdf') {
      return exportAttendancePDF(rows, monthStr, res);
    }
    return exportAttendanceExcel(rows, monthStr, res);
  } catch (err) {
    console.error('[reports] exportMonthlyReport:', err.message);
    res.status(500).json({ message: 'Export failed' });
  }
}

function exportAttendancePDF(rows, month, res) {
  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-${month}.pdf"`);
  doc.pipe(res);

  doc.fontSize(13).font('Helvetica-Bold').text(`Monthly Attendance Report – ${month}`, { align: 'center' });
  doc.moveDown(0.8);

  const cols = [
    { label: 'Employee',    key: 'employee_name',       w: 130 },
    { label: 'Code',        key: 'employee_code',        w: 55 },
    { label: 'Present',     key: 'present_days',         w: 50 },
    { label: 'Absent',      key: 'absent_days',          w: 50 },
    { label: 'Paid Leave',  key: 'paid_leave_days',      w: 65 },
    { label: 'Unpaid Lv',   key: 'unpaid_leave_days',    w: 65 },
    { label: 'Off',         key: 'off_days',             w: 40 },
    { label: 'Hrs Worked',  key: 'total_hours_worked',   w: 65 },
    { label: 'OT Hrs',      key: 'approved_ot_hours',    w: 55 },
    { label: 'Late Hrs',    key: 'unapproved_late_hours', w: 55 },
  ];

  const startX = 40;
  let headerY = doc.y;

  doc.fontSize(8).font('Helvetica-Bold');
  let cx = startX;
  cols.forEach(col => {
    doc.text(col.label, cx, headerY, { width: col.w });
    cx += col.w;
  });

  const tableW = cols.reduce((s, c) => s + c.w, 0);
  doc.moveDown(0.3);
  doc.moveTo(startX, doc.y).lineTo(startX + tableW, doc.y).strokeColor('#888').stroke();
  doc.moveDown(0.2);

  doc.font('Helvetica').fontSize(8);
  rows.forEach(row => {
    const ry = doc.y;
    cx = startX;
    cols.forEach(col => {
      let val = row[col.key];
      if (['total_hours_worked','approved_ot_hours','unapproved_late_hours'].includes(col.key)) {
        val = parseFloat(val).toFixed(2);
      }
      doc.text(String(val ?? ''), cx, ry, { width: col.w });
      cx += col.w;
    });
    doc.moveDown(0.35);

    if (doc.y > 540) {
      doc.addPage();
    }
  });

  doc.end();
}

async function exportAttendanceExcel(rows, month, res) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Attendance ${month}`);

  ws.columns = [
    { header: 'Employee',        key: 'employee_name',        width: 22 },
    { header: 'Code',            key: 'employee_code',         width: 10 },
    { header: 'Currency',        key: 'currency',              width: 10 },
    { header: 'Present',         key: 'present_days',          width: 10 },
    { header: 'Absent',          key: 'absent_days',           width: 10 },
    { header: 'Paid Leave',      key: 'paid_leave_days',       width: 12 },
    { header: 'Unpaid Leave',    key: 'unpaid_leave_days',     width: 14 },
    { header: 'Off',             key: 'off_days',              width: 8 },
    { header: 'Hours Worked',    key: 'total_hours_worked',    width: 14 },
    { header: 'Approved OT Hrs', key: 'approved_ot_hours',     width: 16 },
    { header: 'Late Hrs (Unapp)', key: 'unapproved_late_hours', width: 17 },
    { header: 'Late Hrs (App)',  key: 'approved_late_hours',   width: 15 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

  rows.forEach(row => {
    ws.addRow({
      employee_name:        row.employee_name,
      employee_code:        row.employee_code,
      currency:             row.currency || 'IQD',
      present_days:         parseInt(row.present_days)          || 0,
      absent_days:          parseInt(row.absent_days)           || 0,
      paid_leave_days:      parseInt(row.paid_leave_days)       || 0,
      unpaid_leave_days:    parseInt(row.unpaid_leave_days)     || 0,
      off_days:             parseInt(row.off_days)              || 0,
      total_hours_worked:   parseFloat(row.total_hours_worked)  || 0,
      approved_ot_hours:    parseFloat(row.approved_ot_hours)   || 0,
      unapproved_late_hours:parseFloat(row.unapproved_late_hours)||0,
      approved_late_hours:  parseFloat(row.approved_late_hours) || 0,
    });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-${month}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

function getPrevMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

module.exports = { getMonthlyReport, exportMonthlyReport };
