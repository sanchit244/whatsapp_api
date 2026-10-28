import mysql, { Pool, RowDataPacket } from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { createLogger } from './logger';

const logger = createLogger('database');

let pool: DatabasePool;
let mysqlPool: Pool;

type QueryResult = {
  rows: any[];
  rowCount?: number;
};

type DatabasePool = {
  query: (sql: string, values?: unknown[]) => Promise<QueryResult>;
  connect: () => Promise<DatabaseConnection>;
  end: () => Promise<void>;
};

type DatabaseConnection = {
  query: (sql: string, values?: unknown[]) => Promise<QueryResult>;
  release: () => void;
};

function toMySqlQuery(sql: string, values: unknown[] = []): { sql: string; values: unknown[] } {
  const translatedValues: unknown[] = [];
  const translatedSql = sql.replace(/\$(\d+)/g, (_match, index: string) => {
    translatedValues.push(values[Number(index) - 1]);
    return '?';
  });

  return {
    sql: translatedSql,
    values: translatedValues.length > 0 ? translatedValues : values,
  };
}

function toMySqlSchema(sql: string): string {
  return sql
    .replace(/CREATE EXTENSION[^;]+;?/gi, '')
    .replace(/CREATE INDEX IF NOT EXISTS/gi, 'CREATE INDEX')
    .replace(/UUID\s+PRIMARY KEY/gi, 'CHAR(36) PRIMARY KEY')
    .replace(/\bUUID\b/gi, 'CHAR(36)')
    .replace(/DEFAULT\s+gen_random_uuid\(\)/gi, '')
    .replace(/\bCITEXT\b/gi, 'VARCHAR(255)')
    .replace(/\bJSONB\b/gi, 'JSON')
    .replace(/\bINET\b/gi, 'VARCHAR(45)')
    .replace(/TEXT\[\]\s+DEFAULT\s+ARRAY\[\]::TEXT\[\]/gi, 'JSON')
    .replace(/TEXT\[\]/gi, 'JSON');
}

async function query(sql: string, values: unknown[] = []): Promise<QueryResult> {
  const returningMatch = sql.match(/\s+RETURNING\s+([\s\S]+?)\s*;?\s*$/i);
  const executableSql = returningMatch ? sql.slice(0, returningMatch.index) : sql;
  const translated = toMySqlQuery(executableSql, values);
  const [rows] = await mysqlPool.query(translated.sql, translated.values);

  if (returningMatch) {
    const tableMatch = executableSql.match(/\b(?:INSERT\s+INTO|UPDATE)\s+([a-z_]+)/i);
    if (tableMatch) {
      const table = tableMatch[1];
      const whereMatch = executableSql.match(/\bWHERE\s+([\s\S]+)$/i);
      const selector = whereMatch ? whereMatch[1] : 'id = $1';
      const selected = toMySqlQuery(
        `SELECT ${returningMatch[1]} FROM ${table} WHERE ${selector}`,
        values,
      );
      const [selectedRows] = await mysqlPool.query(selected.sql, selected.values);
      return { rows: Array.isArray(selectedRows) ? selectedRows as RowDataPacket[] : [] };
    }
  }

  return {
    rows: Array.isArray(rows) ? rows as RowDataPacket[] : [],
    rowCount: Array.isArray(rows) ? rows.length : 0,
  };
}

async function connect(): Promise<DatabaseConnection> {
  const connection = await mysqlPool.getConnection();
  return {
    query: async (sql: string, values: unknown[] = []) => {
      const translated = toMySqlQuery(sql, values);
      try {
        const [rows] = await connection.query(translated.sql, translated.values);
        return {
          rows: Array.isArray(rows) ? rows as RowDataPacket[] : [],
          rowCount: Array.isArray(rows) ? rows.length : 0,
        };
      } catch (err: any) {
        if (err && err.code === 'ER_DUP_KEYNAME') {
          return { rows: [], rowCount: 0 };
        }
        throw err;
      }
    },
    release: () => connection.release(),
  };
}

