require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const authRoutes = require('./src/routes/auth');
const shiftsRoutes = require('./src/routes/shifts');
const schedulesRoutes = require('./src/routes/schedules');
const employeesRoutes = require('./src/routes/employees');
const attendanceRoutes      = require('./src/routes/attendance');
const attendanceDailyRoutes = require('./src/routes/attendanceDaily');
const requestsRoutes        = require('./src/routes/requests');
const notificationsRoutes   = require('./src/routes/notifications');
const reportsRoutes         = require('./src/routes/reports');
const salaryRoutes          = require('./src/routes/salary');
const settingsRoutes        = require('./src/routes/settings');
const usersRoutes           = require('./src/routes/users');
const dashboardRoutes       = require('./src/routes/dashboard');
const shiftSwapsRoutes      = require('./src/routes/shiftSwaps');
const backupsRoutes         = require('./src/routes/backups');
const timeOffRoutes         = require('./src/routes/timeOff');
const db             = require('./src/config/db');
const syncCron       = require('./src/jobs/syncCron');
const autoRejectCron = require('./src/jobs/autoRejectCron');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET));

// Public — no auth required (login page needs this before authentication)
app.get('/api/company-info', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT key, value FROM system_settings WHERE key IN ('company_name', 'company_logo')`
    );
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json({
      company_name: map.company_name || '',
      company_logo: map.company_logo || null,
    });
  } catch (err) {
    console.error('[company-info]', err.message);
    res.status(500).json({ company_name: '', company_logo: null });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/shifts', shiftsRoutes);
app.use('/api/schedules', schedulesRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/attendance/daily', attendanceDailyRoutes);
app.use('/api/requests', requestsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/reports/monthly', reportsRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/shift-swaps', shiftSwapsRoutes);
app.use('/api/backups',    backupsRoutes);
app.use('/api/time-off',  timeOffRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  syncCron.start();
  autoRejectCron.start();
});
