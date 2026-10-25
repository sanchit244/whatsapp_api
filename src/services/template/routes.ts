import { Router, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { tenantMiddleware, AuthRequest } from '../../middleware/tenantMiddleware';
import { getPool } from '../../config/database';
import { createLogger } from '../../config/logger';
import { ValidationError, NotFoundError } from '../../middleware/errorHandler';
import { MetaWhatsAppService } from '../whatsapp/metaService';

const router = Router();
const logger = createLogger('template-routes');

/**
 * GET /api/v1/templates
 * List message templates for the current tenant
 */
router.get(
  '/',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const pool = getPool();
      const status = req.query.status as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      let sql = `
        SELECT id, name, content, status, meta_template_id, approval_status, rejection_reason, created_at, updated_at
        FROM templates
        WHERE tenant_id = $1
      `;
      const params: any[] = [req.tenantId];

      if (status) {
        sql += ` AND status = $2`;
        params.push(status);
      }

      sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await pool.query(sql, params);

      // Also get count
      const countRes = await pool.query(
        `SELECT COUNT(*) as count FROM templates WHERE tenant_id = $1`,
        [req.tenantId]
      );
      const total = parseInt(countRes.rows[0]?.count || '0');

      res.json({
        success: true,
        templates: result.rows,
        pagination: {
          total,
          limit,
          offset,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/templates
 * Create a new message template
 */
router.post(
  '/',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId || !req.userId) {
        throw new ValidationError('Missing tenant or user context');
      }

      const { name, content, meta_template_id, category, language } = req.body;

      if (!name || !content) {
        throw new ValidationError('Template name and content are required');
      }

      // Format name: WhatsApp template names must be lowercase letters, numbers, and underscores only
      const formattedName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');

      const pool = getPool();
      const templateId = uuidv4();

      await pool.query(
        `INSERT INTO templates (id, tenant_id, created_by, name, content, status, meta_template_id, approval_status)
         VALUES ($1, $2, $3, $4, $5, 'approved', $6, 'APPROVED')`,
        [templateId, req.tenantId, req.userId, formattedName, content, meta_template_id || null]
      );

      logger.info(`Template ${formattedName} (${templateId}) created for tenant ${req.tenantId}`);

      res.status(201).json({
        success: true,
        message: 'Template created successfully',
        template: {
          id: templateId,
          name: formattedName,
          content,
          status: 'approved',
          category: category || 'MARKETING',
          language: language || 'en_US',
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/templates/:id
 * Retrieve a specific template
 */
router.get(
  '/:id',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const pool = getPool();
      const result = await pool.query(
        `SELECT id, name, content, status, meta_template_id, approval_status, rejection_reason, created_at, updated_at
         FROM templates
         WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Template not found');
      }

      res.json({
        success: true,
        template: result.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/v1/templates/:id
 * Update template content or status
 */
router.put(
  '/:id',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const { name, content, status } = req.body;
      const pool = getPool();

      const existing = await pool.query(
        `SELECT id FROM templates WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId]
      );

      if (existing.rows.length === 0) {
        throw new NotFoundError('Template not found');
      }

      const updates: string[] = [];
      const values: any[] = [];

      if (name) {
        values.push(name.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
        updates.push(`name = $${values.length}`);
      }
      if (content) {
        values.push(content);
        updates.push(`content = $${values.length}`);
      }
      if (status) {
        values.push(status);
        updates.push(`status = $${values.length}`);
      }

      if (updates.length === 0) {
        res.json({
          success: true,
          message: 'No changes provided',
        });
        return;
      }

      values.push(req.params.id, req.tenantId);
      const sql = `UPDATE templates SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length - 1} AND tenant_id = $${values.length}`;

      await pool.query(sql, values);

      res.json({
        success: true,
        message: 'Template updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/templates/:id
 * Delete a template
 */
router.delete(
  '/:id',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const pool = getPool();
      await pool.query(
        `DELETE FROM templates WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId]
      );

      res.json({
        success: true,
        message: 'Template deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/templates/:id/sync
 * Sync template with Meta WhatsApp Business Account
 */
router.post(
  '/:id/sync',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const pool = getPool();
      const result = await pool.query(
        `SELECT name FROM templates WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.tenantId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Template not found');
      }

      const credentials = await MetaWhatsAppService.resolveCredentials(req.tenantId);
      const remoteTemplates = await MetaWhatsAppService.getTemplates(credentials);
      const match = Array.isArray(remoteTemplates) ? remoteTemplates.find((t: any) => t.name?.toLowerCase() === result.rows[0].name?.toLowerCase()) : null;

      if (match) {
        await pool.query(
          `UPDATE templates SET approval_status = $1, status = 'approved', meta_template_id = $2 WHERE id = $3`,
          [match.status || 'APPROVED', match.id || null, req.params.id]
        );
      }

      res.json({
        success: true,
        synced: Boolean(match),
        details: match || { status: 'APPROVED' },
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as templateRoutes };
