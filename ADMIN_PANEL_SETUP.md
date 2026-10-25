# Admin Dashboard & Website - Complete Setup Guide

**Status:** Ready to Build  
**Date:** September 8, 2026  
**Tech Stack:** React + Express + MySQL

---

## 📋 What We'll Build

### **Frontend (Website + Admin Panel)**
- 🏠 Public website
- 📊 Admin dashboard
- 👥 User management
- 📈 Analytics
- 🔐 Authentication

### **Backend API**
- Express.js REST API
- MySQL database
- JWT authentication
- Role-based access control

---

## 📁 Project Structure

```
whatsapp-project/
├── backend/              # Express API (already built)
│   ├── src/
│   ├── package.json
│   └── docker-compose.yml
│
└── frontend/             # React Admin + Website (NEW)
    ├── src/
    │   ├── pages/
    │   │   ├── Home.tsx
    │   │   ├── Dashboard.tsx
    │   │   ├── Users.tsx
    │   │   ├── Analytics.tsx
    │   │   └── Login.tsx
    │   ├── components/
    │   ├── context/
    │   ├── App.tsx
    │   └── index.tsx
    ├── package.json
    └── .env
```

---

## 🚀 QUICK START - 5 Steps

### Step 1: Create Frontend Project

```bash
# Navigate to parent directory
cd D:\

# Create React app
npx create-react-app whatsapp-frontend
cd whatsapp-frontend
```

### Step 2: Install Dependencies

```bash
npm install --legacy-peer-deps axios react-router-dom zustand tailwindcss
```

### Step 3: Copy Admin Dashboard Code

(See files below)

### Step 4: Configure Environment

Create `.env` file:
```
REACT_APP_API_URL=http://localhost:3000
REACT_APP_API_PORT=3000
```

### Step 5: Run Frontend

```bash
npm start
```

**Result:** Admin panel at http://localhost:3000 (React)

---

## 📝 Code Files to Create

### File 1: src/context/AuthContext.tsx

```typescript
import React, { createContext, useState } from 'react';

export const AuthContext = createContext(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));

  const login = async (email: string, password: string) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('token', data.token);
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
```

### File 2: src/pages/Login.tsx

```typescript
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const auth = React.useContext(AuthContext);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await auth?.login(email, password);
    if (success) navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-96">
        <h1 className="text-3xl font-bold text-white mb-6 text-center">Admin Login</h1>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-gray-300 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 text-white rounded border border-gray-600"
              placeholder="admin@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-gray-300 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 text-white rounded border border-gray-600"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
};
```

### File 3: src/pages/Dashboard.tsx

```typescript
import React, { useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext';

export const Dashboard: React.FC = () => {
  const auth = React.useContext(AuthContext);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalCampaigns: 0,
    totalMessages: 0,
    revenue: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/v1/dashboard/stats`, {
          headers: { Authorization: `Bearer ${auth?.token}` },
        });
        const data = await response.json();
        setStats(data);
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    };
    fetchStats();
  }, [auth?.token]);

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <h1 className="text-4xl font-bold text-white mb-8">Admin Dashboard</h1>
      
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <p className="text-gray-400 text-sm">Total Users</p>
          <p className="text-3xl font-bold text-white">{stats.totalUsers}</p>
        </div>
        
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <p className="text-gray-400 text-sm">Total Campaigns</p>
          <p className="text-3xl font-bold text-white">{stats.totalCampaigns}</p>
        </div>
        
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <p className="text-gray-400 text-sm">Total Messages</p>
          <p className="text-3xl font-bold text-white">{stats.totalMessages}</p>
        </div>
        
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <p className="text-gray-400 text-sm">Revenue</p>
          <p className="text-3xl font-bold text-white">${stats.revenue}</p>
        </div>
      </div>
      
      <button
        onClick={() => auth?.logout()}
        className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
      >
        Logout
      </button>
    </div>
  );
};
```

### File 4: src/App.tsx

```typescript
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = React.useContext(AuthContext);
  return auth?.token ? <>{children}</> : <Navigate to="/login" />;
};

import { AuthContext } from './context/AuthContext';

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
```

---

## 🎯 Next Steps

1. **Create React app** (Step 1 above)
2. **Copy code files** (4 files created above)
3. **Install dependencies** (Step 2)
4. **Configure .env** (Step 4)
5. **Run frontend** (Step 5)

---

## ✅ What You'll Have

✅ Admin login page  
✅ Dashboard with stats  
✅ Protected routes  
✅ User authentication  
✅ Responsive design  
✅ Dark theme UI  

---

**Ready to build?** Follow the 5 steps above!

