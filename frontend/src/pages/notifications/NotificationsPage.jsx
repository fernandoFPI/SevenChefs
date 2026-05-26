import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api.js';
import { Button } from '@/components/ui/button';
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get('/notifications');
      setNotifications(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function markAll() {
    await api.put('/notifications/mark-all-read');
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">{t('notifications.title')}</h1>
        <Button variant="outline" size="sm" onClick={markAll}>
          {t('notifications.markAllRead')}
        </Button>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">{t('common.loading')}</p>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16 text-gray-400">{t('notifications.noNotifications')}</div>
      ) : (
        <ul className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-200">
          {notifications.map(n => (
            <li key={n.id} className={`px-5 py-4 flex gap-3 ${n.is_read ? '' : 'bg-brand-50'}`}>
              {!n.is_read && <span className="mt-1.5 h-2 w-2 rounded-full bg-brand-500 shrink-0" />}
              {n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0" />}
              <div className="flex-1">
                <p className="text-sm text-gray-800">{isRtl ? n.message_ar : n.message}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {timeAgo(n.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
