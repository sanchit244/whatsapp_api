import { createClient, RedisClientType } from 'redis';
import { createLogger } from './logger';

const logger = createLogger('redis');

let client: RedisClientType<{}, {}, {}, 2>;

export async function initializeRedis(): Promise<RedisClientType<{}, {}, {}, 2>> {
  try {
    client = createClient({
      RESP: 2,
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        reconnectStrategy: (retries: number) =>
          retries >= 1 ? new Error('Redis is unavailable') : 100,
      },
      password: process.env.REDIS_PASSWORD || undefined,
      database: parseInt(process.env.REDIS_DB || '0'),
    });

    client.on('error', (err: any) => {
      logger.error('Redis client error', err);
    });

    client.on('connect', () => {
      logger.info('Redis client connected');
    });

    await client.connect();
    logger.info('Redis connection established');

    return client;
  } catch (error) {
    logger.error('Redis initialization failed', error);
    throw error;
  }
}

export function getRedisClient(): RedisClientType<{}, {}, {}, 2> {
  if (!client) {
    throw new Error('Redis client not initialized');
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    logger.info('Redis connection closed');
  }
}

// Cache operations
export async function getFromCache<T>(key: string): Promise<T | null> {
  try {
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error(`Failed to get cache key: ${key}`, error);
    return null;
  }
}

export async function setInCache<T>(
  key: string,
  value: T,
  ttl: number = 3600
): Promise<void> {
  try {
    await client.setEx(key, ttl, JSON.stringify(value));
  } catch (error) {
    logger.error(`Failed to set cache key: ${key}`, error);
  }
}

export async function deleteFromCache(key: string): Promise<void> {
  try {
    await client.del(key);
  } catch (error) {
    logger.error(`Failed to delete cache key: ${key}`, error);
  }
}

export async function deletePatternFromCache(pattern: string): Promise<void> {
  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(keys);
    }
  } catch (error) {
    logger.error(`Failed to delete cache pattern: ${pattern}`, error);
  }
}

// Rate limiting with token bucket
export async function checkRateLimit(
  key: string,
  limit: number,
  window: number
): Promise<boolean> {
  try {
    const current = await client.incr(key);

    if (current === 1) {
      await client.expire(key, window);
    }

    return current <= limit;
  } catch (error) {
    logger.error(`Rate limit check failed for key: ${key}`, error);
    return true; // Allow on error
  }
}

// Session management
export async function createSession(
  sessionId: string,
  data: any,
  ttl: number = 86400
): Promise<void> {
  try {
    await client.setEx(`session:${sessionId}`, ttl, JSON.stringify(data));
  } catch (error) {
    logger.error(`Failed to create session: ${sessionId}`, error);
    throw error;
  }
}

export async function getSession(sessionId: string): Promise<any | null> {
  try {
    const data = await client.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error(`Failed to get session: ${sessionId}`, error);
    return null;
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  try {
    await client.del(`session:${sessionId}`);
  } catch (error) {
    logger.error(`Failed to delete session: ${sessionId}`, error);
  }
}
