import { Router, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { tenantMiddleware, AuthRequest, requireRole } from '../../middleware/tenantMiddleware';
import { getPool } from '../../config/database';
import { createLogger } from '../../config/logger';
import { ValidationError, NotFoundError, UnauthorizedError } from '../../middleware/errorHandler';

const router = Router();
const logger = createLogger('user-management-routes');

/**
 * GET /api/v1/users/profile
 * Get current authenticated user profile and tenant information
 */
router.get(
  '/profile',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        throw new UnauthorizedError('User not authenticated');
      }

      const pool = getPool();
      const userRes = await pool.query(
        `SELECT id, email, first_name, last_name, phone, is_admin, status, created_at, last_login
         FROM users WHERE id = $1`,
        [req.userId]
      );

      if (userRes.rows.length === 0) {
        throw new NotFoundError('User not found');
      }

      const tenantRes = await pool.query(
        `SELECT t.id, t.name, t.slug, t.status, t.plan, t.monthly_quota, tu.role
         FROM tenants t
         JOIN tenant_users tu ON t.id = tu.tenant_id
         WHERE tu.user_id = $1 AND t.id = $2`,
        [req.userId, req.tenantId]
      );

      res.json({
        success: true,
        user: userRes.rows[0],
        tenant: tenantRes.rows[0] || null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/v1/users/profile
 * Update current user's profile details
 */
router.put(
  '/profile',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        throw new UnauthorizedError('User not authenticated');
      }

      const { first_name, last_name, phone } = req.body;
      const pool = getPool();

      await pool.query(
        `UPDATE users
         SET first_name = COALESCE($1, first_name),
             last_name = COALESCE($2, last_name),
             phone = COALESCE($3, phone),
             updated_at = NOW()
         WHERE id = $4`,
        [first_name, last_name, phone, req.userId]
      );

      res.json({
        success: true,
        message: 'Profile updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/v1/users/password
 * Change current user's password
 */
router.put(
  '/password',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        throw new UnauthorizedError('User not authenticated');
      }

      const { current_password, new_password } = req.body;

      if (!current_password || !new_password) {
        throw new ValidationError('Current password and new password are required');
      }

      if (new_password.length < 6) {
        throw new ValidationError('New password must be at least 6 characters long');
      }

      const pool = getPool();
      const userRes = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);

      if (userRes.rows.length === 0) {
        throw new NotFoundError('User not found');
      }

      const isMatch = await bcrypt.compare(current_password, userRes.rows[0].password_hash);
      if (!isMatch) {
        throw new ValidationError('Current password is incorrect');
      }

      const newHash = await bcrypt.hash(new_password, 12);
      await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [newHash, req.userId]
      );

      res.json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/users/team/members
 * List all team members in the tenant
 */
router.get(
  '/team/members',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const pool = getPool();
      const members = await pool.query(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.status, tu.role, tu.joined_at
         FROM users u
         JOIN tenant_users tu ON u.id = tu.user_id
         WHERE tu.tenant_id = $1
         ORDER BY tu.joined_at ASC`,
        [req.tenantId]
      );

      res.json({
        success: true,
        members: members.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/users/team/members
 * Add or invite a member to the current tenant
 */
router.post(
  '/team/members',
  tenantMiddleware,
  requireRole('owner', 'admin'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context missing');
      }

      const { email, first_name, last_name, role = 'member', password } = req.body;

      if (!email) {
        throw new ValidationError('Email is required');
      }

      const pool = getPool();

      // Check if user already exists
      let userId: string;
      const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

      if (existingUser.rows.length > 0) {
        userId = existingUser.rows[0].id;
      } else {
        userId = uuidv4();
        const initialPassword = password || `TempPass_${Math.random().toString(36).slice(-8)}!`;
        const hash = await bcrypt.hash(initialPassword, 12);

        await pool.query(
          `INSERT INTO users (id, email, password_hash, first_name, last_name, status)
           VALUES ($1, $2, $3, $4, $5, 'active')`,
          [userId, email, hash, first_name || null, last_name || null]
        );
      }

      // Check if already in this tenant
      const existingMembership = await pool.query(
        'SELECT id FROM tenant_users WHERE tenant_id = $1 AND user_id = $2',
        [req.tenantId, userId]
      );

      if (existingMembership.rows.length > 0) {
        throw new ValidationError('User is already a member of this tenant');
      }

      // Add to tenant
      const membershipId = uuidv4();
      await pool.query(
        `INSERT INTO tenant_users (id, tenant_id, user_id, role, joined_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [membershipId, req.tenantId, userId, role]
      );

      logger.info(`User ${email} added to tenant ${req.tenantId} with role ${role}`);

      res.status(201).json({
        success: true,
        message: 'Team member added successfully',
        member: {
          id: userId,
          email,
          first_name,
          last_name,
          role,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/v1/users/team/members/:userId
 * Update team member's role
 */
router.put(
  '/team/members/:userId',
  tenantMiddleware,
  requireRole('owner', 'admin'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { role } = req.body;
      const { userId } = req.params;

      if (!role) {
        throw new ValidationError('Role is required (owner, admin, member)');
      }

      const pool = getPool();
      const result = await pool.query(
        `UPDATE tenant_users SET role = $1 WHERE tenant_id = $2 AND user_id = $3`,
        [role, req.tenantId, userId]
      );

      if (result.rowCount === 0) {
        throw new NotFoundError('Team member not found in this tenant');
      }

      res.json({
        success: true,
        message: `Team member role updated to ${role}`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/users/team/members/:userId
 * Remove a team member from the tenant
 */
router.delete(
  '/team/members/:userId',
  tenantMiddleware,
  requireRole('owner', 'admin'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;

      if (userId === req.userId) {
        throw new ValidationError('You cannot remove yourself from the organization');
      }

      const pool = getPool();
      await pool.query(
        `DELETE FROM tenant_users WHERE tenant_id = $1 AND user_id = $2`,
        [req.tenantId, userId]
      );

      res.json({
        success: true,
        message: 'Team member removed successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/users/:userId
 * Get user information
 */
router.get(
  '/:userId',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      const userRes = await pool.query(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.status, tu.role, u.created_at
         FROM users u
         JOIN tenant_users tu ON u.id = tu.user_id
         WHERE u.id = $1 AND tu.tenant_id = $2`,
        [req.params.userId, req.tenantId]
      );

      if (userRes.rows.length === 0) {
        throw new NotFoundError('User not found');
      }

      res.json({
        success: true,
        user: userRes.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/users/:userId
 * Delete user from tenant
 */
router.delete(
  '/:userId',
  tenantMiddleware,
  requireRole('owner', 'admin'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      await pool.query(
        `DELETE FROM tenant_users WHERE tenant_id = $1 AND user_id = $2`,
        [req.tenantId, req.params.userId]
      );

      res.json({
        success: true,
        message: 'User removed from tenant',
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as userManagementRoutes };
