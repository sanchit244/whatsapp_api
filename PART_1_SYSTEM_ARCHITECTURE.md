# Part 1: System Architecture
## WhatsApp Bulk Messaging Platform - B2B SaaS

**Document Version:** 1.0  
**Date:** September 6, 2026  
**Status:** Architecture Design Document  
**Scope:** Complete system architecture design for a production-grade WhatsApp bulk messaging platform

---

## 1.1 High-Level Architecture Overview

The platform is designed with a distributed, microservices-based architecture supporting multiple layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CDN/Edge Layer (Cloudflare)                  │
│              Global content delivery with DDoS protection       │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│              API Gateway (Kong/AWS API Gateway)                 │
│            Load balancing, rate limiting, auth                 │
└──────────────────────────────┬──────────────────────────────────┘
                               │
      ┌────────────────────────┼────────────────────────┐
      │                        │                        │
┌─────▼──────┐         ┌──────▼───────┐        ┌──────▼──────┐
│   Admin    │         │   Customer   │        │  WebSocket  │
│ Dashboard  │         │  Dashboard   │        │   Gateway   │
│  (React)   │         │  (Next.js)   │        │ (Real-time) │
└────────────┘         └──────────────┘        └─────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Microservices Layer                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Auth Service │  │   Campaign   │  │   Delivery   │         │
│  │              │  │   Service    │  │   Service    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │    User      │  │   Template   │  │  Analytics   │         │
│  │  Management  │  │   Service    │  │   Service    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Compliance   │  │   Billing    │  │   Webhook    │         │
│  │   Service    │  │   Service    │  │   Service    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Data Layer                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────┐    ┌──────────────────────┐         │
│  │    PostgreSQL 15+    │    │    Redis 7+ Cluster  │         │
│  │  (Primary + Replicas)│    │  (Sessions & Caching)│         │
│  │   RLS Enabled        │    │                      │         │
│  └──────────────────────┘    └──────────────────────┘         │
│                                                                 │
│  ┌──────────────────────┐    ┌──────────────────────┐         │
│  │  RabbitMQ / Kafka    │    │       S3 Storage     │         │
│  │  (Message Queue)     │    │  (Archives & Backups)│         │
│  └──────────────────────┘    └──────────────────────┘         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              External Services & Integrations                   │
├─────────────────────────────────────────────────────────────────┤
│  Meta WhatsApp API │ Stripe/Razorpay │ SendGrid │ Segment  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1.2 Architecture Layers Explained

### Layer 1: CDN/Edge Layer
**Purpose:** Global content delivery and DDoS protection

- **Technology:** Cloudflare
- **Responsibilities:**
  - Cache static assets (JS, CSS, images)
  - DDoS mitigation and WAF rules
  - Global edge network for low latency
  - SSL/TLS termination
  - Geo-routing

**Configuration Example:**
```yaml
cloudflare:
  zones:
    - domain: api.whatsapp-bulk.com
      plan: Enterprise
      security:
        ddos: enabled
        waf: enabled
        rate_limiting: 1000_rps
```

---

### Layer 2: API Gateway
**Purpose:** Single entry point for all client requests

- **Technology Options:** Kong, AWS API Gateway, Nginx
- **Responsibilities:**
  - Request routing to microservices
  - Rate limiting per tenant/user
  - Authentication token validation
  - Request/response logging
  - Load balancing across service instances

**Kong Configuration:**
```yaml
api_gateway:
  listeners:
    - port: 443
      protocol: https
      ssl: enabled
  plugins:
    rate_limiting:
      minute: 100
      second: 10
    authentication:
      type: jwt
      key_claim_name: kid
    logging:
      type: syslog
      level: info
```

---

### Layer 3: Frontend Layer

#### 3.1 Admin Dashboard (React 18 + TypeScript)
**Purpose:** Platform administration and tenant management

**Key Features:**
- Tenant lifecycle management
- Template approval workflow
- Global analytics dashboard
- Compliance monitoring
- Billing management
- Security audit logs

