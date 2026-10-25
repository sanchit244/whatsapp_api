# Quick Start Guide - WhatsApp Bulk Messaging Platform

## 🚀 Start in 3 Commands (Linux/macOS)

```bash
# 1. Clone and navigate
git clone <repo-url> && cd whatsapp-api

# 2. Make start script executable
chmod +x start.sh

# 3. Run the quick start
./start.sh
```

**Result**: Application running at `http://localhost:3000`

---

## 🪟 For Windows Users

**Option 1: Using WSL2 (Recommended)**
```bash
# Enable WSL2
wsl --install

# Open WSL2 terminal
wsl

# Follow Linux/macOS commands above
```

**Option 2: Using PowerShell**
```powershell
# Clone repository
git clone <repo-url>
cd whatsapp-api

# Copy environment file
Copy-Item .env.example .env

# Start Docker services
docker-compose up -d

# Install dependencies
npm install

# Run migrations
npm run db:migrate

# Start application
npm run dev
```

---

## ✅ Verify Everything is Working

```bash
# Test health endpoint
curl http://localhost:3000/health

# Expected response:
# {
#   "status": "ok",
#   "database": "connected",
#   "redis": "connected",
#   "rabbitmq": "connected"
# }
```

---

## 📊 Access Management Panels

Once running:

| Service | URL | Credentials |
|---------|-----|-------------|
| Application | http://localhost:3000 | |
| pgAdmin | http://localhost:5050 | admin@example.com / admin |
| Redis Commander | http://localhost:8081 | (none) |
| RabbitMQ | http://localhost:15672 | guest / guest |

---

## 📖 Next Steps

1. **Read the full guide**: See `HOW_TO_RUN.md`
2. **Test the API**: See `PART_5_API_ENDPOINTS.md`
3. **Explore the code**: Check `src/` directory
4. **Review architecture**: See `PART_1_*` through `PART_13_*` docs

---

**Status**: ✅ Ready to run locally

