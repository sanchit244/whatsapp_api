import React, { useState } from 'react';
import { Link } from 'react-router-dom';

export const Home: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="relative min-h-screen bg-[#070b14] text-gray-100 overflow-hidden font-sans selection:bg-emerald-500 selection:text-gray-950">
      {/* Dynamic Animated Ambient Background Orbs */}
      <div className="absolute top-0 left-1/4 -translate-x-1/2 w-[36rem] h-[36rem] bg-emerald-500/15 rounded-full blur-[120px] pointer-events-none animate-float" />
      <div className="absolute top-1/3 right-1/4 w-[40rem] h-[40rem] bg-cyan-500/10 rounded-full blur-[140px] pointer-events-none animate-float-reverse" />
      <div className="absolute bottom-10 left-1/3 w-[30rem] h-[30rem] bg-indigo-600/15 rounded-full blur-[130px] pointer-events-none animate-pulse-glow" />

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '36px 36px',
        }}
      />

      {/* Navbar */}
      <nav className="relative z-20 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl sticky top-0 px-6 py-4 shadow-2xl">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-400 via-teal-500 to-cyan-400 flex items-center justify-center font-black text-slate-950 text-lg shadow-lg shadow-emerald-500/30">
              WA
            </div>
            <div>
              <span className="text-base sm:text-lg font-extrabold tracking-tight text-white">WhatsApp Bulk Sender</span>
              <span className="hidden sm:inline-block ml-2 px-2.5 py-0.5 text-[10px] uppercase font-bold tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full">
                Meta Cloud API v20.0
              </span>
            </div>
          </div>

          {/* Desktop Links */}
          <div className="hidden sm:flex items-center space-x-4">
            <Link
              to="/client-login"
              className="text-sm font-semibold text-slate-300 hover:text-white px-4 py-2 rounded-xl hover:bg-white/5 transition"
            >
              Client Login
            </Link>
            <Link
              to="/admin"
              className="text-sm font-semibold text-slate-300 hover:text-white px-4 py-2 rounded-xl hover:bg-white/5 transition"
            >
              Admin Portal
            </Link>
            <Link
              to="/client-signup"
              className="text-sm font-bold bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 hover:from-emerald-400 hover:to-cyan-300 text-slate-950 px-5 py-2.5 rounded-xl transition shadow-lg shadow-emerald-500/30 active:scale-95"
            >
              Get Started Free
            </Link>
          </div>

          {/* Mobile Hamburger Toggle Button */}
          <div className="sm:hidden flex items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl glass-panel text-slate-200 hover:text-white border border-white/10 focus:outline-none transition active:scale-95"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? (
                <span className="text-xl font-bold text-emerald-400">✕</span>
              ) : (
                <div className="space-y-1 w-5">
                  <div className="h-0.5 bg-white w-full rounded-full" />
                  <div className="h-0.5 bg-white w-full rounded-full" />
                  <div className="h-0.5 bg-white w-full rounded-full" />
                </div>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Hamburger Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden glass-panel border-b border-white/10 bg-slate-950/95 px-6 py-6 space-y-3 sticky top-[73px] z-20 shadow-2xl animate-in slide-in-from-top duration-200">
          <Link
            to="/client-login"
            onClick={() => setMobileMenuOpen(false)}
            className="block w-full py-3 px-4 rounded-xl text-sm font-bold bg-slate-900/80 hover:bg-white/5 text-slate-200 border border-white/10 text-center transition"
          >
            Client Login
          </Link>
          <Link
            to="/admin"
            onClick={() => setMobileMenuOpen(false)}
            className="block w-full py-3 px-4 rounded-xl text-sm font-bold bg-slate-900/80 hover:bg-white/5 text-slate-200 border border-white/10 text-center transition"
          >
            Admin Portal
          </Link>
          <Link
            to="/client-signup"
            onClick={() => setMobileMenuOpen(false)}
            className="block w-full py-3 px-4 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 text-center shadow-lg shadow-emerald-500/30 transition"
          >
            Get Started Free
          </Link>
        </div>
      )}

      {/* Hero Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 pt-20 pb-28 text-center space-y-8">
        {/* Floating badge */}
        <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-gray-300 shadow-inner">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span className="font-medium">Direct WhatsApp Cloud API Integration</span>
          <span className="text-gray-500">•</span>
          <span className="text-emerald-400 font-semibold">BYOK & Managed Pool Supported</span>
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold text-white tracking-tight max-w-4xl mx-auto leading-[1.1]">
          High-Velocity Bulk WhatsApp <br />
          <span className="gradient-text-emerald">Messaging at Scale</span>
        </h1>

        <p className="text-base sm:text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed">
          Broadcast personalized promotions, order updates, and rich media directly to thousands of verified WhatsApp numbers with automated compliance and live delivery telemetry.
        </p>

        {/* Hero Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            to="/client-signup"
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:via-teal-400 hover:to-cyan-400 text-gray-950 font-extrabold text-base transition-all duration-300 shadow-xl shadow-emerald-500/25 active:scale-[0.98] flex items-center justify-center space-x-2"
          >
            <span>Start Free Trial</span>
            <span>→</span>
          </Link>
          <Link
            to="/admin"
            className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-gray-200 font-bold text-base transition flex items-center justify-center space-x-2"
          >
            <span>🛡️</span>
            <span>Admin Portal</span>
          </Link>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto pt-12">
          <div className="glass-panel p-5 rounded-2xl text-center">
            <p className="text-3xl font-extrabold text-emerald-400 font-mono">99.8%</p>
            <p className="text-xs text-gray-400 mt-1 uppercase font-semibold">Delivery Rate</p>
          </div>
          <div className="glass-panel p-5 rounded-2xl text-center">
            <p className="text-3xl font-extrabold text-blue-400 font-mono">&lt; 1.2s</p>
            <p className="text-xs text-gray-400 mt-1 uppercase font-semibold">Dispatch Latency</p>
          </div>
          <div className="glass-panel p-5 rounded-2xl text-center">
            <p className="text-3xl font-extrabold text-cyan-400 font-mono">100%</p>
            <p className="text-xs text-gray-400 mt-1 uppercase font-semibold">Meta BYOK Support</p>
          </div>
          <div className="glass-panel p-5 rounded-2xl text-center">
            <p className="text-3xl font-extrabold text-purple-400 font-mono">GDPR</p>
            <p className="text-xs text-gray-400 mt-1 uppercase font-semibold">Compliant Opt-Out</p>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 py-20 border-t border-white/5">
        <div className="text-center space-y-3 mb-16">
          <h2 className="text-xs uppercase font-extrabold tracking-widest text-emerald-400">
            Engineered For Reliability
          </h2>
          <p className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Built for Marketing Teams & Enterprise Workflows
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-panel-interactive p-8 rounded-3xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl">
              📤
            </div>
            <h3 className="text-xl font-bold text-white">High-Speed Bulk Dispatch</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              Broadcast text, images, video, and PDF brochures to contact lists via CSV/TXT upload or instant number pasting.
            </p>
          </div>

          <div className="glass-panel-interactive p-8 rounded-3xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center text-2xl">
              ⚡
            </div>
            <h3 className="text-xl font-bold text-white">Live Webhook Telemetry</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              Track sent, delivered, read, and failed statuses in real time. Know exactly when recipients view your announcements.
            </p>
          </div>

          <div className="glass-panel-interactive p-8 rounded-3xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center text-2xl">
              🛡️
            </div>
            <h3 className="text-xl font-bold text-white">Automated Opt-Out & TCPA</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              Automatic customer unsubscribe when users reply STOP or CANCEL, instantly updating contact registries to prevent spam flags.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