**Technology Stack:**
```json
{
  "framework": "React 18",
  "language": "TypeScript",
  "state_management": "Redux Toolkit",
  "styling": "Tailwind CSS",
  "build_tool": "Vite",
  "testing": "Vitest + React Testing Library",
  "real_time": "Socket.io"
}
```

#### 3.2 Customer Dashboard (Next.js 14)
**Purpose:** Customer self-service for campaigns and analytics

**Key Features:**
- Campaign creation and management
- Contact list management
- Real-time analytics dashboard
- Template library
- API key management
- Webhook configuration

**Technology Stack:**
```json
{
  "framework": "Next.js 14",
  "language": "TypeScript",
  "styling": "Tailwind CSS + shadcn/ui",
  "state_management": "Zustand",
  "real_time": "Socket.io",
  "data_fetching": "TanStack Query",
  "testing": "Jest + React Testing Library"
}
```

#### 3.3 WebSocket Gateway
**Purpose:** Real-time bidirectional communication

**Technology:** Socket.io + Node.js

**Features:**
- Live campaign progress updates
- Real-time analytics streaming
- Message delivery status notifications
- Admin alerts for system events

---

### Layer 4: Microservices Layer

#### 4.1 Auth Service
**Purpose:** Authentication, authorization, and session management

**Responsibilities:**
- User registration and login
- JWT token generation and validation
- Multi-factor authentication (TOTP/SMS)
- API key management and rotation
- OAuth2 integration (optional)
- Session management

**Architecture:**
```
┌──────────────────────────────────────────────┐
│            Auth Service                      │
├──────────────────────────────────────────────┤
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │    Authentication Controller           │ │
│  │  - POST /auth/register                 │ │
│  │  - POST /auth/login                    │ │
│  │  - POST /auth/refresh                  │ │
│  │  - POST /auth/logout                   │ │
│  │  - POST /auth/verify-mfa               │ │
│  └────────────────────────────────────────┘ │
│                    │                         │
│  ┌─────────────────▼──────────────────────┐ │
│  │    JWT Token Manager                   │ │
│  │  - Generate access tokens (1hr)        │ │
│  │  - Generate refresh tokens (30d)       │ │
│  │  - Validate and revoke tokens          │ │
│  └─────────────────────────────────────────┘ │
│                    │                         │
│  ┌─────────────────▼──────────────────────┐ │
│  │    MFA Provider (TOTP/SMS)             │ │
│  │  - Generate TOTP secrets               │ │
│  │  - Verify TOTP codes                   │ │
│  │  - Send SMS codes                      │ │
│  └─────────────────────────────────────────┘ │
│                    │                         │
│  ┌─────────────────▼──────────────────────┐ │
│  │    Database (PostgreSQL)               │ │
│  │  - users table                         │ │
│  │  - sessions table                      │ │
│  │  - api_keys table                      │ │
│  │  - mfa_secrets table                   │ │
│  └─────────────────────────────────────────┘ │
│                                              │
└──────────────────────────────────────────────┘
```

**Key Endpoints:**
```typescript
// Authentication
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
POST   /api/v1/auth/verify-mfa

// API Keys
GET    /api/v1/auth/api-keys
POST   /api/v1/auth/api-keys
DELETE /api/v1/auth/api-keys/{keyId}
POST   /api/v1/auth/api-keys/{keyId}/rotate
```

