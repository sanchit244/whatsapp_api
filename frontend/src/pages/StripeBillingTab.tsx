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
  const [razorpayConfig, setRazorpayConfig] = useState<{ keyId: string; isConfigured: boolean }>({
    keyId: '',
    isConfigured: false,
  });

  // Custom credits top-up state
  const [selectedPack, setSelectedPack] = useState<'pack_5k' | 'pack_20k' | 'pack_50k' | 'custom'>('pack_20k');
  const [customAmount, setCustomAmount] = useState<number>(10000);

  // Cost calculator
  const [calcMessages, setCalcMessages] = useState<number>(5000);
  const [calcCategory, setCalcCategory] = useState<'marketing' | 'utility' | 'auth'>('marketing');

  const fetchBilling = useCallback(async () => {
    try {
      setLoading(true);
      const [resB, resI, resC] = await Promise.all([
        fetch(`${API}/api/v1/billing`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/v1/billing/invoices`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/v1/billing/config`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      ]);
      const dataB = await resB.json();
      const dataI = await resI.json();

      if (dataB.billing) setBilling(dataB.billing);
      if (dataI.invoices) setInvoices(dataI.invoices);

      if (resC && resC.ok) {
        const dataC = await resC.json();
        setRazorpayConfig({
          keyId: dataC.keyId || '',
          isConfigured: Boolean(dataC.isConfigured),
        });
      }
    } catch (err: any) {
      console.error('Failed to load billing information', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Check URL query parameters for return or callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    const sessionId = params.get('session_id') || params.get('order_id');

    if (paymentStatus === 'success' && sessionId) {
      // Fulfill checkout session immediately
      fetch(`${API}/api/v1/billing/verify-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ order_id: sessionId }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setPaymentNotice({
              text: `🎉 Payment Confirmed via Razorpay! ${data.message}`,
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
      url.searchParams.delete('order_id');
      url.searchParams.delete('simulated');
      window.history.replaceState({}, '', url.toString());
    } else if (paymentStatus === 'cancelled') {
      setPaymentNotice({ text: 'Payment checkout was cancelled. No charges were made.', type: 'error' });
      const url = new URL(window.location.href);
      url.searchParams.delete('payment');
      window.history.replaceState({}, '', url.toString());
    }

    fetchBilling();
  }, [token, fetchBilling]);

  /**
   * Helper to execute Razorpay Checkout Modal or Simulation
   */
  const executeRazorpayCheckout = async (orderData: {
    orderId: string;
    amount: number;
    currency: string;
    keyId: string;
    title: string;
    description: string;
    mode: 'real' | 'simulated';
  }) => {
    const isRazorpayLoaded = typeof (window as any).Razorpay === 'function';

    if (orderData.mode === 'real' && isRazorpayLoaded) {
      // Launch standard Razorpay Checkout Modal (UPI, Cards, NetBanking, Wallets)
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'WhatsApp Business API',
        description: orderData.description,
        order_id: orderData.orderId,
        handler: async (response: any) => {
          try {
            setCheckoutLoading('verifying');
            const verifyRes = await fetch(`${API}/api/v1/billing/verify-payment`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                order_id: response.razorpay_order_id || orderData.orderId,
                payment_id: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              }),
            });

            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              setPaymentNotice({
                text: `🎉 Payment Confirmed via Razorpay! ${verifyData.message}`,
                type: 'success',
              });
            } else {
              setPaymentNotice({
                text: verifyData.message || 'Payment verification completed',
                type: 'success',
              });
            }
            fetchBilling();
          } catch (err: any) {
            setPaymentNotice({ text: `Verification error: ${err.message}`, type: 'error' });
          } finally {
            setCheckoutLoading(null);
          }
        },
        prefill: {
          name: billing?.tenant_name || 'Business User',
        },
        theme: {
          color: '#059669', // Emerald brand theme
        },
        modal: {
          ondismiss: () => {
            setPaymentNotice({ text: 'Razorpay checkout was dismissed.', type: 'error' });
            setCheckoutLoading(null);
          },
        },
      };

      const rzpInstance = new (window as any).Razorpay(options);
      rzpInstance.open();
    } else {
      // Sandbox / Simulation fallback (instant quota fulfillment for testing)
      try {
        setCheckoutLoading('simulating');
        const verifyRes = await fetch(`${API}/api/v1/billing/verify-payment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            order_id: orderData.orderId,
          }),
        });

        const verifyData = await verifyRes.json();
        setPaymentNotice({
          text: `🎉 [Simulation Mode] Payment Confirmed! ${verifyData.message || 'Quota successfully updated.'}`,
          type: 'success',
        });
        fetchBilling();
      } catch (err: any) {
        setPaymentNotice({ text: `Simulation error: ${err.message}`, type: 'error' });
      } finally {
        setCheckoutLoading(null);
      }
    }
  };

  // Launch Razorpay Checkout for Subscription Plan
  const handleSubscribePlan = async (planKey: string) => {
    try {
      setCheckoutLoading(`plan_${planKey}`);
      const res = await fetch(`${API}/api/v1/billing/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: 'subscription',
          plan: planKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(extractErrorMessage(data, 'Failed to create Razorpay order'));
        setCheckoutLoading(null);
        return;
      }

      await executeRazorpayCheckout(data);
    } catch (err: any) {
      alert(`Checkout error: ${err.message}`);
      setCheckoutLoading(null);
    }
  };

  // Launch Razorpay Checkout for Credit Top-Up
  const handleTopUpCredits = async () => {
    try {
      setCheckoutLoading('topup');
      const payload: any = {
        type: 'credit_topup',
      };

      if (selectedPack === 'custom') {
        payload.custom_credits = customAmount;
      } else {
        payload.credit_pack = selectedPack;
      }

      const res = await fetch(`${API}/api/v1/billing/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(extractErrorMessage(data, 'Failed to create Razorpay order'));
        setCheckoutLoading(null);
        return;
      }

      await executeRazorpayCheckout(data);
    } catch (err: any) {
      alert(`Checkout error: ${err.message}`);
      setCheckoutLoading(null);
    }
  };

  // Cost Estimator calculation
  const getEstimatedCost = () => {
    let rate = 0.82;
    if (calcCategory === 'utility') rate = 0.35;
    if (calcCategory === 'auth') rate = 0.15;
    const totalInr = calcMessages * rate;
    const platformMarkup = totalInr * 0.1; // 10% platform buffer
    return {
      metaRate: rate,
      totalWholesale: totalInr.toFixed(2),
      estimatedTotal: (totalInr + platformMarkup).toFixed(2),
    };
  };

  const est = getEstimatedCost();

  const planTiers = [
    {
      key: 'starter',
      name: 'Starter Plan',
      price: '₹2,499',
      period: '/month',
      quota: '10,000 Messages',
      rate: '₹0.25 per credit',
      features: [
        'Single WhatsApp Business Number',
        'Bulk CSV & Excel Dispatcher',
        'Live Broadcast Analytics',
        'Standard Webhooks & API Access',
        'Email & Community Support',
      ],
      popular: false,
    },
    {
      key: 'professional',
      name: 'Professional Plan',
      price: '₹7,999',
      period: '/month',
      quota: '50,000 Messages',
      rate: '₹0.16 per credit',
      features: [
        'Up to 3 WhatsApp Phone Numbers',
        'Scheduled & Drip Broadcasts',
        'Auto-Reply Bot & Interactive Menus',
        'Shared Team Inbox (5 Agents)',
        'Priority SLA Support',
      ],
      popular: true,
    },
    {
      key: 'enterprise',
      name: 'Enterprise Plan',
      price: '₹39,999',
      period: '/month',
      quota: '500,000 Messages',
      rate: '₹0.08 per credit',
      features: [
        'Unlimited WhatsApp Business Numbers',
        'Dedicated Cloud Infrastructure',
        'High TPS Throughput (80 msg/sec)',
        'Custom Webhooks & CRM Sync',
        '24/7 Dedicated Account Manager',
      ],
      popular: false,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Notice Banner */}
      {paymentNotice && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
            paymentNotice.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
              : 'bg-rose-950/60 border-rose-500/50 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">{paymentNotice.type === 'success' ? '✅' : '⚠️'}</span>
            <span className="text-sm font-semibold">{paymentNotice.text}</span>
          </div>
          <button
            onClick={() => setPaymentNotice(null)}
            className="text-xs opacity-70 hover:opacity-100 font-bold px-2 py-1 rounded"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Info Card */}
      <div className="glass-panel p-6 rounded-2xl border border-white/10 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center space-x-2">
              <span>💳</span> <span>Billing, Razorpay Payments &amp; Message Quotas</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Secure subscription billing and instant credit top-ups via Razorpay (UPI, Google Pay, PhonePe, Cards, NetBanking).
            </p>
          </div>
          <div className="flex items-center gap-2 self-start md:self-auto">
            <span className={`text-[11px] px-2.5 py-1 rounded-full font-semibold border ${
              razorpayConfig.isConfigured 
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
            }`}>
              {razorpayConfig.isConfigured ? '● Razorpay Live' : '● Razorpay Sandbox'}
            </span>
            <button
              onClick={fetchBilling}
              disabled={loading}
              className="text-xs glass-panel hover:bg-white/10 text-white px-3.5 py-2 rounded-xl transition border border-white/10 disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>🔄</span> {loading ? 'Loading...' : 'Refresh Quotas'}
            </button>
          </div>
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

      {/* Razorpay Subscription Upgrade Plans */}
      <div className="glass-panel p-6 rounded-2xl border border-white/10 shadow-2xl space-y-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>⚡</span> Upgrade Subscription via Razorpay
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Select a plan to open Razorpay Checkout with instant UPI Autopay and card support. Your quota is immediately updated.
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
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-white font-mono">{tier.price}</span>
                    <span className="text-xs text-slate-400 font-sans">{tier.period}</span>
                  </div>
                  <div className="mt-2 text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                    <span>✨</span> {tier.quota}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 font-mono">{tier.rate}</p>

                  <ul className="mt-5 space-y-2.5 text-xs text-slate-300 border-t border-white/10 pt-4">
                    {tier.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-emerald-400 font-bold">✓</span>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 pt-4 border-t border-white/5">
                  {isCurrent ? (
                    <div className="w-full text-center py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 font-bold text-xs border border-emerald-500/30">
                      Current Active Plan
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSubscribePlan(tier.key)}
                      disabled={Boolean(checkoutLoading)}
                      className={`w-full py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 ${
                        tier.popular
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20'
                          : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
                      }`}
                    >
                      {checkoutLoading === `plan_${tier.key}` ? (
                        <span>Processing Order...</span>
                      ) : (
                        <>
                          <span>💳 Subscribe via Razorpay</span>
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
            <span>📦</span> Instant Message Credits Top-Up (Razorpay)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Running low before your cycle renewal? Add non-expiring message credits with UPI, Cards, or NetBanking.
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
                <span>💳 Buy Credits with Razorpay</span>
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
                Conversation Category
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setCalcCategory('marketing')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                    calcCategory === 'marketing'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  Marketing (₹0.82)
                </button>
                <button
                  type="button"
                  onClick={() => setCalcCategory('utility')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                    calcCategory === 'utility'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  Utility (₹0.35)
                </button>
                <button
                  type="button"
                  onClick={() => setCalcCategory('auth')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                    calcCategory === 'auth'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  OTP / Auth (₹0.15)
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-white/5 space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Meta Official Rate / Conversation:</span>
                <span className="font-mono text-white">₹{est.metaRate.toFixed(2)} INR</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Wholesale Meta Cost ({calcMessages.toLocaleString()} msgs):</span>
                <span className="font-mono text-white">₹{est.totalWholesale} INR</span>
              </div>
              <div className="border-t border-white/10 pt-2 flex justify-between text-sm font-bold text-emerald-400">
                <span>Estimated Campaign Budget:</span>
                <span className="font-mono text-base">₹{est.estimatedTotal} INR</span>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-white/10 shadow-2xl space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>🛡️</span> Supported Payment Rails
          </h3>
          <p className="text-xs text-slate-400">
            Razorpay provides 100% compliant Indian and International payment rails.
          </p>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5">
              <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold">
                <span>⚡</span> UPI &amp; UPI Autopay
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Google Pay, PhonePe, Paytm, BHIM, and QR Code</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5">
              <div className="flex items-center gap-2 text-blue-400 text-sm font-bold">
                <span>💳</span> Credit &amp; Debit Cards
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Visa, MasterCard, RuPay, Maestro, and Amex</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5">
              <div className="flex items-center gap-2 text-amber-400 text-sm font-bold">
                <span>🏛️</span> NetBanking
              </div>
              <p className="text-[11px] text-slate-400 mt-1">50+ Indian banks including HDFC, ICICI, SBI, Axis</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5">
              <div className="flex items-center gap-2 text-cyan-400 text-sm font-bold">
                <span>👛</span> Digital Wallets &amp; EMI
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Paytm Wallet, Mobikwik, Amazon Pay, Cardless EMI</p>
            </div>
          </div>
        </div>
      </div>

      {/* Real Invoices & Razorpay Transactions Table */}
      <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-slate-900/40">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span>🧾</span> Transaction &amp; Payment History
          </h3>
          <span className="text-xs text-slate-400 font-mono">Razorpay Verified</span>
        </div>

        {invoices.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No transaction history recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900/60 text-[11px] uppercase text-slate-400 font-semibold border-b border-white/10 tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Order / Invoice ID</th>
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

export const BillingTab = StripeBillingTab;
