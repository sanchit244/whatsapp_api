import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Router, Response, NextFunction } from 'express';
import { tenantMiddleware, AuthRequest } from '../../middleware/tenantMiddleware';
import { getPool } from '../../config/database';
import { createLogger } from '../../config/logger';
import { MetaWhatsAppService } from './metaService';
import { ValidationError } from '../../middleware/errorHandler';

const router = Router();
const logger = createLogger('whatsapp-routes');

/**
 * GET /api/v1/whatsapp/config
 * Get tenant WhatsApp settings (Custom BYOK vs Platform Default)
 */
router.get(
  '/config',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const pool = getPool();
      const result = await pool.query(
        `SELECT whatsapp_token, whatsapp_phone_number_id, whatsapp_business_account_id, use_custom_whatsapp
         FROM tenants WHERE id = $1`,
        [req.tenantId]
      );

      if (result.rows.length === 0) {
        throw new ValidationError('Tenant not found');
      }

      const tenant = result.rows[0];
      const hasCustom = Boolean(tenant.use_custom_whatsapp);
      const rawToken = tenant.whatsapp_token || '';
      const maskedToken = rawToken ? `${rawToken.substring(0, 6)}...${rawToken.substring(rawToken.length - 4)}` : '';

      // Check if platform default is available
      const platformCreds = await MetaWhatsAppService.resolveCredentials();
      const hasPlatformDefault = Boolean(platformCreds && platformCreds.token);

      res.json({
        use_custom_whatsapp: hasCustom,
        phone_number_id: tenant.whatsapp_phone_number_id || '',
        business_account_id: tenant.whatsapp_business_account_id || '',
        token_masked: maskedToken,
        is_token_configured: Boolean(rawToken),
        has_platform_default: hasPlatformDefault,
        active_mode: hasCustom ? 'custom' : 'platform',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/whatsapp/config
 * Update tenant WhatsApp settings (Enable BYOK or revert to platform default)
 */
router.post(
  '/config',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const {
        use_custom_whatsapp,
        whatsapp_token,
        whatsapp_phone_number_id,
        phone_number_id,
        whatsapp_business_account_id,
        business_account_id,
      } = req.body;
      const targetPhoneId = whatsapp_phone_number_id || phone_number_id;
      const targetWabaId = whatsapp_business_account_id || business_account_id;
      const pool = getPool();

      // If user is activating custom BYOK, validate parameters
      if (use_custom_whatsapp) {
        if (!targetPhoneId) {
          throw new ValidationError('WhatsApp Phone Number ID is required when enabling custom credentials');
        }
      }

      // Check if new token is provided, or preserve old token
      let tokenToSave = whatsapp_token;
      if (!tokenToSave) {
        const existing = await pool.query(`SELECT whatsapp_token FROM tenants WHERE id = $1`, [req.tenantId]);
        tokenToSave = existing.rows[0]?.whatsapp_token || null;
      }

      await pool.query(
        `UPDATE tenants 
         SET use_custom_whatsapp = $1,
             whatsapp_token = $2,
             whatsapp_phone_number_id = $3,
             whatsapp_business_account_id = $4,
             updated_at = NOW()
         WHERE id = $5`,
        [
          Boolean(use_custom_whatsapp),
          tokenToSave,
          targetPhoneId || null,
          targetWabaId || null,
          req.tenantId,
        ]
      );

      res.json({
        message: 'WhatsApp configuration updated successfully',
        use_custom_whatsapp: Boolean(use_custom_whatsapp),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/whatsapp/verify-credentials
 * Test Meta API token & phone number without saving
 */
router.post(
  '/verify-credentials',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { token, phone_number_id } = req.body;
      if (!token || !phone_number_id) {
        throw new ValidationError('Token and Phone Number ID are required');
      }

      const result = await MetaWhatsAppService.testCredentials(token, phone_number_id);
      if (result.success) {
        res.json({
          success: true,
          message: 'Connection to Meta WhatsApp Cloud API verified successfully!',
          details: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'Failed to verify with Meta API',
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/whatsapp/upload-media
 * Upload an image or video file directly (base64) and get a public URL
 */
router.post(
  '/upload-media',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { fileName, fileType, fileData } = req.body;

      if (!fileData) {
        throw new ValidationError('File data (base64 string) is required');
      }

      // Strip data uri prefix if present (e.g. data:image/png;base64,...)
      const base64Data = fileData.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // Determine extension and media type
      let ext = '.jpg';
      let mediaType: 'image' | 'video' | 'document' = 'image';

      if (fileName && fileName.includes('.')) {
        ext = path.extname(fileName).toLowerCase();
      } else if (fileType) {
        if (fileType.includes('png')) ext = '.png';
        else if (fileType.includes('gif')) ext = '.gif';
        else if (fileType.includes('webp')) ext = '.webp';
        else if (fileType.includes('mp4')) { ext = '.mp4'; mediaType = 'video'; }
        else if (fileType.includes('pdf')) { ext = '.pdf'; mediaType = 'document'; }
      }

      if (['.mp4', '.mov', '.avi', '.webm'].includes(ext)) {
        mediaType = 'video';
      } else if (['.pdf', '.doc', '.docx', '.csv', '.xlsx'].includes(ext)) {
        mediaType = 'document';
      }

      const uploadDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const uniqueFileName = `media_${Date.now()}_${uuidv4().substring(0, 8)}${ext}`;
      const filePath = path.join(uploadDir, uniqueFileName);

      fs.writeFileSync(filePath, buffer);

      // Construct public URL
      const host = req.get('host') || 'localhost:3000';
      const protocol = req.protocol || 'http';
      const fileUrl = `${protocol}://${host}/uploads/${uniqueFileName}`;

      res.status(201).json({
        message: 'Media uploaded successfully',
        url: fileUrl,
        media_type: mediaType,
        fileName: uniqueFileName,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/whatsapp/test-send
 * Send a single test message (text, image, or video) to verify outbound delivery
 */
router.post(
  '/test-send',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { recipient, message, media_type, media_url, filename } = req.body;

      if (!recipient) {
        throw new ValidationError('Recipient phone number is required');
      }

      const credentials = await MetaWhatsAppService.resolveCredentials(req.tenantId);

      let result;
      if (media_url && (media_type === 'image' || media_type === 'video' || media_type === 'document')) {
        result = await MetaWhatsAppService.sendMediaMessage(
          {
            to: recipient,
            type: media_type,
            mediaUrl: media_url,
            caption: message || '',
            filename,
          },
          credentials
        );
      } else {
        if (!message) {
          throw new ValidationError('Message text or media is required');
        }
        result = await MetaWhatsAppService.sendTextMessage(
          {
            to: recipient,
            text: message,
          },
          credentials
        );
      }

      if (result.success) {
        res.json({
          message: 'Test message sent successfully',
          status: result.status,
          messageId: result.messageId,
          media_type: media_url ? media_type : 'text',
        });
      } else {
        res.status(400).json({
          message: 'Failed to send test message',
          error: result.error,
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/whatsapp/templates
 * Get available message templates
 */
router.get(
  '/templates',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const credentials = await MetaWhatsAppService.resolveCredentials(req.tenantId);
      const templates = await MetaWhatsAppService.getTemplates(credentials);

      res.json({
        templates,
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as whatsappRoutes };
