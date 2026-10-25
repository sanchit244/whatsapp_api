import { Router, Response, NextFunction } from 'express';
import { CampaignService } from './campaignService';
import { createLogger } from '../../config/logger';
import { tenantMiddleware, AuthRequest, requireRole } from '../../middleware/tenantMiddleware';
import { ValidationError } from '../../middleware/errorHandler';

const router = Router();
const logger = createLogger('campaign-routes');

import { BulkDispatcher } from './bulkDispatcher';
import { getPool } from '../../config/database';

/**
 * POST /api/v1/campaigns
 * Create a new campaign (and optionally trigger bulk dispatch immediately)
 */
router.post(
  '/',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, description, template_id, scheduled_at, message, message_body, contacts, message_type, template_name, media_url, media_type } = req.body;

      if (!req.tenantId || !req.userId) {
        throw new ValidationError('Missing tenant or user context');
      }

      const campaign = await CampaignService.createCampaign(req.tenantId, req.userId, {
        name,
        description: description || (message ? `Campaign: ${name}` : undefined),
        template_id,
        scheduled_at: scheduled_at ? new Date(scheduled_at) : undefined,
      });

      const finalMessage = message || message_body || '';
      const pool = getPool();
      const contactList = Array.isArray(contacts) ? contacts : [];
      const isScheduled = scheduled_at && new Date(scheduled_at).getTime() > Date.now();

      if (isScheduled) {
        await pool.query(
          `UPDATE campaigns 
           SET status = 'scheduled',
               scheduled_at = $1,
               message_body = $2,
               media_url = $3,
               media_type = $4,
               total_messages = $5,
               recipients_data = $6,
               dispatch_payload = $7,
               updated_at = NOW()
           WHERE id = $8 AND tenant_id = $9`,
          [
            new Date(scheduled_at),
            finalMessage,
            media_url || null,
            media_type || message_type || null,
            contactList.length,
            JSON.stringify(contactList),
            JSON.stringify({
              messageType: message_type || (media_url ? 'image' : 'text'),
              messageText: finalMessage,
              templateName: template_name,
              mediaUrl: media_url,
              mediaType: media_type,
            }),
            campaign.id,
            req.tenantId,
          ]
        );
        (campaign as any).status = 'scheduled';
        (campaign as any).scheduled_at = new Date(scheduled_at);
        (campaign as any).total_messages = contactList.length;

        res.status(201).json({
          message: `Campaign scheduled for ${new Date(scheduled_at).toLocaleString()}`,
          campaign,
        });
        return;
      }

      try {
        await pool.query(
          `UPDATE campaigns SET message_body = $1, media_url = $2, media_type = $3 WHERE id = $4 AND tenant_id = $5`,
          [finalMessage, media_url || null, media_type || message_type || null, campaign.id, req.tenantId]
        );
      } catch {
        // Safe fallback if column migration is pending
      }

      // If contacts list is supplied, dispatch right away!
      if (contactList.length > 0) {
        await BulkDispatcher.startDispatch({
          campaignId: campaign.id,
          tenantId: req.tenantId,
          userId: req.userId,
          recipients: contactList,
          messageType: message_type || (media_url ? 'image' : 'text'),
          messageText: finalMessage,
          templateName: template_name,
          mediaUrl: media_url,
          mediaType: media_type || (message_type === 'image' || message_type === 'video' || message_type === 'document' ? message_type : undefined),
        });
        (campaign as any).status = 'active';
        (campaign as any).total_messages = contactList.length;
      }

      res.status(201).json({
        message: contactList.length > 0 ? 'Bulk campaign launched successfully' : 'Campaign created successfully',
        campaign,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/campaigns/calendar
 * Calendar events view of all campaigns
 */
router.get(
  '/calendar',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Missing tenant context');
      }

      const pool = getPool();
      const eventsRes = await pool.query(
        `SELECT id, name, description, status, scheduled_at, started_at, created_at, completed_at,
                total_messages, messages_sent, messages_delivered, messages_failed, message_body
         FROM campaigns 
         WHERE tenant_id = $1 
         ORDER BY COALESCE(scheduled_at, created_at) ASC`,
        [req.tenantId]
      );

      res.json({
        success: true,
        events: eventsRes.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/campaigns/:id/reschedule
 * Change scheduled time of a pending campaign
 */
router.post(
  '/:id/reschedule',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId || !req.userId) {
        throw new ValidationError('Missing tenant context');
      }

      const { scheduled_at } = req.body;
      if (!scheduled_at) {
        throw new ValidationError('scheduled_at datetime is required');
      }

      const pool = getPool();
      await pool.query(
        `UPDATE campaigns 
         SET scheduled_at = $1, status = 'scheduled', updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [new Date(scheduled_at), req.params.id, req.tenantId]
      );

      res.json({
        success: true,
        message: `Campaign rescheduled for ${new Date(scheduled_at).toLocaleString()}`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/campaigns
 * List campaigns
 */
router.get(
  '/',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Missing tenant context');
      }

      const status = req.query.status as string | undefined;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

      const result = await CampaignService.listCampaigns(req.tenantId, {
        status: status as any,
        page,
        limit,
      });

      res.json({
        message: 'Campaigns retrieved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/campaigns/:id
 * Get campaign details
 */
router.get(
  '/:id',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Missing tenant context');
      }

      const campaign = await CampaignService.getCampaign(req.tenantId, req.params.id as string);

      res.json({
        message: 'Campaign retrieved successfully',
        campaign,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/v1/campaigns/:id
 * Update campaign
 */
router.put(
  '/:id',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId || !req.userId) {
        throw new ValidationError('Missing tenant or user context');
      }

      const { name, description, template_id } = req.body;

      const campaign = await CampaignService.updateCampaign(
        req.tenantId,
        req.params.id as string,
        req.userId,
        {
          name,
          description,
          template_id,
        }
      );

      res.json({
        message: 'Campaign updated successfully',
        campaign,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/campaigns/:id
 * Delete campaign
 */
router.delete(
  '/:id',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId || !req.userId) {
        throw new ValidationError('Missing tenant or user context');
      }

      await CampaignService.deleteCampaign(req.tenantId, req.params.id as string, req.userId);

      res.json({
        message: 'Campaign deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/campaigns/:id/start
 * Start campaign
 */
router.post(
  '/:id/start',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId || !req.userId) {
        throw new ValidationError('Missing tenant or user context');
      }

      const campaign = await CampaignService.startCampaign(
        req.tenantId,
        req.params.id as string,
        req.userId
      );

      res.json({
        message: 'Campaign started successfully',
        campaign,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/campaigns/:id/pause
 * Pause campaign
 */
router.post(
  '/:id/pause',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId || !req.userId) {
        throw new ValidationError('Missing tenant or user context');
      }

      const campaign = await CampaignService.pauseCampaign(
        req.tenantId,
        req.params.id as string,
        req.userId
      );

      res.json({
        message: 'Campaign paused successfully',
        campaign,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/campaigns/:id/resume
 * Resume campaign
 */
router.post(
  '/:id/resume',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId || !req.userId) {
        throw new ValidationError('Missing tenant or user context');
      }

      const campaign = await CampaignService.resumeCampaign(
        req.tenantId,
        req.params.id as string,
        req.userId
      );

      res.json({
        message: 'Campaign resumed successfully',
        campaign,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/campaigns/:id/cancel
 * Cancel campaign
 */
router.post(
  '/:id/cancel',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId || !req.userId) {
        throw new ValidationError('Missing tenant or user context');
      }

      const campaign = await CampaignService.cancelCampaign(
        req.tenantId,
        req.params.id as string,
        req.userId
      );

      res.json({
        message: 'Campaign cancelled successfully',
        campaign,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/campaigns/:id/analytics
 * Get campaign analytics
 */
router.get(
  '/:id/analytics',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Missing tenant context');
      }

      const analytics = await CampaignService.getCampaignAnalytics(
        req.tenantId,
        req.params.id as string
      );

      res.json({
        message: 'Campaign analytics retrieved successfully',
        analytics,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/campaigns/:id/messages
 * List recipient delivery logs for a specific campaign
 */
router.get(
  '/:id/messages',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Missing tenant context');
      }

      const pool = getPool();
      const messagesRes = await pool.query(
        `SELECT id, phone_number, status, meta_message_id, error_message, media_url, media_type, created_at, sent_at, delivered_at, read_at
         FROM messages 
         WHERE campaign_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC
         LIMIT 200`,
        [req.params.id, req.tenantId]
      );

      res.json({
        messages: messagesRes.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/campaigns/:id
 * Delete a campaign
 */
router.delete(
  '/:id',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Missing tenant context');
      }

      const pool = getPool();
      await pool.query(
        `DELETE FROM campaigns WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId]
      );

      res.json({
        message: 'Campaign deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as campaignRoutes };
