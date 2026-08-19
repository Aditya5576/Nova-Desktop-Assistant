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
 *
 * Test context guard:
 *   - In test/Node runner context (process.env.NODE_ENV === 'test' or running test_runner.js),
 *     TaskSchedulerService uses an in-memory mock registry so unit tests do NOT execute
 *     real OS schtasks /Create commands against the host machine.
 */

class TaskSchedulerService {
  constructor() {
    this.scriptsDir = appPaths.getRuntimeScriptsPath();
    this.dbPath = appPaths.getDatabasePath();

    // Detect test execution context
    this.isTestEnv = process.env.NODE_ENV === 'test' ||
                     (process.argv && process.argv.some(arg => arg.includes('test_runner.js') || arg.includes('mocha')));

    // Mock registry for test assertions without touching OS Task Scheduler
    this.mockRegistry = new Map();

    if (!fs.existsSync(this.scriptsDir)) {
      try {
        fs.mkdirSync(this.scriptsDir, { recursive: true });
      } catch (err) {
        console.error('[TaskScheduler] Failed to create runtime scripts directory:', err.message);
      }
    }

    this.ensureTaskRunnerScript();
  }

  ensureTaskRunnerScript() {
    try {
      const destPath = path.join(this.scriptsDir, 'runTask.ps1');
      const srcPath = path.join(appPaths.getPackagedScriptsPath(), 'runTask.ps1');

      if (!fs.existsSync(srcPath)) {
        console.warn('[TaskScheduler] runTask.ps1 source not found at:', srcPath);
        return;
      }

      if (fs.existsSync(destPath)) {
        const srcContent = fs.readFileSync(srcPath, 'utf-8');
        const destContent = fs.readFileSync(destPath, 'utf-8');
        if (srcContent === destContent) return;
      }

      fs.copyFileSync(srcPath, destPath);
      console.log('[TaskScheduler] runTask.ps1 deployed to userData runtime scripts directory.');
    } catch (err) {
      console.error('[TaskScheduler] Failed to deploy runTask.ps1:', err.message);
    }
  }

  detectWindowsShortDateFormat() {
    try {
      const { execSync } = require('child_process');
      const pattern = execSync('powershell.exe -NoProfile -Command "(Get-ItemProperty \'HKCU:\\Control Panel\\International\').sShortDate"', { encoding: 'utf-8', timeout: 3000 }).trim().toLowerCase();
      if (pattern.startsWith('m')) return 'MM/DD/YYYY';
      if (pattern.startsWith('y')) return 'YYYY-MM-DD';
    } catch (e) {}
    return 'DD/MM/YYYY';
  }

  formatDateForOs(year, month, day) {
    if (!this.osDateFormat) {
      this.osDateFormat = this.detectWindowsShortDateFormat();
    }
    if (this.osDateFormat === 'MM/DD/YYYY') {
      return `${month}/${day}/${year}`;
    } else if (this.osDateFormat === 'YYYY-MM-DD') {
      return `${year}-${month}-${day}`;
    }
    return `${day}/${month}/${year}`;
  }

