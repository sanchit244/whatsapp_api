import axios, { AxiosInstance } from 'axios';
import { createLogger } from '../../config/logger';
import { getPool } from '../../config/database';

const logger = createLogger('meta-whatsapp-service');

export interface MetaCredentials {
  token: string;
  phoneNumberId: string;
  businessAccountId?: string;
}

export interface WhatsAppTextMessagePayload {
  to: string;
  text: string;
  previewUrl?: boolean;
}

export interface WhatsAppTemplateMessagePayload {
  to: string;
  templateName: string;
  languageCode?: string;
  components?: any[];
}

export interface WhatsAppMediaMessagePayload {
  to: string;
  type: 'image' | 'video' | 'document' | 'audio';
  mediaUrl: string;
  caption?: string;
  filename?: string;
}

export interface MetaSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  status: 'sent' | 'failed' | 'simulated';
}

export class MetaWhatsAppService {
  private static defaultVersion = process.env.WHATSAPP_API_VERSION || 'v20.0';

  /**
   * Resolve credentials: Checks tenant BYOK credentials first.
   * If not set or not enabled, falls back to platform settings / env vars.
   */
  static async resolveCredentials(tenantId?: string): Promise<MetaCredentials | null> {
    const pool = getPool();

    // 1. Check if tenant has BYOK configured and active
    if (tenantId) {
      try {
        const tenantRes = await pool.query(
          `SELECT whatsapp_token, whatsapp_phone_number_id, whatsapp_business_account_id, use_custom_whatsapp
           FROM tenants WHERE id = $1`,
          [tenantId]
        );

        if (tenantRes.rows.length > 0) {
          const tenant = tenantRes.rows[0];
          if (
            tenant.use_custom_whatsapp &&
            tenant.whatsapp_token &&
            tenant.whatsapp_phone_number_id
          ) {
            logger.info(`Using Tenant-Specific (BYOK) Meta credentials for tenant: ${tenantId}`);
            return {
              token: tenant.whatsapp_token,
              phoneNumberId: tenant.whatsapp_phone_number_id,
              businessAccountId: tenant.whatsapp_business_account_id || undefined,
            };
          }
        }
      } catch (err) {
        logger.warn(`Could not fetch tenant-specific WhatsApp config: ${(err as Error).message}`);
      }
    }

    // 2. Check platform-level settings from database (system_settings)
    try {
      const settingsRes = await pool.query(
        `SELECT setting_key, setting_value FROM system_settings 
         WHERE setting_key IN ('meta_whatsapp_token', 'meta_phone_number_id', 'meta_business_account_id')`
      );

      const dbConfig: Record<string, string> = {};
      settingsRes.rows.forEach((row: any) => {
        dbConfig[row.setting_key] = row.setting_value;
      });

      const token = dbConfig['meta_whatsapp_token'] || process.env.WHATSAPP_API_TOKEN;
      const phoneNumberId = dbConfig['meta_phone_number_id'] || process.env.WHATSAPP_PHONE_NUMBER_ID;
      const businessAccountId = dbConfig['meta_business_account_id'] || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

      if (token && phoneNumberId && !token.includes('your_meta_whatsapp_api_token')) {
        logger.info('Using Platform Meta credentials (configured in database or environment)');
        return {
          token,
          phoneNumberId,
          businessAccountId: businessAccountId || undefined,
        };
      }
    } catch {
      // Table might not exist yet before migrations run
    }

    // 3. Fallback to process.env
    const envToken = process.env.WHATSAPP_API_TOKEN;
    const envPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (envToken && envPhoneId && !envToken.includes('your_meta_whatsapp_api_token')) {
      return {
        token: envToken,
        phoneNumberId: envPhoneId,
        businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
      };
    }

    return null;
  }

  /**
   * Helper to format international phone number into digits only without '+' or leading zeros
   */
  static cleanPhoneNumber(rawPhone: string): string {
    const cleaned = rawPhone.replace(/\D/g, '');
    return cleaned;
  }

  /**
   * Test Meta API credentials by querying phone number details from Graph API
   */
  static async testCredentials(token: string, phoneNumberId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await axios.get(
        `https://graph.facebook.com/${this.defaultVersion}/${phoneNumberId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 10000,
        }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.error?.message || err.message || 'Failed to verify Meta credentials';
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Send a Direct Text Message via Meta Cloud API
   */
  static async sendTextMessage(
    payload: WhatsAppTextMessagePayload,
    credentials?: MetaCredentials | null
  ): Promise<MetaSendResult> {
    const to = this.cleanPhoneNumber(payload.to);
    if (!to) {
      return { success: false, status: 'failed', error: 'Invalid recipient phone number' };
    }

    // If no credentials or placeholder credentials, simulate delivery gracefully for testing
    if (!credentials || !credentials.token || credentials.token.includes('dummy') || credentials.token.includes('your_meta')) {
      logger.info(`[Simulation Mode] Message simulated for ${to}: "${payload.text.substring(0, 30)}..."`);
      return {
        success: true,
        status: 'simulated',
        messageId: `sim_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      };
    }