**Database Schema:**
```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret VARCHAR(255),
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP
);

-- API Keys table
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    last_used TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    rotated_at TIMESTAMP
);

-- Sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    token_jti VARCHAR(255) NOT NULL UNIQUE,
    user_agent VARCHAR(500),
    ip_address INET,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

#### 4.2 User Management Service
**Purpose:** Tenant and team member management

**Responsibilities:**
- Tenant creation and configuration
- Team member management
- Role-based access control (RBAC)
- Permission assignment
- Quota management

**Architecture:**
```
┌──────────────────────────────────────────────┐
│         User Management Service              │
├──────────────────────────────────────────────┤
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │   Tenant Controller                    │ │
│  │  - POST /tenants (admin only)          │ │
│  │  - GET /tenants/{id}                   │ │
│  │  - PUT /tenants/{id}                   │ │
│  │  - DELETE /tenants/{id}                │ │
│  └────────────────────────────────────────┘ │
│                    │                         │
│  ┌─────────────────▼──────────────────────┐ │
│  │   Team Members Controller              │ │
│  │  - GET /tenants/{id}/members           │ │
│  │  - POST /tenants/{id}/members          │ │
│  │  - PUT /tenants/{id}/members/{uid}     │ │
│  │  - DELETE /tenants/{id}/members/{uid}  │ │
│  └─────────────────────────────────────────┘ │
│                    │                         │
│  ┌─────────────────▼──────────────────────┐ │
│  │   Roles & Permissions Manager          │ │
│  │  - Define platform roles               │ │
│  │  - Assign permissions to roles         │ │
│  │  - Check user permissions              │ │
│  └─────────────────────────────────────────┘ │
│                    │                         │
│  ┌─────────────────▼──────────────────────┐ │
│  │    Database (PostgreSQL)               │ │
│  │  - tenants table                       │ │
│  │  - tenant_users table                  │ │
│  │  - roles table                         │ │
│  │  - permissions table                   │ │
│  └─────────────────────────────────────────┘ │
│                                              │
└──────────────────────────────────────────────┘
```

**Database Schema:**
```sql
-- Tenants table
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) DEFAULT 'active',
    plan VARCHAR(50) DEFAULT 'starter',
    monthly_quota INTEGER DEFAULT 10000,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tenant Users (Team Members)
CREATE TABLE tenant_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id),
    joined_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
);

-- Roles
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Predefined roles
INSERT INTO roles (name, description) VALUES
('admin', 'Platform administrator with full access'),
('tenant_owner', 'Tenant account owner'),
('tenant_admin', 'Tenant administrator'),
('campaign_manager', 'Can create and manage campaigns'),
('viewer', 'Read-only access to analytics');

-- Permissions
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    resource VARCHAR(100),
    action VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Role Permissions (Many-to-Many)
CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);
```

**RBAC Matrix:**
```
┌──────────────────┬─────────────────────────────────────────────┐
│ Role             │ Permissions                                 │
├──────────────────┼─────────────────────────────────────────────┤
│ Platform Admin   │ * (all permissions)                         │
│ Tenant Owner     │ Full access to own tenant                   │
│ Tenant Admin     │ Manage campaigns, templates, team members   │
│ Campaign Manager │ Create/edit campaigns, view analytics       │
│ Viewer           │ Read-only access to dashboards/analytics    │
└──────────────────┴─────────────────────────────────────────────┘
```

---

#### 4.3 Campaign Service
**Purpose:** Campaign lifecycle management

**Responsibilities:**
- Campaign creation and configuration
- Campaign scheduling
- Target audience management
- Campaign status tracking
- Campaign archival and cleanup

**Architecture:**
```
┌──────────────────────────────────────────────┐
│           Campaign Service                   │
├──────────────────────────────────────────────┤
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │   Campaign Controller                  │ │
│  │  - POST /campaigns                     │ │
│  │  - GET /campaigns                      │ │
│  │  - GET /campaigns/{id}                 │ │
│  │  - PUT /campaigns/{id}                 │ │
│  │  - DELETE /campaigns/{id}              │ │
│  │  - POST /campaigns/{id}/start          │ │
│  │  - POST /campaigns/{id}/pause          │ │
│  │  - POST /campaigns/{id}/cancel         │ │
│  └────────────────────────────────────────┘ │
│                    │                         │
│  ┌─────────────────▼──────────────────────┐ │
│  │   Campaign Orchestrator                │ │
│  │  - Create message batches              │ │
│  │  - Enqueue batch jobs                  │ │
│  │  - Handle scheduled campaigns          │ │
│  │  - Track campaign progress             │ │
│  └─────────────────────────────────────────┘ │
│                    │                         │
│  ┌─────────────────▼──────────────────────┐ │
│  │   Database + Redis Cache               │ │
│  │  - campaigns table                     │ │
│  │  - campaign_audiences table            │ │
│  │  - Redis keys for progress tracking    │ │
│  └─────────────────────────────────────────┘ │
│                                              │
└──────────────────────────────────────────────┘
```

**Campaign State Machine:**
```
┌────────┐
│ DRAFT  │
└───┬────┘
    │ (save)
    ▼
