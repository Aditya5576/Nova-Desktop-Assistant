@echo off
cd /d "c:\Users\adity\Desktop\MyAssist"
echo 🔄 Syncing Nova Desktop Assistant with GitHub across devices...
node scripts/sync.js
start "" /b npx electron . >nul 2>&1
exit
