import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createLogger } from './logger';

const logger = createLogger('socket');

let io: SocketIOServer | null = null;

export function initializeSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3001',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket: Socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // Client joins tenant-scoped room for inbox messages
    socket.on('join_tenant', (tenantId: string) => {
      socket.join(`tenant:${tenantId}`);
      logger.info(`Socket ${socket.id} joined room tenant:${tenantId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  logger.info('Socket.IO initialized');
  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

/**
 * Emit an incoming WhatsApp message to all connected clients in a tenant room
 */
export function emitInboxMessage(tenantId: string, message: object): void {
  if (io) {
    io.to(`tenant:${tenantId}`).emit('inbox_message', message);
    logger.info(`Emitted inbox_message to tenant:${tenantId}`);
  }
}

/**
 * Emit a campaign delivery status update to a tenant room
 */
export function emitDeliveryUpdate(tenantId: string, update: object): void {
  if (io) {
    io.to(`tenant:${tenantId}`).emit('delivery_update', update);
  }
}

/**
 * Emit campaign status or scheduler updates to a tenant room
 */
export function emitCampaignUpdate(tenantId: string, update: object): void {
  if (io) {
    io.to(`tenant:${tenantId}`).emit('campaign_update', update);
  }
}
