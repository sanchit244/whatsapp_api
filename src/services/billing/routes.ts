import { Router, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { tenantMiddleware, AuthRequest, requireRole } from '../../middleware/tenantMiddleware';
import { getPool } from '../../config/database';
import { createLogger } from '../../config/logger';
import { ValidationError, NotFoundError } from '../../middleware/errorHandler';

const router = Router();
const logger = createLogger('billing-routes');

const PLAN_TIERS = {
  starter: { name: 'Starter Plan', quota: 10000, pricePerMonth: 2499, pricePerExtraMsg: 0.25 },
  professional: { name: 'Professional Plan', quota: 50000, pricePerMonth: 7999, pricePerExtraMsg: 0.20 },
  enterprise: { name: 'Enterprise Plan', quota: 500000, pricePerMonth: 39999, pricePerExtraMsg: 0.15 },
};

/**
 * GET /api/v1/billing/plans
 * Available subscription plans
 */
router.get('/plans', (req, res) => {
  res.json({
    success: true,
    plans: PLAN_TIERS,
  });
});

/**
 * GET /api/v1/billing
 * Current tenant billing summary and quota status
 */
router.get(
  '/',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const pool = getPool();
      const tenantRes = await pool.query(
        `SELECT id, name, plan, monthly_quota, created_at FROM tenants WHERE id = $1`,
        [req.tenantId]
      );

      if (tenantRes.rows.length === 0) {
        throw new NotFoundError('Tenant not found');
      }

      const tenant = tenantRes.rows[0];
      const planKey = (tenant.plan || 'starter').toLowerCase() as keyof typeof PLAN_TIERS;
      const planInfo = PLAN_TIERS[planKey] || PLAN_TIERS.starter;

      // Calculate messages sent during current calendar month
      const usageRes = await pool.query(
        `SELECT COUNT(*) as sent_count 
         FROM messages 
         WHERE tenant_id = $1 
           AND status IN ('sent', 'delivered', 'read')
           AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')`,
        [req.tenantId]
      );

      const messagesSentThisMonth = parseInt(usageRes.rows[0]?.sent_count || '0');
      const monthlyQuota = tenant.monthly_quota || planInfo.quota;
      const usagePercentage = ((messagesSentThisMonth / monthlyQuota) * 100).toFixed(1);
      const remainingQuota = Math.max(0, monthlyQuota - messagesSentThisMonth);

      res.json({
        success: true,
        billing: {
          tenant_name: tenant.name,
          plan: tenant.plan || 'starter',
          plan_name: planInfo.name,
          monthly_quota: monthlyQuota,
          messages_used: messagesSentThisMonth,
          remaining_quota: remainingQuota,
          usage_percentage: `${usagePercentage}%`,
          cost_per_message: `₹${planInfo.pricePerExtraMsg}`,
          monthly_fee: `₹${planInfo.pricePerMonth.toLocaleString('en-IN')}`,
          currency: 'INR',
          cycle_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
          cycle_end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/billing/usage
 * Detailed historical usage breakdown
 */
router.get(
  '/usage',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const pool = getPool();

      // Aggregate messages by day for the last 30 days
      const dailyRes = await pool.query(
        `SELECT 
           DATE(created_at) as date,
           COUNT(*) as total_messages,
           SUM(CASE WHEN status IN ('sent', 'delivered', 'read') THEN 1 ELSE 0 END) as successful,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
         FROM messages
         WHERE tenant_id = $1 AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         GROUP BY DATE(created_at)
         ORDER BY date DESC`,
        [req.tenantId]
      );

      res.json({
        success: true,
        usage: dailyRes.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

import { StripeService, CREDIT_PACKS } from './stripeService';

/**
 * GET /api/v1/billing/credit-packs
 * Available top-up credit packs
 */
router.get('/credit-packs', (req, res) => {
  res.json({
    success: true,
    packs: CREDIT_PACKS,
  });
});

/**
 * GET /api/v1/billing/invoices
 * Invoices and payment history (including Stripe transactions)
 */
router.get(
  '/invoices',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const pool = getPool();
      const tenantRes = await pool.query(`SELECT plan, created_at FROM tenants WHERE id = $1`, [req.tenantId]);
      const planKey = (tenantRes.rows[0]?.plan || 'starter').toLowerCase() as keyof typeof PLAN_TIERS;
      const plan = PLAN_TIERS[planKey] || PLAN_TIERS.starter;

      // Query real payment transactions from DB
      let realTxRows: any[] = [];
      try {
        const txRes = await pool.query(
          `SELECT id, stripe_session_id, amount_cents, currency, payment_type, plan, credits_added, status, created_at
           FROM payment_transactions
           WHERE tenant_id = $1
           ORDER BY created_at DESC
           LIMIT 20`,
          [req.tenantId]
        );
        realTxRows = txRes.rows;
      } catch {
        // Table might be initializing
      }

      const invoices: any[] = realTxRows.map((tx) => ({
        id: tx.stripe_session_id || `TX-${tx.id.substring(0, 8).toUpperCase()}`,
        period: new Date(tx.created_at).toLocaleString('default', { month: 'short', day: 'numeric', year: 'numeric' }),
        plan: tx.payment_type === 'subscription' ? (tx.plan ? `${tx.plan.toUpperCase()} Plan` : 'Subscription') : `Top-Up (${tx.credits_added.toLocaleString()} credits)`,
        amount: (tx.amount_cents / 100).toFixed(2),
        currency: (tx.currency || 'INR').toUpperCase(),
        status: tx.status,
        date: tx.created_at,
        pdf_url: null,
      }));

      // If no transactions yet, show current subscription cycle placeholder
      if (invoices.length === 0) {
        const now = new Date();
        invoices.push({
          id: `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${req.tenantId.substring(0, 4).toUpperCase()}`,
          period: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
          plan: plan.name,
          amount: plan.pricePerMonth.toFixed(2),
          currency: 'INR',
          status: 'paid',
          date: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
          pdf_url: null,
        });
      }

      res.json({
        success: true,
        invoices,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/billing/create-checkout-session
 * Generate Stripe Checkout Session URL for Plan Upgrade or Credit Top-Up
 */
router.post(
  '/create-checkout-session',
  tenantMiddleware,
  requireRole('owner', 'admin'),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const { type, plan, credit_pack, custom_credits, success_url, cancel_url } = req.body;

      if (!type || !['subscription', 'credit_topup'].includes(type)) {
        throw new ValidationError('Valid type is required: "subscription" or "credit_topup"');
      }

      const clientHost = process.env.FRONTEND_URL || 'http://localhost:3001';
      const defaultSuccessUrl = `${clientHost}/dashboard?payment=success`;
      const defaultCancelUrl = `${clientHost}/dashboard?payment=cancelled`;

      const session = await StripeService.createCheckoutSession({
        tenantId: req.tenantId,
        userEmail: (req as any).user?.email,
        type,
        planKey: plan,
        creditPackKey: credit_pack,
        customCredits: custom_credits ? parseInt(custom_credits) : undefined,
        successUrl: success_url || defaultSuccessUrl,
        cancelUrl: cancel_url || defaultCancelUrl,
      });

      res.json({
        success: true,
        sessionId: session.sessionId,
        checkoutUrl: session.checkoutUrl,
        mode: session.mode,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/billing/fulfill-session
 * Verify and apply payment fulfillment immediately (used after return from Stripe)
 */
router.post(
  '/fulfill-session',
  tenantMiddleware,
  requireRole('owner', 'admin'),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const { session_id } = req.body;
      if (!session_id) {
        throw new ValidationError('session_id is required');
      }

      const result = await StripeService.fulfillCheckoutSession(session_id, req.tenantId);

      res.json({
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/billing/webhook
 * Public Stripe webhook endpoint
 */
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  try {
    await StripeService.handleWebhook(req.body, sig || '');
    res.json({ received: true });
  } catch (err: any) {
    logger.error(`Stripe webhook error: ${err.message}`);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

/**
 * POST /api/v1/billing/payment
 * Fallback direct upgrade / credit topup
 */
router.post(
  '/payment',
  tenantMiddleware,
  requireRole('owner', 'admin'),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const { plan, add_quota } = req.body;
      const pool = getPool();

      if (plan && PLAN_TIERS[plan.toLowerCase() as keyof typeof PLAN_TIERS]) {
        const targetPlan = PLAN_TIERS[plan.toLowerCase() as keyof typeof PLAN_TIERS];
        await pool.query(
          `UPDATE tenants SET plan = $1, monthly_quota = $2, updated_at = NOW() WHERE id = $3`,
          [plan.toLowerCase(), targetPlan.quota, req.tenantId]
        );

        logger.info(`Tenant ${req.tenantId} upgraded to plan ${plan}`);

        res.json({
          success: true,
          message: `Plan upgraded successfully to ${targetPlan.name}`,
          new_plan: plan.toLowerCase(),
          new_quota: targetPlan.quota,
        });
        return;
      }

      if (add_quota && Number(add_quota) > 0) {
        const extra = parseInt(add_quota);
        await pool.query(
          `UPDATE tenants SET monthly_quota = COALESCE(monthly_quota, 0) + $1, updated_at = NOW() WHERE id = $2`,
          [extra, req.tenantId]
        );

        res.json({
          success: true,
          message: `Added ${extra.toLocaleString()} message credits successfully`,
        });
        return;
      }

      throw new ValidationError('Valid plan (starter, professional, enterprise) or add_quota is required');
    } catch (error) {
      next(error);
    }
  }
);

export { router as billingRoutes };
