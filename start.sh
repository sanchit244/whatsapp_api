#!/bin/bash

# WhatsApp Bulk Messaging Platform - Quick Start Script
# This script sets up and runs the entire platform

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  WhatsApp Bulk Messaging Platform - Quick Start"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check prerequisites
echo "✓ Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20 LTS or higher."
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose."
    exit 1
fi

echo "✅ All prerequisites installed"
echo "   - Node.js: $(node --version)"
echo "   - npm: $(npm --version)"
echo "   - Docker: $(docker --version)"
echo ""

# Create .env file if it doesn't exist
echo "✓ Setting up environment configuration..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file (edit with your configuration)"
else
    echo "✅ Using existing .env file"
fi
echo ""

# Start Docker services
echo "✓ Starting Docker services..."
docker-compose up -d
echo "✅ Docker services started"
echo "   - PostgreSQL: localhost:5432"
echo "   - Redis: localhost:6379"
echo "   - RabbitMQ: localhost:5672"
echo "   - pgAdmin: http://localhost:5050"
echo "   - Redis Commander: http://localhost:8081"
echo ""

# Wait for services to be healthy
echo "✓ Waiting for services to be ready..."
for i in {1..30}; do
    if docker exec whatsapp-postgres pg_isready -U postgres &> /dev/null; then
        echo "✅ PostgreSQL is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ PostgreSQL failed to start"
        exit 1
    fi
    echo -n "."
    sleep 1
done

for i in {1..30}; do
    if docker exec whatsapp-redis redis-cli ping &> /dev/null; then
        echo "✅ Redis is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Redis failed to start"
        exit 1
    fi
    echo -n "."
    sleep 1
done

for i in {1..30}; do
    if docker exec whatsapp-rabbitmq rabbitmq-diagnostics -q ping &> /dev/null; then
        echo "✅ RabbitMQ is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ RabbitMQ failed to start"
        exit 1
    fi
    echo -n "."
    sleep 1
done
echo ""

# Install npm dependencies
echo "✓ Installing npm dependencies..."
if npm install; then
    echo "✅ Dependencies installed"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi
echo ""

# Run database migrations
echo "✓ Running database migrations..."
if npm run db:migrate; then
    echo "✅ Database migrations completed"
else
    echo "⚠️  Database migrations may have issues (this is okay if tables already exist)"
fi
echo ""

# Start the application
echo "✓ Starting the application..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
npm run dev
