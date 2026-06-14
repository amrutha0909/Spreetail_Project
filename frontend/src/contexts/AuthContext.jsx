import React, { createContext, useContext, useState, useEffect } from 'react';
import api, { setAccessToken } from '../api/axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchCurrentUser = async () => {
    try {
      const response = await api.get('/auth/me');
      setUser(response.data.user);
    } catch (error) {
      setUser(null);
      setAccessToken('');
    }
  };

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      const { accessToken, user: userData } = response.data;
      setAccessToken(accessToken);
      setUser(userData);
      return userData;
    } catch (error) {
      throw error.response?.data?.error || 'Login failed';
    }
  };

  const register = async (email, name, password) => {
    try {
      const response = await api.post('/auth/register', { email, name, password });
      return response.data;
    } catch (error) {
      throw error.response?.data?.error || 'Registration failed';
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout error on backend:', error);
    } finally {
      setAccessToken('');
      setUser(null);
    }
  };

  // Silent refresh on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await api.post('/auth/refresh');
        setAccessToken(response.data.accessToken);
        await fetchCurrentUser();
      } catch (error) {
        // Safe to ignore on mount, user is just not logged in
        setAccessToken('');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Handle global logout events (from axios interceptor)
  useEffect(() => {
    const handleGlobalLogout = () => {
      setAccessToken('');
      setUser(null);
    };

    window.addEventListener('auth-logout', handleGlobalLogout);
    return () => {
      window.removeEventListener('auth-logout', handleGlobalLogout);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