export async function initializeDatabase(): Promise<DatabasePool> {
  const isTiDB = (process.env.DB_HOST || '').includes('tidbcloud') || (process.env.DATABASE_URL || process.env.DB_URL || '').includes('tidbcloud');
  const useSSL = process.env.DB_SSL === 'true' || isTiDB;

  const connectionConfig: any = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Sanchit@8984',
    database: process.env.DB_NAME || 'whatsapp_db',
    multipleStatements: true,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ...(useSSL ? { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } } : {}),
  };

  try {
    mysqlPool = mysql.createPool(connectionConfig);
    pool = {
      query,
      connect,
      end: () => mysqlPool.end(),
    };

    // Test connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();

    logger.info('Database connection established');

    // Initialize schema
    await initializeSchema();

    return pool;
  } catch (error) {
    logger.error('Database initialization failed', error);
    throw error;
  }
}

export async function initializeSchema(): Promise<void> {
  const client = await pool.connect();

  try {
    // Tenants table
    await client.query(toMySqlSchema(`
      CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        status VARCHAR(50) DEFAULT 'active',
        plan VARCHAR(50) DEFAULT 'starter',
        monthly_quota INTEGER DEFAULT 10000,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
    `));

    // Users table
    await client.query(toMySqlSchema(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email CITEXT NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        mfa_enabled BOOLEAN DEFAULT FALSE,
        mfa_secret VARCHAR(255),
        last_login TIMESTAMP,
        is_admin BOOLEAN DEFAULT FALSE,
        status VARCHAR(50) DEFAULT 'pending',
        phone VARCHAR(50),
        notes TEXT,
        approved_at TIMESTAMP,
        approved_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `));

    // Tenant Users (Team Members)
    await client.query(toMySqlSchema(`
      CREATE TABLE IF NOT EXISTS tenant_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(100) DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(tenant_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON tenant_users(user_id);
    `));

    // Sessions table
    await client.query(toMySqlSchema(`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_jti VARCHAR(255) NOT NULL UNIQUE,
        user_agent VARCHAR(500),
        ip_address INET,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    `));

    // API Keys table
    await client.query(toMySqlSchema(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        key_hash VARCHAR(255) NOT NULL UNIQUE,
        last_used TIMESTAMP,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        rotated_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
    `));

    // Campaigns table
    await client.query(toMySqlSchema(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        created_by UUID NOT NULL REFERENCES users(id),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        template_id UUID,
        status VARCHAR(50) DEFAULT 'draft',
        scheduled_at TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        total_messages INTEGER DEFAULT 0,
        messages_sent INTEGER DEFAULT 0,
        messages_delivered INTEGER DEFAULT 0,
        messages_failed INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
      CREATE INDEX IF NOT EXISTS idx_campaigns_created ON campaigns(created_at);
    `));

    // Message Batches table
    await client.query(toMySqlSchema(`
      CREATE TABLE IF NOT EXISTS message_batches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        batch_number INTEGER NOT NULL,
        total_messages INTEGER NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        error_message TEXT,
        UNIQUE(campaign_id, batch_number)
      );
      CREATE INDEX IF NOT EXISTS idx_batches_tenant_status ON message_batches(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_batches_campaign ON message_batches(campaign_id);
    `));

    // Messages table (partitioned by date for performance)
    await client.query(toMySqlSchema(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        campaign_id UUID NOT NULL REFERENCES campaigns(id),
        batch_id UUID REFERENCES message_batches(id),
        phone_number VARCHAR(20) NOT NULL,
        template_id UUID,
        status VARCHAR(50) DEFAULT 'pending',
        meta_message_id VARCHAR(255),
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        sent_at TIMESTAMP,
        delivered_at TIMESTAMP,
        read_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_messages_campaign ON messages(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
      CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone_number);
    `));

    // Contacts table
    await client.query(toMySqlSchema(`
      CREATE TABLE IF NOT EXISTS contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        phone_number VARCHAR(20) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        email CITEXT,
        opted_in BOOLEAN DEFAULT TRUE,
        opted_in_at TIMESTAMP,
        opted_out_at TIMESTAMP,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(tenant_id, phone_number)
      );
      CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number);
      CREATE INDEX IF NOT EXISTS idx_contacts_opted_in ON contacts(opted_in);
    `));

    // Templates table
    await client.query(toMySqlSchema(`
      CREATE TABLE IF NOT EXISTS templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        created_by UUID NOT NULL REFERENCES users(id),
        name VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending_approval',
        meta_template_id VARCHAR(255),
        approval_status VARCHAR(50),
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_templates_tenant ON templates(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_templates_status ON templates(status);
    `));

    // Compliance Opt-Out Requests
    await client.query(toMySqlSchema(`
      CREATE TABLE IF NOT EXISTS opt_out_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        contact_id UUID REFERENCES contacts(id),
        phone_number VARCHAR(20) NOT NULL,
        reason TEXT,
        processed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        processed_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_opt_outs_tenant ON opt_out_requests(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_opt_outs_phone ON opt_out_requests(phone_number);
    `));

    // Audit Logs
    await client.query(toMySqlSchema(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID REFERENCES tenants(id),
        user_id UUID REFERENCES users(id),
        action VARCHAR(255) NOT NULL,
        resource_type VARCHAR(100),
        resource_id UUID,
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
    `));

    // Campaign Analytics (pre-calculated)
    await client.query(toMySqlSchema(`
      CREATE TABLE IF NOT EXISTS campaign_analytics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        total_sent INTEGER DEFAULT 0,
        total_delivered INTEGER DEFAULT 0,
        total_failed INTEGER DEFAULT 0,
        delivery_rate NUMERIC(5, 2) DEFAULT 0,
        avg_delivery_time INTEGER,
        last_updated TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_analytics_campaign ON campaign_analytics(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_analytics_tenant ON campaign_analytics(tenant_id);
    `));

    // Usage Metrics (for billing)
    await client.query(toMySqlSchema(`
      CREATE TABLE IF NOT EXISTS usage_metrics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        period_date DATE NOT NULL,
        messages_sent INTEGER DEFAULT 0,
        api_calls INTEGER DEFAULT 0,
        storage_bytes BIGINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(tenant_id, period_date)
      );
      CREATE INDEX IF NOT EXISTS idx_usage_metrics_tenant ON usage_metrics(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_usage_metrics_period ON usage_metrics(period_date);
    `));

    // Webhooks Configuration
    await client.query(toMySqlSchema(`
      CREATE TABLE IF NOT EXISTS webhooks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        url VARCHAR(500) NOT NULL,
        events TEXT[] DEFAULT ARRAY[]::TEXT[],
        is_active BOOLEAN DEFAULT TRUE,
        secret_key VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON webhooks(tenant_id);
    `));

    // Webhook Events Log
    await client.query(toMySqlSchema(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        attempts INTEGER DEFAULT 0,
        last_attempted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_webhook_events_webhook ON webhook_events(webhook_id);
      CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);
    `));

    // Contact Groups
    await client.query(toMySqlSchema(`
      CREATE TABLE IF NOT EXISTS contact_groups (
        id CHAR(36) PRIMARY KEY,
        tenant_id CHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_contact_groups_tenant ON contact_groups(tenant_id);
    `));

    // Contact Group Members (join table)
    await client.query(toMySqlSchema(`
      CREATE TABLE IF NOT EXISTS contact_group_members (
        id CHAR(36) PRIMARY KEY,
        group_id CHAR(36) NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
        contact_id CHAR(36) NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        added_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(group_id, contact_id)
      );
      CREATE INDEX IF NOT EXISTS idx_group_members_group ON contact_group_members(group_id);
    `));

    // Inbox Messages (incoming WhatsApp replies)
    await client.query(toMySqlSchema(`
      CREATE TABLE IF NOT EXISTS inbox_messages (
        id CHAR(36) PRIMARY KEY,
        tenant_id CHAR(36) REFERENCES tenants(id) ON DELETE CASCADE,
        from_number VARCHAR(30) NOT NULL,
        display_name VARCHAR(255),
        message_type VARCHAR(50) DEFAULT 'text',
        body TEXT,
        media_url TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        received_at TIMESTAMP DEFAULT NOW(),
        whatsapp_message_id VARCHAR(255)
      );
      CREATE INDEX IF NOT EXISTS idx_inbox_tenant ON inbox_messages(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_inbox_read ON inbox_messages(is_read);
      CREATE INDEX IF NOT EXISTS idx_inbox_received ON inbox_messages(received_at);
    `));

    // Payment Transactions table (Stripe checkouts & top-ups)
    await client.query(toMySqlSchema(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id CHAR(36) PRIMARY KEY,
        tenant_id CHAR(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        stripe_session_id VARCHAR(255),
        stripe_payment_intent_id VARCHAR(255),
        amount_cents INT NOT NULL,
        currency VARCHAR(10) DEFAULT 'usd',
        payment_type VARCHAR(50) NOT NULL,
        plan VARCHAR(50),
        credits_added INT DEFAULT 0,
        status VARCHAR(50) DEFAULT 'pending',
        customer_email VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_payment_tenant ON payment_transactions(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_payment_session ON payment_transactions(stripe_session_id);
    `));

    // Global Blacklist / Do-Not-Call (DNC) Registry
    await client.query(toMySqlSchema(`
      CREATE TABLE IF NOT EXISTS global_blacklist (
        id CHAR(36) PRIMARY KEY,
        phone_number VARCHAR(30) NOT NULL UNIQUE,
        reason VARCHAR(255) DEFAULT 'User requested opt-out',
        source VARCHAR(50) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_blacklist_phone ON global_blacklist(phone_number);
    `));

    // System Settings table (Platform-level Meta API configuration, etc.)
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        setting_key VARCHAR(100) PRIMARY KEY,
        setting_value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Safe Column Migrations for WhatsApp Meta BYOK and Media support
    const migrations = [
      "ALTER TABLE tenants ADD COLUMN whatsapp_token TEXT",
      "ALTER TABLE tenants ADD COLUMN whatsapp_phone_number_id VARCHAR(100)",
      "ALTER TABLE tenants ADD COLUMN whatsapp_business_account_id VARCHAR(100)",
      "ALTER TABLE tenants ADD COLUMN use_custom_whatsapp BOOLEAN DEFAULT FALSE",
      "ALTER TABLE campaigns ADD COLUMN message_body TEXT",
      "ALTER TABLE campaigns ADD COLUMN media_url TEXT",
      "ALTER TABLE campaigns ADD COLUMN media_type VARCHAR(50)",
      "ALTER TABLE campaigns ADD COLUMN dispatch_payload LONGTEXT",
      "ALTER TABLE campaigns ADD COLUMN recipients_data LONGTEXT",
      "ALTER TABLE messages ADD COLUMN meta_message_id VARCHAR(255)",
      "ALTER TABLE messages ADD COLUMN error_message TEXT",
      "ALTER TABLE messages ADD COLUMN media_url TEXT",
      "ALTER TABLE messages ADD COLUMN media_type VARCHAR(50)",
      "ALTER TABLE users ADD COLUMN status VARCHAR(50) DEFAULT 'pending'",
      "ALTER TABLE users ADD COLUMN phone VARCHAR(50)",
      "ALTER TABLE users ADD COLUMN notes TEXT",
      "ALTER TABLE users ADD COLUMN approved_at TIMESTAMP NULL",
      "ALTER TABLE users ADD COLUMN approved_by VARCHAR(255) NULL",
      "UPDATE users SET status = 'active' WHERE is_admin = true",
      "UPDATE tenants SET status = 'active' WHERE id = 't0000000-0000-0000-0000-000000000001'",
    ];

    for (const sql of migrations) {
      try {
        await client.query(sql);
      } catch {
        // Ignore duplicate column errors if column already exists
      }
    }

    // Auto-seed default administrator user if not existing
    try {
      const adminCheck = await client.query("SELECT id FROM users WHERE email = 'test@example.com'");
      if (adminCheck.rows.length === 0) {
        const adminId = 'a0000000-0000-0000-0000-000000000001';
        const tenantId = 't0000000-0000-0000-0000-000000000001';
        const hash = await bcrypt.hash('SecurePassword123!', 12);

        await client.query(
          `INSERT INTO tenants (id, name, slug, status, plan, monthly_quota)
           VALUES ($1, 'Master Organization', 'master-org', 'active', 'enterprise', 1000000)`,
          [tenantId]
        );

        await client.query(
          `INSERT INTO users (id, email, password_hash, first_name, last_name, is_admin)
           VALUES ($1, 'test@example.com', $2, 'Admin', 'User', true)`,
          [adminId, hash]
        );

        await client.query(
          `INSERT INTO tenant_users (id, tenant_id, user_id, role)
           VALUES ('tu000000-0000-0000-0000-000000000001', $1, $2, 'owner')`,
          [tenantId, adminId]
        );

        logger.info('Default admin account test@example.com seeded successfully');
      }
    } catch (seedErr: any) {
      logger.warn(`Admin seed check note: ${seedErr.message}`);
    }

    logger.info('Database schema initialized successfully');
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_KEYNAME') {
      logger.warn('Database schema already contains one or more indexes; continuing startup');
    } else {
      logger.error('Failed to initialize database schema', error);
      throw error;
    }
  } finally {
    client.release();
  }
}

export function getPool(): DatabasePool {
  if (!pool) {
    throw new Error('Database pool not initialized');
  }
  return pool;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    logger.info('Database connection closed');
  }
}
