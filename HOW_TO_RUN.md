# How to Run the WhatsApp Bulk Messaging Platform

**Date:** September 8, 2026  
**Version:** 1.0  
**Status:** Production-Ready Setup Guide

---

## 🚀 Quick Start (5 Minutes)

### Prerequisites
- Node.js 20 LTS or higher
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+
- RabbitMQ 3.12+
- Git

### One-Command Setup

```bash
# Clone the repository
git clone <repository-url> whatsapp-api
cd whatsapp-api

# Install all dependencies
npm install

# Start all services with Docker Compose
docker-compose up -d

# Run database migrations
npm run db:migrate

# Start the application
npm run dev
```

**Result**: Application running at `http://localhost:3000`

---

## 📋 Detailed Setup Guide

### Phase 1: Environment Setup (10 minutes)

#### 1.1 System Requirements

**Operating System**:
- macOS 12+ (recommended for development)
- Linux (Ubuntu 20.04+)
- Windows 11 with WSL2
- Docker Desktop 4.0+

**Hardware**:
- CPU: 4 cores minimum (8+ recommended)
- RAM: 8GB minimum (16GB recommended)
- Disk: 20GB free space

**Software**:
```bash
Node.js:        v20.0.0+
npm:            9.0.0+
Docker:         24.0.0+
Git:            2.40.0+
```

#### 1.2 Install Dependencies

**Step 1: Install Node.js**
```bash
# macOS
brew install node@20

# Linux (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Windows (WSL2)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Step 2: Install Docker**
```bash
# macOS
brew install docker

# Linux (Ubuntu/Debian)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Windows
# Download Docker Desktop from: https://www.docker.com/products/docker-desktop
```

**Step 3: Verify Installation**
```bash
node --version          # Should show v20.x.x
npm --version           # Should show 9.x.x
docker --version        # Should show 24.x.x
git --version           # Should show 2.4x.x
```

#### 1.3 Clone Repository

```bash
# Clone the project
git clone https://github.com/your-org/whatsapp-bulk-messaging-platform.git
cd whatsapp-bulk-messaging-platform

# Verify repository structure
ls -la
# Expected:
# src/                 - Source code
# docker-compose.yml   - Docker services
# package.json         - Dependencies
# .env.example         - Environment template
# README.md            - Documentation
```

---

### Phase 2: Infrastructure Setup (15 minutes)

#### 2.1 Environment Configuration

**Step 1: Create `.env` file**
```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

**Step 2: Configure Environment Variables**

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=whatsapp_db
DB_USER=postgres
DB_PASSWORD=your_secure_password
DB_POOL_MIN=5
DB_POOL_MAX=20

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# RabbitMQ Configuration
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=guest
RABBITMQ_PASSWORD=guest
RABBITMQ_VHOST=/

# API Configuration
API_PORT=3000
API_HOST=localhost
NODE_ENV=development
LOG_LEVEL=debug

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_min_32_chars
JWT_REFRESH_SECRET=your_super_secret_refresh_key_min_32_chars
JWT_EXPIRATION=3600
JWT_REFRESH_EXPIRATION=86400

# WhatsApp API (Meta)
WHATSAPP_API_TOKEN=your_meta_api_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=your_business_account_id

# Stripe (for payments)
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# AWS Configuration (optional, for S3)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_S3_BUCKET=whatsapp-bulk-messaging

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password

# Logging
LOG_LEVEL=debug
LOG_DIR=./logs
```

#### 2.2 Start Infrastructure with Docker Compose

**Step 1: Review docker-compose.yml**
```bash
cat docker-compose.yml
```

**Step 2: Start all services**
```bash
# Start all containers in background
docker-compose up -d

# Verify containers are running
docker-compose ps

# Expected output:
# NAME                COMMAND                  STATUS
# postgres            docker-entrypoint.s...   Up 2 minutes
# redis               redis-server             Up 2 minutes
# rabbitmq            docker-entrypoint.sh...  Up 2 minutes
```

**Step 3: Wait for services to be ready**
```bash
# Check PostgreSQL health
docker exec whatsapp-postgres pg_isready -U postgres

