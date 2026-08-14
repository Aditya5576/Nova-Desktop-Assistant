const fs = require('fs');
const path = require('path');
const TaskSchedulerService = require('./taskSchedulerService');
const appPaths = require('./appPaths');

class DatabaseService {
  constructor() {
    this.dbPath = appPaths.getDatabasePath();
    this.scheduler = new TaskSchedulerService();
    this.init();
  }

  init() {
    try {
      // ── One-time migration: copy DB from legacy project-root location to userData ──
      // Guards:
      //  1. this.dbPath must be the canonical userData DB (not a test scratch override)
      //  2. the userData DB must not yet exist
      //  3. the legacy project-root DB must exist at a different path
      // The old file is never deleted — migration only copies.
      const legacyPath = path.join(__dirname, '../../myassist_tasks.json');
      const isCanonicalPath = this.dbPath === appPaths.getDatabasePath();
      if (isCanonicalPath && !fs.existsSync(this.dbPath) && legacyPath !== this.dbPath && fs.existsSync(legacyPath)) {
        try {
          const destDir = path.dirname(this.dbPath);
          if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
          fs.copyFileSync(legacyPath, this.dbPath);
          console.log('[Nova] User database migrated from legacy project location to userData directory.');
        } catch (migErr) {
          console.error('[Nova] Migration failed — starting with a fresh database:', migErr.message);
          // Fall through: the main init block below will create a fresh database
        }
      }

      // Ensure userData directory exists for writes
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

      if (!fs.existsSync(this.dbPath)) {
        const initialData = {
          tasks: [
            {
              id: 'init-1',
              title: 'Welcome to Nova! Desktop Task Assistant is ready.',
              type: 'scheduled',
              status: 'pending',
              category: 'General',
              priority: 'high',
              recurring: 'none',
              createdAt: new Date().toISOString(),
              dueDate: new Date().toISOString().split('T')[0],
              dueTime: '18:00:00',
              reminder: true,
              notified: false,
              notes: 'Initial welcome task.'
            }
          ],
          settings: {
            assistantName: 'Nova',
            theme: 'dark',
            soundEnabled: true,
            notificationsEnabled: true,
            geminiApiKey: '',
            ntfyTopic: ''
          }
        };
        fs.writeFileSync(this.dbPath, JSON.stringify(initialData, null, 2), 'utf-8');
      }
      this.cleanStalePastTasks();
      this.scheduler.syncAllPendingTasks(this.getTasks());
    } catch (err) {
      console.error('Failed to initialize database file:', err);
    }
  }

  cleanStalePastTasks() {
    try {
      const data = this.read();
      if (!data || !Array.isArray(data.tasks)) return;

      const now = new Date();
      let modified = false;

      data.tasks.forEach(task => {
        if (task.status === 'pending' && !task.notified && task.dueDate && task.dueTime) {
          let schTime = task.dueTime;
          if (schTime.length === 5) schTime = `${schTime}:00`;
          const taskDate = new Date(`${task.dueDate}T${schTime}`);
          if (!isNaN(taskDate.getTime()) && taskDate.getTime() < now.getTime() - 120000) {
            task.notified = true;
            modified = true;
          }
        }
      });

      if (modified) {
        this.write(data);
        console.log('[Nova] Cleaned up past-due tasks to prevent notification storms.');
      }
    } catch (e) {
      console.error('[Nova] Error cleaning past tasks:', e);
    }
  }

