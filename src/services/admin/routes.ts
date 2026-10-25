import { Router, Response, NextFunction } from 'express';
import { tenantMiddleware, AuthRequest, requireRole } from '../../middleware/tenantMiddleware';
import { getPool } from '../../config/database';
import { createLogger } from '../../config/logger';
import { MetaWhatsAppService } from '../whatsapp/metaService';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getIO } from '../../config/socket';
import { ValidationError, UnauthorizedError, NotFoundError } from '../../middleware/errorHandler';

const router = Router();
const logger = createLogger('admin-routes');

/**
 * Middleware: Verify user is an admin
 */
const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || !req.user.is_admin) {
    throw new UnauthorizedError('Administrative privileges required');
  }
  next();
};

/**
 * GET /api/v1/admin/stats
 * Platform-wide system stats
 */
router.get(
  '/stats',
  tenantMiddleware,
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();

      // Total users
      const usersRes = await pool.query(`SELECT COUNT(*) as count FROM users`);
      const totalUsers = parseInt(usersRes.rows[0]?.count || '0');

      // Total tenants
      const tenantsRes = await pool.query(`SELECT COUNT(*) as count FROM tenants`);
      const totalTenants = parseInt(tenantsRes.rows[0]?.count || '0');

      // Total campaigns
      const campaignsRes = await pool.query(
        `SELECT COUNT(*) as count,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count
         FROM campaigns`
      );
      const totalCampaigns = parseInt(campaignsRes.rows[0]?.count || '0');
      const activeCampaigns = parseInt(campaignsRes.rows[0]?.active_count || '0');

      // Messages summary
      const messagesRes = await pool.query(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN status IN ('sent', 'delivered', 'read') THEN 1 ELSE 0 END) as sent,
           SUM(CASE WHEN status IN ('delivered', 'read') THEN 1 ELSE 0 END) as delivered,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
         FROM messages`
      );

      const totalMessages = parseInt(messagesRes.rows[0]?.total || '0');
      const sentMessages = parseInt(messagesRes.rows[0]?.sent || '0');
      const deliveredMessages = parseInt(messagesRes.rows[0]?.delivered || '0');
      const failedMessages = parseInt(messagesRes.rows[0]?.failed || '0');

      const deliveryRate =
        sentMessages > 0 ? ((deliveredMessages / sentMessages) * 100).toFixed(1) : '100';

      res.json({
        totalUsers,
        totalTenants,
        totalCampaigns,
        activeCampaigns,
        totalMessages,
        sentMessages,
        deliveredMessages,
        failedMessages,
        deliveryRate: `${deliveryRate}%`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/users
 * List all users and their tenant details with approval & status information
 */
router.get(
  '/users',
  tenantMiddleware,
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      const result = await pool.query(
        `SELECT 
           u.id, u.email, u.first_name, u.last_name, u.phone, u.is_admin,
           COALESCE(u.status, 'pending') as user_status,
           u.created_at, u.approved_at, u.approved_by,
           t.id as tenant_id, t.name as tenant_name, 
           COALESCE(t.status, 'pending') as tenant_status, 
           t.plan, t.monthly_quota, t.use_custom_whatsapp
         FROM users u
         LEFT JOIN tenant_users tu ON u.id = tu.user_id
         LEFT JOIN tenants t ON tu.tenant_id = t.id
         ORDER BY 
           CASE WHEN (COALESCE(u.status, 'pending') = 'pending' OR COALESCE(t.status, 'pending') = 'pending') THEN 0 ELSE 1 END,
           u.created_at DESC`
      );

      res.json({
        users: result.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/admin/users/:id/approve
 * Accept client registration, optionally assign/update credentials, set quota/plan, and activate
 */
router.post(
  '/users/:id/approve',
  tenantMiddleware,
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { password, plan, monthly_quota } = req.body;
      const pool = getPool();

      // Check if user exists
      const userRes = await pool.query('SELECT id, email, first_name, last_name, phone FROM users WHERE id = $1', [id]);
      if (userRes.rows.length === 0) {
        throw new NotFoundError('User not found');
      }

      const adminEmail = req.user?.email || 'admin';
      let credentialsUpdated = false;

      // If admin specified or generated a password for the client
      if (password && typeof password === 'string' && password.trim().length >= 6) {
        const passwordHash = await bcrypt.hash(password.trim(), 12);
        await pool.query(
          `UPDATE users 
           SET password_hash = $1, status = 'active', approved_at = NOW(), approved_by = $2, updated_at = NOW() 
           WHERE id = $3`,
          [passwordHash, adminEmail, id]
        );
        credentialsUpdated = true;
      } else {
        await pool.query(
          `UPDATE users 
           SET status = 'active', approved_at = NOW(), approved_by = $1, updated_at = NOW() 
           WHERE id = $2`,
          [adminEmail, id]
        );
      }

      // Update tenant status to active with assigned plan & quota
      const selectedPlan = plan || 'starter';
      const quota = monthly_quota ? parseInt(monthly_quota) : 10000;

      await pool.query(
        `UPDATE tenants 
         SET status = 'active', plan = $1, monthly_quota = $2, updated_at = NOW() 
         WHERE id IN (SELECT tenant_id FROM tenant_users WHERE user_id = $3)`,
        [selectedPlan, quota, id]
      );

      logger.info(`Client ${userRes.rows[0].email} approved and activated by ${adminEmail}`);

      res.json({
        success: true,
        message: 'Client approved and activated successfully',
        user: {
          id: userRes.rows[0].id,
          email: userRes.rows[0].email,
          status: 'active',
          credentials_updated: credentialsUpdated,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/admin/users/:id/reject
 * Reject a client registration
 */
router.post(
  '/users/:id/reject',
  tenantMiddleware,
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const pool = getPool();

      await pool.query(
        `UPDATE users SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
        [id]
      );
      await pool.query(
        `UPDATE tenants SET status = 'rejected', updated_at = NOW() 
         WHERE id IN (SELECT tenant_id FROM tenant_users WHERE user_id = $1)`,
        [id]
      );

      res.json({ success: true, message: 'Client registration rejected' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/admin/users/:id/credentials
 * Set or reset credentials/password for any client
 */
router.post(
  '/users/:id/credentials',
  tenantMiddleware,
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { password } = req.body;

      if (!password || password.trim().length < 6) {
        throw new ValidationError('Password must be at least 6 characters');
      }

      const pool = getPool();
      const passwordHash = await bcrypt.hash(password.trim(), 12);

      await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [passwordHash, id]
      );

      res.json({
        success: true,
        message: 'Client credentials / password updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/v1/admin/users/:id/status
 * Enable or disable a tenant/user (active | suspended)
 */
router.patch(
  '/users/:id/status',
  tenantMiddleware,
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { status } = req.body; // 'active' | 'suspended'

      if (!status) {
        throw new ValidationError('Status is required');
      }

      const pool = getPool();
      // Update user status
      await pool.query(
        `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2`,
        [status, id]
      );

      // Update tenant status associated with user
      await pool.query(
        `UPDATE tenants SET status = $1, updated_at = NOW() 
         WHERE id IN (SELECT tenant_id FROM tenant_users WHERE user_id = $2)`,
        [status, id]
      );

      res.json({ message: `Client status updated to ${status}` });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/meta-config
 * View platform-wide Meta credentials
 */
router.get(
  '/meta-config',
  tenantMiddleware,
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      const settingsRes = await pool.query(
        `SELECT setting_key, setting_value FROM system_settings 
         WHERE setting_key IN ('meta_whatsapp_token', 'meta_phone_number_id', 'meta_business_account_id', 'meta_webhook_verify_token')`
      );

      const config: Record<string, string> = {};
      settingsRes.rows.forEach((r: any) => {
        config[r.setting_key] = r.setting_value;
      });

      const token = config['meta_whatsapp_token'] || process.env.WHATSAPP_API_TOKEN || '';
      const maskedToken = token ? `${token.substring(0, 6)}...${token.substring(token.length - 4)}` : '';
      const phoneId = config['meta_phone_number_id'] || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
      const wabaId = config['meta_business_account_id'] || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '';
      const verifyToken =
        config['meta_webhook_verify_token'] ||
        process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
        'whatsapp_bulk_webhook_secret_123';

      res.json({
        token_masked: maskedToken,
        is_token_configured: Boolean(token && !token.includes('your_meta')),
        phone_number_id: phoneId,
        business_account_id: wabaId,
        webhook_verify_token: verifyToken,
        webhook_callback_url: `http://localhost:3000/webhooks/whatsapp`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/admin/meta-config
 * Update global Meta API credentials
 */
router.post(
  '/meta-config',
  tenantMiddleware,
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { token, phone_number_id, business_account_id, webhook_verify_token } = req.body;
      const pool = getPool();

      const pairs = [
        ['meta_phone_number_id', phone_number_id],
        ['meta_business_account_id', business_account_id],
        ['meta_webhook_verify_token', webhook_verify_token],
      ];

      if (token) {
        pairs.push(['meta_whatsapp_token', token]);
      }

      for (const [key, val] of pairs) {
        if (val !== undefined && val !== null) {
          await pool.query(
            `INSERT INTO system_settings (setting_key, setting_value, updated_at)
             VALUES ($1, $2, NOW())
             ON DUPLICATE KEY UPDATE setting_value = $2, updated_at = NOW()`,
            [key, val]
          );
        }
      }

      // If token and phone_number_id are present, run a verification test
      let testResult = null;
      const effectiveToken = token || (await pool.query(`SELECT setting_value FROM system_settings WHERE setting_key = 'meta_whatsapp_token'`)).rows[0]?.setting_value;
      if (effectiveToken && phone_number_id) {
        testResult = await MetaWhatsAppService.testCredentials(effectiveToken, phone_number_id);
      }

      res.json({
        message: 'Platform Meta API credentials updated successfully',
        test_result: testResult,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/campaigns
 * View all campaigns across all clients
 */
router.get(
  '/campaigns',
  tenantMiddleware,
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      const result = await pool.query(
        `SELECT 
           c.id, c.name, c.status, c.total_messages, c.messages_sent,
           c.messages_delivered, c.messages_failed, c.created_at, c.started_at, c.completed_at,
           t.name as tenant_name, u.email as created_by_email
         FROM campaigns c
         LEFT JOIN tenants t ON c.tenant_id = t.id
         LEFT JOIN users u ON c.created_by = u.id
         ORDER BY c.created_at DESC
         LIMIT 50`
      );

      res.json({
        campaigns: result.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FEATURE 1: Tenants & Quota Manager + Impersonation
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * GET /api/v1/admin/tenants
 * List all tenants with user count, campaign count, and monthly usage
 */
router.get(
  '/tenants',
  tenantMiddleware,
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      const result = await pool.query(
        `SELECT 
           t.id, t.name, t.slug, t.plan, t.monthly_quota, t.status, t.created_at,
           COUNT(DISTINCT u.id) as user_count,
           COUNT(DISTINCT c.id) as campaign_count,
           COALESCE(SUM(CASE WHEN m.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01') AND m.status IN ('sent', 'delivered', 'read') THEN 1 ELSE 0 END), 0) as current_month_usage
         FROM tenants t
         LEFT JOIN users u ON u.tenant_id = t.id
         LEFT JOIN campaigns c ON c.tenant_id = t.id
         LEFT JOIN messages m ON m.tenant_id = t.id
         GROUP BY t.id, t.name, t.slug, t.plan, t.monthly_quota, t.status, t.created_at
         ORDER BY t.created_at DESC`
      );

      res.json({
        success: true,
        tenants: result.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/v1/admin/tenants/:id
 * Override tenant plan, quota, or status (active/suspended)
 */
router.patch(
  '/tenants/:id',
  tenantMiddleware,
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { plan, monthly_quota, status, name } = req.body;
      const pool = getPool();
      const tenantId = req.params.id;

      const tenantCheck = await pool.query(`SELECT id, name FROM tenants WHERE id = $1`, [tenantId]);
      if (tenantCheck.rows.length === 0) {
        throw new NotFoundError('Tenant not found');
      }

      const updates: string[] = [];
      const values: any[] = [];
      let valIdx = 1;

      if (plan) {
        updates.push(`plan = $${valIdx++}`);
        values.push(plan.toLowerCase());
      }
      if (monthly_quota !== undefined) {
        updates.push(`monthly_quota = $${valIdx++}`);
        values.push(parseInt(monthly_quota));
      }
      if (status) {
        updates.push(`status = $${valIdx++}`);
        values.push(status);
      }
      if (name) {
        updates.push(`name = $${valIdx++}`);
        values.push(name);
      }

      if (updates.length === 0) {
        res.json({ success: true, message: 'No changes submitted' });
        return;
      }

      updates.push(`updated_at = NOW()`);
      values.push(tenantId);

      await pool.query(
        `UPDATE tenants SET ${updates.join(', ')} WHERE id = $${valIdx}`,
        values
      );

      // Record audit log
      try {
        await pool.query(
          `INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, resource_id, details, created_at)
           VALUES ($1, $2, $3, 'UPDATE_TENANT', 'tenant', $4, $5, NOW())`,
          [uuidv4(), tenantId, req.user?.id || null, tenantId, JSON.stringify(req.body)]
        );
      } catch {
        // Safe fallback
      }

      logger.info(`Admin ${req.user?.email} updated tenant ${tenantId}`);

      res.json({
        success: true,
        message: 'Tenant settings updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/admin/tenants/:id/impersonate
 * Generate a ghost-login impersonation token for the tenant
 */
router.post(
  '/tenants/:id/impersonate',
  tenantMiddleware,
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const pool = getPool();
      const tenantId = req.params.id;

      const tenantRes = await pool.query(`SELECT id, name, slug, status FROM tenants WHERE id = $1`, [tenantId]);
      if (tenantRes.rows.length === 0) {
        throw new NotFoundError('Tenant not found');
      }

      // Pick an active user or first user from the tenant
      const userRes = await pool.query(
        `SELECT id, email, first_name, last_name, role, status 
         FROM users 
         WHERE tenant_id = $1 
         ORDER BY (status = 'active') DESC, created_at ASC 
         LIMIT 1`,
        [tenantId]
      );

      if (userRes.rows.length === 0) {
        throw new NotFoundError('No user accounts exist in this tenant to impersonate');
      }

      const targetUser = userRes.rows[0];
      const jwtSecret = process.env.JWT_SECRET || 'whatsapp_bulk_secret_jwt_key_min_32_characters_12345';

      // Issue impersonation token valid for 2 hours
      const impersonationToken = jwt.sign(
        {
          sub: targetUser.id,
          tenant_id: tenantId,
          email: targetUser.email,
          role: targetUser.role || 'owner',
          is_admin: false,
          is_impersonating: true,
          original_admin: req.user?.email,
        },
        jwtSecret,
        { expiresIn: '2h' }
      );

      logger.info(`Admin ${req.user?.email} impersonated tenant ${tenantRes.rows[0].name} (${tenantId})`);

      res.json({
        success: true,
        message: `Now impersonating ${tenantRes.rows[0].name}`,
        token: impersonationToken,
        user: {
          id: targetUser.id,
          email: targetUser.email,
          name: `${targetUser.first_name || ''} ${targetUser.last_name || ''}`.trim() || targetUser.email,
          role: targetUser.role || 'owner',
          tenant_id: tenantId,
          tenant_name: tenantRes.rows[0].name,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FEATURE 2: Stripe Revenue & Global Transaction Feed
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * GET /api/v1/admin/revenue
 * Global revenue breakdown and payment transactions ledger
 */
router.get(
  '/revenue',
  tenantMiddleware,
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();

      // Aggregate revenue metrics
      let totalRevenue = 0;
      let monthlyRevenue = 0;
      let totalTxCount = 0;
      let succeededTxCount = 0;

      try {
        const revRes = await pool.query(`
          SELECT 
            COALESCE(SUM(CASE WHEN status = 'succeeded' THEN amount_cents ELSE 0 END), 0) as total_cents,
            COALESCE(SUM(CASE WHEN status = 'succeeded' AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN amount_cents ELSE 0 END), 0) as month_cents,
            COUNT(*) as total_count,
            COALESCE(SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END), 0) as succeeded_count
          FROM payment_transactions
        `);

        if (revRes.rows.length > 0) {
          totalRevenue = (revRes.rows[0].total_cents || 0) / 100;
          monthlyRevenue = (revRes.rows[0].month_cents || 0) / 100;
          totalTxCount = parseInt(revRes.rows[0].total_count || '0');
          succeededTxCount = parseInt(revRes.rows[0].succeeded_count || '0');
        }
      } catch {
        // Table may be empty
      }

      // Query latest 50 transactions
      let transactions: any[] = [];
      try {
        const txList = await pool.query(`
          SELECT 
            pt.id, pt.stripe_session_id, pt.amount_cents, pt.currency, pt.payment_type,
            pt.plan, pt.credits_added, pt.status, pt.customer_email, pt.created_at,
            t.name as tenant_name
          FROM payment_transactions pt
          LEFT JOIN tenants t ON pt.tenant_id = t.id
          ORDER BY pt.created_at DESC
          LIMIT 50
        `);
        transactions = txList.rows.map((tx: any) => ({
          ...tx,
          amount_inr: (tx.amount_cents / 100).toFixed(2),
          amount_usd: (tx.amount_cents / 100).toFixed(2),
        }));
      } catch {
        transactions = [];
      }

      res.json({
        success: true,
        summary: {
          total_revenue: totalRevenue.toFixed(2),
          monthly_revenue: monthlyRevenue.toFixed(2),
          total_revenue_usd: totalRevenue.toFixed(2),
          monthly_revenue_usd: monthlyRevenue.toFixed(2),
          total_transactions: totalTxCount,
          succeeded_transactions: succeededTxCount,
          currency: 'INR',
        },
        transactions,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FEATURE 3: Global Blacklist / DNC Registry
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * GET /api/v1/admin/blacklist
 * List all numbers on the global do-not-call registry
 */
router.get(
  '/blacklist',
  tenantMiddleware,
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      const result = await pool.query(
        `SELECT id, phone_number, reason, source, created_at FROM global_blacklist ORDER BY created_at DESC LIMIT 200`
      );

      res.json({
        success: true,
        blacklist: result.rows,
        total: result.rows.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/admin/blacklist
 * Add one or multiple phone numbers to the global blacklist
 */
router.post(
  '/blacklist',
  tenantMiddleware,
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone_number, phone_numbers, reason } = req.body;
      const pool = getPool();
      const finalReason = reason || 'Admin blacklisted';

      const numbersToAdd: string[] = [];
      if (phone_number) numbersToAdd.push(MetaWhatsAppService.cleanPhoneNumber(phone_number));
      if (Array.isArray(phone_numbers)) {
        numbersToAdd.push(...phone_numbers.map((n: string) => MetaWhatsAppService.cleanPhoneNumber(n)));
      }

      const validNumbers = Array.from(new Set(numbersToAdd.filter((n) => n.length >= 7)));

      if (validNumbers.length === 0) {
        throw new ValidationError('At least one valid phone number is required');
      }

      let added = 0;
      for (const num of validNumbers) {
        try {
          await pool.query(
            `INSERT INTO global_blacklist (id, phone_number, reason, source, created_at)
             VALUES ($1, $2, $3, 'admin', NOW())
             ON DUPLICATE KEY UPDATE reason = $3`,
            [uuidv4(), num, finalReason]
          );
          added++;
        } catch {
          // ignore duplicate
        }
      }

      res.status(201).json({
        success: true,
        message: `Successfully blacklisted ${added} phone number(s)`,
        count: added,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/admin/blacklist/:id
 * Remove a phone number from the global blacklist
 */
router.delete(
  '/blacklist/:id',
  tenantMiddleware,
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      await pool.query(`DELETE FROM global_blacklist WHERE id = $1 OR phone_number = $1`, [req.params.id]);

      res.json({
        success: true,
        message: 'Phone number removed from global blacklist',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FEATURE 4: System Audit Trail & Event Logs
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * GET /api/v1/admin/audit-logs
 * List system-wide audit logs with user and tenant correlation
 */
router.get(
  '/audit-logs',
  tenantMiddleware,
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      const action = req.query.action as string | undefined;

      let query = `
        SELECT 
          a.id, a.action, a.resource_type, a.resource_id, a.details, a.created_at,
          u.email as user_email,
          t.name as tenant_name
        FROM audit_logs a
        LEFT JOIN users u ON a.user_id = u.id
        LEFT JOIN tenants t ON a.tenant_id = t.id
      `;

      const params: any[] = [];
      if (action) {
        query += ` WHERE a.action = $1`;
        params.push(action);
      }

      query += ` ORDER BY a.created_at DESC LIMIT 100`;

      const result = await pool.query(query, params);

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
 * ─────────────────────────────────────────────────────────────────────────────
 * FEATURE 5: System Announcement Banner
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * GET /api/v1/admin/announcement
 * Fetch current system announcement
 */
router.get(
  '/announcement',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      const resVal = await pool.query(
        `SELECT setting_value FROM system_settings WHERE setting_key = 'system_announcement'`
      );

      let announcement = null;
      if (resVal.rows.length > 0 && resVal.rows[0].setting_value) {
        try {
          announcement = JSON.parse(resVal.rows[0].setting_value);
        } catch {
          announcement = { message: resVal.rows[0].setting_value, active: true, severity: 'info' };
        }
      }

      res.json({
        success: true,
        announcement,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/admin/announcement
 * Publish or update global system announcement banner
 */
router.post(
  '/announcement',
  tenantMiddleware,
  requireAdmin,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { message, severity = 'info', active = true } = req.body;
      const pool = getPool();

      const payload = {
        message: message || '',
        severity: severity || 'info', // 'info' | 'warning' | 'critical'
        active: Boolean(active),
        updated_at: new Date().toISOString(),
        updated_by: req.user?.email || 'admin',
      };

      await pool.query(
        `INSERT INTO system_settings (setting_key, setting_value, updated_at)
         VALUES ('system_announcement', $1, NOW())
         ON DUPLICATE KEY UPDATE setting_value = $1, updated_at = NOW()`,
        [JSON.stringify(payload)]
      );

      // Broadcast immediately via Socket.io to all clients
      const io = getIO();
      if (io) {
        io.emit('system_announcement', payload);
        logger.info(`Broadcasted system_announcement via Socket.IO: "${message}"`);
      }

      res.json({
        success: true,
        message: 'System announcement published and broadcasted successfully',
        announcement: payload,
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as adminRoutes };
