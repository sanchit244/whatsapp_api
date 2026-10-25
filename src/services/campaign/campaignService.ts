import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../../config/database';
import { createLogger } from '../../config/logger';
import { getRedisClient, setInCache, getFromCache } from '../../config/redis';
import { publishEvent, enqueueJob } from '../../config/queue';
import { ValidationError, NotFoundError, AppError } from '../../middleware/errorHandler';

const logger = createLogger('campaign-service');

export type CampaignStatus = 'draft' | 'ready' | 'active' | 'paused' | 'completed' | 'cancelled';

export interface CreateCampaignRequest {
  name: string;
  description?: string;
  template_id?: string;
  scheduled_at?: Date;
}

export interface UpdateCampaignRequest {
  name?: string;
  description?: string;
  template_id?: string;
}

export interface CampaignResponse {
  id: string;
  name: string;
  description?: string;
  status: CampaignStatus;
  total_messages: number;
  messages_sent: number;
  messages_delivered: number;
  messages_failed: number;
  scheduled_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export class CampaignService {
  /**
   * Create a new campaign
   */
  static async createCampaign(
    tenantId: string,
    userId: string,
    req: CreateCampaignRequest
  ): Promise<CampaignResponse> {
    const { name, description, template_id, scheduled_at } = req;

    // Validation
    if (!name || name.trim().length === 0) {
      throw new ValidationError('Campaign name is required');
    }

    if (name.length > 255) {
      throw new ValidationError('Campaign name must be less than 255 characters');
    }

    const pool = getPool();

    try {
      const campaignId = uuidv4();

      // Create campaign
      const result = await pool.query(
        `INSERT INTO campaigns (id, tenant_id, created_by, name, description, template_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, description, status, total_messages, messages_sent,
                   messages_delivered, messages_failed, scheduled_at, created_at, updated_at`,
        [campaignId, tenantId, userId, name, description || null, template_id || null, 'draft']
      );

      const campaign = result.rows[0];

      // Cache the campaign
      const cacheKey = `tenant:${tenantId}:campaign:${campaignId}`;
      await setInCache(cacheKey, campaign, 3600);

      // Publish event
      await publishEvent('campaign.created', { campaignId, tenantId }, tenantId);

      // Audit log
      await CampaignService.auditLog(tenantId, userId, 'CREATE', 'campaign', campaignId, {
        name,
        description,
      });

      logger.info(`Campaign created: ${campaignId} for tenant ${tenantId}`);

      return campaign;
    } catch (error) {
      logger.error('Campaign creation failed', error);
      throw error;
    }
  }

  /**
   * Get campaign by ID
   */
  static async getCampaign(
    tenantId: string,
    campaignId: string
  ): Promise<CampaignResponse> {
    // Try cache first
    const cacheKey = `tenant:${tenantId}:campaign:${campaignId}`;
    const cached = await getFromCache<CampaignResponse>(cacheKey);

    if (cached) {
      return cached;
    }

    const pool = getPool();

    try {
      const result = await pool.query(
        `SELECT id, name, description, status, total_messages, messages_sent,
                messages_delivered, messages_failed, scheduled_at, created_at, updated_at
         FROM campaigns
         WHERE id = $1 AND tenant_id = $2`,
        [campaignId, tenantId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Campaign not found');
      }

      const campaign = result.rows[0];

      // Cache it
      await setInCache(cacheKey, campaign, 3600);

      return campaign;
    } catch (error) {
      logger.error('Failed to get campaign', error);
      throw error;
    }
  }

  /**
   * List campaigns for tenant
   */
  static async listCampaigns(
    tenantId: string,
    options: {
      status?: CampaignStatus;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    campaigns: CampaignResponse[];
    total: number;
    page: number;
    limit: number;
  }> {
    const pool = getPool();
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const offset = (page - 1) * limit;

    try {
      let query = `SELECT id, name, description, status, total_messages, messages_sent,
                          messages_delivered, messages_failed, scheduled_at, created_at, updated_at
                   FROM campaigns
                   WHERE tenant_id = $1`;
      const params: any[] = [tenantId];

      if (options.status) {
        query += ` AND status = $${params.length + 1}`;
        params.push(options.status);
      }

      // Get total count
      const countResult = await pool.query(
        `SELECT COUNT(*) as count FROM campaigns WHERE tenant_id = $1 ${
          options.status ? `AND status = $2` : ''
        }`,
        options.status ? [tenantId, options.status] : [tenantId]
      );

      const total = parseInt(countResult.rows[0].count);

      // Get paginated results
      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      return {
        campaigns: result.rows,
        total,
        page,
        limit,
      };
    } catch (error) {
      logger.error('Failed to list campaigns', error);
      throw error;
    }
  }

  /**
   * Update campaign
   */
  static async updateCampaign(
    tenantId: string,
    campaignId: string,
    userId: string,
    req: UpdateCampaignRequest
  ): Promise<CampaignResponse> {
    const pool = getPool();

    try {
      // Get current campaign
      const current = await CampaignService.getCampaign(tenantId, campaignId);

      if (current.status !== 'draft') {
        throw new AppError(
          400,
          'Only draft campaigns can be updated',
          'CAMPAIGN_NOT_DRAFT'
        );
      }

      // Build update query
      const updates: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (req.name !== undefined) {
        updates.push(`name = $${paramIndex}`);
        params.push(req.name);
        paramIndex++;
      }

      if (req.description !== undefined) {
        updates.push(`description = $${paramIndex}`);
        params.push(req.description || null);
        paramIndex++;
      }

      if (req.template_id !== undefined) {
        updates.push(`template_id = $${paramIndex}`);
        params.push(req.template_id || null);
        paramIndex++;
      }

      if (updates.length === 0) {
        return current;
      }

      updates.push(`updated_at = NOW()`);
      params.push(campaignId, tenantId);

      const result = await pool.query(
        `UPDATE campaigns
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
         RETURNING id, name, description, status, total_messages, messages_sent,
                   messages_delivered, messages_failed, scheduled_at, created_at, updated_at`,
        params
      );

      const updated = result.rows[0];

      // Invalidate cache
      const cacheKey = `tenant:${tenantId}:campaign:${campaignId}`;
      const redis = getRedisClient();
      await redis.del(cacheKey);

      // Audit log
      await CampaignService.auditLog(tenantId, userId, 'UPDATE', 'campaign', campaignId, req);

      logger.info(`Campaign updated: ${campaignId}`);

      return updated;
    } catch (error) {
      logger.error('Campaign update failed', error);
      throw error;
    }
  }

  /**
   * Start campaign
   */
  static async startCampaign(
    tenantId: string,
    campaignId: string,
    userId: string
  ): Promise<CampaignResponse> {
    const pool = getPool();

    try {
      const campaign = await CampaignService.getCampaign(tenantId, campaignId);

      if (campaign.status !== 'draft' && campaign.status !== 'ready') {
        throw new AppError(
          400,
          `Cannot start campaign with status ${campaign.status}`,
          'INVALID_CAMPAIGN_STATUS'
        );
      }

      // Update status
      const result = await pool.query(
        `UPDATE campaigns
         SET status = $1, started_at = NOW(), updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3
         RETURNING id, name, description, status, total_messages, messages_sent,
                   messages_delivered, messages_failed, scheduled_at, created_at, updated_at`,
        ['active', campaignId, tenantId]
      );

      const updated = result.rows[0];

      // Invalidate cache
      const cacheKey = `tenant:${tenantId}:campaign:${campaignId}`;
      const redis = getRedisClient();
      await redis.del(cacheKey);

      // Publish event
      await publishEvent('campaign.started', { campaignId, tenantId }, tenantId, 'high');

      // Enqueue batch processing job
      await enqueueJob(
        'batch.process',
        {
          campaignId,
          tenantId,
          startTime: new Date().toISOString(),
        },
        { priority: 'high' }
      );

      // Audit log
      await CampaignService.auditLog(tenantId, userId, 'START', 'campaign', campaignId);

      logger.info(`Campaign started: ${campaignId}`);

      return updated;
    } catch (error) {
      logger.error('Campaign start failed', error);
      throw error;
    }
  }

  /**
   * Pause campaign
   */
  static async pauseCampaign(
    tenantId: string,
    campaignId: string,
    userId: string
  ): Promise<CampaignResponse> {
    const pool = getPool();

    try {
      const campaign = await CampaignService.getCampaign(tenantId, campaignId);

      if (campaign.status !== 'active') {
        throw new AppError(
          400,
          'Only active campaigns can be paused',
          'CAMPAIGN_NOT_ACTIVE'
        );
      }

      const result = await pool.query(
        `UPDATE campaigns
         SET status = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3
         RETURNING id, name, description, status, total_messages, messages_sent,
                   messages_delivered, messages_failed, scheduled_at, created_at, updated_at`,
        ['paused', campaignId, tenantId]
      );

      const updated = result.rows[0];

      // Invalidate cache
      const cacheKey = `tenant:${tenantId}:campaign:${campaignId}`;
      const redis = getRedisClient();
      await redis.del(cacheKey);

      // Publish event
      await publishEvent('campaign.paused', { campaignId, tenantId }, tenantId);

      // Audit log
      await CampaignService.auditLog(tenantId, userId, 'PAUSE', 'campaign', campaignId);

      logger.info(`Campaign paused: ${campaignId}`);

      return updated;
    } catch (error) {
      logger.error('Campaign pause failed', error);
      throw error;
    }
  }

  /**
   * Resume campaign
   */
  static async resumeCampaign(
    tenantId: string,
    campaignId: string,
    userId: string
  ): Promise<CampaignResponse> {
    const pool = getPool();

    try {
      const campaign = await CampaignService.getCampaign(tenantId, campaignId);

      if (campaign.status !== 'paused') {
        throw new AppError(
          400,
          'Only paused campaigns can be resumed',
          'CAMPAIGN_NOT_PAUSED'
        );
      }

      const result = await pool.query(
        `UPDATE campaigns
         SET status = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3
         RETURNING id, name, description, status, total_messages, messages_sent,
                   messages_delivered, messages_failed, scheduled_at, created_at, updated_at`,
        ['active', campaignId, tenantId]
      );

      const updated = result.rows[0];

      // Invalidate cache
      const cacheKey = `tenant:${tenantId}:campaign:${campaignId}`;
      const redis = getRedisClient();
      await redis.del(cacheKey);

      // Publish event
      await publishEvent('campaign.resumed', { campaignId, tenantId }, tenantId, 'high');

      // Audit log
      await CampaignService.auditLog(tenantId, userId, 'RESUME', 'campaign', campaignId);

      logger.info(`Campaign resumed: ${campaignId}`);

      return updated;
    } catch (error) {
      logger.error('Campaign resume failed', error);
      throw error;
    }
  }

  /**
   * Cancel campaign
   */
  static async cancelCampaign(
    tenantId: string,
    campaignId: string,
    userId: string
  ): Promise<CampaignResponse> {
    const pool = getPool();

    try {
      const campaign = await CampaignService.getCampaign(tenantId, campaignId);

      if (['completed', 'cancelled'].includes(campaign.status)) {
        throw new AppError(
          400,
          `Cannot cancel campaign with status ${campaign.status}`,
          'INVALID_CAMPAIGN_STATUS'
        );
      }

      const result = await pool.query(
        `UPDATE campaigns
         SET status = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3
         RETURNING id, name, description, status, total_messages, messages_sent,
                   messages_delivered, messages_failed, scheduled_at, created_at, updated_at`,
        ['cancelled', campaignId, tenantId]
      );

      const updated = result.rows[0];

      // Invalidate cache
      const cacheKey = `tenant:${tenantId}:campaign:${campaignId}`;
      const redis = getRedisClient();
      await redis.del(cacheKey);

      // Publish event
      await publishEvent('campaign.cancelled', { campaignId, tenantId }, tenantId);

      // Audit log
      await CampaignService.auditLog(tenantId, userId, 'CANCEL', 'campaign', campaignId);

      logger.info(`Campaign cancelled: ${campaignId}`);

      return updated;
    } catch (error) {
      logger.error('Campaign cancel failed', error);
      throw error;
    }
  }

  /**
   * Delete campaign
   */
  static async deleteCampaign(
    tenantId: string,
    campaignId: string,
    userId: string
  ): Promise<void> {
    const pool = getPool();

    try {
      const campaign = await CampaignService.getCampaign(tenantId, campaignId);

      if (campaign.status !== 'draft') {
        throw new AppError(
          400,
          'Only draft campaigns can be deleted',
          'CAMPAIGN_NOT_DRAFT'
        );
      }

      // Delete campaign
      await pool.query(
        `DELETE FROM campaigns WHERE id = $1 AND tenant_id = $2`,
        [campaignId, tenantId]
      );

      // Invalidate cache
      const cacheKey = `tenant:${tenantId}:campaign:${campaignId}`;
      const redis = getRedisClient();
      await redis.del(cacheKey);

      // Audit log
      await CampaignService.auditLog(tenantId, userId, 'DELETE', 'campaign', campaignId);

      logger.info(`Campaign deleted: ${campaignId}`);
    } catch (error) {
      logger.error('Campaign deletion failed', error);
      throw error;
    }
  }

  /**
   * Get campaign analytics
   */
  static async getCampaignAnalytics(
    tenantId: string,
    campaignId: string
  ): Promise<{
    total_sent: number;
    total_delivered: number;
    total_failed: number;
    delivery_rate: number;
    avg_delivery_time?: number;
  }> {
    // Try cache first
    const cacheKey = `tenant:${tenantId}:campaign:${campaignId}:analytics`;
    const cached = await getFromCache<{
      total_sent: number;
      total_delivered: number;
      total_failed: number;
      delivery_rate: number;
      avg_delivery_time?: number;
    }>(cacheKey);

    if (cached) {
      return cached;
    }

    const pool = getPool();

    try {
      const result = await pool.query(
        `SELECT total_sent, total_delivered, total_failed, delivery_rate, avg_delivery_time
         FROM campaign_analytics
         WHERE campaign_id = $1 AND tenant_id = $2`,
        [campaignId, tenantId]
      );

      if (result.rows.length === 0) {
        // Calculate from messages table if analytics not cached
        const msgResult = await pool.query(
          `SELECT
             COUNT(*) as total,
             SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
             SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
             SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
           FROM messages
           WHERE campaign_id = $1 AND tenant_id = $2`,
          [campaignId, tenantId]
        );

        const row = msgResult.rows[0] || { total: 0, sent: 0, delivered: 0, failed: 0 };
        const { sent, delivered, failed, total } = row;
        const analytics: any = {
          total_sent: parseInt(sent) || 0,
          total_delivered: parseInt(delivered) || 0,
          total_failed: parseInt(failed) || 0,
          delivery_rate: total > 0 ? parseFloat(((parseInt(delivered) / total) * 100).toFixed(2)) : 0,
        };

        // Cache it
        await setInCache(cacheKey, analytics, 300);

        return analytics;
      }

      const analytics = result.rows[0];

      // Cache it
      await setInCache(cacheKey, analytics, 300);

      return analytics;
    } catch (error) {
      logger.error('Failed to get campaign analytics', error);
      throw error;
    }
  }

  /**
   * Audit log helper
   */
  private static async auditLog(
    tenantId: string,
    userId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    details?: any
  ): Promise<void> {
    const pool = getPool();

    try {
      const auditId = uuidv4();
      await pool.query(
        `INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, resource_id, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [auditId, tenantId, userId, action, resourceType, resourceId, JSON.stringify(details || {})]
      );
    } catch (error) {
      logger.error('Failed to create audit log', error);
    }
  }
}
