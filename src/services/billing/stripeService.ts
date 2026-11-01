/**
 * Legacy StripeService Adapter
 * Proxies calls to RazorpayService to maintain backward compatibility.
 */
import { RazorpayService, PLAN_DETAILS, CREDIT_PACKS } from './razorpayService';

export { PLAN_DETAILS, CREDIT_PACKS };

export class StripeService {
  static isConfigured(): boolean {
    return RazorpayService.isConfigured();
  }

  static async createCheckoutSession(params: any): Promise<any> {
    const res = await RazorpayService.createOrder(params);
    return {
      sessionId: res.orderId,
      checkoutUrl: res.checkoutUrl || `${params.successUrl}?session_id=${res.orderId}`,
      mode: res.mode,
      orderId: res.orderId,
      amount: res.amount,
      currency: res.currency,
      keyId: res.keyId,
    };
  }

  static async fulfillCheckoutSession(sessionId: string, tenantId: string): Promise<any> {
    return RazorpayService.verifyPayment({
      orderId: sessionId,
      tenantId,
    });
  }

  static async handleWebhook(rawBody: string | Buffer, signature: string): Promise<any> {
    return RazorpayService.handleWebhook(rawBody, signature);
  }
}
