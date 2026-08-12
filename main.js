const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { exec } = require('child_process');
const DatabaseService = require('./src/services/database');
const TaskSchedulerService = require('./src/services/taskSchedulerService');
const TaskService = require('./src/services/taskService');
const NotificationService = require('./src/services/notificationService');
const ReminderService = require('./src/services/reminderService');
const GeminiService = require('./src/services/geminiService');
const { parseTaskInput, getLocalDateString, getLocalTimeStringSec } = require('./src/services/nlpParser');
const logger = require('./src/services/logger');
const NtfySubscriber = require('./src/services/ntfySubscriber');

// Register Windows App User Model ID for native instant Windows OS Notifications
const APP_USER_MODEL_ID = 'com.nova.desktop';
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

// Remove native default menu bar
Menu.setApplicationMenu(null);

// Enable Auto Launch on Windows Startup
app.setLoginItemSettings({
  openAtLogin: true,
  path: process.execPath,
  args: [path.join(__dirname)]
});

// Ensure Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.webContents.reloadIgnoringCache();
      mainWindow.focus();
    }
  });
}

let mainWindow;
let tray;
let db;
let scheduler;
let taskService;
let notificationService;
let reminderService;
let gemini;
let ntfySubscriber;
let isWidgetMode = false;

function setWidgetDimensions(isWidget) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  isWidgetMode = isWidget;
  if (isWidget) {
    mainWindow.setSize(380, 220, true);
    mainWindow.setAlwaysOnTop(true, 'floating');
  } else {
    mainWindow.setSize(500, 600, true);
    mainWindow.setAlwaysOnTop(false);
  }
  mainWindow.webContents.send('widget-mode-changed', isWidgetMode);
}

function createSystemTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
  } catch (e) {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Nova - Desktop Task Assistant');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Nova',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Toggle Widget Mode',
      click: () => {
        setWidgetDimensions(!isWidgetMode);
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Nova',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  db = new DatabaseService();
  scheduler = new TaskSchedulerService();
  taskService = new TaskService(db, scheduler);
  notificationService = new NotificationService();
  reminderService = new ReminderService(db, notificationService);

  const decryptedKey = db.getDecryptedApiKey();
  gemini = new GeminiService(decryptedKey);

  const iconPath = path.join(__dirname, 'assets', 'icon.ico');

  mainWindow = new BrowserWindow({
    width: 500,
    height: 600,
    minWidth: 440,
    minHeight: 480,
    title: 'Nova - Desktop Task Assistant',
    icon: iconPath,
    backgroundColor: '#08090d',
    show: true,
    frame: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.session.clearCache();
  mainWindow.loadFile(path.join(__dirname, 'src/renderer/index.html'));

  mainWindow.show();
  mainWindow.focus();

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();

      if (process.platform === 'win32' && app.trimWorkingSet) {
        app.trimWorkingSet();
      }
    }
    return false;
  });

  createSystemTray();

  // Start unified Reminder Service
  reminderService.start((claimedTask) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('trigger-reminder', claimedTask);
    }
  });

  // Initialize Real-Time iPhone Task Subscriber Engine
  const currentSettings = db.getSettings();
  const activeTopic = (currentSettings && currentSettings.ntfyTopic) ? currentSettings.ntfyTopic : 'nova-my-tasks';
  
  if (!ntfySubscriber) {
    ntfySubscriber = new NtfySubscriber(activeTopic);
    ntfySubscriber.on('task-received', async ({ text }) => {
      try {
        if (!text || text === 'triggered' || text === 'OK' || text.length < 2) return;

        let parsed = parseTaskInput(text);
        if (!parsed) {
          const now = new Date();
          const defaultFuture = new Date(now.getTime() + 3600000);
          parsed = {
            title: text,
            type: 'scheduled',
            status: 'pending',
            category: 'General',
            priority: 'medium',
            recurring: 'none',
            dueDate: getLocalDateString(defaultFuture),
            dueTime: getLocalTimeStringSec(defaultFuture),
            reminder: true,
            notified: false
          };
        }

        const newTask = taskService.addTask(parsed);
        logger.info(`[iPhone Sync] Successfully added task "${newTask.title}" from iPhone 15`);
        
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('task-added-from-iphone', newTask);
        }

        notificationService.sendWindowsToast('📱 Task Received from iPhone', `"${newTask.title}"`);
      } catch (err) {
        logger.error(`[iPhone Sync] Error processing task from iPhone: ${err.message}`);
      }
    });
    ntfySubscriber.start();
  } else {
    ntfySubscriber.setTopic(activeTopic);
  }
}

