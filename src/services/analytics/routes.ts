import { Router, Response, NextFunction } from 'express';
import { tenantMiddleware, AuthRequest } from '../../middleware/tenantMiddleware';
import { getPool } from '../../config/database';
import { createLogger } from '../../config/logger';
import { ValidationError, NotFoundError } from '../../middleware/errorHandler';

const router = Router();
const logger = createLogger('analytics-routes');

/**
 * GET /api/v1/analytics
 * GET /api/v1/analytics/dashboard
 * Comprehensive tenant dashboard performance metrics
 */
const getDashboardMetrics = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.tenantId) {
      throw new ValidationError('Tenant context missing');
    }

    const pool = getPool();

    // 1. Overall message status breakdown
    const msgStatsRes = await pool.query(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status IN ('sent', 'delivered', 'read') THEN 1 ELSE 0 END) as sent,
         SUM(CASE WHEN status IN ('delivered', 'read') THEN 1 ELSE 0 END) as delivered,
         SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read_count,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
       FROM messages 
       WHERE tenant_id = $1`,
      [req.tenantId]
    );

    const stats = msgStatsRes.rows[0];
    const total = parseInt(stats.total || '0');
    const sent = parseInt(stats.sent || '0');
    const delivered = parseInt(stats.delivered || '0');
    const readCount = parseInt(stats.read_count || '0');
    const failed = parseInt(stats.failed || '0');
    const pending = parseInt(stats.pending || '0');

    const deliveryRate = sent > 0 ? ((delivered / sent) * 100).toFixed(1) : '100.0';
    const readRate = delivered > 0 ? ((readCount / delivered) * 100).toFixed(1) : '0.0';
    const failureRate = total > 0 ? ((failed / total) * 100).toFixed(1) : '0.0';

    // 2. Campaign counts
    const campStatsRes = await pool.query(
      `SELECT 
         COUNT(*) as total_campaigns,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_campaigns,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_campaigns
       FROM campaigns
       WHERE tenant_id = $1`,
      [req.tenantId]
    );

    const campStats = campStatsRes.rows[0];

    // 3. Contacts count
    const contactCountRes = await pool.query(
      `SELECT COUNT(*) as total_contacts FROM contacts WHERE tenant_id = $1`,
      [req.tenantId]
    );

    res.json({
      success: true,
      metrics: {
        total_messages: total,
        sent_messages: sent,
        delivered_messages: delivered,
        read_messages: readCount,
        failed_messages: failed,
        pending_messages: pending,
        delivery_rate: `${deliveryRate}%`,
        read_rate: `${readRate}%`,
        failure_rate: `${failureRate}%`,
        total_campaigns: parseInt(campStats.total_campaigns || '0'),
        active_campaigns: parseInt(campStats.active_campaigns || '0'),
        completed_campaigns: parseInt(campStats.completed_campaigns || '0'),
        total_contacts: parseInt(contactCountRes.rows[0]?.total_contacts || '0'),
      },
    });
  } catch (error) {
    next(error);
  }
};

router.get('/', tenantMiddleware, getDashboardMetrics);
router.get('/dashboard', tenantMiddleware, getDashboardMetrics);

/**
 * GET /api/v1/analytics/timeline
 * Message activity grouped by day for chart visualizations
 */
router.get(
  '/timeline',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const pool = getPool();
      const days = req.query.days ? parseInt(req.query.days as string) : 14;

      const result = await pool.query(
        `SELECT 
           DATE(created_at) as date,
           COUNT(*) as total,
           SUM(CASE WHEN status IN ('sent', 'delivered', 'read') THEN 1 ELSE 0 END) as sent,
           SUM(CASE WHEN status IN ('delivered', 'read') THEN 1 ELSE 0 END) as delivered,
           SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as \`read\`,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
         FROM messages
         WHERE tenant_id = $1 AND created_at >= DATE_SUB(NOW(), INTERVAL $2 DAY)
         GROUP BY DATE(created_at)
         ORDER BY date ASC`,
        [req.tenantId, days]
      );

      res.json({
        success: true,
        timeline: result.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/analytics/campaigns/:id/stats
 * Detailed statistics for a specific campaign
 */
router.get(
  '/campaigns/:id/stats',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const pool = getPool();
      const campaignId = req.params.id;

      // Campaign metadata
      const campRes = await pool.query(
        `SELECT id, name, status, total_messages, messages_sent, messages_delivered, messages_failed, created_at, started_at, completed_at
         FROM campaigns 
         WHERE id = $1 AND tenant_id = $2`,
        [campaignId, req.tenantId]
      );

      if (campRes.rows.length === 0) {
        throw new NotFoundError('Campaign not found');
      }

      const campaign = campRes.rows[0];

      // Message status counts
      const statusRes = await pool.query(
        `SELECT status, COUNT(*) as count 
         FROM messages 
         WHERE campaign_id = $1 AND tenant_id = $2 
         GROUP BY status`,
        [campaignId, req.tenantId]
      );

      // Top failure error reasons
      const errorsRes = await pool.query(
        `SELECT error_message, COUNT(*) as count
         FROM messages
         WHERE campaign_id = $1 AND tenant_id = $2 AND status = 'failed' AND error_message IS NOT NULL
         GROUP BY error_message
         ORDER BY count DESC
         LIMIT 5`,
        [campaignId, req.tenantId]
      );

      const statusBreakdown: Record<string, number> = {};
      statusRes.rows.forEach((r: any) => {
        statusBreakdown[r.status] = parseInt(r.count);
      });

      const sent = campaign.messages_sent || 0;
      const delivered = campaign.messages_delivered || 0;
      const deliveryRate = sent > 0 ? ((delivered / sent) * 100).toFixed(1) : '100.0';

      res.json({
        success: true,
        campaign,
        status_breakdown: statusBreakdown,
        delivery_rate: `${deliveryRate}%`,
        common_errors: errorsRes.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/analytics/export
 * Export delivery logs or analytics in CSV format
 */
router.get(
  '/export',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const pool = getPool();
      const campaignId = req.query.campaign_id as string | undefined;

      let sql = `
        SELECT m.id, m.phone_number, m.status, m.meta_message_id, m.error_message, m.created_at, m.sent_at, m.delivered_at, m.read_at, c.name as campaign_name
        FROM messages m
        LEFT JOIN campaigns c ON m.campaign_id = c.id
        WHERE m.tenant_id = $1
      `;
      const params: any[] = [req.tenantId];

      if (campaignId) {
        sql += ` AND m.campaign_id = $2`;
        params.push(campaignId);
      }

      sql += ` ORDER BY m.created_at DESC LIMIT 5000`;
      const result = await pool.query(sql, params);

      // Convert to CSV
      const headers = ['Message ID', 'Campaign', 'Phone Number', 'Status', 'Meta ID', 'Sent At', 'Delivered At', 'Read At', 'Error'];
      const csvRows = [headers.join(',')];

      for (const row of result.rows) {
        csvRows.push([
          `"${row.id || ''}"`,
          `"${(row.campaign_name || '').replace(/"/g, '""')}"`,
          `"${row.phone_number || ''}"`,
          `"${row.status || ''}"`,
          `"${row.meta_message_id || ''}"`,
          `"${row.sent_at ? new Date(row.sent_at).toISOString() : ''}"`,
          `"${row.delivered_at ? new Date(row.delivered_at).toISOString() : ''}"`,
          `"${row.read_at ? new Date(row.read_at).toISOString() : ''}"`,
          `"${(row.error_message || '').replace(/"/g, '""')}"`,
        ].join(','));
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=whatsapp_analytics_${Date.now()}.csv`);
      res.send(csvRows.join('\n'));
    } catch (error) {
      next(error);
    }
  }
);

export { router as analyticsRoutes };
