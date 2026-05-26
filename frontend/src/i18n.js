import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en/translation.json';
import ar from './locales/ar/translation.json';

function applyDirection(lng) {
  document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = lng;
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    fallbackLng: 'en',
    detection: {
      order: ['localStorage'],
      lookupLocalStorage: 'lang',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

i18n.on('languageChanged', applyDirection);
applyDirection(i18n.language || 'en');

export default i18n;
