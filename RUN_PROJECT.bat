@echo off
echo ====================================
echo WhatsApp Bulk Messaging Platform
echo ====================================
echo.
echo Starting services...
echo.

REM Start MySQL if not running
echo [1/3] Starting MySQL (Docker)...
docker-compose up -d

REM Wait for MySQL
echo [2/3] Waiting for database...
timeout /t 5 /nobreak

REM Start backend and frontend concurrently
echo [3/3] Starting Backend & Frontend...
echo.
echo Backend will start on: http://localhost:3000
echo Frontend will start on: http://localhost:3000 (React dev server)
echo.
echo Demo Credentials:
echo   Email: test@example.com
echo   Password: SecurePassword123!
echo.
npm run dev:full

