const { query } = require('../config/db');

async function createNotification({ userId, type, message, messageAr, requestId = null }) {
  await query(
    `INSERT INTO notifications (user_id, type, message, message_ar, request_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, type, message, messageAr, requestId]
  );
}

async function notifyManagersOfNewRequest(request, employeeName) {
  const { rows: managers } = await query(
    `SELECT id FROM users WHERE role = 'MANAGER' AND is_active = true`
  );
  const typeLabel   = request.type === 'OT_REQUEST' ? 'OT request'
    : request.type === 'TIME_OFF_REQUEST' ? 'time off request' : 'day-off request';
  const typeLabelAr = request.type === 'OT_REQUEST' ? 'طلب عمل إضافي'
    : request.type === 'TIME_OFF_REQUEST' ? 'طلب إجازة سنوية' : 'طلب يوم إجازة';
  const dateLabel   = request.date_from
    ? `${request.date_from} → ${request.date_to}`
    : String(request.attendance_date ?? '');
  for (const m of managers) {
    await createNotification({
      userId: m.id,
      type: 'NEW_REQUEST',
      message: `${employeeName} submitted a new ${typeLabel} for ${dateLabel}.`,
      messageAr: `قدّم ${employeeName} ${typeLabelAr} جديداً بتاريخ ${dateLabel}.`,
      requestId: request.id,
    });
  }
}

async function notifyAdminsOfForwardedRequest(request, employeeName) {
  const { rows: admins } = await query(
    `SELECT id FROM users WHERE role = 'ADMIN'`,
    []
  );
  const typeLabel = request.type === 'OT_REQUEST' ? 'OT request' : 'day-off request';
  const typeLabelAr = request.type === 'OT_REQUEST' ? 'طلب عمل إضافي' : 'طلب يوم إجازة';
  for (const a of admins) {
    await createNotification({
      userId: a.id,
      type: 'REQUEST_FORWARDED',
      message: `${employeeName}'s ${typeLabel} for ${request.attendance_date} has been forwarded for your approval.`,
      messageAr: `تم إحالة ${typeLabelAr} الخاص بـ ${employeeName} بتاريخ ${request.attendance_date} إليك للموافقة.`,
      requestId: request.id,
    });
  }
}

async function notifyEmployeeOfDecision(request, employeeUserId, decision, note) {
  const typeLabel = request.type === 'OT_REQUEST' ? 'OT request' : 'day-off request';
  const typeLabelAr = request.type === 'OT_REQUEST' ? 'طلب عمل إضافي' : 'طلب يوم إجازة';
  const isApproved = decision === 'APPROVED';
  const suffix = note ? ` Note: ${note}` : '';
  const suffixAr = note ? ` ملاحظة: ${note}` : '';
  await createNotification({
    userId: employeeUserId,
    type: isApproved ? 'REQUEST_APPROVED' : 'REQUEST_REJECTED',
    message: `Your ${typeLabel} for ${request.attendance_date} has been ${isApproved ? 'approved' : 'rejected'}.${suffix}`,
    messageAr: `تم ${isApproved ? 'الموافقة على' : 'رفض'} ${typeLabelAr} الخاص بك بتاريخ ${request.attendance_date}.${suffixAr}`,
    requestId: request.id,
  });
}

async function notifyEmployeeOfAutoReject(request, employeeUserId) {
  const typeLabel = request.type === 'OT_REQUEST' ? 'OT request' : 'day-off request';
  const typeLabelAr = request.type === 'OT_REQUEST' ? 'طلب عمل إضافي' : 'طلب يوم إجازة';
  await createNotification({
    userId: employeeUserId,
    type: 'REQUEST_AUTO_REJECTED',
    message: `Your ${typeLabel} for ${request.attendance_date} was automatically rejected after 48 hours with no action.`,
    messageAr: `تم رفض ${typeLabelAr} الخاص بك بتاريخ ${request.attendance_date} تلقائياً بعد 48 ساعة دون اتخاذ إجراء.`,
    requestId: request.id,
  });
}

module.exports = {
  createNotification,
  notifyManagersOfNewRequest,
  notifyAdminsOfForwardedRequest,
  notifyEmployeeOfDecision,
  notifyEmployeeOfAutoReject,
};
