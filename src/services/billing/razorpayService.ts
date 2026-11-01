import Razorpay from 'razorpay';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../../config/database';
import { createLogger } from '../../config/logger';

const logger = createLogger('razorpay-service');

const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';

const razorpayClient =
  razorpayKeyId && razorpayKeySecret
    ? new Razorpay({
        key_id: razorpayKeyId,
        key_secret: razorpayKeySecret,
      })
    : null;

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

export class RazorpayService {
  /**
   * Check if real Razorpay API keys are configured
   */
  static isConfigured(): boolean {
    return Boolean(razorpayClient);
  }

  /**
   * Get public Razorpay Key ID for client-side Checkout
   */
  static getKeyId(): string {
    return razorpayKeyId || 'rzp_test_simulated';
  }

  /**
   * Create a Razorpay Order for plan upgrade or credit top-up
   */
  static async createOrder(params: {
    tenantId: string;
    userEmail?: string;
    type: 'subscription' | 'credit_topup';
    planKey?: string;
    creditPackKey?: string;
    customCredits?: number;
    successUrl?: string;
    cancelUrl?: string;
  }): Promise<{
    orderId: string;
    amount: number; // in paise
    currency: string;
    keyId: string;
    title: string;
    description: string;
    mode: 'real' | 'simulated';
    sessionId: string; // for backward compatibility
    checkoutUrl?: string;
  }> {
    const { tenantId, userEmail, type, planKey, creditPackKey, customCredits, successUrl } = params;
    const pool = getPool();
    const transactionId = uuidv4();

    let amountPaise = 0;
    let title = '';
    let description = '';
    let creditsToAdd = 0;
    let selectedPlan = planKey || '';

    if (type === 'subscription') {
      const plan = PLAN_DETAILS[selectedPlan.toLowerCase()] || PLAN_DETAILS.starter;
      amountPaise = plan.priceInr * 100;
      title = `WhatsApp API - ${plan.name} Subscription`;
      description = `Monthly subscription for ${plan.quota.toLocaleString()} messages/month`;
      creditsToAdd = plan.quota;
    } else {
      if (creditPackKey && CREDIT_PACKS[creditPackKey]) {
        const pack = CREDIT_PACKS[creditPackKey];
        amountPaise = pack.priceInr * 100;
        creditsToAdd = pack.credits;
        title = `WhatsApp API - Top Up ${pack.credits.toLocaleString()} Credits`;
        description = `Add ${pack.credits.toLocaleString()} messaging credits to your balance`;
      } else if (customCredits && customCredits > 0) {
        creditsToAdd = customCredits;
        amountPaise = Math.round(customCredits * 28); // 0.28 INR per credit = 28 paise
        title = `WhatsApp API - Custom Top Up (${customCredits.toLocaleString()} Credits)`;
        description = `Add ${customCredits.toLocaleString()} messaging credits to your balance`;
      } else {
        throw new Error('Invalid credit pack or amount specified');
      }
    }

    // If Razorpay keys are configured, create real Razorpay Order
    if (razorpayClient) {
      try {
        const order = await razorpayClient.orders.create({
          amount: amountPaise,
          currency: 'INR',
          receipt: transactionId.substring(0, 40),
          notes: {
            tenantId,
            transactionId,
            type,
            plan: selectedPlan,
            creditsAdded: String(creditsToAdd),
            userEmail: userEmail || '',
          },
        });

        // Record pending transaction
        await pool.query(
          `INSERT INTO payment_transactions 
           (id, tenant_id, stripe_session_id, razorpay_order_id, amount_cents, currency, payment_type, plan, credits_added, status, customer_email, created_at)
           VALUES ($1, $2, $3, $4, $5, 'inr', $6, $7, $8, 'pending', $9, NOW())`,
          [transactionId, tenantId, order.id, order.id, amountPaise, type, selectedPlan || null, creditsToAdd, userEmail || null]
        );

        logger.info(`Created real Razorpay order ${order.id} for tenant ${tenantId}`);

        return {
          orderId: order.id,
          amount: amountPaise,
          currency: 'INR',
          keyId: razorpayKeyId,
          title,
          description,
          mode: 'real',
          sessionId: order.id,
        };
      } catch (err: any) {
        logger.error(`Razorpay order creation failed: ${err.message}. Falling back to sandbox simulation.`);
      }
    }

    // Sandbox / Simulation mode for development without live Razorpay keys
    const mockOrderId = `order_sim_${uuidv4().replace(/-/g, '').substring(0, 20)}`;
    const mockCheckoutUrl = successUrl
      ? `${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id=${mockOrderId}&simulated=true`
      : undefined;

    await pool.query(
      `INSERT INTO payment_transactions 
       (id, tenant_id, stripe_session_id, razorpay_order_id, amount_cents, currency, payment_type, plan, credits_added, status, customer_email, created_at)
       VALUES ($1, $2, $3, $4, $5, 'inr', $6, $7, $8, 'pending', $9, NOW())`,
      [transactionId, tenantId, mockOrderId, mockOrderId, amountPaise, type, selectedPlan || null, creditsToAdd, userEmail || null]
    );

    logger.info(`Created simulated Razorpay order ${mockOrderId} for tenant ${tenantId}`);

    return {
      orderId: mockOrderId,
      amount: amountPaise,
      currency: 'INR',
      keyId: 'rzp_test_simulated',
      title,
      description,
      mode: 'simulated',
      sessionId: mockOrderId,
      checkoutUrl: mockCheckoutUrl,
    };
  }

