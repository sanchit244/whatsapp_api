import { Router, Response, NextFunction } from 'express';
import { ContactService } from './contactService';
import { createLogger } from '../../config/logger';
import { tenantMiddleware, AuthRequest } from '../../middleware/tenantMiddleware';
import { ValidationError } from '../../middleware/errorHandler';

const router = Router();
const logger = createLogger('contact-routes');

/**
 * POST /api/v1/contacts
 * Create or update a contact
 */
router.post(
  '/',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Missing tenant context');
      }

      const contact = await ContactService.createOrUpdateContact(req.tenantId, req.body);

      res.status(201).json({
        message: 'Contact created/updated successfully',
        contact,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/contacts
 * List contacts
 */
router.get(
  '/',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Missing tenant context');
      }

      const optedIn = req.query.opted_in ? req.query.opted_in === 'true' : undefined;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      const result = await ContactService.listContacts(req.tenantId, {
        opted_in: optedIn,
        page,
        limit,
      });

      res.json({
        message: 'Contacts retrieved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/contacts/:phone
 * Get contact by phone number
 */
router.get(
  '/:phone',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Missing tenant context');
      }

      if (req.params.phone === 'groups') {
        return next();
      }

      const contact = await ContactService.getContact(req.tenantId, req.params.phone as string);

      res.json({
        message: 'Contact retrieved successfully',
        contact,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/contacts/:phone/opt-out
 * Opt out a contact
 */
router.post(
  '/:phone/opt-out',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Missing tenant context');
      }

      await ContactService.optOutContact(req.tenantId, req.params.phone as string);

      res.json({
        message: 'Contact opted out successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/contacts/:phone/opt-in
 * Opt in a contact
 */
router.post(
  '/:phone/opt-in',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Missing tenant context');
      }

      await ContactService.optInContact(req.tenantId, req.params.phone as string);

      res.json({
        message: 'Contact opted in successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/contacts/:phone
 * Delete a contact
 */
router.delete(
  '/:phone',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Missing tenant context');
      }

      await ContactService.deleteContact(req.tenantId, req.params.phone as string);

      res.json({
        message: 'Contact deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/contacts/bulk-import
 * Bulk import contacts
 */
router.post(
  '/bulk/import',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Missing tenant context');
      }

      const { contacts } = req.body;

      if (!Array.isArray(contacts)) {
        throw new ValidationError('Contacts must be an array');
      }

      const result = await ContactService.bulkImportContacts(req.tenantId, contacts);

      res.json({
        message: 'Bulk import completed',
        result,
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as contactRoutes };
