import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import RoleGuard from './components/RoleGuard.jsx';

import LoginPage from './pages/login/LoginPage.jsx';
import ChangePasswordPage from './pages/change-password/ChangePasswordPage.jsx';
import DashboardPage from './pages/dashboard/DashboardPage.jsx';
import ForbiddenPage from './pages/403/ForbiddenPage.jsx';

import ShiftsPage from './pages/shifts/ShiftsPage.jsx';
import SchedulesPage from './pages/schedules/SchedulesPage.jsx';
import EmployeeListPage from './pages/employees/EmployeeListPage.jsx';
import EmployeeDetailPage from './pages/employees/EmployeeDetailPage.jsx';
import AddEmployeePage from './pages/employees/AddEmployeePage.jsx';
import EditEmployeePage from './pages/employees/EditEmployeePage.jsx';
import RawAttendancePage from './pages/attendance/RawAttendancePage.jsx';
import AttendanceProcessingPage from './pages/attendance/AttendanceProcessingPage.jsx';
import RequestsPage from './pages/requests/RequestsPage.jsx';
import MyRequestsPage from './pages/requests/MyRequestsPage.jsx';
import NotificationsPage from './pages/notifications/NotificationsPage.jsx';
import MonthlyReportPage from './pages/reports/MonthlyReportPage.jsx';
import SalaryPage from './pages/salary/SalaryPage.jsx';
import SettingsPage from './pages/settings/SettingsPage.jsx';
import UsersPage from './pages/settings/UsersPage.jsx';
import MyAttendancePage from './pages/attendance/MyAttendancePage.jsx';
import ShiftSwapsPage from './pages/shift-swaps/ShiftSwapsPage.jsx';
import TimeOffBalancesPage from './pages/time-off-balances/TimeOffBalancesPage.jsx';

import AdminLayout from './layouts/AdminLayout.jsx';
import ManagerLayout from './layouts/ManagerLayout.jsx';
import AccountantLayout from './layouts/AccountantLayout.jsx';
import EmployeeLayout from './layouts/EmployeeLayout.jsx';

const LAYOUTS = {
  ADMIN: AdminLayout,
  MANAGER: ManagerLayout,
  ACCOUNTANT: AccountantLayout,
  EMPLOYEE: EmployeeLayout,
};

function RoleLayout({ children }) {
  const { user } = useAuth();
  const Layout = LAYOUTS[user?.role] || AdminLayout;
  return <Layout>{children}</Layout>;
}

const SWAP_ROLES       = ['ADMIN', 'MANAGER', 'ACCOUNTANT'];
const MGMT             = ['ADMIN', 'ACCOUNTANT'];
const TIME_OFF_ROLES   = ['ADMIN', 'ACCOUNTANT'];
const ATTENDANCE_ROLES = ['ADMIN', 'ACCOUNTANT', 'MANAGER'];
const REQUEST_MGMT_ROLES = ['ADMIN', 'MANAGER'];
const REPORT_ROLES = ['ADMIN', 'ACCOUNTANT', 'MANAGER'];
const SALARY_ROLES = ['ADMIN', 'ACCOUNTANT'];
const ADMIN_ONLY = ['ADMIN'];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/403" element={<ForbiddenPage />} />

      <Route element={<ProtectedRoute requirePasswordChanged={false} />}>
        <Route path="/change-password" element={<ChangePasswordPage />} />
      </Route>

      <Route element={<ProtectedRoute requirePasswordChanged={true} />}>
        <Route path="/dashboard" element={<RoleLayout><DashboardPage /></RoleLayout>} />

        <Route path="/shifts" element={
          <RoleLayout><RoleGuard roles={MGMT}><ShiftsPage /></RoleGuard></RoleLayout>
        } />
        <Route path="/schedules" element={
          <RoleLayout><RoleGuard roles={MGMT}><SchedulesPage /></RoleGuard></RoleLayout>
        } />
        <Route path="/employees" element={
          <RoleLayout><RoleGuard roles={MGMT}><EmployeeListPage /></RoleGuard></RoleLayout>
        } />
        {/* /employees/new MUST be before /employees/:id */}
        <Route path="/employees/new" element={
          <RoleLayout><RoleGuard roles={MGMT}><AddEmployeePage /></RoleGuard></RoleLayout>
        } />
        <Route path="/employees/:id/edit" element={
          <RoleLayout><RoleGuard roles={MGMT}><EditEmployeePage /></RoleGuard></RoleLayout>
        } />
        <Route path="/employees/:id" element={
          <RoleLayout><RoleGuard roles={MGMT}><EmployeeDetailPage /></RoleGuard></RoleLayout>
        } />

        <Route path="/attendance/raw" element={
          <RoleLayout><RoleGuard roles={ATTENDANCE_ROLES}><RawAttendancePage /></RoleGuard></RoleLayout>
        } />
        <Route path="/attendance/processing" element={
          <RoleLayout><RoleGuard roles={ATTENDANCE_ROLES}><AttendanceProcessingPage /></RoleGuard></RoleLayout>
        } />

        <Route path="/reports/monthly" element={
          <RoleLayout><RoleGuard roles={REPORT_ROLES}><MonthlyReportPage /></RoleGuard></RoleLayout>
        } />
        <Route path="/salary" element={
          <RoleLayout><RoleGuard roles={SALARY_ROLES}><SalaryPage /></RoleGuard></RoleLayout>
        } />

        <Route path="/requests" element={
          <RoleLayout><RoleGuard roles={REQUEST_MGMT_ROLES}><RequestsPage /></RoleGuard></RoleLayout>
        } />
        <Route path="/my-requests" element={
          <RoleLayout><RoleGuard roles={['EMPLOYEE']}><MyRequestsPage /></RoleGuard></RoleLayout>
        } />
        <Route path="/my-attendance" element={
          <RoleLayout><RoleGuard roles={['EMPLOYEE']}><MyAttendancePage /></RoleGuard></RoleLayout>
        } />
        <Route path="/notifications" element={
          <RoleLayout><NotificationsPage /></RoleLayout>
        } />
        <Route path="/settings" element={
          <RoleLayout><RoleGuard roles={ADMIN_ONLY}><SettingsPage /></RoleGuard></RoleLayout>
        } />
        <Route path="/settings/users" element={
          <RoleLayout><RoleGuard roles={ADMIN_ONLY}><UsersPage /></RoleGuard></RoleLayout>
        } />
        <Route path="/shift-swaps" element={
          <RoleLayout><RoleGuard roles={SWAP_ROLES}><ShiftSwapsPage /></RoleGuard></RoleLayout>
        } />
        <Route path="/time-off-balances" element={
          <RoleLayout><RoleGuard roles={TIME_OFF_ROLES}><TimeOffBalancesPage /></RoleGuard></RoleLayout>
        } />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
