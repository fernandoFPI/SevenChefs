import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

export default function ForbiddenPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-50 px-4 text-center">
      <div className="text-7xl font-bold text-gray-200 select-none">403</div>

      <div>
        <h1 className="text-2xl font-semibold text-gray-800">{t('errors.accessDenied')}</h1>
      </div>

      <div>
        <p className="text-sm text-muted-foreground">{t('errors.noPermission')}</p>
      </div>

      <Button onClick={() => navigate(-1)} variant="outline">
        {t('nav.goBack')}
      </Button>
    </div>
  );
}
