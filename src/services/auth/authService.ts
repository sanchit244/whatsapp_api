import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../../config/database';
import { createLogger } from '../../config/logger';
import { getRedisClient, setInCache, getFromCache } from '../../config/redis';
import { ValidationError, UnauthorizedError, ConflictError } from '../../middleware/errorHandler';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

const logger = createLogger('auth-service');

export interface RegisterRequest {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  mfa_code?: string;
}

export interface TokenPayload {
  sub: string; // user_id
  tenant_id: string;
  email: string;
  role: string;
  is_admin: boolean;
  iat: number;
  exp: number;
}

const getJwtSecret = () => process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const getJwtExpiresIn = () => parseInt(process.env.JWT_EXPIRES_IN || process.env.JWT_EXPIRATION || '3600');
const getJwtRefreshSecret = () => process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key';
const getJwtRefreshExpiresIn = () => parseInt(process.env.JWT_REFRESH_EXPIRES_IN || process.env.JWT_REFRESH_EXPIRATION || '2592000');

export class AuthService {
  /**
   * Register a new user
   */
  static async register(req: RegisterRequest): Promise<{ userId: string; email: string; status: string }> {
    const { email, password, first_name, last_name, phone } = req;

    // Validation
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    const pool = getPool();

    try {
      // Check if user already exists
      const existingUser = await pool.query(
        'SELECT id, status FROM users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        const existingStatus = existingUser.rows[0].status || 'pending';
        if (existingStatus === 'pending') {
          throw new ConflictError('A registration with this email is already awaiting administrator approval');
        }
        throw new ConflictError('Email already registered');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user with default status 'pending'
      const userId = uuidv4();
      const result = await pool.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, phone, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         RETURNING id, email, status`,
        [userId, email, passwordHash, first_name || null, last_name || null, phone || null]
      );

      logger.info(`User registered (pending admin approval): ${email}`);

      return {
        userId: result.rows[0].id,
        email: result.rows[0].email,
        status: result.rows[0].status || 'pending',
      };
    } catch (error) {
      logger.error('Registration failed', error);
      throw error;
    }
  }

  /**
   * Create a new tenant for user
   */
  static async createTenant(
    userId: string,
    tenantName: string,
    plan: string = 'starter',
    status: string = 'pending'
  ): Promise<string> {
    const pool = getPool();

    try {
      const tenantId = uuidv4();
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const slug = tenantName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '') + '-' + randomSuffix;

      // Create tenant with status
      await pool.query(
        `INSERT INTO tenants (id, name, slug, plan, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, tenantName, slug, plan, status]
      );

      // Add user as tenant owner
      await pool.query(
        `INSERT INTO tenant_users (id, tenant_id, user_id, role)
         VALUES ($1, $2, $3, $4)`,
        [uuidv4(), tenantId, userId, 'owner']
      );

      logger.info(`Tenant created: ${tenantId} (${status}) for user ${userId}`);

      return tenantId;
    } catch (error) {
      logger.error('Tenant creation failed', error);
      throw error;
    }
  }