    try {
      const url = `https://graph.facebook.com/${this.defaultVersion}/${credentials.phoneNumberId}/messages`;
      const response = await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: {
            preview_url: payload.previewUrl ?? false,
            body: payload.text,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${credentials.token}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );

      const messageId = response.data?.messages?.[0]?.id;
      return {
        success: true,
        status: 'sent',
        messageId,
      };
    } catch (err: any) {
      const errorDetail =
        err.response?.data?.error?.message ||
        err.response?.data?.error?.error_data?.details ||
        err.message ||
        'Unknown Meta API Error';

      logger.error(`Meta API sendTextMessage failed to ${to}: ${errorDetail}`);
      return {
        success: false,
        status: 'failed',
        error: errorDetail,
      };
    }
  }

  /**
   * Send a Media Message (Image, Video, Document) with optional Caption via Meta Cloud API
   */
  static async sendMediaMessage(
    payload: WhatsAppMediaMessagePayload,
    credentials?: MetaCredentials | null
  ): Promise<MetaSendResult> {
    const to = this.cleanPhoneNumber(payload.to);
    if (!to) {
      return { success: false, status: 'failed', error: 'Invalid recipient phone number' };
    }

    if (!payload.mediaUrl) {
      return { success: false, status: 'failed', error: 'Missing media URL' };
    }

    // Simulation mode
    if (!credentials || !credentials.token || credentials.token.includes('dummy') || credentials.token.includes('your_meta')) {
      logger.info(
        `[Simulation Mode] Media (${payload.type}) simulated for ${to}: URL="${payload.mediaUrl}", Caption="${(payload.caption || '').substring(0, 30)}..."`
      );
      return {
        success: true,
        status: 'simulated',
        messageId: `sim_media_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      };
    }

    try {
      const url = `https://graph.facebook.com/${this.defaultVersion}/${credentials.phoneNumberId}/messages`;
      
      const mediaObject: Record<string, any> = {
        link: payload.mediaUrl,
      };

      if (payload.caption) {
        mediaObject.caption = payload.caption;
      }

      if (payload.type === 'document' && payload.filename) {
        mediaObject.filename = payload.filename;
      }

      const body: Record<string, any> = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: payload.type,
        [payload.type]: mediaObject,
      };

      const response = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${credentials.token}`,
          'Content-Type': 'application/json',
        },
        timeout: 25000,
      });

      const messageId = response.data?.messages?.[0]?.id;
      return {
        success: true,
        status: 'sent',
        messageId,
      };
    } catch (err: any) {
      const errorDetail =
        err.response?.data?.error?.message ||
        err.response?.data?.error?.error_data?.details ||
        err.message ||
        'Unknown Meta API Error';

      logger.error(`Meta API sendMediaMessage (${payload.type}) failed to ${to}: ${errorDetail}`);
      return {
        success: false,
        status: 'failed',
        error: errorDetail,
      };
    }
  }

  /**
   * Send an Approved Template Message via Meta Cloud API
   */
  static async sendTemplateMessage(
    payload: WhatsAppTemplateMessagePayload,
    credentials?: MetaCredentials | null
  ): Promise<MetaSendResult> {
    const to = this.cleanPhoneNumber(payload.to);
    if (!to) {
      return { success: false, status: 'failed', error: 'Invalid recipient phone number' };
    }

    if (!credentials || !credentials.token || credentials.token.includes('dummy') || credentials.token.includes('your_meta')) {
      logger.info(`[Simulation Mode] Template message simulated for ${to} (Template: ${payload.templateName})`);
      return {
        success: true,
        status: 'simulated',
        messageId: `sim_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      };
    }

    try {
      const url = `https://graph.facebook.com/${this.defaultVersion}/${credentials.phoneNumberId}/messages`;
      const response = await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'template',
          template: {
            name: payload.templateName,
            language: {
              code: payload.languageCode || 'en_US',
            },
            components: payload.components || [],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${credentials.token}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );

      const messageId = response.data?.messages?.[0]?.id;
      return {
        success: true,
        status: 'sent',
        messageId,
      };
    } catch (err: any) {
      const errorDetail =
        err.response?.data?.error?.message || err.message || 'Unknown Meta API Error';
      logger.error(`Meta API sendTemplateMessage failed to ${to}: ${errorDetail}`);
      return {
        success: false,
        status: 'failed',
        error: errorDetail,
      };
    }
  }

  /**
   * Fetch approved message templates from Meta WABA account
   */
  static async getTemplates(credentials?: MetaCredentials | null): Promise<any[]> {
    if (!credentials || !credentials.token || !credentials.businessAccountId) {
      // Return standard sample templates for display if no live WABA connected yet
      return [
        {
          id: 'tpl_welcome_1',
          name: 'welcome_greeting',
          language: 'en_US',
          status: 'APPROVED',
          category: 'MARKETING',
          body: 'Hello {{1}}, welcome to our platform! We are excited to have you on board.',
        },
        {
          id: 'tpl_order_update_2',
          name: 'order_status_update',
          language: 'en_US',
          status: 'APPROVED',
          category: 'UTILITY',
          body: 'Hi {{1}}, your order #{{2}} is now out for delivery.',
        },
        {
          id: 'tpl_reminder_3',
          name: 'appointment_reminder',
          language: 'en_US',
          status: 'APPROVED',
          category: 'UTILITY',
          body: 'Hi {{1}}, friendly reminder about your upcoming appointment on {{2}}.',
        },
      ];
    }

    try {
      const response = await axios.get(
        `https://graph.facebook.com/${this.defaultVersion}/${credentials.businessAccountId}/message_templates`,
        {
          headers: { Authorization: `Bearer ${credentials.token}` },
          params: { limit: 50 },
          timeout: 10000,
        }
      );
      return response.data?.data || [];
    } catch (err: any) {
      logger.warn(`Could not fetch templates from Meta API: ${err.message}`);
      return [];
    }
  }
}
