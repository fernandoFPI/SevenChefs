const db = require('../config/db');
const { calculateAllSalaries, recomputeNet } = require('../services/salaryService');
const { createNotification } = require('../services/notificationService');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

function getPrevMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

// POST /api/salary/calculate
async function calculate(req, res) {
  try {
    const month = req.body.month || getPrevMonth();

    // Refuse if any record for this month is locked (SUBMITTED or APPROVED).
    const { rows: locked } = await db.query(
      `SELECT id FROM salary_records
       WHERE period_month = $1 AND status IN ('SUBMITTED','APPROVED')
       LIMIT 1`,
      [month]
    );
    if (locked.length) {
      return res.status(400).json({
        message: 'Cannot recalculate: one or more records for this month are submitted or approved. Reject them first.',
      });
    }

    const count = await calculateAllSalaries(month);
    res.json({ message: 'Calculation complete', count });
  } catch (err) {
    console.error('[salary] calculate:', err.message);
    res.status(500).json({ message: 'Calculation failed' });
  }
}

// GET /api/salary
async function list(req, res) {
  try {
    const month = req.query.month || getPrevMonth();
    const { rows } = await db.query(
      `SELECT sr.*, e.name AS employee_name, e.employee_code, e.currency AS employee_currency
       FROM salary_records sr
       JOIN employees e ON e.id = sr.employee_id
       WHERE sr.period_month = $1
       ORDER BY sr.currency ASC, e.name ASC`,
      [month]
    );
    res.json({ month, data: rows });
  } catch (err) {
    console.error('[salary] list:', err.message);
    res.status(500).json({ message: 'Failed to fetch salary records' });
  }
}

// PUT /api/salary/:id  (DRAFT only — admin/accountant)
async function update(req, res) {
  try {
    const { id } = req.params;
    const { rows: cur } = await db.query('SELECT * FROM salary_records WHERE id = $1', [id]);
    if (!cur.length) return res.status(404).json({ message: 'Record not found' });
    if (cur[0].status !== 'DRAFT') return res.status(400).json({ message: 'Only DRAFT records can be edited' });

    const r = { ...cur[0] };
    const fields = ['ot_hours_override', 'late_hours_override', 'bonus', 'deductions', 'note'];
    fields.forEach(f => {
      if (req.body[f] !== undefined) r[f] = req.body[f];
    });

    const { net, overclaim_deduction } = recomputeNet(r);
    r.net_salary = net;
    r.overclaim_deduction = overclaim_deduction;

    const { rows } = await db.query(
      `UPDATE salary_records SET
         ot_hours_override   = $1,
         late_hours_override = $2,
         bonus               = $3,
         deductions          = $4,
         note                = $5,
         net_salary          = $6,
         overclaim_deduction = $7,
         updated_at          = NOW()
       WHERE id = $8
       RETURNING *`,
      [r.ot_hours_override, r.late_hours_override, r.bonus, r.deductions, r.note, r.net_salary, r.overclaim_deduction, id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[salary] update:', err.message);
    res.status(500).json({ message: 'Failed to update record' });
  }
}

// POST /api/salary/submit  (body: { month })
async function submit(req, res) {
  try {
    const month = req.body.month || getPrevMonth();
    const { rowCount } = await db.query(
      `UPDATE salary_records
       SET status = 'SUBMITTED', submitted_at = NOW(), updated_at = NOW()
       WHERE period_month = $1 AND status = 'DRAFT'`,
      [month]
    );
    res.json({ message: 'Submitted', count: rowCount });
  } catch (err) {
    console.error('[salary] submit:', err.message);
    res.status(500).json({ message: 'Submit failed' });
  }
}

// POST /api/salary/:id/approve
async function approveOne(req, res) {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      `UPDATE salary_records
       SET status = 'APPROVED', approved_at = NOW(), approved_by = $1, updated_at = NOW()
       WHERE id = $2 AND status = 'SUBMITTED'
       RETURNING *`,
      [req.user.id, id]
    );
    if (!rows.length) return res.status(400).json({ message: 'Record not found or not in SUBMITTED state' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[salary] approveOne:', err.message);
    res.status(500).json({ message: 'Approve failed' });
  }
}

// POST /api/salary/approve-all  (body: { month })
async function approveAll(req, res) {
  try {
    const month = req.body.month || getPrevMonth();
    const { rowCount } = await db.query(
      `UPDATE salary_records
       SET status = 'APPROVED', approved_at = NOW(), approved_by = $1, updated_at = NOW()
       WHERE period_month = $2 AND status = 'SUBMITTED'`,
      [req.user.id, month]
    );
    res.json({ message: 'All approved', count: rowCount });
  } catch (err) {
    console.error('[salary] approveAll:', err.message);
    res.status(500).json({ message: 'Approve all failed' });
  }
}

// POST /api/salary/:id/reject  (body: { note })
// Returns record to DRAFT so accountant can edit and resubmit.
async function rejectOne(req, res) {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      `UPDATE salary_records
       SET status = 'DRAFT', note = COALESCE($1, note), updated_at = NOW()
       WHERE id = $2 AND status = 'SUBMITTED'
       RETURNING *, (SELECT e.name FROM employees e WHERE e.id = salary_records.employee_id) AS employee_name`,
      [req.body.note || null, id]
    );
    if (!rows.length) return res.status(400).json({ message: 'Record not found or not in SUBMITTED state' });

    const record = rows[0];

    // Notify all ACCOUNTANT users.
    const { rows: accountants } = await db.query(
      `SELECT id FROM users WHERE role = 'ACCOUNTANT'`
    );
    const noteText = req.body.note ? ` Note: ${req.body.note}` : '';
    const noteAr   = req.body.note ? ` ملاحظة: ${req.body.note}` : '';
    for (const acc of accountants) {
      await createNotification({
        userId:    acc.id,
        type:      'SALARY_REJECTED',
        message:   `Salary record for ${record.employee_name} (${record.period_month}) was rejected and returned to Draft.${noteText}`,
        messageAr: `تم رفض سجل راتب ${record.employee_name} (${record.period_month}) وإعادته إلى المسودة.${noteAr}`,
      });
    }

    res.json(record);
  } catch (err) {
    console.error('[salary] rejectOne:', err.message);
    res.status(500).json({ message: 'Reject failed' });
  }
}

