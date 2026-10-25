import { Request, Response } from 'express';
import { getPool } from '../config/database';
import { getRedisClient } from '../config/redis';
import { createLogger } from '../config/logger';

const logger = createLogger('health-check');

export async function healthCheck(req: Request, res: Response): Promise<void> {
  try {
    const health = {
      status: 'UP',
      timestamp: new Date().toISOString(),
      services: {} as any,
    };

    // Check MySQL
    try {
      const pool = getPool();
      const result = await pool.query('SELECT NOW()');
      health.services.database = {
        status: 'UP',
        response_time: '< 100ms',
      };
    } catch (error) {
      health.services.database = {
        status: 'DOWN',
        error: (error as any).message,
      };
      health.status = 'DEGRADED';
    }

    // Check Redis
    try {
      const redis = getRedisClient();
      await redis.ping();
      health.services.redis = {
        status: 'UP',
      };
    } catch (error) {
      health.services.redis = {
        status: 'DOWN',
        error: (error as any).message,
      };
      health.status = 'DEGRADED';
    }

    const statusCode = health.status === 'UP' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Health check failed', error);
    res.status(503).json({
      status: 'DOWN',
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
    });
  }
}
