import { Router, Request, Response } from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../../config/database';
import { createLogger } from '../../config/logger';
import { emitInboxMessage, emitDeliveryUpdate } from '../../config/socket';

const router = Router();
const logger = createLogger('whatsapp-webhooks');

/**
 * GET /webhooks/whatsapp
 * Meta WhatsApp Webhook verification handshake
 */
router.get('/whatsapp', async (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken =
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
    'whatsapp_bulk_webhook_secret_123';

  if (mode === 'subscribe' && token === verifyToken) {
    logger.info('Meta WhatsApp Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    logger.warn(`Meta Webhook verification mismatch. Received token: ${token}`);
    res.sendStatus(403);
  }
});

/**
 * POST /webhooks/whatsapp
 * Meta WhatsApp Inbound events (Statuses: sent, delivered, read, failed, and incoming messages)
 */
router.post('/whatsapp', async (req: Request, res: Response) => {
  // Always immediately respond with 200 OK so Meta doesn't retry or flag endpoint
  res.status(200).json({ received: true });

  const pool = getPool();
  const body = req.body;

  try {
    if (body.object === 'whatsapp_business_account' && body.entry) {
      for (const entry of body.entry) {
        const changes = entry.changes || [];
        for (const change of changes) {
          const value = change.value;
          if (!value) continue;

          // 1. Process Message Status Updates (sent, delivered, read, failed)
          const statuses = value.statuses || [];
          for (const statusObj of statuses) {
            const metaMessageId = statusObj.id;
            const newStatus = statusObj.status; // 'sent' | 'delivered' | 'read' | 'failed'
            const timestamp = statusObj.timestamp ? new Date(parseInt(statusObj.timestamp) * 1000) : new Date();

            logger.info(`Webhook: Message ${metaMessageId} transitioned to ${newStatus}`);

            let updateSql = '';
            let params: any[] = [];

            if (newStatus === 'delivered') {
              updateSql = `UPDATE messages SET status = 'delivered', delivered_at = $1 WHERE meta_message_id = $2`;
              params = [timestamp, metaMessageId];
            } else if (newStatus === 'read') {
              updateSql = `UPDATE messages SET status = 'read', read_at = $1 WHERE meta_message_id = $2`;
              params = [timestamp, metaMessageId];
            } else if (newStatus === 'failed') {
              const errorReason = statusObj.errors?.[0]?.title || 'Delivery failed';
              updateSql = `UPDATE messages SET status = 'failed', error_message = $1 WHERE meta_message_id = $2`;
              params = [errorReason, metaMessageId];
            } else if (newStatus === 'sent') {
              updateSql = `UPDATE messages SET status = 'sent', sent_at = $1 WHERE meta_message_id = $2`;
              params = [timestamp, metaMessageId];
            }

            if (updateSql) {
              await pool.query(updateSql, params);

              // Emit real-time delivery status update to tenant
              const msgRow = await pool.query(
                `SELECT tenant_id FROM messages WHERE meta_message_id = $1`,
                [metaMessageId]
              );
              if (msgRow.rows.length > 0) {
                emitDeliveryUpdate(msgRow.rows[0].tenant_id, { metaMessageId, status: newStatus });
              }

              // If delivered, also increment messages_delivered in the parent campaign
              if (newStatus === 'delivered') {
                const msgRes = await pool.query(
                  `SELECT campaign_id FROM messages WHERE meta_message_id = $1`,
                  [metaMessageId]
                );
                if (msgRes.rows.length > 0 && msgRes.rows[0].campaign_id) {
                  await pool.query(
                    `UPDATE campaigns SET messages_delivered = messages_delivered + 1 WHERE id = $1`,
                    [msgRes.rows[0].campaign_id]
                  );
                }
              }
            }
          }

          // 2. Process incoming customer replies
          const incomingMessages = value.messages || [];
          for (const incoming of incomingMessages) {
            const fromNumber = incoming.from;
            const textBody = incoming.text?.body || '';
            const msgType = incoming.type || 'text';
            const mediaUrl = incoming.image?.link || incoming.video?.link || incoming.document?.link || null;
            logger.info(`Webhook: Incoming message from ${fromNumber}: "${textBody}"`);

            // Find which tenant this number belongs to
            const contactMatch = await pool.query(
              `SELECT tenant_id, first_name, last_name FROM contacts WHERE phone_number = $1 LIMIT 1`,
              [fromNumber.replace(/\D/g, '')]
            );

            const tenantId = contactMatch.rows[0]?.tenant_id || null;
            const displayName = contactMatch.rows.length > 0
              ? `${contactMatch.rows[0].first_name || ''} ${contactMatch.rows[0].last_name || ''}`.trim() || fromNumber
              : fromNumber;

            // Save to inbox_messages table
            const inboxId = uuidv4();
            const inboxMsg = {
              id: inboxId,
              tenant_id: tenantId,
              from_number: fromNumber,
              display_name: displayName,
              message_type: msgType,
              body: textBody,
              media_url: mediaUrl,
              is_read: false,
              received_at: new Date().toISOString(),
              whatsapp_message_id: incoming.id || null,
            };

            if (tenantId) {
              try {
                await pool.query(
                  `INSERT INTO inbox_messages (id, tenant_id, from_number, display_name, message_type, body, media_url, is_read, received_at, whatsapp_message_id)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, NOW(), $8)`,
                  [inboxId, tenantId, fromNumber, displayName, msgType, textBody, mediaUrl, incoming.id || null]
                );
                // Emit real-time socket event to tenant clients
                emitInboxMessage(tenantId, inboxMsg);
              } catch (dbErr: any) {
                logger.error(`Failed to save inbox message: ${dbErr.message}`);
              }
            }

            // Handle opt-out compliance
            if (/^\s*(stop|unsubscribe|cancel)\s*$/i.test(textBody)) {
              const cleanFrom = fromNumber.replace(/\D/g, '');
              logger.info(`Opt-out requested automatically via WhatsApp from ${cleanFrom}`);
              try {
                if (tenantId) {
                  await pool.query(
                    `INSERT INTO opt_out_requests (id, tenant_id, phone_number, reason, processed, processed_at)
                     VALUES ($1, $2, $3, $4, TRUE, NOW())`,
                    [uuidv4(), tenantId, cleanFrom, `Inbound WhatsApp text: "${textBody}"`]
                  );
                  await pool.query(
                    `UPDATE contacts SET opted_in = FALSE, opted_out_at = NOW(), updated_at = NOW()
                     WHERE tenant_id = $1 AND phone_number = $2`,
                    [tenantId, cleanFrom]
                  );

                  // Also add to platform-wide global_blacklist
                  await pool.query(
                    `INSERT INTO global_blacklist (id, phone_number, reason, source, created_at)
                     VALUES ($1, $2, $3, 'webhook_stop', NOW())
                     ON DUPLICATE KEY UPDATE reason = $3`,
                    [uuidv4(), cleanFrom, `Inbound WhatsApp text: "${textBody}"`]
                  );
                }
              } catch (optErr: any) {
                logger.error(`Error saving automated opt-out for ${cleanFrom}: ${optErr.message}`);
              }
            }
          }
        }
      }
    }
  } catch (err: any) {
    logger.error(`Error processing WhatsApp webhook payload: ${err.message}`);
  }
});

/**
 * GET /webhooks/tenant/:tenantId/config
 * List registered webhook subscribers for a tenant
 */
router.get('/tenant/:tenantId/config', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, url, is_active, created_at, updated_at FROM webhooks WHERE tenant_id = $1`,
      [req.params.tenantId]
    );
    res.json({ success: true, webhooks: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /webhooks/tenant/:tenantId/config
 * Register an outgoing webhook URL for message event notifications
 */
router.post('/tenant/:tenantId/config', async (req: Request, res: Response) => {
  try {
    const { url, secret_key } = req.body;
    if (!url) {
      res.status(400).json({ success: false, error: 'Webhook URL is required' });
      return;
    }

    const pool = getPool();
    const webhookId = uuidv4();

    await pool.query(
      `INSERT INTO webhooks (id, tenant_id, url, is_active, secret_key)
       VALUES ($1, $2, $3, TRUE, $4)`,
      [webhookId, req.params.tenantId, url, secret_key || null]
    );

    res.status(201).json({
      success: true,
      message: 'Webhook subscription configured',
      webhook: { id: webhookId, url },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /webhooks/tenant/:tenantId/config/:webhookId
 * Delete a registered webhook subscription
 */
router.delete('/tenant/:tenantId/config/:webhookId', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    await pool.query(
      `DELETE FROM webhooks WHERE id = $1 AND tenant_id = $2`,
      [req.params.webhookId, req.params.tenantId]
    );
    res.json({ success: true, message: 'Webhook deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /webhooks/tenant/:tenantId/test
 * Test webhook delivery by sending a ping event
 */
router.post('/tenant/:tenantId/test', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ success: false, error: 'Target URL is required' });
      return;
    }

    const testPayload = {
      event: 'test_ping',
      timestamp: new Date().toISOString(),
      tenant_id: req.params.tenantId,
      message: 'WhatsApp Bulk Messaging Webhook Test Notification',
    };

    const response = await axios.post(url, testPayload, { timeout: 5000 });
    res.json({
      success: true,
      message: 'Test ping dispatched successfully',
      status: response.status,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: `Failed to deliver test webhook: ${err.message}`,
    });
  }
});

/**
 * POST /webhooks/tenant/:tenantId
 * General inbound tenant-scoped webhook receiver
 */
router.post('/tenant/:tenantId', async (req: Request, res: Response) => {
  logger.info(`Received inbound event for tenant ${req.params.tenantId}: ${JSON.stringify(req.body).substring(0, 100)}`);
  res.json({ received: true, tenant_id: req.params.tenantId });
});

export { router as webhookRoutes };
