import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createLogger } from '../config/logger';

const logger = createLogger('tenant-middleware');

export interface AuthRequest extends Request {
  tenantId?: string;
  userId?: string;
  user?: any;
}

export async function tenantMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Missing or invalid authorization header',
      });
      return;
    }

    const token = authHeader.substring(7);

    // Verify JWT token
    const jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
    const decoded = jwt.verify(token, jwtSecret) as any;

    if (!decoded.tenant_id || !decoded.sub) {
      res.status(401).json({
        error: 'Invalid token claims',
      });
      return;
    }

    // Store in request context
    req.tenantId = decoded.tenant_id;
    req.userId = decoded.sub;
    req.user = decoded;
    logger.debug(`Tenant context set: ${decoded.tenant_id} | User: ${decoded.sub}`);

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: 'Token expired',
      });
    } else if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: 'Invalid token',
      });
    } else {
      logger.error('Tenant middleware error', error);
      res.status(500).json({
        error: 'Internal server error',
      });
    }
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Insufficient permissions',
        required_roles: roles,
      });
      return;
    }

    next();
  };
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || !req.user.is_admin) {
    res.status(403).json({
      error: 'Admin access required',
    });
    return;
  }

  next();
}