┌────────┐
│ READY  │
└───┬────┘
    │ (start/schedule)
    ▼
┌────────┐
│ ACTIVE │◄──────┐
└───┬────┘       │ (resume)
    │ (pause)    │
    ▼            │
┌────────┐       │
│PAUSED  ├───────┘
└───┬────┘
    │ (cancel)
    ▼
┌──────────┐
│ CANCELLED│
└──────────┘
    or (complete)
┌──────────┐
│ COMPLETED│
└──────────┘
```

**Key Endpoints:**
```typescript
POST   /api/v1/campaigns
GET    /api/v1/campaigns
GET    /api/v1/campaigns/{id}
PUT    /api/v1/campaigns/{id}
DELETE /api/v1/campaigns/{id}
POST   /api/v1/campaigns/{id}/start
POST   /api/v1/campaigns/{id}/pause
POST   /api/v1/campaigns/{id}/resume
POST   /api/v1/campaigns/{id}/cancel
GET    /api/v1/campaigns/{id}/analytics
GET    /api/v1/campaigns/{id}/messages
```

---

#### 4.4 Message Queue Service
**Purpose:** Batch processing orchestration

**Responsibilities:**
- Split campaigns into message batches
- Enqueue batches for delivery
- Track batch processing status
- Handle retry logic
- Rate limiting enforcement

**Architecture:**
```
┌──────────────────────────────────────────────┐
│        Message Queue Service                 │
├──────────────────────────────────────────────┤
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │   Batch Processor                      │ │
│  │  - Split campaign into 1k msg batches  │ │
│  │  - Create batch job records            │ │
│  │  - Enqueue to Bull Queue               │ │
│  └────────────────────────────────────────┘ │
│                    │                         │
│  ┌─────────────────▼──────────────────────┐ │
│  │   Queue Manager                        │ │
│  │  - Enqueue jobs by priority            │ │
│  │  - Track job status                    │ │
│  │  - Handle job failure/retry            │ │
│  │  - Monitor queue depth                 │ │
│  └─────────────────────────────────────────┘ │
│                    │                         │
│  ┌─────────────────▼──────────────────────┐ │
│  │   Rate Limiter                         │ │
│  │  - Enforce per-tenant limits           │ │
│  │  - Meta API rate limits (60 msg/sec)   │ │
│  │  - Token bucket algorithm              │ │
│  └─────────────────────────────────────────┘ │
│                    │                         │
│  ┌─────────────────▼──────────────────────┐ │
│  │   Redis + PostgreSQL                   │ │
│  │  - Queue state in Redis                │ │
│  │  - Job records in PostgreSQL           │ │
│  │  - Rate limit tokens in Redis          │ │
│  └─────────────────────────────────────────┘ │
│                                              │
└──────────────────────────────────────────────┘
```

**Message Batching Logic:**
```
Campaign with 250k messages
          │
          ├─ Batch 1: messages 1-1000
          ├─ Batch 2: messages 1001-2000
          ├─ Batch 3: messages 2001-3000
          ... 
          └─ Batch 250: messages 249001-250000

Each batch:
  ├─ Add to HIGH/NORMAL/LOW priority queue (based on campaign type)
  ├─ Store in PostgreSQL (batch_id, status, created_at)
  ├─ Store in Redis for quick status lookup
  └─ Listen for completion webhook

Queue processing:
  Worker 1 ──┐
  Worker 2 ──┼──> Bull Queue ──> Process ──> Meta API
  Worker 3 ──┤                   (rate limit)
  Worker 4 ──┘
