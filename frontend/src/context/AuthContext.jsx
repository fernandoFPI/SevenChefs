import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/auth/me')
      .then((data) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  function setLoggedInUser(userData) {
    setUser(userData);
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, setLoggedInUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
