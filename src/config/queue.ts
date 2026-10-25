import amqp from 'amqplib';
import { createLogger } from './logger';

const logger = createLogger('queue');

let connection: any;
let channel: any;

export async function initializeMessageQueue(): Promise<any> {
  try {
    const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

    connection = await amqp.connect(url);
    channel = await connection.createChannel();

    logger.info('RabbitMQ connection established');

    // Assert exchanges
    await channel.assertExchange('whatsapp.events', 'topic', { durable: true });
    await channel.assertExchange('whatsapp.commands', 'direct', { durable: true });

    // Assert queues with dead letter exchange for failed messages
    const dlExchange = 'whatsapp.deadletter';
    await channel.assertExchange(dlExchange, 'direct', { durable: true });

    // High priority queue (OTP, transactional)
    await channel.assertQueue('queue.high.priority', {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': dlExchange,
        'x-dead-letter-routing-key': 'deadletter',
      },
    });

    // Normal priority queue (marketing)
    await channel.assertQueue('queue.normal.priority', {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': dlExchange,
        'x-dead-letter-routing-key': 'deadletter',
      },
    });

    // Low priority queue (newsletters)
    await channel.assertQueue('queue.low.priority', {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': dlExchange,
        'x-dead-letter-routing-key': 'deadletter',
      },
    });

    // Dead letter queue
    await channel.assertQueue('queue.deadletter', { durable: true });
    await channel.bindQueue('queue.deadletter', dlExchange, 'deadletter');

    // Batch processing queue
    await channel.assertQueue('queue.batch.process', { durable: true });

    // Webhook queue
    await channel.assertQueue('queue.webhooks', { durable: true });

    // Analytics queue
    await channel.assertQueue('queue.analytics', { durable: true });

    logger.info('RabbitMQ queues and exchanges configured');

    return channel;
  } catch (error) {
    logger.error('RabbitMQ initialization failed', error);
    throw error;
  }
}

export function getChannel(): any {
  if (!channel) {
    throw new Error('Message queue channel not initialized');
  }
  return channel;
}

export async function closeMessageQueue(): Promise<void> {
  try {
    if (channel) {
      await channel.close();
    }
    if (connection) {
      await connection.close();
    }
    logger.info('Message queue connection closed');
  } catch (error) {
    logger.error('Failed to close message queue', error);
  }
}

// Event publisher
export async function publishEvent(
  eventType: string,
  data: any,
  tenantId: string,
  priority: 'high' | 'normal' | 'low' = 'normal'
): Promise<void> {
  try {
    const ch = getChannel();
    const exchange = 'whatsapp.events';
    const routingKey = `${eventType}.${tenantId}`;
    const message = {
      eventType,
      data,
      tenantId,
      timestamp: new Date().toISOString(),
    };

    ch.publish(
      exchange,
      routingKey,
      Buffer.from(JSON.stringify(message)),
      { persistent: true, priority: priority === 'high' ? 10 : priority === 'low' ? 1 : 5 }
    );

    logger.debug(`Event published: ${eventType} for tenant ${tenantId}`);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      logger.warn(`Skipping publishEvent (${eventType}): Queue channel not available in development`);
      return;
    }
    logger.error(`Failed to publish event: ${eventType}`, error);
    throw error;
  }
}

// Job enqueueing
export async function enqueueJob(
  queueName: string,
  job: any,
  options: {
    priority?: 'high' | 'normal' | 'low';
    delay?: number;
    retries?: number;
  } = {}
): Promise<void> {
  try {
    const ch = getChannel();
    const priority = options.priority || 'normal';

    // Select queue based on priority
    let queue = queueName;
    if (queueName === 'batch.process') {
      queue = `queue.${priority}.priority`;
    }

    const message = {
      jobId: job.jobId || generateJobId(),
      type: queueName,
      data: job,
      retries: options.retries || 3,
      createdAt: new Date().toISOString(),
    };

    const opts: any = {
      persistent: true,
      priority: priority === 'high' ? 10 : priority === 'low' ? 1 : 5,
    };

    if (options.delay) {
      opts.headers = { 'x-delay': options.delay };
    }

    ch.sendToQueue(queue, Buffer.from(JSON.stringify(message)), opts);

    logger.debug(`Job enqueued to ${queue}:`, message.jobId);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      logger.warn(`Skipping enqueueJob (${queueName}): Queue channel not available in development`);
      return;
    }
    logger.error(`Failed to enqueue job to ${queueName}`, error);
    throw error;
  }
}

// Event subscription
export async function subscribeToEvent(
  eventType: string,
  handler: (event: any) => Promise<void>,
  tenantId?: string
): Promise<void> {
  try {
    const ch = getChannel();
    const queueName = `queue.${eventType}${tenantId ? `.${tenantId}` : ''}`;
    const routingKey = tenantId ? `${eventType}.${tenantId}` : `${eventType}.*`;

    await ch.assertQueue(queueName, { durable: true });
    await ch.bindQueue(queueName, 'whatsapp.events', routingKey);

    await ch.consume(queueName, async (msg: any) => {
      if (msg) {
        try {
          const event = JSON.parse(msg.content.toString());
          await handler(event);
          ch.ack(msg);
        } catch (error) {
          logger.error(`Failed to process event: ${eventType}`, error);
          ch.nack(msg, false, true);
        }
      }
    });

    logger.info(`Subscribed to event: ${eventType}`);
  } catch (error) {
    logger.error(`Failed to subscribe to event: ${eventType}`, error);
    throw error;
  }
}

// Job consumer
export async function consumeJobs(
  queueName: string,
  handler: (job: any) => Promise<void>,
  concurrency: number = 1
): Promise<void> {
  try {
    const ch = getChannel();
    await ch.prefetch(concurrency);

    await ch.consume(queueName, async (msg: any) => {
      if (msg) {
        try {
          const job = JSON.parse(msg.content.toString());
          await handler(job);
          ch.ack(msg);
        } catch (error) {
          logger.error(`Job processing failed in ${queueName}`, error);

          const job = JSON.parse(msg.content.toString());
          if (job.retries > 0) {
            job.retries--;
            await enqueueJob(job.type, job, { delay: 5000 });
          }

          ch.nack(msg, false, false);
        }
      }
    });

    logger.info(`Consumer listening on queue: ${queueName}`);
  } catch (error) {
    logger.error(`Failed to consume jobs from ${queueName}`, error);
    throw error;
  }
}

// Utility
function generateJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Dead letter handler
export async function setupDeadLetterHandler(): Promise<void> {
  try {
    const ch = getChannel();
    await ch.consume('queue.deadletter', async (msg: any) => {
      if (msg) {
        const failedJob = JSON.parse(msg.content.toString());
        logger.warn('Job moved to dead letter queue:', {
          jobId: failedJob.jobId,
          type: failedJob.type,
        });
        ch.ack(msg);
      }
    });

    logger.info('Dead letter handler setup complete');
  } catch (error) {
    logger.error('Failed to setup dead letter handler', error);
  }
}