```

**Database Schema:**
```sql
CREATE TABLE message_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    batch_number INTEGER NOT NULL,
    total_messages INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    UNIQUE(campaign_id, batch_number)
);

CREATE INDEX idx_batches_tenant_status ON message_batches(tenant_id, status);
CREATE INDEX idx_batches_campaign ON message_batches(campaign_id);
```

---

#### 4.5 Delivery Service
**Purpose:** Message transmission via Meta API

**Responsibilities:**
- Submit messages to WhatsApp Cloud API
- Handle API responses
- Manage retries on failure
- Parse delivery status callbacks
- Update message status in database

**Architecture:**
```
┌──────────────────────────────────────────────┐
│          Delivery Service (Workers)          │
├──────────────────────────────────────────────┤
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │   Message Processor                    │ │
│  │  - Fetch batch from queue              │ │
│  │  - Load messages from DB               │ │
│  │  - Prepare payload for Meta API        │ │
│  │  - Submit to WhatsApp Cloud API        │ │
│  └────────────────────────────────────────┘ │
│                    │                         │
│  ┌─────────────────▼──────────────────────┐ │
│  │   Rate Limiter (Token Bucket)          │ │
│  │  - Allow 60 msg/sec per tenant         │ │
│  │  - Exponential backoff on 429          │ │
│  │  - Track usage per tenant              │ │
│  └─────────────────────────────────────────┘ │
│                    │                         │
│  ┌─────────────────▼──────────────────────┐ │
│  │   Response Handler                     │ │
│  │  - Parse Meta API response             │ │
│  │  - Handle success (200, 201)           │ │
│  │  - Handle errors (4xx, 5xx)            │ │
│  │  - Update message status               │ │
│  │  - Emit events for webhooks            │ │
│  └─────────────────────────────────────────┘ │
│                    │                         │
│  ┌─────────────────▼──────────────────────┐ │
│  │   Retry Manager                        │ │
│  │  - 5s, 30s, 5m, 30m, 24h delays       │ │
│  │  - Max 5 retries                       │ │
│  │  - Dead letter queue for failed msgs   │ │
│  └─────────────────────────────────────────┘ │
│                    │                         │
│  ┌─────────────────▼──────────────────────┐ │
│  │   External Integration                 │ │
│  │  - Meta WhatsApp Cloud API             │ │
│  │  - Event Publisher (for webhooks)      │ │
│  │  - Database (PostgreSQL)               │ │
│  └─────────────────────────────────────────┘ │
│                                              │
└──────────────────────────────────────────────┘
```

**Delivery Flow:**
```
Batch from Queue
       │
       ▼
Load Messages ──> Check Opt-in Status ──> Prepare Payload
       │                                        │
       └────────────────────┬───────────────────┘
                            │
                            ▼
                    Rate Limit Check
                    │              │
              (allowed)       (blocked)
                    │              │
                    ▼              ▼
            Call Meta API    Wait/Retry
                    │
                    ├─────────────┬─────────────┐
                    │             │             │
                   Success       4xx           5xx
                    │             │             │
                    ▼             ▼             ▼
            Update Status   Check Error    Retry with
            Mark Sent                      Backoff
