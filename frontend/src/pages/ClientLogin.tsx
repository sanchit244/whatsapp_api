import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { extractErrorMessage } from '../utils/errorHelper';

export const ClientLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();
  const auth = React.useContext(AuthContext);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    const result = await auth?.login(email, password, 'client');
    setLoading(false);
    if (result === true || result?.success) {
      navigate('/client-dashboard');
    } else {
      setErrorMsg(extractErrorMessage(result, 'Login failed. Please check your credentials.'));
    }
  };

  const isPendingApproval = errorMsg.toLowerCase().includes('pending');
  const isSuspended = errorMsg.toLowerCase().includes('suspended');

  return (
    <div className="relative min-h-screen bg-[#0b0f19] text-gray-100 flex items-center justify-center p-4 overflow-hidden">
      {/* Dynamic Animated Ambient Background Orbs */}
      <div className="absolute top-1/3 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none animate-float" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/3 translate-y-1/3 w-[30rem] h-[30rem] bg-indigo-600/15 rounded-full blur-3xl pointer-events-none animate-float-reverse" />
      <div className="absolute top-1/2 right-1/3 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none animate-pulse-glow" />

      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative w-full max-w-md glass-panel p-8 sm:p-10 rounded-3xl border border-white/10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-2xl transition-all duration-300">
        {/* Header */}
        <div className="text-center space-y-3 mb-8">
          <div className="inline-flex items-center justify-center p-3.5 bg-gradient-to-tr from-blue-500/20 to-indigo-500/10 border border-blue-500/30 rounded-2xl shadow-inner shadow-blue-500/20 mb-2">
            <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Client <span className="gradient-text-blue">Portal</span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 max-w-xs mx-auto">
            Access your WhatsApp broadcast manager, campaigns, and delivery telemetry
          </p>
        </div>

        {/* Pending Approval Notice */}
        {isPendingApproval && (
          <div className="mb-6 p-4 bg-amber-950/60 border border-amber-500/50 rounded-2xl text-amber-200 text-xs space-y-1.5 shadow-lg shadow-amber-950/40">
            <div className="font-bold flex items-center space-x-2 text-amber-300 text-sm">
              <span className="text-base">⏳</span>
              <span>Registration Pending Approval</span>
            </div>
            <p className="leading-relaxed text-amber-200/90 pl-6">
              Your account is currently under review by our team. Once approved in the Administrator Panel, you can sign in directly.
            </p>
          </div>
        )}

        {/* Suspended Notice */}
        {isSuspended && (
          <div className="mb-6 p-4 bg-red-950/60 border border-red-500/50 rounded-2xl text-red-200 text-xs space-y-1.5 shadow-lg shadow-red-950/40">
            <div className="font-bold flex items-center space-x-2 text-red-300 text-sm">
              <span className="text-base">🚫</span>
              <span>Account Suspended</span>
            </div>
            <p className="leading-relaxed text-red-200/90 pl-6">
              This organization has been temporarily suspended. Please reach out to platform support.
            </p>
          </div>
        )}

        {/* Standard Error Alert */}
        {!isPendingApproval && !isSuspended && errorMsg && (
          <div className="mb-6 p-3.5 bg-red-950/60 border border-red-500/50 rounded-2xl text-red-200 text-xs flex items-center space-x-3 shadow-lg shadow-red-950/40">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center font-bold">
              !
            </span>
            <span className="flex-1 font-medium">{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          {/* Email */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300">
              Business Email
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 glass-input rounded-xl text-white placeholder-gray-500 text-sm outline-none"
                placeholder="you@company.com"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300">
              Account Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-11 py-3 glass-input rounded-xl text-white placeholder-gray-500 text-sm outline-none"
                placeholder="••••••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-200 transition"
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full relative group overflow-hidden bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 text-white font-bold py-3.5 rounded-xl transition-all duration-300 shadow-[0_10px_25px_-5px_rgba(59,130,246,0.4)] disabled:opacity-50 active:scale-[0.99] flex items-center justify-center space-x-2 text-sm"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>Sign In to Workspace</span>
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </>
            )}
          </button>
        </form>

        {/* Signup Link */}
        <p className="text-gray-400 text-center text-xs mt-6">
          Don't have an organization account yet?{' '}
          <Link to="/client-signup" className="text-blue-400 hover:text-blue-300 font-semibold underline underline-offset-2">
            Register here
          </Link>
        </p>

        {/* Footer Navigation */}
        <div className="mt-6 pt-4 border-t border-white/5 flex justify-between items-center text-xs text-gray-400">
          <Link to="/" className="hover:text-white transition flex items-center space-x-1">
            <span>←</span>
            <span>Back to Home</span>
          </Link>
          <Link to="/admin" className="hover:text-emerald-400 transition font-medium">
            Admin Panel →
          </Link>
        </div>
      </div>
    </div>
  );
};