# Check Redis health
docker exec whatsapp-redis redis-cli ping

# Check RabbitMQ health
docker exec whatsapp-rabbitmq rabbitmq-diagnostics -q ping
```

**Step 4: Create databases**
```bash
# Connect to PostgreSQL
docker exec -it whatsapp-postgres psql -U postgres

# In psql shell:
CREATE DATABASE whatsapp_db;
CREATE DATABASE whatsapp_test;
\q
```

---

### Phase 3: Application Setup (10 minutes)

#### 3.1 Install NPM Dependencies

```bash
# Install all Node.js dependencies
npm install

# Expected output shows:
# up to date, 150 packages in 3.2s
```

#### 3.2 Configure TypeScript

```bash
# Verify TypeScript configuration
cat tsconfig.json

# Compile TypeScript (test)
npm run build

# Expected: build succeeds with 0 errors
```

#### 3.3 Database Setup

**Step 1: Run migrations**
```bash
# Create tables and schema
npm run db:migrate

# Expected output:
# ✓ Database migration completed
# ✓ Tables created successfully
```

**Step 2: Seed sample data (optional)**
```bash
# Add sample data for testing
npm run db:seed

# Expected output:
# ✓ Seed data inserted
# ✓ 5 sample tenants created
# ✓ 10 sample users created
```

#### 3.4 Verify Setup

```bash
# Run type checking
npm run type-check

# Run linting
npm run lint

# Run tests (if any)
npm run test

# Expected: All checks pass
```

---

## ▶️ Running the Application

### Development Mode

**Step 1: Start the development server**
```bash
# Run with hot reload
npm run dev

# Expected output:
# ✓ TypeScript compilation successful
# ✓ Server running on http://localhost:3000
# ✓ Connected to PostgreSQL
# ✓ Redis cache ready
# ✓ RabbitMQ queue ready
```

**Step 2: Verify server is running**
```bash
# In another terminal
curl http://localhost:3000/health

# Expected response:
# {
#   "status": "ok",
#   "database": "connected",
#   "redis": "connected",
#   "rabbitmq": "connected",
#   "timestamp": "2026-09-08T07:18:22.310Z"
# }
```

### Production Mode

**Step 1: Build for production**
```bash
# Compile TypeScript to JavaScript
npm run build

# Expected:
# Compiled successfully
# Output in ./dist directory
```

**Step 2: Start production server**
```bash
# Start with Node.js
npm run start

# Or with PM2 (process manager)
npm install -g pm2
pm2 start dist/server.js --name whatsapp-api

# Monitor
pm2 monit
```

---

## 🧪 Testing the API

### Test Authentication

**Step 1: Register a new account**
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!",
    "first_name": "John",
    "last_name": "Doe",
    "company_name": "Test Company"
  }'

# Expected response:
# {
#   "message": "Registration successful",
#   "user": { "id": "user_xxx", "email": "test@example.com" },
#   "token": "eyJhbGciOiJSUzI1NiIs..."
# }
```

**Step 2: Login**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePassword123!"
  }'

# Save the returned token for next requests
TOKEN="eyJhbGciOiJSUzI1NiIs..."
```

### Test Campaign API

**Step 1: Create a campaign**
```bash
curl -X POST http://localhost:3000/api/v1/campaigns \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Summer Sale",
    "description": "Special summer offers",
    "template_id": "template_123",
    "recipient_count": 1000
  }'

# Expected response:
# {
#   "message": "Campaign created",
#   "campaign": {
#     "id": "campaign_xxx",
#     "name": "Summer Sale",
#     "status": "draft"
#   }
# }
```

**Step 2: Get campaign details**
```bash
curl http://localhost:3000/api/v1/campaigns/campaign_xxx \
  -H "Authorization: Bearer $TOKEN"
```

**Step 3: Start campaign**
```bash
curl -X POST http://localhost:3000/api/v1/campaigns/campaign_xxx/start \
  -H "Authorization: Bearer $TOKEN"

