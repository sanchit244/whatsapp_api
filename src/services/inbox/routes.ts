import { Router, Response, NextFunction } from 'express';
import { tenantMiddleware, AuthRequest } from '../../middleware/tenantMiddleware';
import { getPool } from '../../config/database';
import { createLogger } from '../../config/logger';
import { ValidationError } from '../../middleware/errorHandler';

const router = Router();
const logger = createLogger('inbox-routes');

/**
 * GET /api/v1/inbox
 * List all incoming WhatsApp messages for the tenant (newest first)
 */
router.get(
  '/',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) throw new ValidationError('Missing tenant context');
      const pool = getPool();
      const limit = parseInt((req.query.limit as string) || '50');
      const offset = parseInt((req.query.offset as string) || '0');
      const unreadOnly = req.query.unread === 'true';

      let sql = `SELECT id, tenant_id, from_number, display_name, message_type, body, media_url,
                        is_read, received_at, whatsapp_message_id
                 FROM inbox_messages
                 WHERE tenant_id = $1`;
      const params: any[] = [req.tenantId];

      if (unreadOnly) {
        sql += ` AND is_read = FALSE`;
      }
      sql += ` ORDER BY received_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await pool.query(sql, params);

      // Count total unread
      const unreadRes = await pool.query(
        `SELECT COUNT(*) as unread_count FROM inbox_messages WHERE tenant_id = $1 AND is_read = FALSE`,
        [req.tenantId]
      );

      res.json({
        success: true,
        messages: result.rows,
        unread_count: parseInt(unreadRes.rows[0]?.unread_count || '0'),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/v1/inbox/:id/read
 * Mark a message as read
 */
router.patch(
  '/:id/read',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) throw new ValidationError('Missing tenant context');
      const pool = getPool();
      await pool.query(
        `UPDATE inbox_messages SET is_read = TRUE WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId]
      );
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/inbox/mark-all-read
 * Mark all messages as read for the tenant
 */
router.post(
  '/mark-all-read',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) throw new ValidationError('Missing tenant context');
      const pool = getPool();
      await pool.query(
        `UPDATE inbox_messages SET is_read = TRUE WHERE tenant_id = $1 AND is_read = FALSE`,
        [req.tenantId]
      );
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

export { router as inboxRoutes };