  /**
   * User login
   */
  static async login(req: LoginRequest): Promise<{
    accessToken: string;
    refreshToken: string;
    user: any;
    tenants: any[];
  }> {
    const { email, password, mfa_code } = req;

    const pool = getPool();

    try {
      // Find user
      const userResult = await pool.query(
        'SELECT id, email, password_hash, first_name, last_name, phone, mfa_enabled, mfa_secret, is_admin, status FROM users WHERE email = $1',
        [email]
      );

      if (userResult.rows.length === 0) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const user = userResult.rows[0];

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);

      if (!isPasswordValid) {
        throw new UnauthorizedError('Invalid email or password');
      }

      // Check account approval status if not super-admin
      if (!user.is_admin) {
        const userStatus = (user.status || 'pending').toLowerCase();
        if (userStatus === 'pending') {
          throw new UnauthorizedError(
            'Your registration is currently pending approval by the administrator. Please wait for the admin to accept your account and provide/activate your credentials.'
          );
        }
        if (userStatus === 'suspended') {
          throw new UnauthorizedError('Your account has been suspended by the administrator. Please contact support.');
        }
        if (userStatus === 'rejected') {
          throw new UnauthorizedError('Your registration request was not approved by the administrator.');
        }
      }

      // Check MFA if enabled
      if (user.mfa_enabled && !mfa_code) {
        throw new UnauthorizedError('MFA code required');
      }

      if (user.mfa_enabled && mfa_code) {
        const isValidMFA = speakeasy.totp.verify({
          secret: user.mfa_secret,
          encoding: 'base32',
          token: mfa_code,
          window: 2,
        });

        if (!isValidMFA) {
          throw new UnauthorizedError('Invalid MFA code');
        }
      }

      // Get user's tenants
      const tenantsResult = await pool.query(
        `SELECT t.id, t.name, t.slug, t.plan, t.status, tu.role
         FROM tenants t
         JOIN tenant_users tu ON t.id = tu.tenant_id
         WHERE tu.user_id = $1`,
        [user.id]
      );

      if (tenantsResult.rows.length === 0) {
        throw new UnauthorizedError('User is not part of any tenant');
      }

      const tenants = tenantsResult.rows;
      const primaryTenant = tenants[0];

      // Check tenant status if not admin
      if (!user.is_admin) {
        const tenantStatus = (primaryTenant.status || 'pending').toLowerCase();
        if (tenantStatus === 'pending') {
          throw new UnauthorizedError(
            'Your organization account is pending administrator approval. Please wait for the admin to activate your account.'
          );
        }
        if (tenantStatus === 'suspended') {
          throw new UnauthorizedError('Your organization account has been suspended. Please contact support.');
        }
      }

      // Generate tokens
      const tokens = AuthService.generateTokens(
        user.id,
        primaryTenant.id,
        email,
        primaryTenant.role,
        Boolean(user.is_admin)
      );

      // Update last login
      await pool.query(
        'UPDATE users SET last_login = NOW() WHERE id = $1',
        [user.id]
      );

      logger.info(`User logged in: ${email}`);

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          phone: user.phone,
          status: user.status || 'active',
          is_admin: Boolean(user.is_admin),
        },
        tenants,
      };
    } catch (error) {
      logger.error('Login failed', error);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  static async refreshToken(refreshToken: string): Promise<{
    accessToken: string;
  }> {
    try {
      const decoded = jwt.verify(refreshToken, getJwtRefreshSecret()) as TokenPayload;

      // Generate new access token
      const newAccessToken = jwt.sign(
        {
          sub: decoded.sub,
          tenant_id: decoded.tenant_id,
          email: decoded.email,
          role: decoded.role,
          is_admin: decoded.is_admin,
        },
        getJwtSecret(),
        { expiresIn: getJwtExpiresIn() }
      );

      return {
        accessToken: newAccessToken,
      };
    } catch (error) {
      logger.error('Token refresh failed', error);
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }

  /**
   * Generate JWT tokens
   */
  static generateTokens(
    userId: string,
    tenantId: string,
    email: string,
    role: string,
    isAdmin: boolean
  ): { accessToken: string; refreshToken: string } {
    const accessToken = jwt.sign(
      {
        sub: userId,
        tenant_id: tenantId,
        email,
        role,
        is_admin: isAdmin,
      },
      getJwtSecret(),
      { expiresIn: getJwtExpiresIn() }
    );

    const refreshToken = jwt.sign(
      {
        sub: userId,
        tenant_id: tenantId,
        email,
        role,
        is_admin: isAdmin,
      },
      getJwtRefreshSecret(),
      { expiresIn: getJwtRefreshExpiresIn() }
    );

    return { accessToken, refreshToken };
  }

  /**
   * Setup MFA for user
   */
  static async setupMFA(userId: string): Promise<{
    secret: string;
    qrCode: string;
  }> {
    const pool = getPool();

    try {
      // Get user email for label
      const userResult = await pool.query(
        'SELECT email FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new UnauthorizedError('User not found');
      }

      const user = userResult.rows[0];

      // Generate TOTP secret
      const secret = speakeasy.generateSecret({
        name: `WhatsApp Bulk Messaging (${user.email})`,
        length: 32,
      });

      // Generate QR code
      const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

      // Store secret temporarily in cache (user must verify within 10 minutes)
      await setInCache(`mfa:pending:${userId}`, secret.base32, 600);

      return {
        secret: secret.base32,
        qrCode,
      };
    } catch (error) {
      logger.error('MFA setup failed', error);
      throw error;
    }
  }

  /**
   * Verify and enable MFA
   */
  static async verifyMFA(userId: string, token: string): Promise<void> {
    const pool = getPool();
    const redis = getRedisClient();

    try {
      // Get pending secret from cache
      const secret = await getFromCache(`mfa:pending:${userId}`);

      if (!secret) {
        throw new ValidationError('MFA setup expired or not initiated');
      }

      // Verify token
      const isValid = speakeasy.totp.verify({
        secret: secret as string,
        encoding: 'base32',
        token,
        window: 2,
      });

      if (!isValid) {
        throw new ValidationError('Invalid MFA token');
      }

      // Save secret and enable MFA
      await pool.query(
        'UPDATE users SET mfa_enabled = true, mfa_secret = $1 WHERE id = $2',
        [secret, userId]
      );

      // Remove from cache
      await redis.del(`mfa:pending:${userId}`);

      logger.info(`MFA enabled for user: ${userId}`);
    } catch (error) {
      logger.error('MFA verification failed', error);
      throw error;
    }
  }

  /**
   * Create API key
   */
  static async createAPIKey(
    tenantId: string,
    keyName: string,
    expiresInDays: number = 90
  ): Promise<{
    keyId: string;
    key: string;
  }> {
    const pool = getPool();

    try {
      const keyId = uuidv4();
      const rawKey = `wapi_${uuidv4()}_${uuidv4()}`.replace(/-/g, '');
      const keyHash = await bcrypt.hash(rawKey, 10);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      await pool.query(
        `INSERT INTO api_keys (id, tenant_id, name, key_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [keyId, tenantId, keyName, keyHash, expiresAt]
      );

      logger.info(`API key created: ${keyId} for tenant ${tenantId}`);

      return {
        keyId,
        key: rawKey,
      };
    } catch (error) {
      logger.error('API key creation failed', error);
      throw error;
    }
  }

  /**
   * Verify API key
   */
  static async verifyAPIKey(rawKey: string): Promise<{
    tenantId: string;
    keyId: string;
  } | null> {
    const pool = getPool();

    try {
      // Get all API keys for comparison (expensive, but secure)
      const result = await pool.query(
        `SELECT id, tenant_id, key_hash, expires_at
         FROM api_keys
         WHERE expires_at > NOW() OR expires_at IS NULL`
      );

      for (const row of result.rows) {
        const isMatch = await bcrypt.compare(rawKey, row.key_hash);

        if (isMatch) {
          // Update last used
          await pool.query(
            'UPDATE api_keys SET last_used = NOW() WHERE id = $1',
            [row.id]
          );

          return {
            tenantId: row.tenant_id,
            keyId: row.id,
          };
        }
      }

      return null;
    } catch (error) {
      logger.error('API key verification failed', error);
      throw error;
    }
  }

  /**
   * Rotate API key
   */
  static async rotateAPIKey(keyId: string): Promise<{
    key: string;
  }> {
    const pool = getPool();

    try {
      const rawKey = `wapi_${uuidv4()}_${uuidv4()}`.replace(/-/g, '');
      const keyHash = await bcrypt.hash(rawKey, 10);

      await pool.query(
        `UPDATE api_keys
         SET key_hash = $1, rotated_at = NOW()
         WHERE id = $2`,
        [keyHash, keyId]
      );

      logger.info(`API key rotated: ${keyId}`);

      return {
        key: rawKey,
      };
    } catch (error) {
      logger.error('API key rotation failed', error);
      throw error;
    }
  }
}
