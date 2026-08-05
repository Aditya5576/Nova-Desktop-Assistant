const { execSync } = require('child_process');
const os = require('os');
const path = require('path');

/**
 * Cross-Device Git Auto-Sync Engine for Nova Desktop Assistant
 * Pulls latest code & tasks from GitHub on startup, and pushes local changes on shutdown.
 */

function runCmd(cmd) {
  try {
    const output = execSync(cmd, { cwd: path.join(__dirname, '..'), encoding: 'utf-8' });
    return { success: true, output: output.trim() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function syncRepository() {
  console.log('🔄 Checking GitHub for cross-device updates...');

  // 1. Fetch & Pull Latest Code from GitHub
  const pullResult = runCmd('git pull origin main --rebase');
  if (pullResult.success) {
    console.log('✅ Successfully pulled latest changes from GitHub!');
  } else {
    console.warn('⚠️ Git pull warning (working offline or no new changes):', pullResult.error);
  }

  // 2. Check for local changes & auto-commit/push
  const statusResult = runCmd('git status --porcelain');
  if (statusResult.success && statusResult.output) {
    const hostname = os.hostname();
    const timestamp = new Date().toISOString();
    console.log(`🚀 Found local changes on ${hostname}. Auto-pushing to GitHub...`);

    runCmd('git add .');
    runCmd(`git commit -m "Auto-sync from ${hostname} at ${timestamp}"`);
    const pushResult = runCmd('git push origin main');

    if (pushResult.success) {
      console.log('✨ All changes successfully synced to GitHub!');
    } else {
      console.error('Failed to push to GitHub:', pushResult.error);
    }
  } else {
    console.log('⚡ Repository is fully up-to-date across devices.');
  }
}

if (require.main === module) {
  syncRepository();
}

module.exports = { syncRepository };
