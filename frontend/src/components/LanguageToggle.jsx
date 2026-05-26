import React from 'react';
import { useTranslation } from 'react-i18next';

export default function LanguageToggle({ className = '' }) {
  const { t, i18n } = useTranslation();

  function toggle() {
    const next = i18n.language === 'ar' ? 'en' : 'ar';
    i18n.changeLanguage(next);
  }

  return (
    <button
      onClick={toggle}
      className={`text-sm px-3 py-1.5 rounded-lg border border-brand-200 text-brand-700 hover:bg-brand-50 transition-colors ${className}`}
    >
      {t('nav.language')}
    </button>
  );
}
