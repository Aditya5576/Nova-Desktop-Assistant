const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const appPaths = require('./appPaths');

/**
 * Windows Task Scheduler Service (Production 100% Closed-App Verification)
 *
 * Runtime script strategy:
 *   - runTask.ps1 is a static committed file (packaged as extraResources).
 *   - On startup, it is COPIED to userData/scripts/ so schtasks always points
 *     to a writable, user-owned location — never to Program Files or app.asar.
 *   - The copy is skipped when the destination already exists and is identical
 *     to the source (to avoid unnecessary disk writes on every launch).
 *   - schtask names remain unchanged: MyAssist_Rem_<safeId>
 */

class TaskSchedulerService {
  constructor() {
    // Runtime writable scripts directory — always in userData, never in install dir
    this.scriptsDir = appPaths.getRuntimeScriptsPath();
    // Database path for informational purposes (actual path used by runTask.ps1
    // is derived from its own location on disk, so no hardcoding needed here)
    this.dbPath = appPaths.getDatabasePath();

    // Ensure the writable scripts directory exists
    if (!fs.existsSync(this.scriptsDir)) {
      try {
        fs.mkdirSync(this.scriptsDir, { recursive: true });
      } catch (err) {
        console.error('[TaskScheduler] Failed to create runtime scripts directory:', err.message);
      }
    }

    this.ensureTaskRunnerScript();
  }

  /**
   * Deploy runTask.ps1 to the writable userData/scripts/ directory.
   *
   * Source (read-only):
   *   - Production (packaged): process.resourcesPath/scripts/runTask.ps1
   *   - Development / test:    project_root/scripts/runTask.ps1
   *
   * Destination (writable):
   *   - userData/scripts/runTask.ps1   (always)
   *
   * The PowerShell script derives its database and lock paths from its own
   * location ($MyInvocation.MyCommand.Path), so placing it in userData/scripts/
   * makes it naturally resolve userData/myassist_tasks.json and userData/.locks/.
   *
   * The copy is skipped when source and destination have identical content.
   */
  ensureTaskRunnerScript() {
    try {
      const destPath = path.join(this.scriptsDir, 'runTask.ps1');
      const srcPath = path.join(appPaths.getPackagedScriptsPath(), 'runTask.ps1');

      // If source doesn't exist (rare edge case in unusual environments), warn and exit
      if (!fs.existsSync(srcPath)) {
        console.warn('[TaskScheduler] runTask.ps1 source not found at:', srcPath);
        return;
      }

      // Skip copy when destination is already up to date
      if (fs.existsSync(destPath)) {
        const srcContent = fs.readFileSync(srcPath, 'utf-8');
        const destContent = fs.readFileSync(destPath, 'utf-8');
        if (srcContent === destContent) return; // already current
      }

      fs.copyFileSync(srcPath, destPath);
      console.log('[TaskScheduler] runTask.ps1 deployed to userData runtime scripts directory.');
    } catch (err) {
      console.error('[TaskScheduler] Failed to deploy runTask.ps1:', err.message);
    }
  }

  scheduleTask(task) {
    try {
      if (!task || !task.id || !task.dueDate || task.status === 'done') return;

      const taskId = String(task.id);
      const safeTaskNameId = taskId.replace(/[^a-zA-Z0-9_]/g, '_');
      const taskName = `MyAssist_Rem_${safeTaskNameId}`;

      const dateParts = String(task.dueDate).split('-');
      if (dateParts.length !== 3) return;
      const [year, month, day] = dateParts;

      let schTime = task.dueTime || '09:00:00';
      if (schTime.length === 5) {
        schTime = `${schTime}:00`;
      }

      // Format date as dd/MM/yyyy for Windows Task Scheduler
      const formattedDateStr = `${day}/${month}/${year}`;

      // Always point schtask at the runtime (userData) copy of the script
      const runnerScript = path.join(this.scriptsDir, 'runTask.ps1');
      const taskAction = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${runnerScript}" -Id "${taskId}"`;

      // Remove previous task if exists, then create new OS task
      exec(`schtasks /Delete /TN "${taskName}" /F`, () => {
        const createCmd = `schtasks /Create /TN "${taskName}" /TR "${taskAction}" /SC ONCE /SD "${formattedDateStr}" /ST "${schTime}" /F`;
        exec(createCmd, (err, stdout, stderr) => {
          if (!err) {
            console.log(`[TaskScheduler] Registered Windows OS Task "${taskName}" for ${formattedDateStr} at ${schTime}`);
          } else {
            console.error(`[TaskScheduler] Error creating ${taskName}:`, stderr || err.message);
          }
        });
      });
    } catch (err) {
      console.error('Failed to schedule Windows OS task:', err);
    }
  }

  removeTask(id) {
    try {
      const safeTaskNameId = String(id).replace(/[^a-zA-Z0-9_]/g, '_');
      const taskName = `MyAssist_Rem_${safeTaskNameId}`;
      exec(`schtasks /Delete /TN "${taskName}" /F`, () => {});
    } catch (err) {
      console.error('Failed to delete Windows OS task:', err);
    }
  }

  syncAllPendingTasks(tasks = []) {
    try {
      tasks.forEach(task => {
        if (task.status === 'pending' && task.dueDate) {
          this.scheduleTask(task);
        }
      });
    } catch (e) {
      console.error('Failed to sync pending tasks with Task Scheduler:', e);
    }
  }
}

module.exports = TaskSchedulerService;
