import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createLogger } from './config/logger';
import { initializeDatabase, getPool } from './config/database';
import { initializeRedis } from './config/redis';
import { initializeMessageQueue } from './config/queue';
import { errorHandler } from './middleware/errorHandler';
import { tenantMiddleware } from './middleware/tenantMiddleware';
import { authRoutes } from './services/auth/routes';
import { campaignRoutes } from './services/campaign/routes';
import { contactRoutes } from './services/contacts/routes';
import { contactGroupRoutes } from './services/contacts/groupRoutes';
import { inboxRoutes } from './services/inbox/routes';
import { userManagementRoutes } from './services/userManagement/routes';
import { templateRoutes } from './services/template/routes';
import { complianceRoutes } from './services/compliance/routes';
import { billingRoutes } from './services/billing/routes';
import { analyticsRoutes } from './services/analytics/routes';
import { webhookRoutes } from './services/webhooks/routes';
import { whatsappRoutes } from './services/whatsapp/routes';
import { adminRoutes } from './services/admin/routes';
import { healthCheck } from './middleware/healthCheck';

// Load environment variables
dotenv.config();

const logger = createLogger('app');

// Initialize Express app
const app: Express = express();

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static media uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Health check endpoint (before auth middleware)
app.use('/health', healthCheck);

// Webhook routes (public callback from Meta, no JWT bearer token required)
app.use('/webhooks', webhookRoutes);

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// Public announcement endpoint
app.get('/api/v1/announcement', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const resVal = await pool.query(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'system_announcement'`
    );
    if (resVal.rows.length > 0 && resVal.rows[0].setting_value) {
      try {
        const announcement = JSON.parse(resVal.rows[0].setting_value);
        return res.json(announcement);
      } catch {
        return res.json({ message: resVal.rows[0].setting_value, active: true, severity: 'info' });
      }
    }
    return res.json({ active: false });
  } catch {
    return res.json({ active: false });
  }
});

// Public auth routes (no tenant required)
app.use('/api/v1/auth', authRoutes);

// Protected routes with tenant middleware
app.use(tenantMiddleware);

// API routes - Mount contactGroupRoutes before contactRoutes so /groups is not matched as /:phone
app.use('/api/v1/contacts', contactGroupRoutes);
app.use('/api/v1/contacts', contactRoutes);
app.use('/api/v1/campaigns', campaignRoutes);
app.use('/api/v1/whatsapp', whatsappRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/users', userManagementRoutes);
app.use('/api/v1/templates', templateRoutes);
app.use('/api/v1/compliance', complianceRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/inbox', inboxRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method
  });
});

// Error handling middleware
app.use(errorHandler);

// Initialize services and start server
export async function initializeServices() {
  try {
    logger.info('Initializing WhatsApp Bulk Messaging Platform...');

    // Initialize database
    logger.info('Connecting to MySQL database...');
    await initializeDatabase();
    logger.info('Database connection successful');

    // Redis and RabbitMQ are optional for auth and local development.
    logger.info('Connecting to Redis...');
    try {
      await initializeRedis();
      logger.info('Redis connection successful');
    } catch (error) {
      if (process.env.NODE_ENV === 'production') throw error;
      logger.warn('Redis unavailable; continuing without cache in development');
    }

    logger.info('Initializing RabbitMQ...');
    try {
      await initializeMessageQueue();
      logger.info('RabbitMQ initialization successful');
    } catch (error) {
      if (process.env.NODE_ENV === 'production') throw error;
      logger.warn('RabbitMQ unavailable; continuing without message queue in development');
    }
  } catch (error) {
    logger.error('Failed to initialize services', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

if (require.main === module) {
  initializeServices().then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
    });
  });
}

export default app;
