import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../../config/database';
import { createLogger } from '../../config/logger';

const logger = createLogger('stripe-service');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripeClient = stripeSecretKey ? new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' as any }) : null;

export const PLAN_DETAILS: Record<string, { name: string; priceInr: number; quota: number }> = {
  starter: { name: 'Starter Plan', priceInr: 2499, quota: 10000 },
  professional: { name: 'Professional Plan', priceInr: 7999, quota: 50000 },
  enterprise: { name: 'Enterprise Plan', priceInr: 39999, quota: 500000 },
};

export const CREDIT_PACKS: Record<string, { credits: number; priceInr: number; label: string }> = {
  pack_5k: { credits: 5000, priceInr: 1600, label: '5,000 Credits (₹1,600)' },
  pack_20k: { credits: 20000, priceInr: 5600, label: '20,000 Credits (₹5,600)' },
  pack_50k: { credits: 50000, priceInr: 12000, label: '50,000 Credits (₹12,000)' },
};

export class StripeService {
  /**
   * Check if real Stripe API keys are configured
   */
  static isConfigured(): boolean {
    return Boolean(stripeClient);
  }

  /**
   * Create a Stripe Checkout Session for plan upgrade or credit top-up
   */
  static async createCheckoutSession(params: {
    tenantId: string;
    userEmail?: string;
    type: 'subscription' | 'credit_topup';
    planKey?: string;
    creditPackKey?: string;
    customCredits?: number;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ sessionId: string; checkoutUrl: string; mode: 'real' | 'simulated' }> {
    const { tenantId, userEmail, type, planKey, creditPackKey, customCredits, successUrl, cancelUrl } = params;
    const pool = getPool();
    const transactionId = uuidv4();

    let amountCents = 0;
    let title = '';
    let description = '';
    let creditsToAdd = 0;
    let selectedPlan = planKey || '';

    if (type === 'subscription') {
      const plan = PLAN_DETAILS[selectedPlan.toLowerCase()] || PLAN_DETAILS.starter;
      amountCents = plan.priceInr * 100;
      title = `WhatsApp API - ${plan.name} Subscription`;
      description = `Monthly subscription for ${plan.quota.toLocaleString()} messages/month`;
      creditsToAdd = plan.quota;
    } else {
      if (creditPackKey && CREDIT_PACKS[creditPackKey]) {
        const pack = CREDIT_PACKS[creditPackKey];
        amountCents = pack.priceInr * 100;
        creditsToAdd = pack.credits;
        title = `WhatsApp API - Top Up ${pack.credits.toLocaleString()} Credits`;
        description = `Add ${pack.credits.toLocaleString()} messaging credits to your balance`;
      } else if (customCredits && customCredits > 0) {
        creditsToAdd = customCredits;
        amountCents = Math.round(customCredits * 28); // 0.28 INR per credit = 28 paise
        title = `WhatsApp API - Custom Top Up (${customCredits.toLocaleString()} Credits)`;
        description = `Add ${customCredits.toLocaleString()} messaging credits to your balance`;
      } else {
        throw new Error('Invalid credit pack or amount specified');
      }
    }

    // If Stripe secret key is configured, create real Stripe Checkout Session
    if (stripeClient) {
      try {
        const session = await stripeClient.checkout.sessions.create({
          payment_method_types: ['card'],
          mode: 'payment',
          customer_email: userEmail || undefined,
          client_reference_id: tenantId,
          metadata: {
            tenantId,
            transactionId,
            type,
            plan: selectedPlan,
            creditsAdded: String(creditsToAdd),
          },
          line_items: [
            {
              price_data: {
                currency: 'inr',
                product_data: {
                  name: title,
                  description,
                },
                unit_amount: amountCents,
              },
              quantity: 1,
            },
          ],
          success_url: `${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: cancelUrl,
        });

        // Record pending transaction
        await pool.query(
          `INSERT INTO payment_transactions 
           (id, tenant_id, stripe_session_id, amount_cents, currency, payment_type, plan, credits_added, status, customer_email, created_at)
           VALUES ($1, $2, $3, $4, 'inr', $5, $6, $7, 'pending', $8, NOW())`,
          [transactionId, tenantId, session.id, amountCents, type, selectedPlan || null, creditsToAdd, userEmail || null]
        );

        logger.info(`Created real Stripe checkout session ${session.id} for tenant ${tenantId}`);

        return {
          sessionId: session.id,
          checkoutUrl: session.url || successUrl,
          mode: 'real',
        };
      } catch (err: any) {
        logger.error(`Stripe checkout session creation failed: ${err.message}. Falling back to sandbox simulation.`);
      }
    }

    // Sandbox / Simulation mode for development without live Stripe key
    const mockSessionId = `cs_sim_${uuidv4().replace(/-/g, '').substring(0, 24)}`;
    const mockCheckoutUrl = `${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id=${mockSessionId}&simulated=true`;

    await pool.query(
      `INSERT INTO payment_transactions 
       (id, tenant_id, stripe_session_id, amount_cents, currency, payment_type, plan, credits_added, status, customer_email, created_at)
       VALUES ($1, $2, $3, $4, 'inr', $5, $6, $7, 'pending', $8, NOW())`,
      [transactionId, tenantId, mockSessionId, amountCents, type, selectedPlan || null, creditsToAdd, userEmail || null]
    );

    logger.info(`Created simulated Stripe checkout session ${mockSessionId} for tenant ${tenantId}`);

    return {
      sessionId: mockSessionId,
      checkoutUrl: mockCheckoutUrl,
      mode: 'simulated',
    };
  }

  /**
   * Verify and fulfill a completed checkout session
   */
  static async fulfillCheckoutSession(sessionId: string, tenantId: string): Promise<{
    success: boolean;
    type: string;
    amount: number;
    plan?: string;
    creditsAdded?: number;
    message: string;
  }> {
    const pool = getPool();

    // Check transaction record
    const txRes = await pool.query(
      `SELECT * FROM payment_transactions WHERE stripe_session_id = $1 AND tenant_id = $2`,
      [sessionId, tenantId]
    );

    if (txRes.rows.length === 0) {
      throw new Error('Transaction session not found for this tenant');
    }

    const tx = txRes.rows[0];

    // Already succeeded
    if (tx.status === 'succeeded') {
      return {
        success: true,
        type: tx.payment_type,
        amount: tx.amount_cents / 100,
        plan: tx.plan,
        creditsAdded: tx.credits_added,
        message: 'Payment already processed and credited',
      };
    }

    // Verify with real Stripe if not simulated
    if (stripeClient && !sessionId.startsWith('cs_sim_')) {
      try {
        const session = await stripeClient.checkout.sessions.retrieve(sessionId);
        if (session.payment_status !== 'paid') {
          return {
            success: false,
            type: tx.payment_type,
            amount: tx.amount_cents / 100,
            message: `Stripe payment status is ${session.payment_status}`,
          };
        }
      } catch (err: any) {
        logger.error(`Error verifying with Stripe API: ${err.message}`);
      }
    }

    // Apply fulfillment to tenant
    if (tx.payment_type === 'subscription' && tx.plan) {
      const plan = PLAN_DETAILS[tx.plan.toLowerCase()] || PLAN_DETAILS.starter;
      await pool.query(
        `UPDATE tenants SET plan = $1, monthly_quota = $2, updated_at = NOW() WHERE id = $3`,
        [tx.plan.toLowerCase(), plan.quota, tenantId]
      );
      logger.info(`Tenant ${tenantId} upgraded to ${tx.plan} (${plan.quota} quota) via Stripe checkout`);
    } else if (tx.payment_type === 'credit_topup' && tx.credits_added > 0) {
      await pool.query(
        `UPDATE tenants SET monthly_quota = COALESCE(monthly_quota, 0) + $1, updated_at = NOW() WHERE id = $2`,
        [tx.credits_added, tenantId]
      );
      logger.info(`Tenant ${tenantId} added ${tx.credits_added} message credits via Stripe checkout`);
    }

    // Mark transaction succeeded
    await pool.query(
      `UPDATE payment_transactions SET status = 'succeeded', updated_at = NOW() WHERE id = $1`,
      [tx.id]
    );

    return {
      success: true,
      type: tx.payment_type,
      amount: tx.amount_cents / 100,
      plan: tx.plan,
      creditsAdded: tx.credits_added,
      message: tx.payment_type === 'subscription'
        ? `Successfully upgraded to ${tx.plan?.toUpperCase()} Plan!`
        : `Successfully added ${tx.credits_added?.toLocaleString()} message credits!`,
    };
  }

  /**
   * Handle incoming Stripe webhook event
   */
  static async handleWebhook(rawBody: string | Buffer, signature: string): Promise<{ received: boolean }> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

    if (!stripeClient || !webhookSecret) {
      logger.warn('Stripe webhook received but webhook secret is not configured');
      return { received: true };
    }

    let event: Stripe.Event;
    try {
      event = stripeClient.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      logger.error(`Webhook signature verification failed: ${err.message}`);
      throw new Error(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const tenantId = session.metadata?.tenantId || session.client_reference_id;
      if (tenantId) {
        await StripeService.fulfillCheckoutSession(session.id, tenantId);
      }
    }

    return { received: true };
  }
}
