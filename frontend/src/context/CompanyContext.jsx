import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '@/lib/api.js';

const CompanyContext = createContext({
  companyName: '',
  companyLogo: '',
  setCompanyName: () => {},
  setCompanyLogo: () => {},
});

export function CompanyProvider({ children }) {
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');

  useEffect(() => {
    api.get('/company-info')
      .then(res => {
        const name = res.company_name || '';
        const logo = res.company_logo || '';
        setCompanyName(name);
        setCompanyLogo(logo);
        document.title = name
          ? `${name} — Attendance & Payroll`
          : 'Attendance & Payroll System';
      })
      .catch(() => {});
  }, []);

  // Keep browser tab title in sync whenever name changes after a settings save.
  useEffect(() => {
    if (companyName) {
      document.title = `${companyName} — Attendance & Payroll`;
    } else {
      document.title = 'Attendance & Payroll System';
    }
  }, [companyName]);

  return (
    <CompanyContext.Provider value={{ companyName, companyLogo, setCompanyName, setCompanyLogo }}>
      {children}
    </CompanyContext.Provider>
  );
}

export const useCompany = () => useContext(CompanyContext);