# Expected response:
# {
#   "message": "Campaign started",
#   "campaign": { "status": "active" }
# }
```

### Test Contact API

**Step 1: Create a contact**
```bash
curl -X POST http://localhost:3000/api/v1/contacts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "+1-555-0100",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com"
  }'
```

**Step 2: List contacts**
```bash
curl http://localhost:3000/api/v1/contacts \
  -H "Authorization: Bearer $TOKEN"
```

**Step 3: Bulk import contacts**
```bash
curl -X POST http://localhost:3000/api/v1/contacts/bulk/import \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contacts": [
      { "phone_number": "+1-555-0101", "first_name": "Jane" },
      { "phone_number": "+1-555-0102", "first_name": "Bob" }
    ]
  }'
```

---

## 🖥️ Frontend Setup (Optional)

### Frontend Development

**Step 1: Navigate to frontend directory**
```bash
cd frontend
npm install
```

**Step 2: Configure frontend environment**
```bash
# Copy example env
cp .env.example .env.local

# Edit with API endpoint
nano .env.local
# VITE_API_URL=http://localhost:3000
```

**Step 3: Start frontend dev server**
```bash
npm run dev

# Expected:
# ✓ Frontend running on http://localhost:5173
```

**Step 4: Open in browser**
```bash
# Navigate to http://localhost:5173
# Login with test@example.com / SecurePassword123!
```

---

## 📊 Monitoring & Debugging

### View Logs

**Backend logs**:
```bash
# In development
npm run dev   # Logs appear in terminal

# Tail production logs
tail -f logs/application.log

# Filter by level
grep "ERROR" logs/application.log
```

**Docker container logs**:
```bash
# PostgreSQL
docker logs whatsapp-postgres

# Redis
docker logs whatsapp-redis

# RabbitMQ
docker logs whatsapp-rabbitmq
```

### Database Inspection

**Connect to PostgreSQL**:
```bash
# Using psql
docker exec -it whatsapp-postgres psql -U postgres -d whatsapp_db

# Common queries:
SELECT * FROM tenants;
SELECT * FROM users;
SELECT * FROM campaigns;
SELECT * FROM contacts;
\dt                    # List all tables
\du                    # List users
```

**Use pgAdmin (GUI)**:
```bash
# Navigate to http://localhost:5050
# Login: admin@example.com / admin
# Add connection to postgres:5432
```

### Redis Inspection

**Connect to Redis**:
```bash
# Using redis-cli
docker exec -it whatsapp-redis redis-cli

# Common commands:
KEYS *                 # List all keys
GET <key>              # Get value
DEL <key>              # Delete key
FLUSHDB                # Clear all data
INFO                   # Server info
```

### RabbitMQ Inspection

**Access RabbitMQ Management UI**:
```bash
# Navigate to http://localhost:15672
# Login: guest / guest

# View:
# - Queues
# - Messages
# - Connections
# - Channels
```

---

## 🐛 Troubleshooting

### Issue: PostgreSQL connection refused

**Solution**:
```bash
# Check if container is running
docker ps | grep postgres

# If not, restart it
docker-compose restart postgres

# Check logs
docker logs whatsapp-postgres

# Verify connection
docker exec whatsapp-postgres pg_isready -U postgres
```

### Issue: Redis connection timeout

**Solution**:
```bash
# Check Redis status
docker exec whatsapp-redis redis-cli ping

# If timeout, restart
docker-compose restart redis

# Flush cache if needed
docker exec whatsapp-redis redis-cli FLUSHDB
```

### Issue: RabbitMQ not responding

**Solution**:
```bash
# Check status
docker exec whatsapp-rabbitmq rabbitmq-diagnostics -q ping

# Restart
docker-compose restart rabbitmq

# Wait 10 seconds for startup
sleep 10
```

### Issue: Database migration fails

**Solution**:
```bash
# Check migration status
npm run db:migrate:status

# Rollback last migration
npm run db:migrate:rollback

# Run migrations again
npm run db:migrate

# Check database directly
docker exec -it whatsapp-postgres psql -U postgres -d whatsapp_db -c "\dt"
```

### Issue: Build fails with TypeScript errors

**Solution**:
```bash
# Check for type errors
npm run type-check

