import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Home } from './pages/Home';
import { ClientSignup } from './pages/ClientSignup';
import { ClientLogin } from './pages/ClientLogin';
import { ClientDashboard } from './pages/ClientDashboard';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = React.useContext(AuthContext);
  return auth?.token && auth?.user?.is_admin && localStorage.getItem('portal') === 'admin'
    ? <>{children}</>
    : <Navigate to="/login" />;
};

const ClientProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = React.useContext(AuthContext);
  return auth?.token && localStorage.getItem('portal') === 'client'
    ? <>{children}</>
    : <Navigate to="/client-login" />;
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          {/* Public/Client Routes */}
          <Route path="/" element={<Home />} />
          <Route path="/client-signup" element={<ClientSignup />} />
          <Route path="/client-login" element={<ClientLogin />} />
          <Route
            path="/client-dashboard"
            element={
              <ClientProtectedRoute>
                <ClientDashboard />
              </ClientProtectedRoute>
            }
          />

          {/* Admin Routes */}
          <Route path="/admin" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
