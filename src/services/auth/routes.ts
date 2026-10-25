import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from './authService';
import { createLogger } from '../../config/logger';
import { tenantMiddleware, AuthRequest } from '../../middleware/tenantMiddleware';
import { ValidationError, UnauthorizedError } from '../../middleware/errorHandler';

const router = Router();
const logger = createLogger('auth-routes');

/**
 * POST /api/v1/auth/register
 * Register a new user and create a tenant
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, first_name, last_name, tenant_name, phone } = req.body;

    // Validation
    if (!email || !password || !tenant_name) {
      throw new ValidationError('Email, password, and company/tenant name are required');
    }

    // Register user with status pending
    const user = await AuthService.register({
      email,
      password,
      first_name,
      last_name,
      phone,
    });

    // Create tenant with status pending
    const tenantId = await AuthService.createTenant(user.userId, tenant_name, 'starter', 'pending');

    logger.info(`New user registered (pending admin approval): ${email}`);

    // Return pending status without auto-login tokens
    res.status(201).json({
      success: true,
      status: 'pending',
      message: 'Registration submitted successfully! Your account is pending administrator approval. Once the administrator approves and activates your credentials, you will be able to log in.',
      user: {
        id: user.userId,
        email: user.email,
        status: user.status,
      },
      tenant_id: tenantId,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/login
 * User login
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, mfa_code } = req.body;

    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    const result = await AuthService.login({
      email,
      password,
      mfa_code,
    });

    res.json({
      message: 'Login successful',
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      user: result.user,
      tenants: result.tenants,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/admin-login
 * Login for the administration portal only
 */
router.post('/admin-login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, mfa_code } = req.body;

    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    const result = await AuthService.login({ email, password, mfa_code });

    if (!result.user.is_admin) {
      throw new UnauthorizedError('This account is not authorized for the admin panel');
    }

    res.json({
      message: 'Admin login successful',
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      user: result.user,
      tenants: result.tenants,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/refresh
 * Refresh access token
 */
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      throw new ValidationError('Refresh token is required');
    }

    const result = await AuthService.refreshToken(refresh_token);

    res.json({
      message: 'Token refreshed',
      access_token: result.accessToken,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/logout
 * Logout user (token invalidation)
 */
router.post('/logout', tenantMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // In a real implementation, you might invalidate the token by adding it to a blacklist
    // For now, we'll just return success
    res.json({
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/mfa/setup
 * Setup MFA for user
 */
router.post('/mfa/setup', tenantMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      throw new UnauthorizedError('User not authenticated');
    }

    const result = await AuthService.setupMFA(req.userId);

    res.json({
      message: 'MFA setup initiated',
      secret: result.secret,
      qr_code: result.qrCode,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/mfa/verify
 * Verify and enable MFA
 */
router.post('/mfa/verify', tenantMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;

    if (!token) {
      throw new ValidationError('MFA token is required');
    }

    if (!req.userId) {
      throw new UnauthorizedError('User not authenticated');
    }

    await AuthService.verifyMFA(req.userId, token);

    res.json({
      message: 'MFA enabled successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/api-keys
 * Create API key
 */
router.post('/api-keys', tenantMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, expires_in_days } = req.body;

    if (!name || !req.tenantId) {
      throw new ValidationError('Name is required');
    }

    const result = await AuthService.createAPIKey(
      req.tenantId,
      name,
      expires_in_days || 90
    );

    res.status(201).json({
      message: 'API key created',
      key_id: result.keyId,
      key: result.key,
      note: 'Save this key in a secure location. You will not be able to see it again.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/auth/api-keys/:keyId/rotate
 * Rotate API key
 */
router.post(
  '/api-keys/:keyId/rotate',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const keyId = req.params.keyId as string;

      const result = await AuthService.rotateAPIKey(keyId);

      res.json({
        message: 'API key rotated',
        key: result.key,
        note: 'Save this key in a secure location.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/auth/api-keys
 * List API keys (masked)
 */
router.get(
  '/api-keys',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { getPool } = await import('../../config/database');
      const pool = getPool();

      const result = await pool.query(
        `SELECT id, name, created_at, last_used, expires_at
         FROM api_keys
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [req.tenantId]
      );

      res.json({
        message: 'API keys retrieved',
        keys: result.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/auth/api-keys/:keyId
 * Delete API key
 */
router.delete(
  '/api-keys/:keyId',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { getPool } = await import('../../config/database');
      const pool = getPool();
      const { keyId } = req.params;

      await pool.query(
        `DELETE FROM api_keys
         WHERE id = $1 AND tenant_id = $2`,
        [keyId, req.tenantId]
      );

      res.json({
        message: 'API key deleted',
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as authRoutes };
