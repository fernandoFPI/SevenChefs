import React, { useState, useEffect, useRef } from 'react';
import { Bell, LayoutDashboard, Users, Clock, CalendarDays, ClipboardList, CalendarCheck, FileText, BellRing, BarChart2, DollarSign, Settings, CalendarCheck2, ArrowLeftRight, Umbrella } from 'lucide-react';
import { NavLink, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '../context/AuthContext.jsx';
import { useCompany } from '../context/CompanyContext.jsx';
import { useTranslation } from 'react-i18next';
import LanguageToggle from '@/components/LanguageToggle.jsx';
import { api } from '@/lib/api.js';

const ROLE_COLORS = {
  ADMIN:      'bg-red-100 text-red-700',
  MANAGER:    'bg-brand-100 text-brand-700',
  ACCOUNTANT: 'bg-green-100 text-green-700',
  EMPLOYEE:   'bg-gray-100 text-gray-700',
};

const NAV_ITEMS = {
  ADMIN: [
    { to: '/dashboard',             labelKey: 'nav.dashboard',            Icon: LayoutDashboard },
    { to: '/employees',             labelKey: 'nav.employees',            Icon: Users },
    { to: '/shifts',                labelKey: 'nav.shifts',               Icon: Clock },
    { to: '/schedules',             labelKey: 'nav.schedules',            Icon: CalendarDays },
    { to: '/attendance/raw',        labelKey: 'nav.rawAttendance',        Icon: ClipboardList },
    { to: '/attendance/processing', labelKey: 'nav.attendanceProcessing', Icon: CalendarCheck },
    { to: '/reports/monthly',       labelKey: 'nav.monthlyReport',        Icon: BarChart2 },
    { to: '/salary',                labelKey: 'nav.salary',               Icon: DollarSign },
    { to: '/shift-swaps',           labelKey: 'nav.shiftSwaps',           Icon: ArrowLeftRight },
    { to: '/time-off-balances',      labelKey: 'nav.timeOffBalances',      Icon: Umbrella },
    { to: '/requests',              labelKey: 'nav.requests',             Icon: FileText },
    { to: '/notifications',         labelKey: 'nav.notifications',        Icon: BellRing },
    { to: '/settings',              labelKey: 'nav.settings',             Icon: Settings },
  ],
  ACCOUNTANT: [
    { to: '/dashboard',             labelKey: 'nav.dashboard',            Icon: LayoutDashboard },
    { to: '/employees',             labelKey: 'nav.employees',            Icon: Users },
    { to: '/shifts',                labelKey: 'nav.shifts',               Icon: Clock },
    { to: '/schedules',             labelKey: 'nav.schedules',            Icon: CalendarDays },
    { to: '/attendance/raw',        labelKey: 'nav.rawAttendance',        Icon: ClipboardList },
    { to: '/attendance/processing', labelKey: 'nav.attendanceProcessing', Icon: CalendarCheck },
    { to: '/reports/monthly',       labelKey: 'nav.monthlyReport',        Icon: BarChart2 },
    { to: '/salary',                labelKey: 'nav.salary',               Icon: DollarSign },
    { to: '/shift-swaps',           labelKey: 'nav.shiftSwaps',           Icon: ArrowLeftRight },
    { to: '/time-off-balances',     labelKey: 'nav.timeOffBalances',      Icon: Umbrella },
    { to: '/notifications',         labelKey: 'nav.notifications',        Icon: BellRing },
  ],
  MANAGER: [
    { to: '/dashboard',             labelKey: 'nav.dashboard',            Icon: LayoutDashboard },
    { to: '/attendance/raw',        labelKey: 'nav.rawAttendance',        Icon: ClipboardList },
    { to: '/attendance/processing', labelKey: 'nav.attendanceProcessing', Icon: CalendarCheck },
    { to: '/reports/monthly',       labelKey: 'nav.monthlyReport',        Icon: BarChart2 },
    { to: '/shift-swaps',           labelKey: 'nav.shiftSwaps',           Icon: ArrowLeftRight },
    { to: '/requests',              labelKey: 'nav.requests',             Icon: FileText },
    { to: '/notifications',         labelKey: 'nav.notifications',        Icon: BellRing },
  ],
  EMPLOYEE: [
    { to: '/dashboard',             labelKey: 'nav.dashboard',            Icon: LayoutDashboard },
    { to: '/my-attendance',         labelKey: 'nav.myAttendance',         Icon: CalendarCheck2 },
    { to: '/my-requests',           labelKey: 'nav.myRequests',           Icon: FileText },
    { to: '/notifications',         labelKey: 'nav.notifications',        Icon: BellRing },
  ],
};

function RoleBadge({ role }) {
  const { t } = useTranslation();
  const color = ROLE_COLORS[role] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {t(`roles.${role}`, role)}
    </span>
  );
}