```

---

#### 4.6 Analytics Service
**Purpose:** Real-time metrics and reporting

**Responsibilities:**
- Aggregate message statistics
- Calculate campaign metrics
- Generate reports
- Provide real-time dashboard data
- Track performance trends

**Architecture:**
```
┌──────────────────────────────────────────────┐
│         Analytics Service                    │
├──────────────────────────────────────────────┤
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │   Event Aggregator                     │ │
│  │  - Subscribe to message events         │ │
│  │  - Aggregate stats in real-time        │ │
│  │  - Update pre-calculated metrics       │ │
│  └────────────────────────────────────────┘ │
│                    │                         │
│  ┌─────────────────▼──────────────────────┐ │
│  │   Reporting Engine                     │ │
│  │  - Campaign summary reports            │ │
│  │  - Engagement metrics                  │ │
│  │  - Conversion tracking                 │ │
│  │  - Export to CSV/PDF                   │ │
│  └─────────────────────────────────────────┘ │
│                    │                         │
│  ┌─────────────────▼──────────────────────┐ │
│  │   Dashboard API                        │ │
│  │  - GET /campaigns/{id}/stats           │ │
│  │  - GET /campaigns/{id}/breakdown       │ │
│  │  - GET /dashboard/summary              │ │
│  └─────────────────────────────────────────┘ │
│                    │                         │
│  ┌─────────────────▼──────────────────────┐ │
│  │   Data Sources                         │ │
│  │  - Message status events               │ │
│  │  - Webhook callbacks                   │ │
│  │  - Database queries                    │ │
│  │  - Redis cache layer                   │ │
│  └─────────────────────────────────────────┘ │
│                                              │
└──────────────────────────────────────────────┘
```

**Key Metrics Tracked:**
```
Per Campaign:
  - Total messages
  - Messages sent
  - Messages delivered
  - Messages failed
  - Messages pending
  - Delivery rate (%)
  - Average send time
  - Peak send rate

Per Tenant:
  - Messages this month
  - Messages this year
  - Monthly trend
  - Top campaigns
  - Engagement rate
  - Cost/message
```

---

#### 4.7 Template Service
**Purpose:** Template management and approval workflow

**Responsibilities:**
- Store WhatsApp message templates
- Template approval workflow
- Sync with Meta template library
- Template versioning
- Template usage tracking

---

#### 4.8 Compliance Service
**Purpose:** GDPR compliance and opt-in/out management

**Responsibilities:**
- Track user consent (opt-in)
- Process opt-out requests (GDPR)
- Maintain audit logs
- Generate compliance reports
- Enforce GDPR data rights (access, deletion, portability)

---

#### 4.9 Billing Service
**Purpose:** Usage tracking and invoicing

**Responsibilities:**
- Track monthly usage per tenant
- Calculate overage charges
- Generate invoices
- Process payments (Stripe/Razorpay)
- Manage subscription billing

---

## 1.3 Multi-Tenancy Implementation

Data isolation is enforced at multiple layers:

### Database Level: PostgreSQL Row-Level Security (RLS)

```sql
-- Enable RLS on all relevant tables
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- Create policy: users can only see their tenant's campaigns
CREATE POLICY campaign_isolation ON campaigns
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Create policy: users can only see their tenant's messages
CREATE POLICY message_isolation ON messages
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Set tenant context for each request
SET app.current_tenant_id = '550e8400-e29b-41d4-a716-446655440000';
```

### Application Level: Middleware

```typescript
// Express middleware to enforce tenant isolation
export const tenantMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const tenantId = decoded.tenant_id;
    
    // Store in request context
    req.tenantId = tenantId;
    req.userId = decoded.sub;
    
    // Set in PostgreSQL session
    req.db.query('SET app.current_tenant_id = $1', [tenantId]);
    
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Automatic tenant_id injection in queries
export const queryWithTenant = (db, tenantId) => {
  return {
    query: (text, params) => {
      // Always filter by tenant_id
      const modifiedText = text.includes('WHERE')
        ? text.replace('WHERE', `WHERE tenant_id = $${params.length + 1} AND`)
        : text + ` WHERE tenant_id = $${params.length + 1}`;
      
      return db.query(modifiedText, [...params, tenantId]);
    }
  };
};
```

### Cache Level: Redis Key Namespacing

```typescript
export const getCacheKey = (tenantId: string, resource: string, id: string) => {
  return `tenant:${tenantId}:${resource}:${id}`;
};

// Usage
const campaignKey = getCacheKey(tenantId, 'campaign', campaignId);
await redis.set(campaignKey, JSON.stringify(campaign), 'EX', 3600);
const cached = await redis.get(campaignKey);
```

### Queue Level: Job Message Tagging

```typescript
// Enqueue job with tenant context
const job = await queue.add(
  'process-batch',
  {
    batchId: batchId,
    messages: messageData
  },
  {
    jobId: `batch:${tenantId}:${batchId}`,
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  }
);

