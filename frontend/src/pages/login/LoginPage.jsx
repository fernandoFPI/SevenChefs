import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useCompany } from '@/context/CompanyContext.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import LanguageToggle from '@/components/LanguageToggle.jsx';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorKey, setErrorKey] = useState('');
  const [loading, setLoading] = useState(false);

  const { t } = useTranslation();
  const { setLoggedInUser } = useAuth();
  const { companyName, companyLogo } = useCompany();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorKey('');
    setLoading(true);

    try {
      const data = await api.post('/auth/login', { username, password });
      setLoggedInUser({
        ...data.user,
        requiresPasswordChange: data.requiresPasswordChange ?? false,
      });

      if (data.requiresPasswordChange) {
        navigate('/change-password', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch {
      setErrorKey('auth.invalidCredentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="absolute top-4 end-4 z-10">
        <LanguageToggle />
      </div>

      <Card className="w-full max-w-md shadow-lg">
        <CardContent className="pt-6">
          {/* Company branding at the top of the card */}
          <div className="text-center mb-6">
            {companyLogo && (
              <img
                src={companyLogo}
                alt={companyName || 'Logo'}
                style={{ maxHeight: '110px', maxWidth: '260px', width: '100%', objectFit: 'contain', display: 'block', margin: '0 auto 12px auto' }}
              />
            )}
            {companyName && (
              <h1 className="text-2xl font-bold text-gray-900">{companyName}</h1>
            )}
            <p className="text-sm text-gray-500 mt-1">{t('app.systemName')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1">
              <Label htmlFor="username">{t('auth.username')}</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            {errorKey && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {t(errorKey)}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '…' : t('auth.login')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
