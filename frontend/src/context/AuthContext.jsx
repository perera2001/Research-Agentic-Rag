import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/client';

const STORAGE_KEY = 'researchmind_token';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_KEY));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [startupError, setStartupError] = useState('');

  function signOut() {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
    setStartupError('');
  }

  useEffect(() => {
    const onUnauthorized = () => signOut();
    window.addEventListener('researchmind:unauthorized', onUnauthorized);
    return () => window.removeEventListener('researchmind:unauthorized', onUnauthorized);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiRequest('/api/auth/me', { token })
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch((error) => {
        if (!cancelled) {
          if (error.status === 401) signOut();
          else setStartupError(error.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  async function authenticate(mode, values) {
    const data = await apiRequest(`/api/auth/${mode}`, { method: 'POST', body: values });
    localStorage.setItem(STORAGE_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    setStartupError('');
  }

  const value = useMemo(() => ({
    token, user, loading, startupError, authenticate, signOut,
  }), [token, user, loading, startupError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