// GET /api/salary/export?month=YYYY-MM&format=pdf|excel
async function exportSalary(req, res) {
  try {
    const month  = req.query.month || getPrevMonth();
    const format = (req.query.format || 'excel').toLowerCase();

    const { rows } = await db.query(
      `SELECT sr.*, e.name AS employee_name, e.employee_code
       FROM salary_records sr
       JOIN employees e ON e.id = sr.employee_id
       WHERE sr.period_month = $1
       ORDER BY sr.currency ASC, e.name ASC`,
      [month]
    );

    if (format === 'pdf') return exportSalaryPDF(rows, month, res);
    return exportSalaryExcel(rows, month, res);
  } catch (err) {
    console.error('[salary] export:', err.message);
    res.status(500).json({ message: 'Export failed' });
  }
}

function formatMoney(val, currency) {
  const n = parseFloat(val) || 0;
  if (currency === 'USD') return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USD';
  return Math.round(n).toLocaleString('en-US') + ' IQD';
}

function exportSalaryPDF(rows, month, res) {
  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="salary-${month}.pdf"`);
  doc.pipe(res);

  doc.fontSize(13).font('Helvetica-Bold').text(`Salary Report – ${month}`, { align: 'center' });
  doc.moveDown(0.8);

  const cols = [
    { label: 'Employee',     key: 'employee_name',  w: 110 },
    { label: 'Code',         key: 'employee_code',   w: 50 },
    { label: 'Currency',     key: 'currency',        w: 45 },
    { label: 'Base Salary',  key: 'base_salary',     w: 70 },
    { label: 'Present',      key: 'total_present_days', w: 45 },
    { label: 'Absent',       key: 'total_absent_days',  w: 45 },
    { label: 'OT Hrs',       key: 'approved_ot_hours',  w: 45 },
    { label: 'Late Hrs',     key: 'unapproved_late_hours', w: 50 },
    { label: 'Bonus',        key: 'bonus',            w: 55 },
    { label: 'Deductions',   key: 'deductions',       w: 60 },
    { label: 'Net Salary',   key: 'net_salary',       w: 80 },
    { label: 'Status',       key: 'status',           w: 55 },
  ];

  const startX = 40;

  const currencies = [...new Set(rows.map(r => r.currency || 'IQD'))].sort();
  for (const cur of currencies) {
    const group = rows.filter(r => (r.currency || 'IQD') === cur);
    if (!group.length) continue;

    doc.fontSize(10).font('Helvetica-Bold').text(`${cur} Employees`, { underline: true });
    doc.moveDown(0.4);

    let headerY = doc.y;
    doc.fontSize(8).font('Helvetica-Bold');
    let cx = startX;
    cols.forEach(col => { doc.text(col.label, cx, headerY, { width: col.w }); cx += col.w; });

    const tableW = cols.reduce((s, c) => s + c.w, 0);
    doc.moveDown(0.3);
    doc.moveTo(startX, doc.y).lineTo(startX + tableW, doc.y).strokeColor('#888').stroke();
    doc.moveDown(0.2);

    doc.font('Helvetica').fontSize(8);
    let totalNet = 0;
    group.forEach(row => {
      const ry = doc.y;
      cx = startX;
      cols.forEach(col => {
        let val = row[col.key];
        if (['base_salary', 'bonus', 'deductions', 'net_salary'].includes(col.key)) {
          val = formatMoney(val, row.currency || 'IQD');
        } else if (['approved_ot_hours', 'unapproved_late_hours'].includes(col.key)) {
          val = parseFloat(val).toFixed(2);
        }
        doc.text(String(val ?? ''), cx, ry, { width: col.w });
        cx += col.w;
      });
      totalNet += parseFloat(row.net_salary) || 0;
      doc.moveDown(0.35);
      if (doc.y > 540) doc.addPage();
    });

    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').fontSize(8).text(`Total Net (${cur}): ${formatMoney(totalNet, cur)}`, { align: 'right' });
    doc.moveDown(0.6);
  }

  doc.end();
}

async function exportSalaryExcel(rows, month, res) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Salary ${month}`);

  ws.columns = [
    { header: 'Employee',        key: 'employee_name',          width: 22 },
    { header: 'Code',            key: 'employee_code',           width: 10 },
    { header: 'Currency',        key: 'currency',                width: 10 },
    { header: 'Base Salary',     key: 'base_salary',             width: 14 },
    { header: 'Present Days',    key: 'total_present_days',      width: 13 },
    { header: 'Absent Days',     key: 'total_absent_days',       width: 12 },
    { header: 'Paid Leave',      key: 'total_paid_leave_days',   width: 12 },
    { header: 'Unpaid Leave',    key: 'total_unpaid_leave_days', width: 14 },
    { header: 'Approved OT Hrs', key: 'approved_ot_hours',       width: 16 },
    { header: 'Late Hrs (Unapp)',key: 'unapproved_late_hours',    width: 17 },
    { header: 'Late Hrs (App)',  key: 'approved_late_hours',     width: 15 },
    { header: 'OT Override',     key: 'ot_hours_override',       width: 13 },
    { header: 'Late Override',   key: 'late_hours_override',     width: 14 },
    { header: 'Bonus',           key: 'bonus',                   width: 12 },
    { header: 'Deductions',      key: 'deductions',              width: 12 },
    { header: 'Net Salary',      key: 'net_salary',              width: 14 },
    { header: 'Status',          key: 'status',                  width: 12 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

  const currencies = [...new Set(rows.map(r => r.currency || 'IQD'))].sort();
  for (const cur of currencies) {
    const group = rows.filter(r => (r.currency || 'IQD') === cur);
    if (!group.length) continue;

    const headerRow = ws.addRow([`── ${cur} Employees ──`]);
    headerRow.font = { bold: true, italic: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cur === 'USD' ? 'FFE2EFDA' : 'FFFFF2CC' } };

    let totalNet = 0;
    group.forEach(row => {
      ws.addRow({
        employee_name:           row.employee_name,
        employee_code:           row.employee_code,
        currency:                row.currency || 'IQD',
        base_salary:             parseFloat(row.base_salary)             || 0,
        total_present_days:      parseInt(row.total_present_days)        || 0,
        total_absent_days:       parseInt(row.total_absent_days)         || 0,
        total_paid_leave_days:   parseInt(row.total_paid_leave_days)     || 0,
        total_unpaid_leave_days: parseInt(row.total_unpaid_leave_days)   || 0,
        approved_ot_hours:       parseFloat(row.approved_ot_hours)       || 0,
        unapproved_late_hours:   parseFloat(row.unapproved_late_hours)   || 0,
        approved_late_hours:     parseFloat(row.approved_late_hours)     || 0,
        ot_hours_override:       row.ot_hours_override !== null ? parseFloat(row.ot_hours_override) : '',
        late_hours_override:     row.late_hours_override !== null ? parseFloat(row.late_hours_override) : '',
        bonus:                   parseFloat(row.bonus)                   || 0,
        deductions:              parseFloat(row.deductions)              || 0,
        net_salary:              parseFloat(row.net_salary)              || 0,
        status:                  row.status,
      });
      totalNet += parseFloat(row.net_salary) || 0;
    });

    const totalRow = ws.addRow({ employee_name: `Total Net (${cur})`, net_salary: totalNet });
    totalRow.font = { bold: true };
    ws.addRow([]);
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="salary-${month}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

module.exports = { calculate, list, update, submit, approveOne, approveAll, rejectOne, exportSalary };