function NotificationDropdown({ onClose }) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    api.get('/notifications').then(r => setNotifications(r.slice(0, 10))).catch(() => {});
  }, []);

  async function handleMarkAll() {
    await api.put('/notifications/mark-all-read');
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  return (
    <div className={`absolute top-12 ${isRtl ? 'left-0' : 'right-0'} w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-800">{t('notifications.title')}</span>
        <button onClick={handleMarkAll} className="text-xs text-brand-600 hover:underline">
          {t('notifications.markAllRead')}
        </button>
      </div>
      <ul className="max-h-72 overflow-y-auto divide-y divide-gray-50">
        {notifications.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-gray-400">{t('notifications.noNotifications')}</li>
        ) : notifications.map(n => (
          <li key={n.id} className={`px-4 py-3 text-sm ${n.is_read ? 'text-gray-500' : 'text-gray-800 bg-brand-50'}`}>
            {isRtl ? n.message_ar : n.message}
          </li>
        ))}
      </ul>
      <div className="px-4 py-2 border-t border-gray-100 text-center">
        <Link to="/notifications" onClick={onClose} className="text-xs text-brand-600 hover:underline">
          {t('notifications.viewAll')}
        </Link>
      </div>
    </div>
  );
}

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const { companyName, companyLogo } = useCompany();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const bellRef = useRef(null);

  const navItems = NAV_ITEMS[user?.role] || NAV_ITEMS.EMPLOYEE;

  useEffect(() => {
    function fetchCount() {
      api.get('/notifications/unread-count').then(r => setUnreadCount(r.count)).catch(() => {});
    }
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  function handleBellClick() {
    setShowDropdown(prev => !prev);
    if (!showDropdown && unreadCount > 0) {
      api.put('/notifications/mark-all-read').then(() => setUnreadCount(0)).catch(() => {});
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div style={{ padding: '16px 12px', textAlign: 'center', borderBottom: '1px solid var(--sidebar-border, #e5e7eb)' }}>
          {companyLogo && (
            <img
              src={companyLogo}
              alt={companyName || 'Logo'}
              style={{ maxHeight: '120px', width: '100%', objectFit: 'contain', display: 'block', margin: '0 auto 8px auto' }}
            />
          )}
          <p className="text-sm font-semibold text-gray-900 leading-tight">
            {companyName || t('app.tagline')}
          </p>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, labelKey, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 mx-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-brand-50 hover:text-brand-700'
                }`
              }
            >
              <Icon className="h-6 w-5 flex-shrink-0" />
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top navbar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <p className="flex-1 text-sm font-semibold text-gray-800">
            {companyName ? `${companyName} — ${t('app.tagline')}` : t('app.systemName')}
          </p>

          <div className="flex items-center gap-4">
            <LanguageToggle />

            {/* Notification bell */}
            <div className="relative" ref={bellRef}>
              <button
                className="relative p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                aria-label={t('nav.notifications')}
                onClick={handleBellClick}
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {showDropdown && (
                <NotificationDropdown onClose={() => setShowDropdown(false)} />
              )}
            </div>

            <p className="text-sm font-medium text-gray-800">{user?.username}</p>

            <button
              onClick={handleLogout}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t('auth.logout')}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
