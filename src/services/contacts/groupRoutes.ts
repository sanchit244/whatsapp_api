import { Router, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { tenantMiddleware, AuthRequest } from '../../middleware/tenantMiddleware';
import { getPool } from '../../config/database';
import { createLogger } from '../../config/logger';
import { ValidationError, NotFoundError } from '../../middleware/errorHandler';

const router = Router();
const logger = createLogger('contact-groups');

/**
 * GET /api/v1/contacts/groups
 * List all contact groups for the tenant
 */
router.get(
  '/groups',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) throw new ValidationError('Missing tenant context');
      const pool = getPool();
      const result = await pool.query(
        `SELECT g.id, g.name, g.description, g.created_at,
                COUNT(gm.contact_id) as member_count
         FROM contact_groups g
         LEFT JOIN contact_group_members gm ON g.id = gm.group_id
         WHERE g.tenant_id = $1
         GROUP BY g.id, g.name, g.description, g.created_at
         ORDER BY g.created_at DESC`,
        [req.tenantId]
      );
      res.json({ success: true, groups: result.rows });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/contacts/groups
 * Create a new contact group
 */
router.post(
  '/groups',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) throw new ValidationError('Missing tenant context');
      const { name, description } = req.body;
      if (!name?.trim()) throw new ValidationError('Group name is required');

      const pool = getPool();
      const id = uuidv4();
      await pool.query(
        `INSERT INTO contact_groups (id, tenant_id, name, description, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [id, req.tenantId, name.trim(), description || null]
      );
      logger.info(`Created contact group "${name}" for tenant ${req.tenantId}`);
      res.status(201).json({ success: true, group: { id, name, description } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/v1/contacts/groups/:groupId
 * Delete a contact group
 */
router.delete(
  '/groups/:groupId',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) throw new ValidationError('Missing tenant context');
      const pool = getPool();
      const check = await pool.query(
        `SELECT id FROM contact_groups WHERE id = $1 AND tenant_id = $2`,
        [req.params.groupId, req.tenantId]
      );
      if (check.rows.length === 0) throw new NotFoundError('Group not found');
      await pool.query(`DELETE FROM contact_groups WHERE id = $1`, [req.params.groupId]);
      res.json({ success: true, message: 'Group deleted' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/contacts/groups/:groupId/members
 * List contacts in a group
 */
router.get(
  '/groups/:groupId/members',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) throw new ValidationError('Missing tenant context');
      const pool = getPool();
      const result = await pool.query(
        `SELECT c.id, c.phone_number, c.first_name, c.last_name, c.email, c.opted_in, c.created_at
         FROM contacts c
         INNER JOIN contact_group_members gm ON c.id = gm.contact_id
         INNER JOIN contact_groups g ON gm.group_id = g.id
         WHERE g.id = $1 AND g.tenant_id = $2
         ORDER BY c.created_at DESC`,
        [req.params.groupId, req.tenantId]
      );
      res.json({ success: true, contacts: result.rows });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/contacts/groups/:groupId/members
 * Add contacts to a group by phone numbers
 */
router.post(
  '/groups/:groupId/members',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) throw new ValidationError('Missing tenant context');
      const { phones } = req.body as { phones: string[] };
      if (!Array.isArray(phones) || phones.length === 0)
        throw new ValidationError('phones array is required');

      const pool = getPool();
      let added = 0;
      for (const phone of phones) {
        const clean = phone.replace(/\D/g, '');
        const contactRes = await pool.query(
          `SELECT id FROM contacts WHERE tenant_id = $1 AND phone_number = $2`,
          [req.tenantId, clean]
        );
        if (contactRes.rows.length > 0) {
          try {
            await pool.query(
              `INSERT INTO contact_group_members (id, group_id, contact_id, added_at)
               VALUES ($1, $2, $3, NOW())`,
              [uuidv4(), req.params.groupId, contactRes.rows[0].id]
            );
            added++;
          } catch {
            // ignore duplicate
          }
        }
      }
      res.json({ success: true, added });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/contacts/import/csv
 * Parse and import contacts from CSV text, optionally into a group
 */
router.post(
  '/import/csv',
  tenantMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) throw new ValidationError('Missing tenant context');
      const { csv_text, group_id } = req.body as { csv_text: string; group_id?: string };
      if (!csv_text?.trim()) throw new ValidationError('csv_text is required');

      const pool = getPool();
      const lines = csv_text.split('\n').map((l: string) => l.trim()).filter(Boolean);
      if (lines.length < 2) throw new ValidationError('CSV must have a header + at least one row');

      // Parse header to find column positions
      const headers = lines[0].split(',').map((h: string) => h.replace(/^"|"$/g, '').trim().toLowerCase());
      const phoneIdx = headers.findIndex((h: string) => h.includes('phone') || h === 'mobile' || h === 'number');
      if (phoneIdx === -1) throw new ValidationError('CSV must have a "phone" column');
      const firstIdx = headers.findIndex((h: string) => h.includes('first') || h === 'name');
      const lastIdx = headers.findIndex((h: string) => h.includes('last'));
      const emailIdx = headers.findIndex((h: string) => h.includes('email'));

      let imported = 0;
      let skipped = 0;
      const importedIds: string[] = [];

      for (const line of lines.slice(1)) {
        const cols = line.split(',').map((c: string) => c.replace(/^"|"$/g, '').trim());
        const phone = cols[phoneIdx]?.replace(/\D/g, '');
        if (!phone || phone.length < 7) { skipped++; continue; }

        const firstName = firstIdx >= 0 ? cols[firstIdx] || null : null;
        const lastName = lastIdx >= 0 ? cols[lastIdx] || null : null;
        const email = emailIdx >= 0 ? cols[emailIdx] || null : null;

        try {
          // Upsert contact
          const existing = await pool.query(
            `SELECT id FROM contacts WHERE tenant_id = $1 AND phone_number = $2`,
            [req.tenantId, phone]
          );
          let contactId: string;
          if (existing.rows.length > 0) {
            contactId = existing.rows[0].id;
            await pool.query(
              `UPDATE contacts SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name),
               email = COALESCE($3, email), updated_at = NOW() WHERE id = $4`,
              [firstName, lastName, email, contactId]
            );
          } else {
            contactId = uuidv4();
            await pool.query(
              `INSERT INTO contacts (id, tenant_id, phone_number, first_name, last_name, email, opted_in, opted_in_at, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW(), NOW(), NOW())`,
              [contactId, req.tenantId, phone, firstName, lastName, email]
            );
          }
          importedIds.push(contactId);
          imported++;
        } catch {
          skipped++;
        }
      }

      // Add imported contacts to group if specified
      if (group_id && importedIds.length > 0) {
        for (const cid of importedIds) {
          try {
            await pool.query(
              `INSERT INTO contact_group_members (id, group_id, contact_id, added_at)
               VALUES ($1, $2, $3, NOW())`,
              [uuidv4(), group_id, cid]
            );
          } catch { /* ignore duplicates */ }
        }
      }

      logger.info(`CSV import: ${imported} imported, ${skipped} skipped for tenant ${req.tenantId}`);
      res.json({ success: true, imported, skipped, total: lines.length - 1 });
    } catch (err) {
      next(err);
    }
  }
);

export { router as contactGroupRoutes };