# Fix issues in src/ files

# Try building again
npm run build

# If stuck, clean and reinstall
rm -rf node_modules dist
npm install
npm run build
```

---

## 📈 Performance Verification

### Load Testing

**Install k6**:
```bash
# macOS
brew install k6

# Linux
sudo apt-get install k6

# Windows (WSL)
sudo apt-get install k6
```

**Run load test**:
```bash
# Create test file: loadtest.js
cat > loadtest.js << 'EOF'
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m30s', target: 100 },
    { duration: '20s', target: 0 },
  ],
};

export default function () {
  let response = http.get('http://localhost:3000/health');
  check(response, {
    'status is 200': (r) => r.status === 200,
  });
}
EOF

# Run test
k6 run loadtest.js
```

### Monitor Performance

**Check API response times**:
```bash
# Using Apache Bench
ab -n 100 -c 10 http://localhost:3000/health

# Using wrk
wrk -t4 -c100 -d30s http://localhost:3000/health
```

**Monitor resource usage**:
```bash
# Docker stats
docker stats whatsapp-postgres whatsapp-redis

# System monitoring
# macOS
top -l 1 | head -20

# Linux
top -b -n 1 | head -20
```

---

## 🚀 Deployment

### To Staging

```bash
# Build production image
docker build -t whatsapp-api:latest .

# Push to registry
docker tag whatsapp-api:latest your-registry/whatsapp-api:latest
docker push your-registry/whatsapp-api:latest

# Deploy with docker-compose
docker-compose -f docker-compose.prod.yml up -d
```

### To Production (Kubernetes)

```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/

# Verify deployment
kubectl get pods
kubectl get svc

# Check logs
kubectl logs -f deployment/whatsapp-api
```

---

## 📝 Common Commands Reference

```bash
# Development
npm run dev              # Start dev server with hot reload
npm run build            # Build for production
npm run start            # Start production server
npm run test             # Run tests
npm run type-check       # Check TypeScript types
npm run lint             # Lint code
npm run format           # Format code with Prettier

# Database
npm run db:migrate       # Run migrations
npm run db:migrate:rollback  # Rollback last migration
npm run db:seed          # Seed sample data
npm run db:reset         # Reset database

# Docker
docker-compose up -d     # Start all services
docker-compose down      # Stop all services
docker-compose logs -f   # View logs
docker-compose ps        # List containers

# Cleanup
npm run clean            # Remove build artifacts
docker-compose down -v   # Remove containers and volumes
rm -rf node_modules      # Remove dependencies
```

---

## ✅ Verification Checklist

After setup, verify everything works:

```
□ Node.js & npm installed
□ Docker & Docker Compose installed
□ Repository cloned
□ .env file configured
□ PostgreSQL running (docker ps)
□ Redis running (docker ps)
□ RabbitMQ running (docker ps)
□ npm install completed
□ npm run build succeeds
□ Database migrations run
□ npm run dev starts successfully
□ Health check endpoint responds (http://localhost:3000/health)
□ Can register new account via API
□ Can login and receive JWT token
□ Can create campaign via API
□ Can create contact via API
□ Frontend loads (if running)
□ No errors in console logs
□ Database has tables (psql check)
□ Redis keys present (redis-cli check)
□ RabbitMQ queues visible (UI check)
```

---

## 🎓 Next Steps

After running locally:

1. **Explore the API**: Visit `http://localhost:3000/api/docs` (if Swagger enabled)
2. **Read documentation**: Check `PART_5_API_ENDPOINTS.md` for full API specs
3. **Review code**: Explore `src/` directory to understand architecture
4. **Run tests**: Execute `npm run test` to verify functionality
5. **Deploy**: Follow deployment guide in `PART_10_DEVELOPMENT_PHASES.md`

---

## 📞 Support

For issues:
1. Check troubleshooting section above
2. Review logs: `docker logs <service>` or `tail logs/application.log`
3. Check database: Connect with psql and verify tables
4. Review code: Look for error messages in TypeScript compilation

---

**Status**: ✅ COMPLETE SETUP GUIDE  
**Last Updated**: September 8, 2026

