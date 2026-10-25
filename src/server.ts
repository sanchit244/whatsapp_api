import 'dotenv/config';
import http from 'http';
import app, { initializeServices } from './app';
import { initializeSocket } from './config/socket';
import { createLogger } from './config/logger';
import { CampaignScheduler } from './services/campaign/campaignScheduler';

const logger = createLogger('server');

const PORT = process.env.PORT || 3000;

async function start() {
  await initializeServices();

  // Start background campaign scheduler
  CampaignScheduler.initScheduler(15000); // Check every 15 seconds

  // Create HTTP server and attach Socket.IO
  const httpServer = http.createServer(app);
  initializeSocket(httpServer);

  httpServer.listen(PORT, () => {
    logger.info(`🚀 Server is running on port ${PORT}`);
    logger.info(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`🔌 Socket.IO enabled for real-time inbox & delivery tracking`);
    logger.info(`❤️  Health Check: http://localhost:${PORT}/health`);
  });
}

start();

export default app;