function toggleWindowVisibility() {
  if (!mainWindow) return;

  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
    if (process.platform === 'win32' && app.trimWorkingSet) {
      app.trimWorkingSet();
    }
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true);
    mainWindow.focus();
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(false);
      }
    }, 200);
  }
}

// IPC Handlers
ipcMain.handle('get-tasks', () => taskService.getTasks());

ipcMain.handle('add-task', (event, taskData) => {
  if (typeof taskData !== 'object' || taskData === null) return null;
  if (taskData.title && typeof taskData.title === 'string') {
    taskData.title = taskData.title.slice(0, 500);
  }
  return taskService.addTask(taskData);
});

ipcMain.handle('parse-input', (event, inputStr) => {
  if (typeof inputStr !== 'string') return null;
  return parseTaskInput(inputStr.slice(0, 1000));
});

ipcMain.handle('update-task', (event, arg1, arg2) => {
  let id = null;
  let updates = null;
  if (typeof arg1 === 'object' && arg1 !== null && arg1.id) {
    id = String(arg1.id);
    updates = arg1.updates;
  } else {
    id = typeof arg1 === 'string' ? arg1 : null;
    updates = arg2;
  }
  if (!id || typeof updates !== 'object' || updates === null) return null;
  return taskService.updateTask(id, updates);
});

ipcMain.handle('snooze-task', (event, arg1, arg2) => {
  let id = null;
  let minutes = 15;
  if (typeof arg1 === 'object' && arg1 !== null && arg1.id) {
    id = String(arg1.id);
    minutes = typeof arg1.minutes === 'number' ? arg1.minutes : 15;
  } else {
    id = typeof arg1 === 'string' ? arg1 : null;
    minutes = typeof arg2 === 'number' ? arg2 : 15;
  }
  if (!id) return null;
  return taskService.snoozeTask(id, minutes);
});

ipcMain.handle('delete-task', (event, idOrObj) => {
  const id = (typeof idOrObj === 'object' && idOrObj !== null) ? idOrObj.id : idOrObj;
  if (typeof id !== 'string' || !id.trim()) return false;
  return taskService.deleteTask(id);
});

ipcMain.handle('clear-completed-tasks', () => taskService.clearCompletedTasks());

ipcMain.handle('clear-all-tasks', () => taskService.clearAllTasks());

function getSanitizedSettings() {
  const settings = db.getSettings();
  const hasKey = db.hasGeminiApiKey();
  return {
    assistantName: settings.assistantName || 'Nova',
    theme: settings.theme || 'emerald',
    soundEnabled: settings.soundEnabled !== false,
    notificationsEnabled: settings.notificationsEnabled !== false,
    ntfyTopic: settings.ntfyTopic || 'nova-my-tasks',
    hasGeminiApiKey: hasKey,
    geminiApiKey: '' // Raw API key NEVER exposed to renderer over IPC
  };
}

ipcMain.handle('get-settings', () => getSanitizedSettings());

ipcMain.handle('update-settings', (event, settings) => {
  if (typeof settings !== 'object' || settings === null) return getSanitizedSettings();

  const updated = db.updateSettings(settings);
  const decryptedKey = db.getDecryptedApiKey();
  gemini.setApiKey(decryptedKey);

  if (settings.ntfyTopic !== undefined && typeof settings.ntfyTopic === 'string' && ntfySubscriber) {
    ntfySubscriber.setTopic(settings.ntfyTopic);
  }

  return getSanitizedSettings();
});

// Gemini AI IPC Calls
ipcMain.handle('gemini-chat', async (event, userInput) => {
  if (typeof userInput !== 'string' || !userInput.trim()) return "Please type a message, Aditya!";
  const tasks = taskService.getTasks();
  return await gemini.assistantResponse(userInput.slice(0, 2000), tasks);
});

ipcMain.handle('gemini-summary', async () => {
  const tasks = taskService.getTasks();
  return await gemini.generateDailySummary(tasks);
});

ipcMain.on('toggle-widget-mode', (event, isWidget) => setWidgetDimensions(isWidget));

ipcMain.on('show-notification', (event, { title, body }) => {
  if (!db) return;
  notificationService.dispatchNotification(title, body, db.getSettings());
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (reminderService) reminderService.stop();
  if (process.platform !== 'darwin') app.quit();
});