  /**
   * Verify Razorpay Payment Signature and fulfill subscription / credit top-up
   */
  static async verifyPayment(params: {
    orderId: string;
    paymentId?: string;
    signature?: string;
    tenantId: string;
  }): Promise<{
    success: boolean;
    type: string;
    amount: number;
    plan?: string;
    creditsAdded?: number;
    message: string;
  }> {
    const { orderId, paymentId, signature, tenantId } = params;
    const pool = getPool();

    // Check transaction record
    const txRes = await pool.query(
      `SELECT * FROM payment_transactions 
       WHERE (razorpay_order_id = $1 OR stripe_session_id = $1) AND tenant_id = $2`,
      [orderId, tenantId]
    );

    if (txRes.rows.length === 0) {
      throw new Error('Transaction order not found for this tenant');
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
        message: 'Payment already verified and credited',
      };
    }

    // If real Razorpay keys are configured and this is not a simulated order
    if (razorpayClient && !orderId.startsWith('order_sim_') && razorpayKeySecret) {
      if (paymentId && signature) {
        // Verify Razorpay HMAC SHA256 signature
        const expectedSignature = crypto
          .createHmac('sha256', razorpayKeySecret)
          .update(`${orderId}|${paymentId}`)
          .digest('hex');

        if (expectedSignature !== signature) {
          logger.error(`Razorpay signature verification failed for order ${orderId}`);
          throw new Error('Invalid Razorpay payment signature');
        }
      } else if (paymentId) {
        // Fetch payment details directly from Razorpay API
        try {
          const payment = await razorpayClient.payments.fetch(paymentId);
          if (payment.status !== 'captured' && payment.status !== 'authorized') {
            return {
              success: false,
              type: tx.payment_type,
              amount: tx.amount_cents / 100,
              message: `Razorpay payment status is ${payment.status}`,
            };
          }
        } catch (err: any) {
          logger.error(`Error fetching payment from Razorpay: ${err.message}`);
          throw new Error(`Failed to verify payment with Razorpay: ${err.message}`);
        }
      }
    }

    // Apply fulfillment to tenant
    if (tx.payment_type === 'subscription' && tx.plan) {
      const plan = PLAN_DETAILS[tx.plan.toLowerCase()] || PLAN_DETAILS.starter;
      await pool.query(
        `UPDATE tenants SET plan = $1, monthly_quota = $2, updated_at = NOW() WHERE id = $3`,
        [tx.plan.toLowerCase(), plan.quota, tenantId]
      );
      logger.info(`Tenant ${tenantId} upgraded to ${tx.plan} (${plan.quota} quota) via Razorpay payment`);
    } else if (tx.payment_type === 'credit_topup' && tx.credits_added > 0) {
      await pool.query(
        `UPDATE tenants SET monthly_quota = COALESCE(monthly_quota, 0) + $1, updated_at = NOW() WHERE id = $2`,
        [tx.credits_added, tenantId]
      );
      logger.info(`Tenant ${tenantId} added ${tx.credits_added} message credits via Razorpay payment`);
    }

    // Mark transaction succeeded
    await pool.query(
      `UPDATE payment_transactions 
       SET status = 'succeeded', 
           razorpay_payment_id = COALESCE($1, razorpay_payment_id),
           razorpay_signature = COALESCE($2, razorpay_signature),
           updated_at = NOW() 
       WHERE id = $3`,
      [paymentId || null, signature || null, tx.id]
    );

    return {
      success: true,
      type: tx.payment_type,
      amount: tx.amount_cents / 100,
      plan: tx.plan,
      creditsAdded: tx.credits_added,
      message:
        tx.payment_type === 'subscription'
          ? `Successfully upgraded to ${tx.plan?.toUpperCase()} Plan!`
          : `Successfully added ${tx.credits_added?.toLocaleString()} message credits!`,
    };
  }

  /**
   * Handle incoming Razorpay webhook event
   */
  static async handleWebhook(rawBody: string | Buffer, signature: string): Promise<{ received: boolean }> {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';

    if (!webhookSecret) {
      logger.warn('Razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not configured');
      return { received: true };
    }

    // Validate signature
    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(bodyStr).digest('hex');

    if (expectedSignature !== signature) {
      logger.error('Razorpay webhook signature verification failed');
      throw new Error('Invalid Razorpay webhook signature');
    }

    let payload: any;
    try {
      payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new Error('Invalid JSON payload');
    }

    const event = payload.event;
    logger.info(`Received Razorpay webhook event: ${event}`);

    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id || payload.payload?.order?.entity?.id;
      const paymentId = paymentEntity?.id;
      const tenantId = paymentEntity?.notes?.tenantId;

      if (orderId && tenantId) {
        await RazorpayService.verifyPayment({
          orderId,
          paymentId,
          tenantId,
        });
      }
    }

    return { received: true };
  }
}