  read() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('Error reading database file:', err);
    }
    return { tasks: [], settings: {} };
  }

  write(data) {
    try {
      const tempPath = `${this.dbPath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.dbPath);
      return true;
    } catch (err) {
      console.error('Error writing database file:', err);
      return false;
    }
  }

  getTasks() {
    const data = this.read();
    return data.tasks || [];
  }

  addTask(taskData) {
    const data = this.read();
    const newTask = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      title: taskData.title || 'Untitled Task',
      type: taskData.type || 'scheduled',
      status: taskData.status || (taskData.type === 'completed' ? 'done' : 'pending'),
      category: taskData.category || 'General',
      priority: taskData.priority || 'medium',
      recurring: taskData.recurring || 'none',
      createdAt: new Date().toISOString(),
      completedAt: taskData.type === 'completed' || taskData.status === 'done' ? new Date().toISOString() : null,
      dueDate: taskData.dueDate || new Date().toISOString().split('T')[0],
      dueTime: taskData.dueTime || '09:00:00',
      reminder: taskData.reminder !== undefined ? taskData.reminder : true,
      notified: false,
      snoozedUntil: null,
      notes: taskData.notes || ''
    };

    data.tasks.unshift(newTask);
    this.write(data);

    if (newTask.reminder && newTask.type === 'scheduled') {
      try {
        this.scheduler.scheduleTask(newTask);
      } catch (e) {
        console.error('Task scheduler error:', e);
      }
    }

    return newTask;
  }

  updateTask(id, updates) {
    const data = this.read();
    const index = data.tasks.findIndex(t => t.id === id);
    if (index !== -1) {
      const task = data.tasks[index];

      if (updates.status === 'done' && task.status !== 'done') {
        updates.completedAt = new Date().toISOString();
        try {
          this.scheduler.removeTask(id);
        } catch (e) {}
      }

      data.tasks[index] = { ...data.tasks[index], ...updates };
      this.write(data);

      if (updates.status === 'done' && task.status !== 'done' && task.recurring && task.recurring !== 'none') {
        this.createNextRecurringTask(task);
      }

      if (data.tasks[index].status === 'pending' && data.tasks[index].reminder && !data.tasks[index].notified) {
        try {
          this.scheduler.scheduleTask(data.tasks[index]);
        } catch (e) {}
      } else if (data.tasks[index].notified) {
        try {
          this.scheduler.removeTask(id);
        } catch (e) {}
      }

      return data.tasks[index];
    }
    return null;
  }

  snoozeTask(id, minutes = 15) {
    const data = this.read();
    const index = data.tasks.findIndex(t => t.id === id);
    if (index !== -1) {
      const snoozedTime = new Date(Date.now() + minutes * 60000);
      const hours = String(snoozedTime.getHours()).padStart(2, '0');
      const mins = String(snoozedTime.getMinutes()).padStart(2, '0');
      const secs = String(snoozedTime.getSeconds()).padStart(2, '0');

      data.tasks[index].snoozedUntil = snoozedTime.toISOString();
      data.tasks[index].dueDate = `${snoozedTime.getFullYear()}-${String(snoozedTime.getMonth() + 1).padStart(2, '0')}-${String(snoozedTime.getDate()).padStart(2, '0')}`;
      data.tasks[index].dueTime = `${hours}:${mins}:${secs}`;
      data.tasks[index].notified = false;

      this.write(data);
      try {
        this.scheduler.scheduleTask(data.tasks[index]);
      } catch (e) {}

      return data.tasks[index];
    }
    return null;
  }

  createNextRecurringTask(originalTask) {
    if (!originalTask.dueDate) return;

    const currentDue = new Date(originalTask.dueDate);
    let nextDate = new Date(currentDue);

    if (originalTask.recurring === 'daily') {
      nextDate.setDate(nextDate.getDate() + 1);
    } else if (originalTask.recurring === 'weekly') {
      nextDate.setDate(nextDate.getDate() + 7);
    } else if (originalTask.recurring === 'monthly') {
      nextDate.setMonth(nextDate.getMonth() + 1);
    }

    const nextDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;

    const newTaskData = {
      title: originalTask.title,
      type: 'scheduled',
      status: 'pending',
      category: originalTask.category,
      priority: originalTask.priority,
      recurring: originalTask.recurring,
      dueDate: nextDateStr,
      dueTime: originalTask.dueTime,
      reminder: originalTask.reminder,
      notes: originalTask.notes
    };

    this.addTask(newTaskData);
  }

  deleteTask(id) {
    const data = this.read();
    const initialLen = data.tasks.length;
    data.tasks = data.tasks.filter(t => t.id !== id);
    if (data.tasks.length !== initialLen) {
      this.write(data);
      try {
        this.scheduler.removeTask(id);
      } catch (e) {}
      return true;
    }
    return false;
  }

  clearCompletedTasks() {
    const data = this.read();
    const existingTasks = data.tasks || [];
    const completedTasks = existingTasks.filter(t => t.status === 'done' || t.type === 'completed');

    completedTasks.forEach(task => {
      try {
        this.scheduler.removeTask(task.id);
      } catch (e) {}
    });

    data.tasks = existingTasks.filter(t => t.status !== 'done' && t.type !== 'completed');
    this.write(data);
    return true;
  }

  clearAllTasks() {
    const data = this.read();
    const existingTasks = data.tasks || [];
    
    // Clear scheduled OS tasks
    existingTasks.forEach(task => {
      try {
        this.scheduler.removeTask(task.id);
      } catch (e) {}
    });

    data.tasks = [];
    this.write(data);
    return true;
  }

  getLocksDir() {
    const locksDir = appPaths.getLocksPath();
    if (!fs.existsSync(locksDir)) {
      try { fs.mkdirSync(locksDir, { recursive: true }); } catch (e) {}
    }
    return locksDir;
  }

  claimTaskReminder(id) {
    if (!id) return null;
    const safeId = String(id).replace(/[^a-zA-Z0-9_]/g, '_');
    const lockPath = path.join(this.getLocksDir(), `claim_${safeId}.lock`);

    // 1. Check in-memory DB status first
    const data = this.read();
    const tasks = data.tasks || [];
    const index = tasks.findIndex(t => t.id === id);
    if (index === -1) return null;
    const task = tasks[index];
    if (task.status === 'done' || task.notified) {
      return null;
    }

    // 2. Cross-Process OS Kernel Lock Claim (Atomic wx open)
    let lockAcquired = false;
    try {
      const fd = fs.openSync(lockPath, 'wx');
      const lockContent = JSON.stringify({ pid: process.pid, time: Date.now() });
      fs.writeFileSync(fd, lockContent, 'utf-8');
      fs.closeSync(fd);
      lockAcquired = true;
    } catch (err) {
      if (err.code === 'EEXIST') {
        try {
          const stats = fs.statSync(lockPath);
          const ageMs = Date.now() - stats.mtimeMs;
          if (ageMs > 60000) {
            try { fs.unlinkSync(lockPath); } catch (e) {}
            const fd = fs.openSync(lockPath, 'wx');
            const lockContent = JSON.stringify({ pid: process.pid, time: Date.now(), recovered: true });
            fs.writeFileSync(fd, lockContent, 'utf-8');
            fs.closeSync(fd);
            lockAcquired = true;
          }
        } catch (e) {
          lockAcquired = false;
        }
      }
    }

    if (!lockAcquired) {
      return null; // ALREADY_CLAIMED by PowerShell or another process
    }

    // 3. Mark notified in database
    task.notified = true;
    tasks[index] = task;
    data.tasks = tasks;
    this.write(data);
    return task;
  }

  getSettings() {
    const data = this.read();
    let settings = data.settings || {};

    let safeStorage = null;
    try { safeStorage = require('electron').safeStorage; } catch (e) {}

    // Legacy migration check: encrypt existing plaintext key if safeStorage is available
    if (settings.geminiApiKey && settings.geminiApiKey.trim()) {
      const rawKey = settings.geminiApiKey.trim();
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        try {
          const buffer = safeStorage.encryptString(rawKey);
          settings.geminiApiKeyEncrypted = buffer.toString('base64');
          delete settings.geminiApiKey;
          data.settings = settings;
          this.write(data);
        } catch (err) {
          console.error('Failed to encrypt Gemini API key during migration:', err);
        }
      } else {
        // Plaintext key exists but safeStorage unavailable: strip from disk and retain in memory only
        this.inMemoryApiKey = rawKey;
        delete settings.geminiApiKey;
        data.settings = settings;
        this.write(data);
        console.warn('Secure API key storage unavailable on this platform. Key retained in memory for current session only.');
      }
    }

    if (settings.geminiApiKey && (!safeStorage || !safeStorage.isEncryptionAvailable())) {
      this.inMemoryApiKey = settings.geminiApiKey;
    }

    if (!settings.ntfyTopic || !settings.ntfyTopic.trim()) {
      settings.ntfyTopic = 'nova-my-tasks';
    }
    return settings;
  }

  getDecryptedApiKey() {
    const settings = this.getSettings();

    let safeStorage = null;
    try { safeStorage = require('electron').safeStorage; } catch (e) {}

    if (settings.geminiApiKeyEncrypted && safeStorage && safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(settings.geminiApiKeyEncrypted, 'base64');
        return safeStorage.decryptString(buffer);
      } catch (err) {
        console.error('Failed to decrypt Gemini API key:', err);
      }
    }

    // Return session in-memory key if safeStorage is unavailable
    return this.inMemoryApiKey || '';
  }

  hasGeminiApiKey() {
    const key = this.getDecryptedApiKey();
    return Boolean(key && key.trim().length > 10);
  }

  updateSettings(newSettings) {
    const data = this.read();
    const currentSettings = data.settings || {};
    const updatedSettings = { ...currentSettings, ...newSettings };

    let safeStorage = null;
    try { safeStorage = require('electron').safeStorage; } catch (e) {}

    if (newSettings.geminiApiKey !== undefined) {
      const rawKey = (newSettings.geminiApiKey || '').trim();
      delete updatedSettings.geminiApiKey; // NEVER persist plaintext geminiApiKey to disk

      if (!rawKey) {
        delete updatedSettings.geminiApiKeyEncrypted;
        this.inMemoryApiKey = '';
      } else if (safeStorage && safeStorage.isEncryptionAvailable()) {
        try {
          const buffer = safeStorage.encryptString(rawKey);
          updatedSettings.geminiApiKeyEncrypted = buffer.toString('base64');
          this.inMemoryApiKey = rawKey;
        } catch (err) {
          console.error('Encryption error:', err);
          this.inMemoryApiKey = rawKey;
        }
      } else {
        console.warn('Secure API key storage unavailable on this platform. Key retained in memory for current session only.');
        this.inMemoryApiKey = rawKey;
      }
    }

    // Guarantee no plaintext key field written to JSON file
    delete updatedSettings.geminiApiKey;

    data.settings = updatedSettings;
    this.write(data);
    return updatedSettings;
  }
}

module.exports = DatabaseService;
