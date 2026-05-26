import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorKey, setErrorKey] = useState('');
  const [loading, setLoading] = useState(false);

  const { t } = useTranslation();
  const { user, setLoggedInUser } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorKey('');

    if (newPassword.length < 8) {
      setErrorKey('auth.passwordTooShort');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorKey('auth.passwordMismatch');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setLoggedInUser({ ...user, requiresPasswordChange: false });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setErrorKey(err.message || 'auth.invalidCredentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle>{t('auth.changePassword')}</CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1">
              <Label htmlFor="currentPassword">{t('auth.currentPassword')}</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="newPassword">{t('auth.newPassword')}</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="confirmPassword">{t('auth.confirmPassword')}</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
              {loading ? '…' : t('auth.changePassword')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
