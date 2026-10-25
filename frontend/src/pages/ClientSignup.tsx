import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { extractErrorMessage } from '../utils/errorHelper';

export const ClientSignup: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    company: '',
    phone: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const response = await fetch('http://localhost:3000/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          first_name: formData.name.split(' ')[0],
          last_name: formData.name.split(' ').slice(1).join(' '),
          tenant_name: formData.company,
          phone: formData.phone,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setIsSubmitted(true);
      } else {
        setErrorMsg(extractErrorMessage(data, 'Registration failed'));
      }
    } catch {
      setErrorMsg('Registration failed. Please check your network connection.');
    }
    setLoading(false);
  };

  return (
    <div className="relative min-h-screen bg-[#0b0f19] text-gray-100 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      {/* Dynamic Animated Ambient Background Orbs */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none animate-float" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/3 translate-y-1/3 w-[30rem] h-[30rem] bg-blue-600/15 rounded-full blur-3xl pointer-events-none animate-float-reverse" />
      <div className="absolute top-1/2 right-1/3 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none animate-pulse-glow" />

      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative w-full max-w-lg glass-panel p-8 sm:p-10 rounded-3xl border border-white/10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-2xl transition-all duration-300">
        {isSubmitted ? (
          <div className="text-center py-6 space-y-5 animate-fade-in">
            <div className="w-20 h-20 bg-gradient-to-tr from-amber-500/20 to-yellow-500/10 border border-amber-500/40 rounded-full flex items-center justify-center mx-auto text-4xl shadow-lg shadow-amber-950/40">
              ⏳
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold text-white tracking-tight">Registration Submitted!</h2>
              <p className="text-sm text-gray-300">
                Thank you, <span className="font-semibold text-white">{formData.name}</span>. Your account request for <span className="font-semibold text-blue-400">{formData.company}</span> has been received.
              </p>
            </div>

            <div className="bg-amber-950/40 border border-amber-600/40 rounded-2xl p-5 text-left text-xs text-amber-200 space-y-2.5 shadow-inner">
              <p className="font-bold flex items-center space-x-2 text-amber-300 text-sm">
                <span>🔒</span>
                <span>Administrator Verification Process</span>
              </p>
              <p className="leading-relaxed text-amber-200/90 pl-6">
                Your account is currently in <strong>Pending Approval</strong>. The administrator will review your organization details in the Admin Panel and activate your workspace credentials.
              </p>
              <div className="pt-2 border-t border-amber-800/40 text-gray-300 flex justify-between font-mono">
                <span>Registered Email:</span>
                <span className="text-white font-semibold">{formData.email}</span>
              </div>
            </div>

            <div className="pt-3 flex flex-col gap-3">
              <Link
                to="/client-login"
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-blue-600/30 text-sm text-center"
              >
                Proceed to Client Login
              </Link>
              <Link
                to="/"
                className="text-xs text-gray-400 hover:text-gray-200 text-center py-1 transition"
              >
                ← Return to Homepage
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="text-center space-y-2 mb-7">
              <div className="inline-flex items-center justify-center p-3 bg-gradient-to-tr from-purple-500/20 to-blue-500/10 border border-purple-500/30 rounded-2xl mb-1 shadow-inner shadow-purple-500/20">
                <span className="text-2xl">✨</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Create <span className="gradient-text-blue">Organization Account</span>
              </h1>
              <p className="text-xs text-gray-400 max-w-xs mx-auto">
                Request your business messaging workspace. Verified by administrator before activation.
              </p>
            </div>

            {errorMsg && (
              <div className="mb-5 p-3.5 bg-red-950/60 border border-red-500/50 rounded-2xl text-red-200 text-xs flex items-center space-x-3 shadow-lg shadow-red-950/40">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center font-bold">
                  !
                </span>
                <span className="flex-1 font-medium">{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300">
                    Contact Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 glass-input rounded-xl text-white placeholder-gray-500 text-sm outline-none"
                    placeholder="Jane Doe"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    className="w-full px-3.5 py-2.5 glass-input rounded-xl text-white placeholder-gray-500 text-sm outline-none"
                    placeholder="Acme Global Inc."
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300">
                  Business Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 glass-input rounded-xl text-white placeholder-gray-500 text-sm outline-none"
                  placeholder="contact@company.com"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300">
                  Phone / WhatsApp Number
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3.5 py-2.5 glass-input rounded-xl text-white placeholder-gray-500 text-sm outline-none font-mono"
                  placeholder="+1 (555) 000-0000"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300">
                  Security Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full pl-3.5 pr-11 py-2.5 glass-input rounded-xl text-white placeholder-gray-500 text-sm outline-none"
                    placeholder="Min. 8 characters"
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

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 relative group overflow-hidden bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 text-white font-bold py-3.5 rounded-xl transition-all duration-300 shadow-[0_10px_25px_-5px_rgba(59,130,246,0.4)] disabled:opacity-50 active:scale-[0.99] flex items-center justify-center space-x-2 text-sm"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <span>Submitting Request...</span>
                  </>
                ) : (
                  <>
                    <span>Submit Registration Request</span>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </>
                )}
              </button>
            </form>

            <p className="text-gray-400 text-center text-xs mt-5">
              Already approved?{' '}
              <Link to="/client-login" className="text-blue-400 hover:text-blue-300 font-semibold underline underline-offset-2">
                Sign in here
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
};
