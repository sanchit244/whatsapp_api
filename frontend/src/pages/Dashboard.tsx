import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import {
  AdminTenantsTab,
  AdminRevenueTab,
  AdminBlacklistTab,
  AdminAuditLogsTab,
  AdminAnnouncementTab,
} from './AdminFeatureTabs';
import { extractErrorMessage } from '../utils/errorHelper';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const auth = React.useContext(AuthContext);

  const [activeTab, setActiveTab] = useState<
    'overview' | 'users' | 'tenants' | 'revenue' | 'blacklist' | 'audit_logs' | 'announcements' | 'meta_config'
  >('overview');

  // Stats state
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalTenants: 0,
    totalCampaigns: 0,
    activeCampaigns: 0,
    totalMessages: 0,
    sentMessages: 0,
    deliveredMessages: 0,
    failedMessages: 0,
    deliveryRate: '100%',
  });

  // Campaigns list state
  const [allCampaigns, setAllCampaigns] = useState<any[]>([]);

  // Users list state
  const [usersList, setUsersList] = useState<any[]>([]);

  // User Filtering & Pending Approval Modal states
  const [userFilter, setUserFilter] = useState<'all' | 'pending' | 'active' | 'suspended'>('all');
  const [approvalModalUser, setApprovalModalUser] = useState<any | null>(null);
  const [approvalPasswordOption, setApprovalPasswordOption] = useState<'keep' | 'custom'>('keep');
  const [approvalCustomPassword, setApprovalCustomPassword] = useState('');
  const [approvalPlan, setApprovalPlan] = useState('starter');
  const [approvalQuota, setApprovalQuota] = useState(10000);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Success credentials preview card
  const [approvedCredentialsCard, setApprovedCredentialsCard] = useState<{
    email: string;
    password?: string;
    clientName: string;
    company: string;
    quota: number;
    plan: string;
  } | null>(null);
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Edit / Reset credentials modal
  const [credsModalUser, setCredsModalUser] = useState<any | null>(null);
  const [newCredsPassword, setNewCredsPassword] = useState('');
  const [credsSubmitting, setCredsSubmitting] = useState(false);
  const [credsSuccessMsg, setCredsSuccessMsg] = useState('');

  // Global Meta Config state
  const [metaConfig, setMetaConfig] = useState({
    token: '',
    token_masked: '',
    is_token_configured: false,
    phone_number_id: '',
    business_account_id: '',
    webhook_verify_token: '',
    webhook_callback_url: '',
  });

  const [saveStatus, setSaveStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Fetch admin platform stats
  const fetchStats = async () => {
    if (!auth?.token) return;
    try {
      const res = await fetch('http://localhost:3000/api/v1/admin/stats', {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  // Fetch all campaigns across the platform
  const fetchAllCampaigns = async () => {
    if (!auth?.token) return;
    try {
      const res = await fetch('http://localhost:3000/api/v1/admin/campaigns', {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const data = await res.json();
      if (res.ok && data.campaigns) {
        setAllCampaigns(data.campaigns);
      }
    } catch (err) {
      console.error('Failed to load platform campaigns:', err);
    }
  };

  // Fetch all registered users
  const fetchUsers = async () => {
    if (!auth?.token) return;
    try {
      const res = await fetch('http://localhost:3000/api/v1/admin/users', {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const data = await res.json();
      if (res.ok && data.users) {
        setUsersList(data.users);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  // Fetch global Meta API config
  const fetchMetaConfig = async () => {
    if (!auth?.token) return;
    try {
      const res = await fetch('http://localhost:3000/api/v1/admin/meta-config', {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setMetaConfig({
          token: '',
          token_masked: data.token_masked || '',
          is_token_configured: data.is_token_configured,
          phone_number_id: data.phone_number_id || '',
          business_account_id: data.business_account_id || '',
          webhook_verify_token: data.webhook_verify_token || '',
          webhook_callback_url: data.webhook_callback_url || '',
        });
      }
    } catch (err) {
      console.error('Failed to load Meta config:', err);
    }
  };

  useEffect(() => {
    if (!auth?.token) {
      navigate('/login');
      return;
    }
    fetchStats();
    fetchAllCampaigns();
    fetchUsers();
    fetchMetaConfig();

    const timer = setInterval(() => {
      fetchStats();
      fetchAllCampaigns();
    }, 6000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token]);

  // Handle Save Global Meta API Config
  const handleSaveMetaConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveStatus(null);

    try {
      const res = await fetch('http://localhost:3000/api/v1/admin/meta-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth?.token}`,
        },
        body: JSON.stringify(metaConfig),
      });

      const data = await res.json();
      if (res.ok) {
        setSaveStatus({
          success: true,
          message: data.test_result?.success
            ? '✅ Configuration saved and verified with Meta Graph API!'
            : '✅ Configuration saved successfully.',
        });
        fetchMetaConfig();
      } else {
        setSaveStatus({
          success: false,
          message: extractErrorMessage(data, 'Failed to save configuration'),
        });
      }
    } catch (err: any) {
      setSaveStatus({ success: false, message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const pendingClients = usersList.filter(
    (u) => !u.is_admin && (u.user_status === 'pending' || u.tenant_status === 'pending')
  );

  // Password generator helper
  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let res = '';
    for (let i = 0; i < 9; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'Wp#' + res;
  };

  // Open approve & credentials modal
  const handleOpenApprovalModal = (user: any) => {
    setApprovalModalUser(user);
    setApprovalPasswordOption('keep');
    setApprovalCustomPassword(generateRandomPassword());
    setApprovalPlan(user.plan || 'starter');
    setApprovalQuota(user.monthly_quota || 10000);
    setShowPassword(false);
  };

  // Submit client approval
  const handleApproveClient = async () => {
    if (!approvalModalUser || !auth?.token) return;
    setApprovalSubmitting(true);
    try {
      const passwordToSet =
        approvalPasswordOption === 'custom' ? approvalCustomPassword.trim() : undefined;

      const res = await fetch(`http://localhost:3000/api/v1/admin/users/${approvalModalUser.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          password: passwordToSet,
          plan: approvalPlan,
          monthly_quota: approvalQuota,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        await fetchUsers();
        await fetchStats();
        setApprovedCredentialsCard({
          email: approvalModalUser.email,
          password: passwordToSet,
          clientName:
            `${approvalModalUser.first_name || ''} ${approvalModalUser.last_name || ''}`.trim() ||
            approvalModalUser.email,
          company: approvalModalUser.tenant_name || 'Organization',
          quota: approvalQuota,
          plan: approvalPlan,
        });
        setApprovalModalUser(null);
      } else {
        alert(extractErrorMessage(data, 'Failed to approve client'));
      }
    } catch (err: any) {
      alert('Error approving client: ' + err.message);
    } finally {
      setApprovalSubmitting(false);
    }
  };

  // Reject client registration
  const handleRejectClient = async (userId: string, email: string) => {
    if (!window.confirm(`Are you sure you want to reject the registration request for ${email}?`)) {
      return;
    }
    try {
      const res = await fetch(`http://localhost:3000/api/v1/admin/users/${userId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth?.token}`,
        },
      });
      if (res.ok) {
        fetchUsers();
        fetchStats();
      }
    } catch (err) {
      console.error('Failed to reject registration:', err);
    }
  };

  // Open reset credentials modal
  const handleOpenCredsModal = (user: any) => {
    setCredsModalUser(user);
    setNewCredsPassword(generateRandomPassword());
    setCredsSuccessMsg('');
    setShowPassword(false);
  };

  // Update credentials
  const handleUpdateCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credsModalUser || !newCredsPassword.trim()) return;
    setCredsSubmitting(true);
    setCredsSuccessMsg('');
    try {
      const res = await fetch(
        `http://localhost:3000/api/v1/admin/users/${credsModalUser.id}/credentials`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${auth?.token}`,
          },
          body: JSON.stringify({ password: newCredsPassword.trim() }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        setCredsSuccessMsg('✅ Password updated successfully! Copy and send credentials to the client.');
      } else {
        alert(extractErrorMessage(data, 'Failed to update credentials'));
      }
    } catch (err: any) {
      alert('Failed: ' + err.message);
    } finally {
      setCredsSubmitting(false);
    }
  };

  // Copy helper
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 3000);
  };

  // Toggle user suspension
  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      const res = await fetch(`http://localhost:3000/api/v1/admin/users/${userId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth?.token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        fetchUsers();
      }
    } catch (err) {
      console.error('Failed to toggle status:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans relative overflow-x-hidden selection:bg-rose-500/20 selection:text-rose-300">
      {/* Background Grid Pattern & Ambient Glowing Orbs */}
      <div className="fixed inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px] opacity-15 pointer-events-none" />
      <div className="fixed -top-40 -left-40 w-96 h-96 bg-rose-600/10 rounded-full blur-3xl pointer-events-none animate-float" />
      <div className="fixed top-1/3 -right-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none animate-float-reverse" />
      <div className="fixed -bottom-40 left-1/3 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl pointer-events-none animate-float" />

      {/* Admin Sticky Glass Navbar */}
      <nav className="glass-panel sticky top-0 z-30 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-white/10 backdrop-blur-xl bg-slate-950/70">
        <div className="flex items-center space-x-3.5">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center font-black text-white text-sm shadow-lg shadow-rose-600/30">
              ADM
            </div>
            <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-400 border-2 border-[#070b14] rounded-full animate-ping" />
            <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-[#070b14] rounded-full" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold text-white tracking-wide">WhatsApp Command Center</h1>
              <span className="px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                Super-Admin
              </span>
            </div>
            <p className="text-xs text-slate-400">Global Infrastructure & Meta Cloud Engine Oversight</p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-lg shadow-rose-500/10'
                : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <span>📊</span> System Overview
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-2 ${
              activeTab === 'users'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-lg shadow-rose-500/10'
                : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <span>👥</span>
            <span>Clients & Organizations</span>
            {pendingClients.length > 0 && (
              <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full shadow-md animate-pulse">
                {pendingClients.length} Pending
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('tenants')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === 'tenants'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-lg shadow-rose-500/10'
                : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <span>🏢</span> Tenants &amp; Quotas
          </button>
          <button
            onClick={() => setActiveTab('revenue')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === 'revenue'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-lg shadow-rose-500/10'
                : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <span>💰</span> Stripe Revenue
          </button>
          <button
            onClick={() => setActiveTab('blacklist')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === 'blacklist'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-lg shadow-rose-500/10'
                : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <span>🛡️</span> Global DNC
          </button>
          <button
            onClick={() => setActiveTab('audit_logs')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === 'audit_logs'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-lg shadow-rose-500/10'
                : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <span>📜</span> Audit Trail
          </button>
          <button
            onClick={() => setActiveTab('announcements')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === 'announcements'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-lg shadow-rose-500/10'
                : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <span>📢</span> Announcements
          </button>
          <button
            onClick={() => setActiveTab('meta_config')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === 'meta_config'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-lg shadow-rose-500/10'
                : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <span>⚡</span> Meta API Gateway
          </button>
          <button
            onClick={() => {
              auth?.logout();
              navigate('/login');
            }}
            className="ml-2 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 hover:border-transparent font-semibold py-2 px-3.5 rounded-xl text-xs transition-all duration-200 shadow-sm"
          >
            Log Out
          </button>
        </div>
      </nav>

      {/* Main Admin Content */}
      <main className="max-w-7xl mx-auto w-full p-6 space-y-6 flex-1 relative z-10">
        {/* Tab 1: System Overview */}
        {activeTab === 'overview' && (
          <>
            {/* Real Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="glass-panel p-5 rounded-2xl border border-white/10 hover:border-rose-500/30 transition-all duration-300 relative overflow-hidden group shadow-xl">
                <div className="absolute -right-6 -top-6 w-24 h-24 bg-rose-500/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500" />
                <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Total Tenants & Clients</span>
                <p className="text-3xl font-extrabold text-white mt-2 font-mono tracking-tight">{stats.totalTenants}</p>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {stats.totalUsers} registered user accounts
                </p>
              </div>

              <div className="glass-panel p-5 rounded-2xl border border-white/10 hover:border-blue-500/30 transition-all duration-300 relative overflow-hidden group shadow-xl">
                <div className="absolute -right-6 -top-6 w-24 h-24 bg-blue-500/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500" />
                <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Platform Campaigns</span>
                <p className="text-3xl font-extrabold text-blue-400 mt-2 font-mono tracking-tight">{stats.totalCampaigns}</p>
                <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {stats.activeCampaigns} live sending right now
                </p>
              </div>

              <div className="glass-panel p-5 rounded-2xl border border-white/10 hover:border-purple-500/30 transition-all duration-300 relative overflow-hidden group shadow-xl">
                <div className="absolute -right-6 -top-6 w-24 h-24 bg-purple-500/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500" />
                <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Dispatched Messages</span>
                <p className="text-3xl font-extrabold text-purple-300 mt-2 font-mono tracking-tight">{stats.sentMessages.toLocaleString()}</p>
                <p className="text-xs text-slate-400 mt-1">{stats.totalMessages.toLocaleString()} total platform volume</p>
              </div>

              <div className="glass-panel p-5 rounded-2xl border border-white/10 hover:border-emerald-500/30 transition-all duration-300 relative overflow-hidden group shadow-xl">
                <div className="absolute -right-6 -top-6 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500" />
                <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Delivery Success Rate</span>
                <p className="text-3xl font-extrabold text-emerald-400 mt-2 font-mono tracking-tight">{stats.deliveryRate}</p>
                <p className="text-xs text-slate-400 mt-1">{stats.deliveredMessages.toLocaleString()} verified handoffs</p>
              </div>
            </div>

            {/* Platform Campaigns Table */}
            <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
              <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-slate-900/40">
                <div>
                  <h2 className="text-base font-bold text-white">Platform-Wide Active Campaigns</h2>
                  <p className="text-xs text-slate-400">Real-time status across all registered client accounts</p>
                </div>
                <button
                  onClick={() => {
                    fetchStats();
                    fetchAllCampaigns();
                  }}
                  className="text-xs text-slate-300 hover:text-white glass-panel px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition flex items-center gap-1.5"
                >
                  <span>🔄</span> Refresh
                </button>
              </div>

              {allCampaigns.length === 0 ? (
                <div className="p-12 text-center text-slate-400 space-y-2">
                  <p className="text-base font-medium">No campaigns launched on the platform yet.</p>
                  <p className="text-xs text-slate-500">When clients dispatch campaigns, live metrics will populate here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-900/60 text-[11px] uppercase text-slate-400 font-semibold border-b border-white/10 tracking-wider">
                      <tr>
                        <th className="px-6 py-3.5">Campaign Name</th>
                        <th className="px-6 py-3.5">Tenant / Organization</th>
                        <th className="px-6 py-3.5">Status</th>
                        <th className="px-6 py-3.5">Progress</th>
                        <th className="px-6 py-3.5">Delivered</th>
                        <th className="px-6 py-3.5">Failed</th>
                        <th className="px-6 py-3.5">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {allCampaigns.map((camp) => {
                        const total = camp.total_messages || 0;
                        const sent = camp.messages_sent || 0;
                        const pct = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;

                        return (
                          <tr key={camp.id} className="hover:bg-white/[0.02] transition">
                            <td className="px-6 py-4 font-semibold text-white">{camp.name}</td>
                            <td className="px-6 py-4 text-xs font-mono text-slate-300">
                              {camp.tenant_name || 'Individual'}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 ${
                                  camp.status === 'completed'
                                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                                    : camp.status === 'active'
                                    ? 'bg-blue-500/10 text-blue-300 border border-blue-500/30 animate-pulse'
                                    : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${camp.status === 'completed' ? 'bg-emerald-400' : camp.status === 'active' ? 'bg-blue-400' : 'bg-amber-400'}`} />
                                {camp.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-6 py-4 w-44">
                              <div className="flex items-center space-x-2.5">
                                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-white/5">
                                  <div
                                    className={`h-2 rounded-full transition-all duration-500 ${camp.status === 'active' ? 'bg-gradient-to-r from-blue-500 to-cyan-400' : 'bg-gradient-to-r from-emerald-500 to-teal-400'}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-xs font-mono text-slate-400">{sent}/{total}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 font-mono text-emerald-400">
                              {(camp.messages_delivered || 0).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 font-mono text-rose-400">
                              {(camp.messages_failed || 0).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-400">
                              {new Date(camp.created_at).toLocaleDateString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Tab 2: Clients & Tenants Management */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            {/* Pending Approvals Spotlight Card */}
            {pendingClients.length > 0 && (
              <div className="glass-panel bg-gradient-to-r from-amber-500/10 via-slate-900/80 to-amber-500/5 border-2 border-amber-500/40 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-amber-500/20">
                  <div className="flex items-center space-x-3.5">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-xl shadow-lg shadow-amber-500/10">
                      🔔
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <span>Pending Registrations Awaiting Verification</span>
                        <span className="bg-amber-400 text-slate-950 text-xs font-black px-2 py-0.5 rounded-full shadow">
                          {pendingClients.length} Action Needed
                        </span>
                      </h3>
                      <p className="text-xs text-amber-200/80">
                        Review submitted client organizations, assign monthly quotas, and issue active credentials.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {pendingClients.map((user) => (
                    <div
                      key={user.id}
                      className="glass-panel bg-slate-900/70 border border-amber-500/30 rounded-xl p-4 space-y-3 shadow-lg hover:border-amber-400 transition"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-white text-sm">
                            {user.first_name || user.last_name
                              ? `${user.first_name || ''} ${user.last_name || ''}`
                              : 'Client Request'}
                          </p>
                          <p className="text-xs text-slate-300 font-mono mt-0.5">{user.email}</p>
                        </div>
                        <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">
                          PENDING
                        </span>
                      </div>

                      <div className="text-xs space-y-1.5 text-slate-400 bg-slate-950/50 p-3 rounded-lg border border-white/5">
                        <div className="flex justify-between">
                          <span>Organization:</span>
                          <span className="text-slate-200 font-semibold">{user.tenant_name || 'Individual'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Phone / WA:</span>
                          <span className="text-slate-200 font-mono">{user.phone || 'Not provided'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Registered:</span>
                          <span className="text-slate-400">{new Date(user.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleOpenApprovalModal(user)}
                          className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold py-2 px-3 rounded-lg text-xs transition shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5"
                        >
                          <span>✅</span> Approve & Issue Creds
                        </button>
                        <button
                          onClick={() => handleRejectClient(user.id, user.email)}
                          className="glass-panel text-slate-300 hover:text-rose-300 hover:border-rose-500/40 py-2 px-3 rounded-lg text-xs transition"
                          title="Reject Registration"
                        >
                          ✕ Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Main Clients & Tenants Table Container */}
            <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
              <div className="px-6 py-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/40">
                <div>
                  <h2 className="text-base font-bold text-white">Registered Platform Organizations</h2>
                  <p className="text-xs text-slate-400">
                    Authorize registrations, manage client credentials, assign monthly quotas, and monitor account access.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* Status Filter Chips */}
                  <div className="flex glass-panel p-1 rounded-xl border border-white/10 text-xs">
                    <button
                      onClick={() => setUserFilter('all')}
                      className={`px-3 py-1 rounded-lg transition font-medium ${
                        userFilter === 'all' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      All ({usersList.length})
                    </button>
                    <button
                      onClick={() => setUserFilter('pending')}
                      className={`px-3 py-1 rounded-lg transition font-medium flex items-center gap-1 ${
                        userFilter === 'pending'
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                          : 'text-slate-400 hover:text-amber-300'
                      }`}
                    >
                      Pending ({pendingClients.length})
                    </button>
                    <button
                      onClick={() => setUserFilter('active')}
                      className={`px-3 py-1 rounded-lg transition font-medium ${
                        userFilter === 'active' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Active ({usersList.filter((u) => !u.is_admin && u.user_status === 'active' && u.tenant_status === 'active').length})
                    </button>
                    <button
                      onClick={() => setUserFilter('suspended')}
                      className={`px-3 py-1 rounded-lg transition font-medium ${
                        userFilter === 'suspended' ? 'bg-rose-900/80 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Suspended ({usersList.filter((u) => !u.is_admin && (u.user_status === 'suspended' || u.tenant_status === 'suspended')).length})
                    </button>
                  </div>

                  <button
                    onClick={fetchUsers}
                    className="text-xs text-slate-300 hover:text-white glass-panel px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition flex items-center gap-1"
                  >
                    <span>🔄</span> Refresh
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-900/60 text-[11px] uppercase text-slate-400 font-semibold border-b border-white/10 tracking-wider">
                    <tr>
                      <th className="px-6 py-3.5">Client Email & Name</th>
                      <th className="px-6 py-3.5">Organization & Phone</th>
                      <th className="px-6 py-3.5">Role</th>
                      <th className="px-6 py-3.5">Plan / Quota</th>
                      <th className="px-6 py-3.5">Account Status</th>
                      <th className="px-6 py-3.5">Registered / Approved</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {usersList
                      .filter((u) => {
                        if (userFilter === 'pending') {
                          return !u.is_admin && (u.user_status === 'pending' || u.tenant_status === 'pending');
                        }
                        if (userFilter === 'active') {
                          return !u.is_admin && u.user_status === 'active' && u.tenant_status === 'active';
                        }
                        if (userFilter === 'suspended') {
                          return !u.is_admin && (u.user_status === 'suspended' || u.tenant_status === 'suspended');
                        }
                        return true;
                      })
                      .map((user) => {
                        const isPending = !user.is_admin && (user.user_status === 'pending' || user.tenant_status === 'pending');
                        const isSuspended = !user.is_admin && (user.user_status === 'suspended' || user.tenant_status === 'suspended');
                        const isRejected = user.user_status === 'rejected';

                        return (
                          <tr
                            key={user.id}
                            className={`transition ${
                              isPending
                                ? 'bg-amber-500/5 hover:bg-amber-500/10'
                                : 'hover:bg-white/[0.02]'
                            }`}
                          >
                            <td className="px-6 py-4">
                              <p className="font-semibold text-white">{user.email}</p>
                              <p className="text-xs text-slate-400">
                                {user.first_name} {user.last_name}
                              </p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="font-semibold text-white text-xs">{user.tenant_name || 'Individual'}</p>
                              <p className="text-xs text-slate-400 font-mono">{user.phone || 'No phone'}</p>
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-xs font-bold inline-flex items-center gap-1 ${
                                  user.is_admin
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                    : 'bg-slate-800 text-slate-300 border border-white/5'
                                }`}
                              >
                                {user.is_admin ? 'SUPER-ADMIN' : 'CLIENT'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-xs">
                              <span className="capitalize text-slate-200 font-semibold">{user.plan || 'starter'}</span>
                              <p className="text-[11px] text-slate-400 font-mono">
                                {user.monthly_quota ? `${Number(user.monthly_quota).toLocaleString()} msgs/mo` : '10,000 msgs/mo'}
                              </p>
                            </td>
                            <td className="px-6 py-4">
                              {isPending ? (
                                <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                                  ⏳ PENDING
                                </span>
                              ) : isSuspended ? (
                                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                  SUSPENDED
                                </span>
                              ) : isRejected ? (
                                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400">
                                  REJECTED
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  ACTIVE
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-400">
                              <p>Created: {new Date(user.created_at).toLocaleDateString()}</p>
                              {user.approved_at && (
                                <p className="text-[11px] text-emerald-400">
                                  Approved: {new Date(user.approved_at).toLocaleDateString()}
                                </p>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right space-x-1.5 whitespace-nowrap">
                              {!user.is_admin && (
                                <>
                                  {isPending ? (
                                    <>
                                      <button
                                        onClick={() => handleOpenApprovalModal(user)}
                                        className="text-xs px-3 py-1.5 rounded-lg font-bold bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white transition shadow-sm"
                                      >
                                        Approve & Creds
                                      </button>
                                      <button
                                        onClick={() => handleRejectClient(user.id, user.email)}
                                        className="text-xs px-2.5 py-1.5 rounded-lg glass-panel hover:text-rose-300 transition"
                                      >
                                        Reject
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => handleOpenCredsModal(user)}
                                        className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600 text-blue-200 hover:text-white border border-blue-500/30 transition"
                                        title="Assign new password or reset credentials"
                                      >
                                        🔑 Edit Creds
                                      </button>
                                      <button
                                        onClick={() =>
                                          handleToggleUserStatus(user.id, user.tenant_status || 'active')
                                        }
                                        className={`text-xs px-2.5 py-1.5 rounded-lg transition ${
                                          user.tenant_status === 'active'
                                            ? 'bg-rose-500/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30'
                                            : 'bg-emerald-500/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30'
                                        }`}
                                      >
                                        {user.tenant_status === 'active' ? 'Suspend' : 'Activate'}
                                      </button>
                                    </>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Modal 1: Approve Client & Set Credentials */}
        {approvalModalUser && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="glass-panel border border-white/20 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl shadow-black/80 bg-slate-900/90">
              <div className="flex justify-between items-center pb-3 border-b border-white/10">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>✅</span> Authorize Client & Setup Credentials
                  </h3>
                  <p className="text-xs text-slate-400">Accept registration and grant immediate portal access</p>
                </div>
                <button
                  onClick={() => setApprovalModalUser(null)}
                  className="text-slate-400 hover:text-white text-xl leading-none"
                >
                  ✕
                </button>
              </div>

              {/* Client Info Header */}
              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-white/5 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Client Email:</span>
                  <span className="text-white font-mono font-bold">{approvalModalUser.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Client Name:</span>
                  <span className="text-slate-200">
                    {approvalModalUser.first_name} {approvalModalUser.last_name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Company / Organization:</span>
                  <span className="text-slate-200">{approvalModalUser.tenant_name || 'Individual'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Phone Number:</span>
                  <span className="text-slate-200 font-mono">{approvalModalUser.phone || 'N/A'}</span>
                </div>
              </div>

              {/* Credential Options */}
              <div className="space-y-3">
                <label className="block text-xs uppercase font-semibold text-slate-300">
                  Credentials & Password Setup
                </label>

                <div className="space-y-2">
                  <label className="flex items-center space-x-2 text-sm text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="passOption"
                      checked={approvalPasswordOption === 'keep'}
                      onChange={() => setApprovalPasswordOption('keep')}
                      className="text-rose-500 focus:ring-rose-500"
                    />
                    <span>Keep password client entered at registration</span>
                  </label>

                  <label className="flex items-center space-x-2 text-sm text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="passOption"
                      checked={approvalPasswordOption === 'custom'}
                      onChange={() => setApprovalPasswordOption('custom')}
                      className="text-rose-500 focus:ring-rose-500"
                    />
                    <span>Assign specific password / temporary credentials</span>
                  </label>
                </div>

                {approvalPasswordOption === 'custom' && (
                  <div className="bg-slate-950/60 p-3 rounded-xl border border-white/10 space-y-2 mt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">Assigned Password:</span>
                      <button
                        type="button"
                        onClick={() => setApprovalCustomPassword(generateRandomPassword())}
                        className="text-xs text-rose-400 hover:text-rose-300 font-semibold"
                      >
                        🎲 Generate Secure
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={approvalCustomPassword}
                        onChange={(e) => setApprovalCustomPassword(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-900 text-white rounded-lg border border-white/10 text-sm font-mono focus:border-emerald-500 outline-none"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white"
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      This password will replace any existing password and enable immediate login.
                    </p>
                  </div>
                )}
              </div>

              {/* Plan & Quota Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase font-semibold text-slate-300 mb-1">
                    Subscription Plan
                  </label>
                  <select
                    value={approvalPlan}
                    onChange={(e) => setApprovalPlan(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 text-white rounded-lg border border-white/10 text-sm focus:border-emerald-500 outline-none"
                  >
                    <option value="starter">Starter Plan</option>
                    <option value="pro">Pro Plan</option>
                    <option value="enterprise">Enterprise Plan</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase font-semibold text-slate-300 mb-1">
                    Monthly Quota (Messages)
                  </label>
                  <input
                    type="number"
                    value={approvalQuota}
                    onChange={(e) => setApprovalQuota(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-800 text-white rounded-lg border border-white/10 text-sm focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setApprovalModalUser(null)}
                  className="px-4 py-2 glass-panel text-slate-300 rounded-lg text-sm hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={approvalSubmitting}
                  onClick={handleApproveClient}
                  className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold rounded-lg text-sm transition shadow-lg shadow-emerald-600/30 disabled:opacity-50"
                >
                  {approvalSubmitting ? 'Approving...' : 'Confirm Approval & Activate'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal 2: Approved Credentials Ready Card (Copy for Client) */}
        {approvedCredentialsCard && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="glass-panel border border-emerald-500/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl bg-slate-900/95">
              <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto text-2xl shadow-lg shadow-emerald-500/20">
                ✓
              </div>
              <h3 className="text-xl font-bold text-white text-center">Client Successfully Activated!</h3>
              <p className="text-xs text-slate-300 text-center">
                The account has been approved. Provide these portal credentials to your client.
              </p>

              <div className="bg-slate-950/70 p-4 rounded-xl border border-white/10 text-xs space-y-2.5 font-mono text-slate-300">
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-400">Portal Link:</span>
                  <span className="text-cyan-400">http://localhost:3001/client-login</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-400">Email:</span>
                  <span className="text-white font-bold">{approvedCredentialsCard.email}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-400">Password:</span>
                  <span className="text-amber-300 font-bold">
                    {approvedCredentialsCard.password || '(Client’s registration password)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Quota:</span>
                  <span className="text-emerald-400">{approvedCredentialsCard.quota.toLocaleString()} msgs</span>
                </div>
              </div>

              <div className="space-y-2.5 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      `🎉 WhatsApp Messaging Account Approved!\n\nPortal: http://localhost:3001/client-login\nEmail: ${
                        approvedCredentialsCard.email
                      }\nPassword: ${
                        approvedCredentialsCard.password || '(The password you entered during registration)'
                      }\nQuota: ${approvedCredentialsCard.quota.toLocaleString()} messages/month`
                    )
                  }
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2.5 rounded-xl text-sm transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
                >
                  <span>📋</span>
                  {copiedNotification ? 'Credentials Copied to Clipboard!' : 'Copy Credentials to Send to Client'}
                </button>

                <button
                  type="button"
                  onClick={() => setApprovedCredentialsCard(null)}
                  className="w-full glass-panel hover:bg-white/5 text-slate-300 py-2 rounded-xl text-xs transition border border-white/5"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal 3: Edit / Reset Credentials for Existing Client */}
        {credsModalUser && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="glass-panel border border-white/20 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl bg-slate-900/90">
              <div className="flex justify-between items-center pb-3 border-b border-white/10">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>🔑</span> Update Client Password / Credentials
                </h3>
                <button
                  onClick={() => setCredsModalUser(null)}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="bg-slate-950/60 p-3 rounded-xl text-xs space-y-1 border border-white/5">
                <p className="text-slate-400">Target Client Account:</p>
                <p className="font-mono text-white font-bold">{credsModalUser.email}</p>
              </div>

              {credsSuccessMsg ? (
                <div className="space-y-3">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-200 text-xs">
                    {credsSuccessMsg}
                  </div>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `WhatsApp Account Credentials Updated:\nLogin: http://localhost:3001/client-login\nEmail: ${credsModalUser.email}\nNew Password: ${newCredsPassword}`
                      )
                    }
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20"
                  >
                    <span>📋</span>
                    {copiedNotification ? 'Copied!' : 'Copy New Credentials'}
                  </button>
                  <button
                    onClick={() => setCredsModalUser(null)}
                    className="w-full glass-panel text-slate-300 py-2 rounded-xl text-xs"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleUpdateCredentials} className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs uppercase font-semibold text-slate-300">New Password</label>
                      <button
                        type="button"
                        onClick={() => setNewCredsPassword(generateRandomPassword())}
                        className="text-xs text-rose-400 hover:text-rose-300 font-semibold"
                      >
                        🎲 Generate
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={newCredsPassword}
                        onChange={(e) => setNewCredsPassword(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-800 text-white rounded-lg border border-white/10 text-sm font-mono focus:border-rose-500 outline-none"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white"
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setCredsModalUser(null)}
                      className="px-4 py-2 glass-panel text-slate-300 rounded-lg text-xs hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={credsSubmitting}
                      className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-lg text-xs transition shadow-md shadow-blue-600/20 disabled:opacity-50"
                    >
                      {credsSubmitting ? 'Updating...' : 'Set Credentials'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Global Meta API Configuration */}
        {activeTab === 'meta_config' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form Settings */}
            <div className="lg:col-span-2 glass-panel p-6 rounded-2xl border border-white/10 shadow-2xl space-y-6">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white">Platform Meta WhatsApp Cloud API Setup</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    Global Gateway
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-1">
                  Configure the primary Meta Cloud API credentials that power platform messaging for all standard client accounts.
                </p>
              </div>

              <form onSubmit={handleSaveMetaConfig} className="space-y-4">
                <div>
                  <label className="block text-xs uppercase font-semibold text-slate-300 mb-1">
                    Meta Permanent System User Token
                  </label>
                  <input
                    type="password"
                    placeholder={metaConfig.token_masked || 'Paste permanent access token from Meta Business Manager'}
                    value={metaConfig.token}
                    onChange={(e) => setMetaConfig({ ...metaConfig, token: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-900/80 text-white rounded-xl border border-white/10 text-sm focus:border-rose-500 outline-none transition"
                  />
                  <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1.5">
                    <span>Status:</span>
                    <span className={`font-semibold ${metaConfig.is_token_configured ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {metaConfig.is_token_configured ? '● Configured & Active' : '○ Not configured (Simulation fallback)'}
                    </span>
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs uppercase font-semibold text-slate-300 mb-1">
                      Platform Phone Number ID
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 104567890123456"
                      value={metaConfig.phone_number_id}
                      onChange={(e) => setMetaConfig({ ...metaConfig, phone_number_id: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-900/80 text-white rounded-xl border border-white/10 text-sm focus:border-rose-500 outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs uppercase font-semibold text-slate-300 mb-1">
                      Business Account ID (WABA ID)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 204567890123456"
                      value={metaConfig.business_account_id}
                      onChange={(e) => setMetaConfig({ ...metaConfig, business_account_id: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-900/80 text-white rounded-xl border border-white/10 text-sm focus:border-rose-500 outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase font-semibold text-slate-300 mb-1">
                    Meta Webhook Verify Token
                  </label>
                  <input
                    type="text"
                    value={metaConfig.webhook_verify_token}
                    onChange={(e) => setMetaConfig({ ...metaConfig, webhook_verify_token: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-900/80 text-white rounded-xl border border-white/10 text-sm focus:border-rose-500 outline-none transition font-mono"
                  />
                  <p className="text-xs text-slate-400 mt-1">Must match the token entered in Meta Developer Webhook setup.</p>
                </div>

                {saveStatus && (
                  <div
                    className={`p-3.5 rounded-xl text-xs font-medium border ${
                      saveStatus.success ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    {saveStatus.message}
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-rose-600/30 disabled:opacity-50"
                  >
                    {saving ? 'Testing & Saving...' : 'Save & Verify Global Credentials'}
                  </button>
                </div>
              </form>
            </div>

            {/* Webhook Endpoint Instructions */}
            <div className="glass-panel p-6 rounded-2xl border border-white/10 shadow-2xl space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>🔗</span> Meta Webhook Setup Guide
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                To receive live message delivery receipts (`delivered`, `read`, `failed`), register this callback in your Meta App Dashboard under WhatsApp &gt; Configuration &gt; Webhook.
              </p>

              <div className="space-y-3.5">
                <div>
                  <span className="text-[11px] text-slate-400 uppercase font-semibold block mb-1">Callback URL</span>
                  <div className="bg-slate-950/70 p-2.5 rounded-xl border border-white/10 font-mono text-xs text-emerald-400 break-all select-all">
                    http://localhost:3000/webhooks/whatsapp
                  </div>
                </div>

                <div>
                  <span className="text-[11px] text-slate-400 uppercase font-semibold block mb-1">Verify Token</span>
                  <div className="bg-slate-950/70 p-2.5 rounded-xl border border-white/10 font-mono text-xs text-cyan-400 select-all">
                    {metaConfig.webhook_verify_token || 'whatsapp_bulk_webhook_secret_123'}
                  </div>
                </div>

                <div className="bg-slate-950/50 p-3 rounded-xl border border-white/5">
                  <span className="text-[11px] text-slate-400 uppercase font-semibold block mb-1">Webhook Subscriptions</span>
                  <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside mt-1">
                    <li><code className="text-rose-300">messages</code> (Inbound customer replies & opt-outs)</li>
                    <li><code className="text-rose-300">message_template_status_update</code></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Tenants & Quotas (with Impersonation) */}
        {activeTab === 'tenants' && <AdminTenantsTab token={auth?.token || ''} />}

        {/* Tab 5: Stripe Revenue & Transactions */}
        {activeTab === 'revenue' && <AdminRevenueTab token={auth?.token || ''} />}

        {/* Tab 6: Global Blacklist / DNC Manager */}
        {activeTab === 'blacklist' && <AdminBlacklistTab token={auth?.token || ''} />}

        {/* Tab 7: System Audit Trail & Event Logs */}
        {activeTab === 'audit_logs' && <AdminAuditLogsTab token={auth?.token || ''} />}

        {/* Tab 8: System Announcements */}
        {activeTab === 'announcements' && <AdminAnnouncementTab token={auth?.token || ''} />}
      </main>
    </div>
  );
};
