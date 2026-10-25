import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../../config/database';
import { createLogger } from '../../config/logger';
import { MetaWhatsAppService } from '../whatsapp/metaService';

const logger = createLogger('bulk-dispatcher');

export interface BulkSendItem {
  phoneNumber: string;
  name?: string;
  customVars?: Record<string, string>;
}

export interface DispatchCampaignOptions {
  campaignId: string;
  tenantId: string;
  userId: string;
  recipients: (string | BulkSendItem)[];
  messageType: 'text' | 'template' | 'image' | 'video' | 'document';
  messageText?: string;
  templateName?: string;
  languageCode?: string;
  templateComponents?: any[];
  rateLimitPerSecond?: number; // e.g. 20 msgs/sec
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'document';
}

export class BulkDispatcher {
  /**
   * Enqueue and run a bulk campaign asynchronously
   */
  static async startDispatch(options: DispatchCampaignOptions): Promise<{ total: number; campaignId: string }> {
    const pool = getPool();
    const { campaignId, tenantId, recipients, messageType, messageText, templateName, languageCode, templateComponents, rateLimitPerSecond = 20 } = options;

    // Normalize recipients list
    const validRecipients: BulkSendItem[] = recipients
      .map((r) => {
        if (typeof r === 'string') {
          return { phoneNumber: MetaWhatsAppService.cleanPhoneNumber(r) };
        }
        return {
          ...r,
          phoneNumber: MetaWhatsAppService.cleanPhoneNumber(r.phoneNumber),
        };
      })
      .filter((r) => r.phoneNumber.length >= 7 && r.phoneNumber.length <= 16);

    // Check Global Blacklist / DNC
    let blacklistedSet = new Set<string>();
    try {
      const blRes = await pool.query(`SELECT phone_number FROM global_blacklist`);
      blacklistedSet = new Set(blRes.rows.map((r: any) => MetaWhatsAppService.cleanPhoneNumber(r.phone_number)));
    } catch {
      // Table may be initializing
    }

    const nonBlacklisted: BulkSendItem[] = [];
    const blacklisted: BulkSendItem[] = [];

    for (const r of validRecipients) {
      if (blacklistedSet.has(r.phoneNumber)) {
        blacklisted.push(r);
      } else {
        nonBlacklisted.push(r);
      }
    }

    const total = validRecipients.length;

    // Update campaign status to active and set total_messages
    await pool.query(
      `UPDATE campaigns 
       SET status = 'active', total_messages = $1, started_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [total, campaignId, tenantId]
    );

    // Populate messages table
    for (const recipient of nonBlacklisted) {
      const messageId = uuidv4();
      await pool.query(
        `INSERT INTO messages (id, tenant_id, campaign_id, phone_number, status, media_url, media_type, created_at)
         VALUES ($1, $2, $3, $4, 'pending', $5, $6, NOW())`,
        [messageId, tenantId, campaignId, recipient.phoneNumber, options.mediaUrl || null, options.mediaType || options.messageType || null]
      );
    }

    for (const recipient of blacklisted) {
      const messageId = uuidv4();
      await pool.query(
        `INSERT INTO messages (id, tenant_id, campaign_id, phone_number, status, error_message, media_url, media_type, created_at)
         VALUES ($1, $2, $3, $4, 'failed', 'Blocked by Global Blacklist / DNC registry', $5, $6, NOW())`,
        [messageId, tenantId, campaignId, recipient.phoneNumber, options.mediaUrl || null, options.mediaType || options.messageType || null]
      );
    }

    // Run dispatch asynchronously without blocking the API request
    setImmediate(async () => {
      try {
        await this.processQueue(options, validRecipients);
      } catch (err: any) {
        logger.error(`Critical error during bulk dispatch of campaign ${campaignId}: ${err.message}`);
        await pool.query(
          `UPDATE campaigns SET status = 'failed', updated_at = NOW() WHERE id = $1`,
          [campaignId]
        );
      }
    });

    return { total, campaignId };
  }

  /**
   * Internal queue processor with throttling / delay between messages
   */
  private static async processQueue(
    options: DispatchCampaignOptions,
    recipients: BulkSendItem[]
  ): Promise<void> {
    const { campaignId, tenantId, messageType, messageText, templateName, languageCode, templateComponents, rateLimitPerSecond = 20 } = options;
    const pool = getPool();

    logger.info(`Starting bulk dispatch for campaign ${campaignId}: ${recipients.length} recipients`);

    // Resolve credentials once (or per-tenant)
    const credentials = await MetaWhatsAppService.resolveCredentials(tenantId);
    const delayMs = Math.max(20, Math.floor(1000 / rateLimitPerSecond));

    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];

      try {
        // Check if campaign was paused or cancelled by user/admin
        if (i % 10 === 0) {
          const statusRes = await pool.query(
            `SELECT status FROM campaigns WHERE id = $1`,
            [campaignId]
          );
          const currentStatus = statusRes.rows[0]?.status;
          if (currentStatus === 'paused' || currentStatus === 'cancelled') {
            logger.info(`Campaign ${campaignId} was ${currentStatus}. Halting dispatch.`);
            return;
          }
        }

        // Format message body (replace variables like {{name}} or {{1}})
        let customizedText = messageText || '';
        if (recipient.name) {
          customizedText = customizedText
            .replace(/\{\{name\}\}/gi, recipient.name)
            .replace(/\{\{1\}\}/g, recipient.name);
        }

        let sendResult;
        if (messageType === 'template' && templateName) {
          sendResult = await MetaWhatsAppService.sendTemplateMessage(
            {
              to: recipient.phoneNumber,
              templateName,
              languageCode: languageCode || 'en_US',
              components: templateComponents,
            },
            credentials
          );
        } else if (
          (messageType === 'image' || messageType === 'video' || messageType === 'document') &&
          options.mediaUrl
        ) {
          sendResult = await MetaWhatsAppService.sendMediaMessage(
            {
              to: recipient.phoneNumber,
              type: messageType,
              mediaUrl: options.mediaUrl,
              caption: customizedText,
            },
            credentials
          );
        } else {
          sendResult = await MetaWhatsAppService.sendTextMessage(
            {
              to: recipient.phoneNumber,
              text: customizedText,
            },
            credentials
          );
        }

        if (sendResult.success) {
          sentCount++;
          await pool.query(
            `UPDATE messages 
             SET status = 'sent', meta_message_id = $1, sent_at = NOW()
             WHERE campaign_id = $2 AND phone_number = $3 AND status = 'pending'`,
            [sendResult.messageId || null, campaignId, recipient.phoneNumber]
          );
        } else {
          failedCount++;
          await pool.query(
            `UPDATE messages 
             SET status = 'failed', error_message = $1
             WHERE campaign_id = $2 AND phone_number = $3 AND status = 'pending'`,
            [sendResult.error || 'Send failed', campaignId, recipient.phoneNumber]
          );
        }
      } catch (itemErr: any) {
        failedCount++;
        await pool.query(
          `UPDATE messages 
           SET status = 'failed', error_message = $1
           WHERE campaign_id = $2 AND phone_number = $3 AND status = 'pending'`,
          [itemErr.message, campaignId, recipient.phoneNumber]
        );
      }

      // Update campaign progress in DB periodically
      if ((i + 1) % 5 === 0 || i === recipients.length - 1) {
        await pool.query(
          `UPDATE campaigns 
           SET messages_sent = $1, messages_failed = $2, updated_at = NOW()
           WHERE id = $3`,
          [sentCount, failedCount, campaignId]
        );
      }

      // Rate limit throttle
      if (i < recipients.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    // Mark campaign completed
    await pool.query(
      `UPDATE campaigns 
       SET status = 'completed', completed_at = NOW(), messages_sent = $1, messages_failed = $2, updated_at = NOW()
       WHERE id = $3`,
      [sentCount, failedCount, campaignId]
    );

    logger.info(`Campaign ${campaignId} completed! Sent: ${sentCount}, Failed: ${failedCount}`);
  }
}
