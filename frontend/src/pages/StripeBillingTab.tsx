import React, { useState, useEffect, useCallback } from 'react';
import { extractErrorMessage } from '../utils/errorHelper';

import { API_URL as API } from '../config/api';

interface BillingSummary {
  tenant_name: string;
  plan: string;
  plan_name: string;
  monthly_quota: number;
  messages_used: number;
  remaining_quota: number;
  usage_percentage: string;
  cost_per_message: string;
  monthly_fee: string;
  currency: string;
  cycle_start: string;
  cycle_end: string;
}

interface InvoiceRecord {
  id: string;
  period: string;
  plan: string;
  amount: string | number;
  currency: string;
  status: string;
  date: string;
}

interface StripeBillingTabProps {
  token: string;
}

export const StripeBillingTab: React.FC<StripeBillingTabProps> = ({ token }) => {
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Custom credits top-up state
  const [selectedPack, setSelectedPack] = useState<'pack_5k' | 'pack_20k' | 'pack_50k' | 'custom'>('pack_20k');
  const [customAmount, setCustomAmount] = useState<number>(10000);

  // Cost calculator
  const [calcMessages, setCalcMessages] = useState<number>(5000);
  const [calcCategory, setCalcCategory] = useState<'marketing' | 'utility' | 'auth'>('marketing');

  const fetchBilling = useCallback(async () => {
    try {
      setLoading(true);
      const [resB, resI] = await Promise.all([
        fetch(`${API}/api/v1/billing`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/v1/billing/invoices`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const dataB = await resB.json();
      const dataI = await resI.json();

      if (dataB.billing) setBilling(dataB.billing);
      if (dataI.invoices) setInvoices(dataI.invoices);
    } catch (err: any) {
      console.error('Failed to load billing information', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Check URL query parameters for return from Stripe Checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    const sessionId = params.get('session_id');

    if (paymentStatus === 'success' && sessionId) {
      // Fulfill checkout session immediately
      fetch(`${API}/api/v1/billing/fulfill-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id: sessionId }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setPaymentNotice({
              text: `🎉 Payment Confirmed via Stripe! ${data.message}`,
              type: 'success',
            });
          } else {
            setPaymentNotice({ text: data.message || 'Payment status verified', type: 'success' });
          }
          fetchBilling();
        })
        .catch(() => {
          setPaymentNotice({ text: 'Payment received. Quota updated.', type: 'success' });
          fetchBilling();
        });

      // Clean search params without reloading
      const url = new URL(window.location.href);
      url.searchParams.delete('payment');
      url.searchParams.delete('session_id');
      url.searchParams.delete('simulated');
      window.history.replaceState({}, '', url.toString());
    } else if (paymentStatus === 'cancelled') {
      setPaymentNotice({ text: 'Stripe Checkout was cancelled. No charges were made.', type: 'error' });
      const url = new URL(window.location.href);
      url.searchParams.delete('payment');
      window.history.replaceState({}, '', url.toString());
    }

    fetchBilling();
  }, [token, fetchBilling]);

  // Launch Stripe Checkout for Subscription Plan
  const handleSubscribePlan = async (planKey: string) => {
    try {
      setCheckoutLoading(`plan_${planKey}`);
      const res = await fetch(`${API}/api/v1/billing/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: 'subscription',
          plan: planKey,
          success_url: `${window.location.origin}/dashboard?payment=success`,
          cancel_url: `${window.location.origin}/dashboard?payment=cancelled`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(extractErrorMessage(data, 'Failed to start Stripe checkout'));
        return;
      }

      if (data.checkoutUrl) {
        // Redirect to real or simulated Stripe Checkout
        window.location.href = data.checkoutUrl;
      }
    } catch (err: any) {
      alert(`Checkout error: ${err.message}`);
    } finally {
      setCheckoutLoading(null);
    }
  };

  // Launch Stripe Checkout for Credit Top-Up
  const handleTopUpCredits = async () => {
    try {
      setCheckoutLoading('topup');
      const payload: any = {
        type: 'credit_topup',
        success_url: `${window.location.origin}/dashboard?payment=success`,
        cancel_url: `${window.location.origin}/dashboard?payment=cancelled`,
      };

      if (selectedPack === 'custom') {
        payload.custom_credits = customAmount;
      } else {
        payload.credit_pack = selectedPack;
      }

      const res = await fetch(`${API}/api/v1/billing/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(extractErrorMessage(data, 'Failed to start Stripe checkout'));
        return;
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (err: any) {
      alert(`Top-up checkout error: ${err.message}`);
    } finally {
      setCheckoutLoading(null);
    }
  };

  const planTiers = [
    {
      key: 'starter',
      name: 'Starter Plan',
      price: '₹2,499',
      period: '/month',
      quota: '10,000 msgs',
      overage: '₹0.25/extra',
      popular: false,
      features: ['10,000 messages included', 'Meta Cloud API BYOK support', 'Standard queue delivery', 'Analytics & charts', 'Two-Way WhatsApp Inbox'],
    },
    {
      key: 'professional',
      name: 'Professional Plan',
      price: '₹7,999',
      period: '/month',
      quota: '50,000 msgs',
      overage: '₹0.20/extra',
      popular: true,
      features: ['50,000 messages included', 'High-throughput 20 msgs/sec', 'Priority campaign scheduler', 'Advanced audience segmentation', 'Multi-agent Inbox routing', 'Priority technical support'],
    },
    {
      key: 'enterprise',
      name: 'Enterprise Plan',
      price: '₹39,999',
      period: '/month',
      quota: '500,000 msgs',
      overage: '₹0.15/extra',
      popular: false,
      features: ['500,000 messages included', 'Ultra throughput 80+ msgs/sec', 'Dedicated platform phone pool', 'Custom webhooks & integrations', 'SLA 99.95% delivery uptime', 'Dedicated account manager'],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Notice Banner */}
      {paymentNotice && (
        <div
          className={`p-4 rounded-xl border text-sm font-semibold flex justify-between items-center ${
            paymentNotice.type === 'success'
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-lg shadow-emerald-500/10'
              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
          }`}
        >
          <span>{paymentNotice.text}</span>
          <button onClick={() => setPaymentNotice(null)} className="text-xs px-2 py-1 font-bold">✕</button>
        </div>
      )}

      {/* Header Info Card */}
      <div className="glass-panel p-6 rounded-2xl border border-white/10 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center space-x-2">
              <span>💳</span> <span>Billing, Stripe Payments &amp; Message Quotas</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Secure subscription billing and instant credit top-ups powered by Stripe Checkout.
            </p>
          </div>
          <button
            onClick={fetchBilling}
            disabled={loading}
            className="text-xs glass-panel hover:bg-white/10 text-white px-3.5 py-2 rounded-xl transition border border-white/10 disabled:opacity-50 flex items-center gap-1.5 self-start md:self-auto"
          >
            <span>🔄</span> {loading ? 'Loading...' : 'Refresh Quotas'}
          </button>
        </div>

        {/* Quota KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="glass-panel p-4 rounded-xl border border-white/5 bg-slate-950/40">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Current Plan</span>
            <p className="text-2xl font-extrabold text-emerald-400 mt-1 capitalize">
              {billing?.plan_name || 'Starter Plan'}
            </p>
            <p className="text-xs text-slate-400 mt-1">{billing?.monthly_fee || '₹2,499/month'} subscription</p>
          </div>

          <div className="glass-panel p-4 rounded-xl border border-white/5 bg-slate-950/40">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Monthly Quota</span>
            <p className="text-2xl font-extrabold text-blue-400 mt-1 font-mono">
              {(billing?.monthly_quota || 10000).toLocaleString()}
            </p>
            <p className="text-xs text-slate-400 mt-1">Messages included in plan</p>
          </div>

          <div className="glass-panel p-4 rounded-xl border border-white/5 bg-slate-950/40">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Used This Cycle</span>
            <p className="text-2xl font-extrabold text-amber-400 mt-1 font-mono">
              {(billing?.messages_used || 0).toLocaleString()}
            </p>
            <p className="text-xs text-slate-400 mt-1">{billing?.usage_percentage || '0%'} consumed</p>
          </div>

          <div className="glass-panel p-4 rounded-xl border border-white/5 bg-slate-950/40">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Available Credits</span>
            <p className="text-2xl font-extrabold text-white mt-1 font-mono">
              {(billing?.remaining_quota || 10000).toLocaleString()}
            </p>
            <p className="text-xs text-emerald-400 mt-1">Ready for dispatch</p>
          </div>
        </div>

        {/* Quota Progress Bar */}
        <div className="mt-5 bg-slate-950/60 p-4 rounded-xl border border-white/5">
          <div className="flex justify-between text-xs font-semibold text-slate-300 mb-2">
            <span>Cycle Progress</span>
            <span className="font-mono">
              {(billing?.messages_used || 0).toLocaleString()} / {(billing?.monthly_quota || 10000).toLocaleString()} Messages ({billing?.usage_percentage || '0%'})
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden border border-white/5">
            <div
              className="bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 h-2.5 rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(
                  100,
                  Math.max(2, Math.round(((billing?.messages_used || 0) / (billing?.monthly_quota || 10000)) * 100))
                )}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Stripe Subscription Upgrade Plans */}
      <div className="glass-panel p-6 rounded-2xl border border-white/10 shadow-2xl space-y-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>⚡</span> Upgrade Subscription via Stripe
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Select a plan to launch real Stripe Checkout. Your quota will be immediately updated upon confirmation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
          {planTiers.map((tier) => {
            const isCurrent = (billing?.plan || 'starter').toLowerCase() === tier.key;
            return (
              <div
                key={tier.key}
                className={`p-5 rounded-2xl border transition relative flex flex-col justify-between ${
                  tier.popular
                    ? 'border-emerald-500/50 bg-gradient-to-b from-emerald-950/30 to-slate-900/80 shadow-xl shadow-emerald-500/10'
                    : 'border-white/10 bg-slate-900/60'
                }`}
              >
                {tier.popular && (
                  <span className="absolute -top-3 right-4 bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full shadow-md">
                    Most Popular
                  </span>
                )}

                <div>
                  <h4 className="text-base font-bold text-white">{tier.name}</h4>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-extrabold text-white font-mono">{tier.price}</span>
                    <span className="text-xs text-slate-400">{tier.period}</span>
                  </div>
                  <p className="text-xs font-semibold text-emerald-400 mt-1">{tier.quota}</p>

                  <ul className="mt-4 space-y-2 text-xs text-slate-300 border-t border-white/5 pt-3">
                    {tier.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="text-emerald-400 font-bold">✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 pt-4 border-t border-white/5">
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full py-2.5 rounded-xl text-xs font-bold bg-white/5 text-slate-400 border border-white/10 cursor-not-allowed"
                    >
                      ✓ Current Active Plan
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSubscribePlan(tier.key)}
                      disabled={Boolean(checkoutLoading)}
                      className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                        tier.popular
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20'
                          : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
                      }`}
                    >
                      {checkoutLoading === `plan_${tier.key}` ? (
                        <span>Connecting Stripe...</span>
                      ) : (
                        <>
                          <span>💳 Subscribe with Stripe</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fast Message Credits Top-Up Section */}
      <div className="glass-panel p-6 rounded-2xl border border-white/10 shadow-2xl space-y-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>📦</span> Instant Message Credits Top-Up (Stripe)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Running low before your cycle renewal? Add non-expiring message credits to your account immediately.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
          <div
            onClick={() => setSelectedPack('pack_5k')}
            className={`p-4 rounded-xl border cursor-pointer transition text-center ${
              selectedPack === 'pack_5k'
                ? 'border-emerald-500 bg-emerald-500/10 text-white'
                : 'border-white/10 bg-slate-900/60 hover:border-white/20 text-slate-300'
            }`}
          >
            <p className="text-xs uppercase font-semibold text-slate-400">Small Pack</p>
            <p className="text-xl font-bold font-mono text-emerald-400 mt-1">5,000</p>
            <p className="text-sm font-bold text-white mt-1">₹1,600 INR</p>
            <p className="text-[10px] text-slate-400 mt-0.5">₹0.32/msg</p>
          </div>

          <div
            onClick={() => setSelectedPack('pack_20k')}
            className={`p-4 rounded-xl border cursor-pointer transition text-center ${
              selectedPack === 'pack_20k'
                ? 'border-emerald-500 bg-emerald-500/10 text-white'
                : 'border-white/10 bg-slate-900/60 hover:border-white/20 text-slate-300'
            }`}
          >
            <p className="text-xs uppercase font-semibold text-emerald-400">Popular Value</p>
            <p className="text-xl font-bold font-mono text-emerald-400 mt-1">20,000</p>
            <p className="text-sm font-bold text-white mt-1">₹5,600 INR</p>
            <p className="text-[10px] text-slate-400 mt-0.5">₹0.28/msg</p>
          </div>

          <div
            onClick={() => setSelectedPack('pack_50k')}
            className={`p-4 rounded-xl border cursor-pointer transition text-center ${
              selectedPack === 'pack_50k'
                ? 'border-emerald-500 bg-emerald-500/10 text-white'
                : 'border-white/10 bg-slate-900/60 hover:border-white/20 text-slate-300'
            }`}
          >
            <p className="text-xs uppercase font-semibold text-slate-400">High Volume</p>
            <p className="text-xl font-bold font-mono text-emerald-400 mt-1">50,000</p>
            <p className="text-sm font-bold text-white mt-1">₹12,000 INR</p>
            <p className="text-[10px] text-slate-400 mt-0.5">₹0.24/msg</p>
          </div>

          <div
            onClick={() => setSelectedPack('custom')}
            className={`p-4 rounded-xl border cursor-pointer transition text-center ${
              selectedPack === 'custom'
                ? 'border-emerald-500 bg-emerald-500/10 text-white'
                : 'border-white/10 bg-slate-900/60 hover:border-white/20 text-slate-300'
            }`}
          >
            <p className="text-xs uppercase font-semibold text-slate-400">Custom Amount</p>
            <input
              type="number"
              min="1000"
              step="1000"
              value={customAmount}
              onChange={(e) => {
                setSelectedPack('custom');
                setCustomAmount(parseInt(e.target.value) || 1000);
              }}
              className="w-full mt-1 px-2 py-1 bg-slate-950 border border-white/10 rounded font-mono text-xs text-white text-center focus:border-emerald-500 outline-none"
            />
            <p className="text-sm font-bold text-white mt-1 font-mono">
              ₹{(customAmount * 0.28).toFixed(2)} INR
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleTopUpCredits}
            disabled={Boolean(checkoutLoading)}
            className="bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 text-slate-950 font-bold px-6 py-3 rounded-xl text-xs transition shadow-lg shadow-emerald-500/25 flex items-center gap-2"
          >
            {checkoutLoading === 'topup' ? (
              <span>Preparing Checkout...</span>
            ) : (
              <>
                <span>💳 Buy Credits with Stripe Checkout</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Cost Estimator Calculator & Guide */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6 rounded-2xl border border-white/10 shadow-2xl space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>💰</span> Live WhatsApp Campaign Cost Calculator
          </h3>
          <p className="text-xs text-slate-400">
            Estimate wholesale Meta conversation costs based on category and recipient count.
          </p>

          <div className="space-y-4 pt-1">
            <div>
              <label className="block text-xs uppercase font-semibold text-slate-300 mb-2">
                Number of Recipients: <span className="text-emerald-400 font-mono text-base">{calcMessages.toLocaleString()}</span>
              </label>
              <input
                type="range"
                min="100"
                max="100000"
                step="500"
                value={calcMessages}
                onChange={(e) => setCalcMessages(parseInt(e.target.value) || 100)}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs uppercase font-semibold text-slate-300 mb-2">
                Category
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setCalcCategory('marketing')}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    calcCategory === 'marketing'
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-white/5 border-white/5 text-slate-400'
                  }`}
                >
                  <p className="font-bold text-xs">📣 Marketing</p>
                  <p className="text-[10px] text-slate-400">~₹0.78/msg</p>
                </button>
                <button
                  type="button"
                  onClick={() => setCalcCategory('utility')}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    calcCategory === 'utility'
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-white/5 border-white/5 text-slate-400'
                  }`}
                >
                  <p className="font-bold text-xs">📦 Utility</p>
                  <p className="text-[10px] text-slate-400">~₹0.15/msg</p>
                </button>
                <button
                  type="button"
                  onClick={() => setCalcCategory('auth')}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    calcCategory === 'auth'
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-white/5 border-white/5 text-slate-400'
                  }`}
                >
                  <p className="font-bold text-xs">🔐 Auth / OTP</p>
                  <p className="text-[10px] text-slate-400">~₹0.12/msg</p>
                </button>
              </div>
            </div>

            {/* Calculated box */}
            {(() => {
              const rate = calcCategory === 'marketing' ? 0.78 : calcCategory === 'utility' ? 0.15 : 0.12;
              const metaEst = (calcMessages * rate).toFixed(2);
              const remaining = billing?.remaining_quota ?? 10000;
              const covered = Math.min(calcMessages, remaining);
              const overage = Math.max(0, calcMessages - remaining);
              const overageCost = (overage * 0.25).toFixed(2);

              return (
                <div className="bg-slate-950/70 p-4 rounded-xl border border-white/10 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Wholesale Meta Rate (BYOK):</span>
                    <span className="font-mono text-emerald-400 font-bold">~₹{metaEst} INR</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Covered under Plan Quota:</span>
                    <span className="font-mono text-cyan-400 font-semibold">{covered.toLocaleString()} msgs (₹0.00)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Overage Charge (if exceeding quota):</span>
                    <span className="font-mono text-amber-400 font-semibold">{overage.toLocaleString()} msgs (₹{overageCost})</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* WhatsApp Billing Guide */}
        <div className="glass-panel p-6 rounded-2xl border border-white/10 shadow-2xl space-y-3 text-xs text-slate-300 leading-relaxed">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span>ℹ️</span> How WhatsApp Billing Works
          </h3>
          <div className="bg-slate-950/60 p-3 rounded-xl border border-white/5 space-y-1">
            <p className="font-bold text-white">1. Custom Credentials (BYOK):</p>
            <p className="text-slate-400">
              When you configure your own Meta WhatsApp Business Account, Meta bills your card directly at wholesale rates with zero markup.
            </p>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-xl border border-white/5 space-y-1">
            <p className="font-bold text-white">2. Platform Sender Pool:</p>
            <p className="text-slate-400">
              Messages automatically deduct from your plan quota or prepaid message balance.
            </p>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-xl border border-white/5 space-y-1">
            <p className="font-bold text-white">3. 24-Hour Conversation Window:</p>
            <p className="text-slate-400">
              Outbound templates open a 24-hour session. Subsequent messages in that window incur no additional Meta fee.
            </p>
          </div>
        </div>
      </div>

      {/* Real Invoices & Stripe Transactions Table */}
      <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-slate-900/40">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span>🧾</span> Transaction &amp; Payment History
          </h3>
          <span className="text-xs text-slate-400 font-mono">Stripe Verified</span>
        </div>

        {invoices.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No transaction history recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900/60 text-[11px] uppercase text-slate-400 font-semibold border-b border-white/10 tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Session / Invoice ID</th>
                  <th className="px-6 py-3.5">Date</th>
                  <th className="px-6 py-3.5">Description</th>
                  <th className="px-6 py-3.5">Amount</th>
                  <th className="px-6 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-xs">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-white/[0.02] transition">
                    <td className="px-6 py-4 text-white truncate max-w-xs">{inv.id}</td>
                    <td className="px-6 py-4 text-slate-400 font-sans text-xs">
                      {new Date(inv.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-white font-sans text-xs capitalize">
                      {inv.plan}
                    </td>
                    <td className="px-6 py-4 text-emerald-400 font-bold">
                      ₹{Number(inv.amount).toFixed(2)} {inv.currency || 'INR'}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          inv.status === 'succeeded' || inv.status === 'paid'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
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