// Worker processes and maintains tenant context
const processor = queue.process(async (job) => {
  const { batchId, messages } = job.data;
  const tenantId = job.id.split(':')[1]; // Extract from job ID
  
  // All database operations filter by tenantId
  const batch = await db.query(
    'SELECT * FROM message_batches WHERE id = $1 AND tenant_id = $2',
    [batchId, tenantId]
  );
  
  return { processed: messages.length };
});
```

---

## 1.4 Microservices Communication

### Synchronous Communication (REST/gRPC)

```
Campaign Service → Template Service (validate template)
Campaign Service → Delivery Service (get delivery status)
Analytics Service → Campaign Service (get campaign data)
```

### Asynchronous Communication (Events/Message Broker)

```
Message Events (via RabbitMQ/Kafka):
  - campaign.created
  - campaign.started
  - campaign.completed
  - message.sent
  - message.delivered
  - message.failed
  - message.opened
  - contact.opted_out

Subscribers:
  - Analytics Service → Updates metrics
  - Compliance Service → Tracks opt-outs
  - Webhook Service → Notifies customers
  - Billing Service → Tracks usage
```

**Event Bus Implementation:**

```typescript
// Event Publisher
export class EventBus {
  constructor(private channel: amqp.Channel) {}
  
  async publish(eventType: string, data: any, tenantId: string) {
    const exchange = 'whatsapp.events';
    const routingKey = `${eventType}.${tenantId}`;
    
    await this.channel.assertExchange(exchange, 'topic', { durable: true });
    
    this.channel.publish(
      exchange,
      routingKey,
      Buffer.from(JSON.stringify({
        eventType,
        data,
        tenantId,
        timestamp: new Date().toISOString()
      }))
    );
  }
}

// Event Subscriber
export class EventSubscriber {
  async subscribe(eventType: string, handler: (data: any) => Promise<void>) {
    const queue = `queue.${eventType}`;
    const routingKey = `${eventType}.*`;
    
    await this.channel.assertQueue(queue, { durable: true });
    await this.channel.bindQueue(queue, 'whatsapp.events', routingKey);
    
    await this.channel.consume(queue, async (msg) => {
      if (msg) {
        const { data } = JSON.parse(msg.content.toString());
        await handler(data);
        this.channel.ack(msg);
      }
    });
  }
}
```

---

## 1.5 Security Architecture

### Authentication Flow

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ POST /auth/login
       ▼
┌──────────────────────────────┐
│    API Gateway / Auth Service│
└──────┬───────────────────────┘
       │ Validate credentials
       │ Check MFA if enabled
       │
       ├─ Success: Generate JWT
       │
       ▼
┌──────────────────────────────┐
│   Response with JWT & Refresh│
│   Access Token (1hr)         │
│   Refresh Token (30d)        │
└──────────────────────────────┘
       │
       │ Include JWT in Authorization header
       ▼
┌──────────────────────────────┐
│    Subsequent Requests       │
│  Authorization: Bearer {JWT} │
└──────┬───────────────────────┘
       │
       │ API Gateway validates JWT
       │ Extract tenant_id from claims
       │ Set in middleware
       │
       ▼
┌──────────────────────────────┐
│   Service processes request  │
│   with tenant isolation      │
└──────────────────────────────┘
```

### Authorization: Role-Based Access Control (RBAC)

```typescript
// Decorator for route protection
export const authorize = (requiredRoles: string[]) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function(...args: any[]) {
      const req = args[0]; // Express request
      const userRole = req.user.role;
      
      if (!requiredRoles.includes(userRole)) {
        throw new ForbiddenException(
          `Required roles: ${requiredRoles.join(', ')}`
        );
      }
      
      return originalMethod.apply(this, args);
    };
    
    return descriptor;
  };
};

// Usage
@Post('/campaigns')
@authorize(['campaign_manager', 'tenant_admin', 'tenant_owner'])
async createCampaign(req: Request, res: Response) {
  // ...
}
```

