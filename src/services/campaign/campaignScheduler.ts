import { getPool } from '../../config/database';
import { createLogger } from '../../config/logger';
import { BulkDispatcher } from './bulkDispatcher';
import { emitCampaignUpdate } from '../../config/socket';

const logger = createLogger('campaign-scheduler');

let schedulerInterval: NodeJS.Timeout | null = null;

export class CampaignScheduler {
  /**
   * Initialize the background cron loop to poll for due scheduled campaigns
   */
  static initScheduler(intervalMs = 20000): void {
    if (schedulerInterval) {
      clearInterval(schedulerInterval);
    }

    logger.info(`Campaign Scheduler initialized (polling every ${intervalMs / 1000}s)`);

    schedulerInterval = setInterval(async () => {
      try {
        await CampaignScheduler.checkAndTriggerScheduledCampaigns();
      } catch (err: any) {
        logger.error(`Error in scheduler tick: ${err.message}`);
      }
    }, intervalMs);

    // Run first check immediately
    CampaignScheduler.checkAndTriggerScheduledCampaigns().catch((err) => {
      logger.error(`Initial scheduler check error: ${err.message}`);
    });
  }

  /**
   * Stop the scheduler interval
   */
  static stopScheduler(): void {
    if (schedulerInterval) {
      clearInterval(schedulerInterval);
      schedulerInterval = null;
      logger.info('Campaign Scheduler stopped');
    }
  }

  /**
   * Query database for due scheduled campaigns and trigger their bulk dispatch
   */
  static async checkAndTriggerScheduledCampaigns(): Promise<void> {
    const pool = getPool();

    try {
      const dueRes = await pool.query(
        `SELECT id, tenant_id, created_by, name, scheduled_at, message_body, media_url, media_type, dispatch_payload, recipients_data
         FROM campaigns
         WHERE status = 'scheduled'
           AND scheduled_at IS NOT NULL
           AND scheduled_at <= NOW()`
      );

      if (dueRes.rows.length === 0) {
        return;
      }

      logger.info(`Found ${dueRes.rows.length} scheduled campaign(s) ready for execution`);

      for (const campaign of dueRes.rows) {
        await CampaignScheduler.executeScheduledCampaign(campaign);
      }
    } catch (err: any) {
      logger.error(`Failed to poll scheduled campaigns: ${err.message}`);
    }
  }

  /**
   * Execute an individual scheduled campaign
   */
  static async executeScheduledCampaign(campaign: any): Promise<void> {
    const pool = getPool();
    const campaignId = campaign.id;
    const tenantId = campaign.tenant_id;

    logger.info(`Executing scheduled campaign "${campaign.name}" (${campaignId}) for tenant ${tenantId}`);

    try {
      // Mark as processing/active so other ticks don't re-pick it
      await pool.query(
        `UPDATE campaigns SET status = 'active', started_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'scheduled'`,
        [campaignId]
      );

      let recipients: string[] = [];
      if (campaign.recipients_data) {
        try {
          recipients = JSON.parse(campaign.recipients_data);
        } catch {
          recipients = [];
        }
      }

      let payload: any = {};
      if (campaign.dispatch_payload) {
        try {
          payload = JSON.parse(campaign.dispatch_payload);
        } catch {
          payload = {};
        }
      }

      if (recipients.length === 0) {
        logger.warn(`Scheduled campaign ${campaignId} has 0 recipients. Marking as completed.`);
        await pool.query(
          `UPDATE campaigns SET status = 'completed', completed_at = NOW() WHERE id = $1`,
          [campaignId]
        );
        return;
      }

      // Notify clients
      emitCampaignUpdate(tenantId, {
        type: 'scheduled_started',
        campaignId,
        name: campaign.name,
        total: recipients.length,
      });

      // Start bulk dispatch
      await BulkDispatcher.startDispatch({
        campaignId,
        tenantId,
        userId: campaign.created_by,
        recipients,
        messageType: payload.messageType || (campaign.media_url ? 'image' : 'text'),
        messageText: payload.messageText || campaign.message_body || '',
        templateName: payload.templateName,
        mediaUrl: campaign.media_url || payload.mediaUrl,
        mediaType: campaign.media_type || payload.mediaType,
      });

      logger.info(`Scheduled campaign ${campaignId} launched successfully`);
    } catch (err: any) {
      logger.error(`Error executing scheduled campaign ${campaignId}: ${err.message}`);
      await pool.query(
        `UPDATE campaigns SET status = 'failed', updated_at = NOW() WHERE id = $1`,
        [campaignId]
      );
    }
  }
}
