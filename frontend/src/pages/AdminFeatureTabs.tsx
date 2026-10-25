import React, { useState, useEffect, useCallback } from 'react';
import { extractErrorMessage } from '../utils/errorHelper';

const API = 'http://localhost:3000';

interface AdminTabProps {
  token: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 1: Tenants & Quota Manager + Impersonation
// ─────────────────────────────────────────────────────────────────────────────
export const AdminTenantsTab: React.FC<AdminTabProps> = ({ token }) => {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTenant, setSelectedTenant] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ plan: 'starter', monthly_quota: 10000, status: 'active', name: '' });
  const [saving, setSaving] = useState(false);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchTenants = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/v1/admin/tenants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.tenants) setTenants(data.tenants);
    } catch {
      setMsg({ text: 'Failed to load tenants', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  const handleOpenEdit = (t: any) => {
    setSelectedTenant(t);
    setEditForm({
      plan: t.plan || 'starter',
      monthly_quota: t.monthly_quota || 10000,
      status: t.status || 'active',
      name: t.name || '',
    });
  };

  const handleSaveTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;
    try {
      setSaving(true);
      const res = await fetch(`${API}/api/v1/admin/tenants/${selectedTenant.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg({ text: `Tenant "${editForm.name}" updated successfully!`, type: 'success' });
        setSelectedTenant(null);
        fetchTenants();
      } else {
        setMsg({ text: extractErrorMessage(data, 'Failed to update tenant'), type: 'error' });
      }
    } catch {
      setMsg({ text: 'Network error saving tenant', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleImpersonate = async (tenantId: string) => {
    if (!window.confirm('Login as this tenant? You will be switched to their client portal with full administrative rights.')) return;
    try {
      setImpersonating(tenantId);
      const res = await fetch(`${API}/api/v1/admin/tenants/${tenantId}/impersonate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.token) {
        // Store impersonation token and switch to client portal
        localStorage.setItem('admin_impersonator_token', token);
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('portal', 'client');
        window.location.href = '/client-dashboard';
      } else {
        alert(extractErrorMessage(data, 'Impersonation failed: no active user accounts in this tenant.'));
      }
    } catch (err: any) {
      alert(`Impersonation error: ${err.message}`);
    } finally {
      setImpersonating(null);
    }
  };

  const filtered = tenants.filter(
    (t) =>
      t.name?.toLowerCase().includes(search.toLowerCase()) ||
      t.slug?.toLowerCase().includes(search.toLowerCase()) ||
      t.id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      {msg && (
        <div className={`p-3.5 rounded-xl border text-xs flex justify-between items-center ${msg.type === 'success' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border-rose-500/40'}`}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="text-xs font-bold">✕</button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>🏢</span> Tenant Organizations &amp; Quota Manager
          </h3>
          <p className="text-xs text-slate-400">
            Control company plans, force-override message allowances, freeze accounts, and ghost-login as clients.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search tenant or slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 outline-none focus:border-emerald-500 w-full sm:w-64"
          />
          <button onClick={fetchTenants} disabled={loading} className="px-3 py-2 glass-panel hover:bg-white/10 text-white rounded-xl text-xs border border-white/10">
            🔄
          </button>
        </div>
      </div>

      {/* Tenants Table */}
      <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/60 uppercase text-[10px] font-bold tracking-wider text-slate-400 border-b border-white/10">
              <tr>
                <th className="px-5 py-3.5">Company / Tenant</th>
                <th className="px-5 py-3.5">Plan</th>
                <th className="px-5 py-3.5">Users</th>
                <th className="px-5 py-3.5">Month Usage / Quota</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Created</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              {filtered.map((t) => {
                const usage = parseInt(t.current_month_usage || '0');
                const quota = parseInt(t.monthly_quota || '10000');
                const pct = Math.min(100, Math.round((usage / quota) * 100));
                return (
                  <tr key={t.id} className="hover:bg-white/[0.02] transition">
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-white text-sm">{t.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{t.slug || t.id.substring(0, 8)}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        {t.plan || 'starter'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-white font-semibold">
                      {t.user_count || 1}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-300 mb-1">
                        <span>{usage.toLocaleString()} / {quota.toLocaleString()}</span>
                        <span className="text-emerald-400 font-bold">{pct}%</span>
                      </div>
                      <div className="w-32 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-emerald-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${t.status === 'active' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}`}>
                        {t.status || 'active'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-400 text-[11px]">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => handleOpenEdit(t)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-white border border-white/10 transition"
                      >
                        ⚙️ Adjust Quota
                      </button>
                      <button
                        onClick={() => handleImpersonate(t.id)}
                        disabled={impersonating === t.id}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition"
                        title="Log into client dashboard as this tenant"
                      >
                        {impersonating === t.id ? 'Connecting...' : '👤 Login As'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Quota / Settings Modal */}
      {selectedTenant && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="glass-panel border border-white/20 rounded-2xl w-full max-w-md p-6 bg-slate-900 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>⚙️</span> Adjust Tenant Settings
              </h3>
              <button onClick={() => setSelectedTenant(null)} className="text-slate-400 hover:text-white font-bold">✕</button>
            </div>

            <form onSubmit={handleSaveTenant} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Company / Tenant Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500 text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Subscription Plan</label>
                <select
                  value={editForm.plan}
                  onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500 text-xs"
                >
                  <option value="starter">Starter Plan (10,000 msgs)</option>
                  <option value="professional">Professional Plan (50,000 msgs)</option>
                  <option value="enterprise">Enterprise Plan (500,000 msgs)</option>
                  <option value="custom">Custom VIP / Enterprise Tier</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Monthly Message Quota (Allowance)</label>
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  value={editForm.monthly_quota}
                  onChange={(e) => setEditForm({ ...editForm, monthly_quota: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white font-mono outline-none focus:border-emerald-500 text-xs"
                  required
                />
                <p className="text-[10px] text-slate-500 mt-1">Super-admins can set any custom quota ceiling without charging via Stripe.</p>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Account Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500 text-xs"
                >
                  <option value="active">Active (Full Access)</option>
                  <option value="suspended">Suspended (Blocked from Sending)</option>
                  <option value="pending">Pending Approval</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2 border-t border-white/10">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-bold rounded-xl text-xs transition"
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTenant(null)}
                  className="px-4 py-2.5 glass-panel text-slate-300 hover:text-white rounded-xl text-xs"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 2: Stripe Revenue & Global Transaction Feed
// ─────────────────────────────────────────────────────────────────────────────
export const AdminRevenueTab: React.FC<AdminTabProps> = ({ token }) => {
  const [data, setData] = useState<{ summary: any; transactions: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRevenue = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/v1/admin/revenue`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) setData(json);
    } catch {
      console.error('Failed to load revenue data');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchRevenue();
  }, [fetchRevenue]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>💰</span> Platform Revenue &amp; Stripe Transaction Ledger
          </h3>
          <p className="text-xs text-slate-400">
            Monitor real-time income collected across subscriptions and message top-ups.
          </p>
        </div>
        <button onClick={fetchRevenue} disabled={loading} className="px-3.5 py-2 glass-panel hover:bg-white/10 text-white rounded-xl text-xs border border-white/10">
          🔄 Refresh Feed
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-xl border border-white/5 bg-slate-950/40">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Total Gross Revenue</span>
          <p className="text-2xl font-extrabold text-emerald-400 mt-1 font-mono">
            ₹{data?.summary?.total_revenue || data?.summary?.total_revenue_usd || '0.00'} INR
          </p>
          <p className="text-xs text-slate-400 mt-0.5">All-time Stripe volume</p>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-white/5 bg-slate-950/40">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Current Month Volume</span>
          <p className="text-2xl font-extrabold text-blue-400 mt-1 font-mono">
            ₹{data?.summary?.monthly_revenue || data?.summary?.monthly_revenue_usd || '0.00'} INR
          </p>
          <p className="text-xs text-slate-400 mt-0.5">Calendar month MRR</p>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-white/5 bg-slate-950/40">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Successful Payments</span>
          <p className="text-2xl font-extrabold text-cyan-300 mt-1 font-mono">
            {data?.summary?.succeeded_transactions || 0}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">Completed checkout sessions</p>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-white/5 bg-slate-950/40">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Total Transactions</span>
          <p className="text-2xl font-extrabold text-white mt-1 font-mono">
            {data?.summary?.total_transactions || 0}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">Attempted checkouts</p>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        <div className="px-5 py-3.5 border-b border-white/10 flex justify-between items-center bg-slate-900/40">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Stripe Payment Stream</h4>
          <span className="text-[11px] text-slate-400 font-mono">Real-Time Sync</span>
        </div>

        {(!data?.transactions || data.transactions.length === 0) ? (
          <div className="p-8 text-center text-slate-400 text-xs">No payment transactions recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/60 uppercase text-[10px] font-bold tracking-wider text-slate-400 border-b border-white/10">
                <tr>
                  <th className="px-5 py-3">Stripe Session / ID</th>
                  <th className="px-5 py-3">Tenant / Client</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                {data.transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-white/[0.02] transition">
                    <td className="px-5 py-3 text-white truncate max-w-xs">{tx.stripe_session_id || tx.id}</td>
                    <td className="px-5 py-3 font-sans text-xs text-slate-300">{tx.tenant_name || tx.customer_email || 'Direct Checkout'}</td>
                    <td className="px-5 py-3 font-sans capitalize text-xs">
                      {tx.payment_type === 'subscription' ? `${tx.plan || 'Plan'} Subscription` : `Credit Top-Up (+${(tx.credits_added || 0).toLocaleString()})`}
                    </td>
                    <td className="px-5 py-3 text-emerald-400 font-bold">₹{tx.amount_inr || tx.amount_usd} {tx.currency?.toUpperCase() || 'INR'}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${tx.status === 'succeeded' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-400 font-sans text-[11px]">{new Date(tx.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 3: Global Blacklist / DNC Manager
// ─────────────────────────────────────────────────────────────────────────────
export const AdminBlacklistTab: React.FC<AdminTabProps> = ({ token }) => {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [reasonInput, setReasonInput] = useState('User opt-out request');
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');

  const fetchBlacklist = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/v1/admin/blacklist`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.blacklist) setList(data.blacklist);
    } catch {
      console.error('Failed to load blacklist');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchBlacklist();
  }, [fetchBlacklist]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const numbers = phoneInput.split(/[\n,]+/).map((n) => n.trim()).filter((n) => n.length >= 7);
    if (numbers.length === 0) {
      alert('Please enter at least one valid phone number');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`${API}/api/v1/admin/blacklist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phone_numbers: numbers, reason: reasonInput }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        setShowAddModal(false);
        setPhoneInput('');
        fetchBlacklist();
      } else {
        alert(extractErrorMessage(data, 'Failed to blacklist numbers'));
      }
    } catch {
      alert('Network error adding to blacklist');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (id: string, phone: string) => {
    if (!window.confirm(`Unblock ${phone} from global blacklist?`)) return;
    try {
      const res = await fetch(`${API}/api/v1/admin/blacklist/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchBlacklist();
      }
    } catch {
      alert('Failed to remove from blacklist');
    }
  };

  const filtered = list.filter((item) =>
    item.phone_number?.includes(search) || item.reason?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>🛡️</span> Global Do-Not-Call (DNC) &amp; Blacklist Registry
          </h3>
          <p className="text-xs text-slate-400">
            Numbers listed here are automatically filtered out and blocked across all tenants to prevent Meta spam flags.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search phone number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 outline-none focus:border-rose-500 w-full sm:w-60"
          />
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-rose-600/25 flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>+</span> <span>Block Number</span>
          </button>
        </div>
      </div>

      {/* Blacklist Table */}
      <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-xs">Loading blacklist registry...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            {list.length === 0 ? 'No phone numbers blacklisted yet. All numbers are eligible for broadcast.' : 'No matching numbers found.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/60 uppercase text-[10px] font-bold tracking-wider text-slate-400 border-b border-white/10">
                <tr>
                  <th className="px-5 py-3">Phone Number</th>
                  <th className="px-5 py-3">Reason</th>
                  <th className="px-5 py-3">Source</th>
                  <th className="px-5 py-3">Date Added</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-sans">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.02] transition">
                    <td className="px-5 py-3 font-mono font-bold text-rose-300">{item.phone_number}</td>
                    <td className="px-5 py-3 text-slate-300">{item.reason}</td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold bg-white/5 text-slate-400 border border-white/10">
                        {item.source === 'webhook_stop' ? '⚡ Webhook "STOP"' : 'Admin Added'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-[11px]">{new Date(item.created_at).toLocaleString()}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => handleRemove(item.id, item.phone_number)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition"
                      >
                        Unblock
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add to Blacklist Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="glass-panel border border-white/20 rounded-2xl w-full max-w-md p-6 bg-slate-900 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>🚫</span> Add Numbers to Global Blacklist
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white font-bold">✕</button>
            </div>

            <form onSubmit={handleAdd} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Phone Number(s) — One per line or comma-separated</label>
                <textarea
                  rows={4}
                  placeholder={`+14155552671\n+919876543210`}
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white font-mono outline-none focus:border-rose-500 text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Reason for Blacklisting</label>
                <input
                  type="text"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white outline-none focus:border-rose-500 text-xs"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-white/10">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition"
                >
                  {submitting ? 'Blocking...' : 'Confirm Blacklist'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 glass-panel text-slate-300 hover:text-white rounded-xl text-xs"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 4: System Audit Trail & Event Logs
// ─────────────────────────────────────────────────────────────────────────────
export const AdminAuditLogsTab: React.FC<AdminTabProps> = ({ token }) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [selectedDetails, setSelectedDetails] = useState<any | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const url = actionFilter
        ? `${API}/api/v1/admin/audit-logs?action=${encodeURIComponent(actionFilter)}`
        : `${API}/api/v1/admin/audit-logs`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.logs) setLogs(data.logs);
    } catch {
      console.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [token, actionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>📜</span> System Audit Trail &amp; Compliance Logs
          </h3>
          <p className="text-xs text-slate-400">
            Immutable log of all user logins, tenant modifications, quota boosts, and administrative actions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-blue-500"
          >
            <option value="">All Actions</option>
            <option value="LOGIN">User Logins</option>
            <option value="UPDATE_TENANT">Tenant / Quota Updates</option>
            <option value="CREATE">Creation Events</option>
            <option value="DISPATCH">Bulk Dispatches</option>
          </select>
          <button onClick={fetchLogs} disabled={loading} className="px-3.5 py-2 glass-panel hover:bg-white/10 text-white rounded-xl text-xs border border-white/10">
            🔄
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        {logs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">No audit events found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/60 uppercase text-[10px] font-bold tracking-wider text-slate-400 border-b border-white/10">
                <tr>
                  <th className="px-5 py-3">Timestamp</th>
                  <th className="px-5 py-3">Action</th>
                  <th className="px-5 py-3">User / Admin</th>
                  <th className="px-5 py-3">Tenant / Org</th>
                  <th className="px-5 py-3">Resource</th>
                  <th className="px-5 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-sans">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition">
                    <td className="px-5 py-3 font-mono text-[11px] text-slate-400">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="px-5 py-3 font-mono font-bold text-cyan-300">{log.action}</td>
                    <td className="px-5 py-3 text-white text-xs">{log.user_email || 'System / Auto'}</td>
                    <td className="px-5 py-3 text-slate-300">{log.tenant_name || 'Platform'}</td>
                    <td className="px-5 py-3 text-slate-400 font-mono text-[11px]">{log.resource_type}</td>
                    <td className="px-5 py-3 text-right">
                      {log.details ? (
                        <button
                          onClick={() => setSelectedDetails(log.details)}
                          className="px-2 py-0.5 rounded text-[11px] bg-white/5 hover:bg-white/10 text-blue-400 font-mono border border-white/10"
                        >
                          View Payload
                        </button>
                      ) : (
                        <span className="text-slate-600 text-[11px]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Details JSON Modal */}
      {selectedDetails && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="glass-panel border border-white/20 rounded-2xl w-full max-w-lg p-6 bg-slate-900 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white">Event Payload Details</h3>
              <button onClick={() => setSelectedDetails(null)} className="text-slate-400 hover:text-white font-bold">✕</button>
            </div>
            <pre className="bg-slate-950 p-4 rounded-xl text-xs font-mono text-emerald-400 overflow-x-auto max-h-80 border border-white/10">
              {typeof selectedDetails === 'string' ? selectedDetails : JSON.stringify(selectedDetails, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 5: System Announcement Banner
// ─────────────────────────────────────────────────────────────────────────────
export const AdminAnnouncementTab: React.FC<AdminTabProps> = ({ token }) => {
  const [form, setForm] = useState({
    message: '',
    severity: 'info' as 'info' | 'warning' | 'critical',
    active: true,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchAnnouncement = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/v1/admin/announcement`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.announcement) {
        setForm({
          message: data.announcement.message || '',
          severity: data.announcement.severity || 'info',
          active: Boolean(data.announcement.active),
        });
      }
    } catch {
      console.error('Failed to load current announcement');
    }
  }, [token]);

  useEffect(() => {
    fetchAnnouncement();
  }, [fetchAnnouncement]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await fetch(`${API}/api/v1/admin/announcement`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg({ text: 'Announcement broadcasted live to all active clients via Socket.IO!', type: 'success' });
      } else {
        setMsg({ text: extractErrorMessage(data, 'Failed to publish announcement'), type: 'error' });
      }
    } catch {
      setMsg({ text: 'Network error broadcasting announcement', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`p-4 rounded-xl border text-xs font-semibold flex justify-between items-center ${msg.type === 'success' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border-rose-500/40'}`}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="text-xs font-bold">✕</button>
        </div>
      )}

      <div>
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <span>📢</span> Platform System Announcement Banner
        </h3>
        <p className="text-xs text-slate-400">
          Push real-time notices, maintenance alerts, or Meta Cloud API updates to all logged-in client dashboards.
        </p>
      </div>

      {/* Live Preview Box */}
      <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-2">
        <span className="text-[10px] uppercase font-bold text-slate-400">Live Client Dashboard Banner Preview:</span>
        {form.active && form.message ? (
          <div
            className={`p-3.5 rounded-xl border flex items-center gap-3 text-xs font-semibold ${
              form.severity === 'critical'
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                : form.severity === 'warning'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
            }`}
          >
            <span>{form.severity === 'critical' ? '🚨' : form.severity === 'warning' ? '⚠️' : 'ℹ️'}</span>
            <span className="flex-1">{form.message}</span>
            <span className="text-[10px] uppercase opacity-75 font-mono font-bold">{form.severity}</span>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl border border-white/5 bg-slate-950/40 text-xs text-slate-500 italic">
            Banner is currently inactive / disabled.
          </div>
        )}
      </div>

      {/* Form Controls */}
      <div className="glass-panel p-6 rounded-2xl border border-white/10 shadow-2xl">
        <form onSubmit={handlePublish} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Announcement Message Text</label>
            <textarea
              rows={3}
              placeholder="e.g. Meta Cloud API scheduled maintenance this Sunday 02:00 UTC to 04:00 UTC. Campaigns will auto-queue."
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-white/10 rounded-xl text-white outline-none focus:border-blue-500 text-xs transition"
              required={form.active}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Severity / Tone</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, severity: 'info' })}
                  className={`py-2 px-3 rounded-xl border font-bold text-center transition ${form.severity === 'info' ? 'bg-blue-500/20 text-blue-300 border-blue-500/50' : 'bg-white/5 border-white/5 text-slate-400'}`}
                >
                  ℹ️ Info
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, severity: 'warning' })}
                  className={`py-2 px-3 rounded-xl border font-bold text-center transition ${form.severity === 'warning' ? 'bg-amber-500/20 text-amber-300 border-amber-500/50' : 'bg-white/5 border-white/5 text-slate-400'}`}
                >
                  ⚠️ Warning
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, severity: 'critical' })}
                  className={`py-2 px-3 rounded-xl border font-bold text-center transition ${form.severity === 'critical' ? 'bg-rose-500/20 text-rose-300 border-rose-500/50' : 'bg-white/5 border-white/5 text-slate-400'}`}
                >
                  🚨 Critical
                </button>
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Visibility Status</label>
              <div className="flex items-center gap-3 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                  />
                  <span className="text-white font-semibold">Enable banner for all clients</span>
                </label>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-white/10 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition shadow-lg shadow-blue-600/25"
            >
              {saving ? 'Broadcasting...' : '📡 Publish & Broadcast via Socket.IO'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
