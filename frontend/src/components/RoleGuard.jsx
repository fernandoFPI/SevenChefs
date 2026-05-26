import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import ForbiddenPage from '../pages/403/ForbiddenPage.jsx';

export default function RoleGuard({ roles, children }) {
  const { user } = useAuth();

  if (!user || !roles.includes(user.role)) {
    return <ForbiddenPage />;
  }

  return children;
}