---

## 1.6 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Customer                                   │
│              (Creates campaign via Web Dashboard)                    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
               ┌─────────────────────────────┐
               │   API Gateway + Auth        │
               │   (Validate JWT, Rate Limit)│
               └─────────────────┬───────────┘
                                 │
                                 ▼
                    ┌────────────────────────────┐
                    │   Campaign Service         │
                    │ (Create campaign, validate)│
                    └────────────┬───────────────┘
                                 │
                    ┌────────────┴─────────────┐
                    │                         │
                    ▼                         ▼
        ┌──────────────────────┐  ┌──────────────────────┐
        │  Template Service    │  │  PostgreSQL          │
        │ (Validate template)  │  │ (Store campaign)     │
        └──────────────────────┘  └──────────────────────┘
                    │
                    └────────────┬─────────────┐
                                 │             │
                                 ▼             ▼
                     ┌──────────────────┐  ┌──────────────────┐
                     │  Message Queue   │  │  Event Bus       │
                     │  Service         │  │ (campaign.created)
                     │ (Create batches) │  └──────────┬───────┘
                     └────────┬─────────┘             │
                              │                       ▼
                              │          ┌──────────────────────┐
                              │          │ Compliance Service   │
                              │          │ (Track consent)      │
                              │          └──────────────────────┘
                              │
                    ┌─────────┴──────────┐
                    │                    │
                    ▼                    ▼
        ┌────────────────────┐  ┌─────────────────────┐
        │  Bull Queue (Redis)│  │  PostgreSQL         │
        │  Priority Queues   │  │  (message_batches)  │
        │  HIGH/NORMAL/LOW   │  └─────────────────────┘
        └────────────┬───────┘
                     │
          ┌──────────┼──────────┐
          │          │          │
          ▼          ▼          ▼
        Worker1   Worker2   Worker3
          │          │          │
          └──────────┼──────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  Rate Limiter          │
        │  (60 msg/sec per       │
        │   tenant)              │
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │   Delivery Service     │
        │  (Call Meta API)       │
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │   Meta WhatsApp API    │
        │  (Cloud API)           │
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  WhatsApp Users        │
        │  (Receive Messages)    │
        └────────────────────────┘

Async Updates:
                Message Status Events
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
      Analytics  Compliance  Webhooks
      Service    Service     Service
         │          │           │
         └────────┬─┴──────┬────┘
                  │        │
                  ▼        ▼
            Real-time   Customer
            Dashboard   Notifications
```

---

## 1.7 Key Design Principles

### 1. **Horizontal Scalability**
- Stateless services (scale independently)
- Distributed data (Redis for caching)
- Load balancing at API Gateway
- Message queue for async processing

### 2. **Multi-Tenancy**
- Complete data isolation at all layers
- Database RLS + Application-level checks
- Redis key namespacing
- Queue job tagging

### 3. **High Availability**
- Multiple service instances per region
- Database replicas for read scaling
- Redis cluster mode
- Kubernetes for orchestration

### 4. **Event-Driven Architecture**
- Decoupled services via event bus
- Eventual consistency
- Async workflows
- Real-time updates via WebSockets

### 5. **Security First**
- JWT authentication with MFA
- RBAC for authorization
- Encryption at rest and in transit
- Row-level security in database
- API rate limiting
- Input validation

---

## Summary

Part 1 establishes a modern, scalable microservices architecture designed for:
- **100k+ messages per campaign** with sub-500ms latency
- **Complete multi-tenant isolation** at all layers
- **Enterprise-grade security** with authentication, authorization, and encryption
- **High availability** through distributed deployment and redundancy
- **Event-driven** async processing for scalability

This foundation supports the subsequent parts (Core Features, Technology Stack, Data Model, API Design, Queue System, etc.) and enables rapid scaling to millions of messages monthly.

---

**Document Status:** Complete - Part 1 Architecture Implementation
**Last Updated:** September 6, 2026
