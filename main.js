const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { exec } = require('child_process');
const DatabaseService = require('./src/services/database');
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
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

let mainWindow;
let tray;
let db;
let gemini;
let ntfySubscriber;
let reminderInterval;
let isWidgetMode = false;

function playWindowsAudioChime() {
  const cmd = `powershell -NoProfile -Command "[System.Media.SystemSounds]::Exclamation.Play()"`;
  exec(cmd, () => {});
}

// Clean Minimalist Windows Toast Notification (Single Dispatch - No Double Banner)
function sendWindowsToastNotification(title, body) {
  const safeTitle = title || 'Task Reminder';
  const safeBody = body || 'Reminder due now!';

  // Single Reliable Windows Toast Script (PowerShell Toast with sound)
  try {
    const scriptPath = path.join(__dirname, 'scripts', 'sendToast.ps1');
    const psTitle = safeTitle.replace(/"/g, '`"');
    const psBody = safeBody.replace(/"/g, '`"');
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -Title "${psTitle}" -Body "${psBody}" -Topic "none"`;
    exec(cmd, (err) => {
      if (err) {
        logger.warn(`PowerShell Toast command exited with notice: ${err.message}`);
      } else {
        logger.info(`PowerShell Toast dispatched successfully for "${safeTitle}"`);
      }
    });
  } catch (err) {
    logger.error(`Failed to trigger PowerShell toast script: ${err.message}`);
  }
}

// 📱 Free iOS iPhone 15 Instant Push Notification Engine (via ntfy.sh)
function sendIosPushNotification(title, body) {
  try {
    if (!db) return;
    const settings = db.getSettings();
    const topic = (settings.ntfyTopic && settings.ntfyTopic.trim()) ? settings.ntfyTopic.trim() : 'nova-my-tasks';
    const safeTitle = (title || 'Nova Task Reminder').replace(/[^\x00-\x7F]/g, '');
    const postData = body || 'Task reminder due now!';

    const options = {
      hostname: 'ntfy.sh',
      port: 443,
      path: `/${encodeURIComponent(topic)}`,
      method: 'POST',
      headers: {
        'Title': safeTitle,
        'Priority': 'high',
        'Tags': 'bell,alarm_clock',
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      console.log(`iOS Push Notification dispatched to ntfy.sh/${topic} (Status: ${res.statusCode})`);
    });

    req.on('error', (e) => {
      console.error('iOS push notification failed:', e.message);
    });

    req.write(postData);
    req.end();
  } catch (err) {
    console.error('Error sending iOS push notification:', err);
  }
}

function createWindow() {
  db = new DatabaseService();
  const settings = db.getSettings();
  gemini = new GeminiService(settings.geminiApiKey || '');

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
  startReminderChecker();

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

        const newTask = db.addTask(parsed);
        logger.info(`[iPhone Sync] Successfully added task "${newTask.title}" from iPhone 15`);
        
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('task-added-from-iphone', newTask);
        }

        // Trigger Instant Windows Desktop Toast Confirmation
        const displayTime = newTask.dueTime ? formatTime12Hour(newTask.dueTime) : (newTask.dueDate || 'Today');
        sendWindowsToastNotification('📱 Task Received from iPhone', `"${newTask.title}" | Scheduled for ${displayTime}`);
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

function createSystemTray() {
  try {
    const icoPath = path.join(__dirname, 'assets', 'icon.ico');
    let trayIcon = nativeImage.createFromPath(icoPath);

    if (trayIcon.isEmpty()) {
      const iconBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAzSURBVHgB7cxBDQAwDMCw40h/p2Z4wMEfS1IBTfLE3u32KIB27t0eBdDOHQXQzsEB2rkf6yQC2N8x7f4AAAAASUVORUS5CYII=',
        'base64'
      );
      trayIcon = nativeImage.createFromBuffer(iconBuffer);
    }

    tray = new Tray(trayIcon);
    tray.setToolTip('Nova - Click to toggle dashboard');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show / Hide Assistant',
        click: () => toggleWindowVisibility()
      },
      {
        label: 'Toggle Mini Widget Mode',
        click: () => {
          isWidgetMode = !isWidgetMode;
          setWidgetDimensions(isWidgetMode);
        }
      },
      { type: 'separator' },
      {
        label: 'Exit Nova',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('click', () => toggleWindowVisibility());
    tray.on('double-click', () => toggleWindowVisibility());
  } catch (e) {
    console.error('Failed to create tray icon:', e);
  }
}

function setWidgetDimensions(enableWidget) {
  if (!mainWindow) return;
  isWidgetMode = enableWidget;

  if (isWidgetMode) {
    mainWindow.setSize(440, 260);
    mainWindow.setAlwaysOnTop(true);
  } else {
    mainWindow.setSize(500, 600);
    mainWindow.setAlwaysOnTop(false);
  }
  mainWindow.webContents.send('widget-mode-changed', isWidgetMode);
}

function formatTime12Hour(timeStr) {
  if (!timeStr) return '';
  const parts = String(timeStr).split(':');
  if (parts.length < 2) return timeStr;
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1].padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

function startReminderChecker() {
  if (reminderInterval) clearInterval(reminderInterval);

  // Sharp 1-second polling daemon for exact time notifications
  reminderInterval = setInterval(() => {
    if (!db) return;

    const tasks = db.getTasks();
    const now = new Date();
    const currentDateStr = getLocalDateString(now);
    const currentTimeStrSec = getLocalTimeStringSec(now);

    tasks.forEach(task => {
      if (
        task.type === 'scheduled' &&
        task.status === 'pending' &&
        task.reminder &&
        !task.notified &&
        task.dueDate &&
        task.dueTime
      ) {
        const isTodayOrPastDate = task.dueDate <= currentDateStr;
        const taskTimeSec = task.dueTime.length === 5 ? `${task.dueTime}:00` : task.dueTime;
        const isTimeDue = (task.dueDate < currentDateStr) || (task.dueDate === currentDateStr && taskTimeSec <= currentTimeStrSec);

        if (isTodayOrPastDate && isTimeDue) {
          db.updateTask(task.id, { notified: true });

          // Play Audio Chime
          playWindowsAudioChime();

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('trigger-reminder', task);
          }

          // Trigger Clean Windows Native Desktop Notification
          const priorityStr = (task.priority || 'medium').toUpperCase();
          const timeStr = task.dueTime ? formatTime12Hour(task.dueTime) : '';

          const notifTitle = task.title || 'Task Reminder';
          const notifBody = `Time: ${timeStr} | Priority: ${priorityStr}`;
          
          sendWindowsToastNotification(notifTitle, notifBody);

          // 📱 Dispatch Single Free Instant Push Notification directly to iPhone 15
          sendIosPushNotification(notifTitle, notifBody);
        }
      }
    });
  }, 1000);
}

// IPC Handlers
ipcMain.handle('get-tasks', () => db.getTasks());

ipcMain.handle('add-task', (event, taskData) => db.addTask(taskData));

ipcMain.handle('parse-input', (event, inputStr) => parseTaskInput(inputStr));

ipcMain.handle('update-task', (event, { id, updates }) => db.updateTask(id, updates));

ipcMain.handle('snooze-task', (event, { id, minutes }) => db.snoozeTask(id, minutes));

ipcMain.handle('delete-task', (event, id) => db.deleteTask(id));

ipcMain.handle('clear-all-tasks', () => db.clearAllTasks());

ipcMain.handle('get-settings', () => db.getSettings());

ipcMain.handle('update-settings', (event, settings) => {
  if (settings.geminiApiKey !== undefined) {
    gemini.setApiKey(settings.geminiApiKey);
  }
  if (settings.ntfyTopic !== undefined && ntfySubscriber) {
    ntfySubscriber.setTopic(settings.ntfyTopic);
  }
  return db.updateSettings(settings);
});

// Gemini AI IPC Calls
ipcMain.handle('gemini-chat', async (event, userInput) => {
  const tasks = db.getTasks();
  return await gemini.assistantResponse(userInput, tasks);
});

ipcMain.handle('gemini-summary', async () => {
  const tasks = db.getTasks();
  return await gemini.generateDailySummary(tasks);
});

ipcMain.on('toggle-widget-mode', (event, isWidget) => setWidgetDimensions(isWidget));

ipcMain.on('show-notification', (event, { title, body }) => {
  sendWindowsToastNotification(title, body);
  sendIosPushNotification(title, body);
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (reminderInterval) clearInterval(reminderInterval);
  if (process.platform !== 'darwin') app.quit();
});
