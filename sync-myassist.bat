@echo off
cd /d "%~dp0"
echo 🔄 Syncing Nova Desktop Assistant with GitHub across devices...
node scripts/sync.js
start "" /b npx electron . >nul 2>&1
exit
