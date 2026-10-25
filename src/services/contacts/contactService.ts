import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../../config/database';
import { createLogger } from '../../config/logger';
import { getRedisClient, setInCache, getFromCache } from '../../config/redis';
import { publishEvent } from '../../config/queue';
import { ValidationError, NotFoundError } from '../../middleware/errorHandler';

const logger = createLogger('contact-service');

export interface CreateContactRequest {
  phone_number: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  metadata?: Record<string, any>;
}

export interface ContactResponse {
  id: string;
  phone_number: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  opted_in: boolean;
  opted_in_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export class ContactService {
  /**
   * Create or update a contact
   */
  static async createOrUpdateContact(
    tenantId: string,
    req: CreateContactRequest
  ): Promise<ContactResponse> {
    const { phone_number, first_name, last_name, email, metadata } = req;

    // Validation
    if (!phone_number || phone_number.trim().length === 0) {
      throw new ValidationError('Phone number is required');
    }

    // Normalize phone number (remove non-digits)
    const normalizedPhone = phone_number.replace(/\D/g, '');

    if (normalizedPhone.length < 10) {
      throw new ValidationError('Phone number must be at least 10 digits');
    }

    const pool = getPool();

    try {
      // Check if contact exists
      const existing = await pool.query(
        `SELECT id FROM contacts WHERE tenant_id = $1 AND phone_number = $2`,
        [tenantId, normalizedPhone]
      );

      if (existing.rows.length > 0) {
        // Update existing contact
        const result = await pool.query(
          `UPDATE contacts
           SET first_name = $1, last_name = $2, email = $3, metadata = $4, updated_at = NOW()
           WHERE tenant_id = $5 AND phone_number = $6
           RETURNING id, phone_number, first_name, last_name, email, opted_in, opted_in_at, created_at, updated_at`,
          [first_name || null, last_name || null, email || null, JSON.stringify(metadata || {}), tenantId, normalizedPhone]
        );

        const contact = result.rows[0];

        // Invalidate cache
        await ContactService.invalidateContactCache(tenantId, normalizedPhone);

        logger.info(`Contact updated: ${normalizedPhone} for tenant ${tenantId}`);

        return contact;
      }

      // Create new contact
      const contactId = uuidv4();

      const result = await pool.query(
        `INSERT INTO contacts (id, tenant_id, phone_number, first_name, last_name, email, metadata, opted_in, opted_in_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING id, phone_number, first_name, last_name, email, opted_in, opted_in_at, created_at, updated_at`,
        [
          contactId,
          tenantId,
          normalizedPhone,
          first_name || null,
          last_name || null,
          email || null,
          JSON.stringify(metadata || {}),
          true,
        ]
      );

      const contact = result.rows[0];

      // Cache the contact
      const cacheKey = `tenant:${tenantId}:contact:${normalizedPhone}`;
      await setInCache(cacheKey, contact, 3600);

      // Publish event
      await publishEvent('contact.created', { contactId, tenantId }, tenantId);

      logger.info(`Contact created: ${normalizedPhone} for tenant ${tenantId}`);

      return contact;
    } catch (error) {
      logger.error('Contact creation/update failed', error);
      throw error;
    }
  }

  /**
   * Get contact by phone number
   */
  static async getContact(tenantId: string, phoneNumber: string): Promise<ContactResponse> {
    const normalizedPhone = phoneNumber.replace(/\D/g, '');

    // Try cache first
    const cacheKey = `tenant:${tenantId}:contact:${normalizedPhone}`;
    const cached = await getFromCache<ContactResponse>(cacheKey);

    if (cached) {
      return cached;
    }

    const pool = getPool();

    try {
      const result = await pool.query(
        `SELECT id, phone_number, first_name, last_name, email, opted_in, opted_in_at, created_at, updated_at
         FROM contacts
         WHERE tenant_id = $1 AND phone_number = $2`,
        [tenantId, normalizedPhone]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Contact not found');
      }

      const contact = result.rows[0];

      // Cache it
      await setInCache(cacheKey, contact, 3600);

      return contact;
    } catch (error) {
      logger.error('Failed to get contact', error);
      throw error;
    }
  }

  /**
   * List contacts for tenant
   */
  static async listContacts(
    tenantId: string,
    options: {
      opted_in?: boolean;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    contacts: ContactResponse[];
    total: number;
    page: number;
    limit: number;
  }> {
    const pool = getPool();
    const page = options.page || 1;
    const limit = Math.min(options.limit || 50, 500);
    const offset = (page - 1) * limit;

    try {
      let query = `SELECT id, phone_number, first_name, last_name, email, opted_in, opted_in_at, created_at, updated_at
                   FROM contacts
                   WHERE tenant_id = $1`;
      const params: any[] = [tenantId];

      if (options.opted_in !== undefined) {
        query += ` AND opted_in = $${params.length + 1}`;
        params.push(options.opted_in);
      }

      // Get total count
      const countResult = await pool.query(
        `SELECT COUNT(*) as count FROM contacts WHERE tenant_id = $1 ${
          options.opted_in !== undefined ? `AND opted_in = $2` : ''
        }`,
        options.opted_in !== undefined ? [tenantId, options.opted_in] : [tenantId]
      );

      const total = parseInt(countResult.rows[0].count);

      // Get paginated results
      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      return {
        contacts: result.rows,
        total,
        page,
        limit,
      };
    } catch (error) {
      logger.error('Failed to list contacts', error);
      throw error;
    }
  }

  /**
   * Opt out a contact
   */
  static async optOutContact(tenantId: string, phoneNumber: string): Promise<void> {
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    const pool = getPool();

    try {
      // Find contact
      const contactResult = await pool.query(
        `SELECT id FROM contacts WHERE tenant_id = $1 AND phone_number = $2`,
        [tenantId, normalizedPhone]
      );

      const contactId = contactResult.rows[0]?.id;

      // Update opted_in status
      await pool.query(
        `UPDATE contacts
         SET opted_in = false, opted_out_at = NOW()
         WHERE tenant_id = $1 AND phone_number = $2`,
        [tenantId, normalizedPhone]
      );

      // Log opt-out request for GDPR compliance
      const optOutId = uuidv4();
      await pool.query(
        `INSERT INTO opt_out_requests (id, tenant_id, contact_id, phone_number, processed, processed_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [optOutId, tenantId, contactId || null, normalizedPhone, true]
      );

      // Invalidate cache
      await ContactService.invalidateContactCache(tenantId, normalizedPhone);

      // Publish event
      await publishEvent('contact.opted_out', { phoneNumber: normalizedPhone, tenantId }, tenantId);

      logger.info(`Contact opted out: ${normalizedPhone} for tenant ${tenantId}`);
    } catch (error) {
      logger.error('Contact opt-out failed', error);
      throw error;
    }
  }

  /**
   * Opt in a contact
   */
  static async optInContact(tenantId: string, phoneNumber: string): Promise<void> {
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    const pool = getPool();

    try {
      // Update opted_in status
      await pool.query(
        `UPDATE contacts
         SET opted_in = true, opted_in_at = NOW()
         WHERE tenant_id = $1 AND phone_number = $2`,
        [tenantId, normalizedPhone]
      );

      // Invalidate cache
      await ContactService.invalidateContactCache(tenantId, normalizedPhone);

      // Publish event
      await publishEvent('contact.opted_in', { phoneNumber: normalizedPhone, tenantId }, tenantId);

      logger.info(`Contact opted in: ${normalizedPhone} for tenant ${tenantId}`);
    } catch (error) {
      logger.error('Contact opt-in failed', error);
      throw error;
    }
  }

  /**
   * Delete contact
   */
  static async deleteContact(tenantId: string, phoneNumber: string): Promise<void> {
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    const pool = getPool();

    try {
      await pool.query(
        `DELETE FROM contacts WHERE tenant_id = $1 AND phone_number = $2`,
        [tenantId, normalizedPhone]
      );

      // Invalidate cache
      await ContactService.invalidateContactCache(tenantId, normalizedPhone);

      logger.info(`Contact deleted: ${normalizedPhone} for tenant ${tenantId}`);
    } catch (error) {
      logger.error('Contact deletion failed', error);
      throw error;
    }
  }

  /**
   * Bulk import contacts from CSV
   */
  static async bulkImportContacts(
    tenantId: string,
    contacts: CreateContactRequest[]
  ): Promise<{
    imported: number;
    failed: number;
    errors: any[];
  }> {
    let imported = 0;
    let failed = 0;
    const errors: any[] = [];

    for (let i = 0; i < contacts.length; i++) {
      try {
        await ContactService.createOrUpdateContact(tenantId, contacts[i]);
        imported++;
      } catch (error) {
        failed++;
        errors.push({
          row: i + 1,
          contact: contacts[i],
          error: (error as any).message,
        });
      }
    }

    logger.info(
      `Bulk import completed: ${imported} imported, ${failed} failed for tenant ${tenantId}`
    );

    return { imported, failed, errors };
  }

  /**
   * Cache invalidation helper
   */
  private static async invalidateContactCache(tenantId: string, phoneNumber: string): Promise<void> {
    try {
      const cacheKey = `tenant:${tenantId}:contact:${phoneNumber}`;
      const redis = getRedisClient();
      await redis.del(cacheKey);
    } catch (error) {
      logger.error('Failed to invalidate contact cache', error);
    }
  }
}
