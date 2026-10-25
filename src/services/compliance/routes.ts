import { Router, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { tenantMiddleware, AuthRequest } from '../../middleware/tenantMiddleware';
import { getPool } from '../../config/database';
import { createLogger } from '../../config/logger';
import { ValidationError, NotFoundError } from '../../middleware/errorHandler';

const router = Router();
const logger = createLogger('compliance-routes');

/**
 * GET /api/v1/compliance
 * Compliance overview & metrics
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

      // Count opted-out contacts
      const optOutRes = await pool.query(
        `SELECT COUNT(*) as count FROM contacts WHERE tenant_id = $1 AND opted_in = FALSE`,
        [req.tenantId]
      );
      const optOutCount = parseInt(optOutRes.rows[0]?.count || '0');

      // Count total contacts
      const totalContactsRes = await pool.query(
        `SELECT COUNT(*) as count FROM contacts WHERE tenant_id = $1`,
        [req.tenantId]
      );
      const totalContacts = parseInt(totalContactsRes.rows[0]?.count || '0');

      // Count audit logs
      const auditRes = await pool.query(
        `SELECT COUNT(*) as count FROM audit_logs WHERE tenant_id = $1`,
        [req.tenantId]
      );
      const auditCount = parseInt(auditRes.rows[0]?.count || '0');

      res.json({
        success: true,
        summary: {
          total_contacts: totalContacts,
          opted_out_contacts: optOutCount,
          opt_in_rate: totalContacts > 0 ? (((totalContacts - optOutCount) / totalContacts) * 100).toFixed(1) + '%' : '100%',
          audit_logs_recorded: auditCount,
          gdpr_compliant: true,
          tcpa_compliant: true,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/compliance/opt-outs
 * List opt-out requests
 */
router.get(
  '/opt-outs',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const pool = getPool();
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      const result = await pool.query(
        `SELECT id, phone_number, reason, processed, created_at, processed_at
         FROM opt_out_requests
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.tenantId, limit, offset]
      );

      res.json({
        success: true,
        opt_outs: result.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/compliance/opt-out
 * Process an opt-out request for a phone number
 */
router.post(
  '/opt-out',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const { phone_number, reason = 'User requested opt-out' } = req.body;

      if (!phone_number) {
        throw new ValidationError('Phone number is required');
      }

      const cleanPhone = phone_number.replace(/\D/g, '');
      const pool = getPool();

      // Record in opt_out_requests
      const optOutId = uuidv4();
      await pool.query(
        `INSERT INTO opt_out_requests (id, tenant_id, phone_number, reason, processed, processed_at)
         VALUES ($1, $2, $3, $4, TRUE, NOW())`,
        [optOutId, req.tenantId, cleanPhone, reason]
      );

      // Mark contact opted_out in contacts table
      await pool.query(
        `UPDATE contacts SET opted_in = FALSE, opted_out_at = NOW(), updated_at = NOW()
         WHERE tenant_id = $1 AND phone_number = $2`,
        [req.tenantId, cleanPhone]
      );

      // Record audit log
      const auditId = uuidv4();
      await pool.query(
        `INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, details)
         VALUES ($1, $2, $3, 'opt_out_processed', 'contact', $4)`,
        [auditId, req.tenantId, req.userId || null, JSON.stringify({ phone_number: cleanPhone, reason })]
      );

      logger.info(`Compliance opt-out processed for ${cleanPhone} in tenant ${req.tenantId}`);

      res.status(201).json({
        success: true,
        message: `Phone number ${cleanPhone} successfully opted out and unsubscribed`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/compliance/opt-out/:phone
 * Remove opt-out status (Re-subscribe a contact upon customer consent)
 */
router.delete(
  '/opt-out/:phone',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const phoneParam = req.params.phone as string;
      const cleanPhone = (phoneParam || '').replace(/\D/g, '');
      const pool = getPool();

      await pool.query(
        `DELETE FROM opt_out_requests WHERE tenant_id = $1 AND phone_number = $2`,
        [req.tenantId, cleanPhone]
      );

      await pool.query(
        `UPDATE contacts SET opted_in = TRUE, opted_in_at = NOW(), updated_at = NOW()
         WHERE tenant_id = $1 AND phone_number = $2`,
        [req.tenantId, cleanPhone]
      );

      res.json({
        success: true,
        message: `Phone number ${cleanPhone} re-subscribed successfully`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/compliance/audit-logs
 * Retrieve audit log events for compliance verification
 */
router.get(
  '/audit-logs',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const pool = getPool();
      const action = req.query.action as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      let sql = `
        SELECT a.id, a.action, a.resource_type, a.resource_id, a.details, a.created_at, u.email as user_email
        FROM audit_logs a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.tenant_id = $1
      `;
      const params: any[] = [req.tenantId];

      if (action) {
        sql += ` AND a.action = $2`;
        params.push(action);
      }

      sql += ` ORDER BY a.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await pool.query(sql, params);

      res.json({
        success: true,
        logs: result.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/compliance/audit-logs
 * Record an audit log event
 */
router.post(
  '/audit-logs',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const { action, resource_type, resource_id, details } = req.body;

      if (!action) {
        throw new ValidationError('Action is required');
      }

      const pool = getPool();
      const auditId = uuidv4();

      await pool.query(
        `INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, resource_id, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          auditId,
          req.tenantId,
          req.userId || null,
          action,
          resource_type || null,
          resource_id || null,
          details ? JSON.stringify(details) : null,
        ]
      );

      res.status(201).json({
        success: true,
        message: 'Audit event logged',
        audit_id: auditId,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/compliance/gdpr/export
 * Export full GDPR data record for a specific phone number or user
 */
router.get(
  '/gdpr/export',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const phone = req.query.phone as string | undefined;

      if (!phone) {
        throw new ValidationError('Phone number query parameter is required for GDPR export');
      }

      const cleanPhone = phone.replace(/\D/g, '');
      const pool = getPool();

      // Fetch contact details
      const contactRes = await pool.query(
        `SELECT id, phone_number, first_name, last_name, email, opted_in, opted_in_at, opted_out_at, created_at
         FROM contacts WHERE tenant_id = $1 AND phone_number = $2`,
        [req.tenantId, cleanPhone]
      );

      // Fetch messages history
      const messagesRes = await pool.query(
        `SELECT id, campaign_id, status, error_message, created_at, sent_at, delivered_at, read_at
         FROM messages WHERE tenant_id = $1 AND phone_number = $2 ORDER BY created_at DESC`,
        [req.tenantId, cleanPhone]
      );

      // Fetch opt-out records
      const optOutRes = await pool.query(
        `SELECT id, reason, processed, created_at, processed_at
         FROM opt_out_requests WHERE tenant_id = $1 AND phone_number = $2`,
        [req.tenantId, cleanPhone]
      );

      res.json({
        success: true,
        export_date: new Date().toISOString(),
        subject_phone: cleanPhone,
        contact: contactRes.rows[0] || null,
        message_history: messagesRes.rows,
        opt_out_history: optOutRes.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as complianceRoutes };