  /**
   * Schedules a Windows OS Task for a pending task.
   * Strictly enforces:
   *   - task.status === 'pending'
   *   - task.notified !== true
   *   - task.reminder !== false
   * If any of these are violated, removes the task if it exists.
   */
  scheduleTask(task) {
    try {
      if (!task || !task.id || !task.dueDate) return;

      const taskId = String(task.id);
      const safeTaskNameId = taskId.replace(/[^a-zA-Z0-9_]/g, '_');
      const taskName = `MyAssist_Rem_${safeTaskNameId}`;

      // Strict Guard: Do NOT schedule if done, already notified, or reminder disabled
      if (task.status !== 'pending' || task.notified === true || task.reminder === false) {
        this.removeTask(taskId);
        return;
      }

      const dateParts = String(task.dueDate).split('-');
      if (dateParts.length !== 3) return;
      const [year, month, day] = dateParts;

      let schTime = task.dueTime || '09:00:00';
      if (schTime.length === 5) {
        schTime = `${schTime}:00`;
      }

      // Past-due guard: Do NOT schedule OS task if scheduled time is in the past (> 2 min ago)
      const taskDateTime = new Date(`${task.dueDate}T${schTime}`);
      if (!isNaN(taskDateTime.getTime()) && taskDateTime.getTime() < Date.now() - 120000) {
        this.removeTask(taskId);
        return;
      }

      const formattedDateStr = this.formatDateForOs(year, month, day);
      const runnerScript = path.join(this.scriptsDir, 'runTask.ps1');
      const taskAction = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${runnerScript}" -Id "${taskId}"`;

      if (this.isTestEnv) {
        // Test context: update in-memory mock registry cleanly
        this.mockRegistry.set(taskName, {
          name: taskName,
          id: taskId,
          action: taskAction,
          date: formattedDateStr,
          time: schTime
        });
        return;
      }

      // Real OS Task Scheduler: Remove old task if exists, then create new OS task
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
      if (!id) return;
      const safeTaskNameId = String(id).replace(/[^a-zA-Z0-9_]/g, '_');
      const taskName = `MyAssist_Rem_${safeTaskNameId}`;
      this.removeTaskByName(taskName);
    } catch (err) {
      console.error('Failed to delete Windows OS task:', err);
    }
  }

  removeTaskByName(taskName) {
    if (!taskName) return;

    if (this.isTestEnv) {
      this.mockRegistry.delete(taskName);
      return;
    }

    exec(`schtasks /Delete /TN "${taskName}" /F`, () => {});
  }

  /**
   * Full Idempotent Synchronization & Pruning Reconciliation.
   *
   * 1. Filters database tasks for valid active pending reminders (status === 'pending', !notified, reminder !== false).
   * 2. Queries Windows Task Scheduler for all registered tasks matching MyAssist_Rem_*.
   * 3. Unregisters any MyAssist_Rem_* OS task that is NOT in the active database list (cleans up stale/orphaned tasks).
   * 4. Schedules/updates active pending tasks.
   */
  syncAllPendingTasks(tasks = []) {
    try {
      const now = Date.now();
      const activePendingTasks = (tasks || []).filter(t => {
        if (!t || !t.id || t.status !== 'pending' || t.notified || t.reminder === false || !t.dueDate) return false;
        let schTime = t.dueTime || '09:00:00';
        if (schTime.length === 5) schTime = `${schTime}:00`;
        const taskDateTime = new Date(`${t.dueDate}T${schTime}`);
        return !isNaN(taskDateTime.getTime()) && taskDateTime.getTime() >= now - 120000;
      });

      const activeTaskNames = new Set(
        activePendingTasks.map(t => `MyAssist_Rem_${String(t.id).replace(/[^a-zA-Z0-9_]/g, '_')}`)
      );

      if (this.isTestEnv) {
        // Test context: prune mock registry to match activeTaskNames, then schedule
        for (const registeredName of Array.from(this.mockRegistry.keys())) {
          if (!activeTaskNames.has(registeredName)) {
            this.mockRegistry.delete(registeredName);
          }
        }
        activePendingTasks.forEach(task => this.scheduleTask(task));
        return;
      }

      // Real OS Task Scheduler: Query existing MyAssist_Rem_* tasks
      exec('schtasks /Query /FO CSV /NH', (err, stdout) => {
        if (!err && stdout) {
          const lines = stdout.split('\n');
          lines.forEach(line => {
            const parts = line.split(',');
            if (parts.length > 0) {
              const rawName = parts[0].replace(/"/g, '').trim();
              // Extract basename if path included e.g. \MyAssist_Rem_xxx
              const taskName = rawName.startsWith('\\') ? rawName.substring(1) : rawName;

              if (taskName.startsWith('MyAssist_Rem_')) {
                if (!activeTaskNames.has(taskName)) {
                  this.removeTaskByName(taskName);
                }
              }
            }
          });
        }

        // Register active pending tasks
        activePendingTasks.forEach(task => {
          this.scheduleTask(task);
        });
      });
    } catch (e) {
      console.error('Failed to sync pending tasks with Task Scheduler:', e);
    }
  }
}

module.exports = TaskSchedulerService;
