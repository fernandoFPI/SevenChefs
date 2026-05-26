import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { CompanyProvider } from './context/CompanyContext.jsx';
import './i18n.js';
import './index.css';

function LangSync() {
  const { i18n } = useTranslation();
  useEffect(() => {
    const isAr = i18n.language === 'ar';
    document.documentElement.dir  = isAr ? 'rtl' : 'ltr';
    document.documentElement.lang = i18n.language || 'en';
  }, [i18n.language]);
  return null;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <CompanyProvider>
        <AuthProvider>
          <LangSync />
          <App />
        </AuthProvider>
      </CompanyProvider>
    </BrowserRouter>
  </React.StrictMode>
);
