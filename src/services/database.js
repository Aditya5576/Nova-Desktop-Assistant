const fs = require('fs');
const path = require('path');
const TaskSchedulerService = require('./taskSchedulerService');

class DatabaseService {
  constructor() {
    this.dbPath = path.join(__dirname, '../../myassist_tasks.json');
    this.scheduler = new TaskSchedulerService();
    this.init();
  }

  init() {
    try {
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
      this.scheduler.syncAllPendingTasks(this.getTasks());
    } catch (err) {
      console.error('Failed to initialize database file:', err);
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

  claimTaskReminder(id) {
    const data = this.read();
    const tasks = data.tasks || [];
    const index = tasks.findIndex(t => t.id === id);
    if (index !== -1) {
      const task = tasks[index];
      if (task.status === 'done' || task.notified) {
        return null;
      }
      task.notified = true;
      tasks[index] = task;
      data.tasks = tasks;
      this.write(data);
      return task;
    }
    return null;
  }

  getSettings() {
    const data = this.read();
    let settings = data.settings || {};

    let safeStorage = null;
    try { safeStorage = require('electron').safeStorage; } catch (e) {}

    // Backward-compatible migration: encrypt existing plaintext key
    if (settings.geminiApiKey && settings.geminiApiKey.trim()) {
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        try {
          const buffer = safeStorage.encryptString(settings.geminiApiKey.trim());
          settings.geminiApiKeyEncrypted = buffer.toString('base64');
          delete settings.geminiApiKey;
          data.settings = settings;
          this.write(data);
        } catch (err) {
          console.error('Failed to encrypt Gemini API key during migration:', err);
        }
      } else {
        console.warn('Secure API key storage unavailable on this platform.');
      }
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
    return settings.geminiApiKey || '';
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
      if (!rawKey) {
        delete updatedSettings.geminiApiKey;
        delete updatedSettings.geminiApiKeyEncrypted;
      } else if (safeStorage && safeStorage.isEncryptionAvailable()) {
        try {
          const buffer = safeStorage.encryptString(rawKey);
          updatedSettings.geminiApiKeyEncrypted = buffer.toString('base64');
          delete updatedSettings.geminiApiKey;
        } catch (err) {
          updatedSettings.geminiApiKey = rawKey;
        }
      } else {
        console.warn('Secure API key storage unavailable on this platform.');
        updatedSettings.geminiApiKey = rawKey;
      }
    }

    data.settings = updatedSettings;
    this.write(data);
    return updatedSettings;
  }
}

module.exports = DatabaseService;
