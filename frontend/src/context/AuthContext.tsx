import React, { createContext, useState } from 'react';
import { API_URL } from '../config/api';

export const AuthContext = createContext<any>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('token'));

  const login = async (email: string, password: string, portal: 'admin' | 'client' = 'client') => {
    try {
      const endpoint = portal === 'admin' ? 'admin-login' : 'login';
      const response = await fetch(`${API_URL}/api/v1/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (response.ok && data.access_token) {
        setToken(data.access_token);
        setUser(data.user);
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('portal', portal);
        return { success: true };
      }
      return { 
        success: false, 
        error: (typeof data.error === 'object' ? data.error?.message : data.error) || data.message || 'Login failed' 
      };
    } catch (error: any) {
      console.error('Login failed:', error);
      return { 
        success: false, 
        error: error.message || 'Network error, please try again later' 
      };
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('portal');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
