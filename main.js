const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const DatabaseService = require('./src/services/database');
const GeminiService = require('./src/services/geminiService');
const { parseTaskInput, getLocalDateString, getLocalTimeStringSec } = require('./src/services/nlpParser');

// Register Windows App User Model ID for native instant Windows OS Notifications
const APP_USER_MODEL_ID = 'com.myassist.desktop';
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
let reminderInterval;
let isWidgetMode = false;

function playWindowsAudioChime() {
  const cmd = `powershell -NoProfile -Command "[System.Media.SystemSounds]::Exclamation.Play()"`;
  exec(cmd, () => {});
}

// Instant Native Windows Toast Notification (0ms delay, branded MyAssist header)
function sendWindowsToastNotification(title, body) {
  try {
    if (Notification.isSupported()) {
      const icoPath = path.join(__dirname, 'assets', 'icon.png');
      const notif = new Notification({
        title: title || 'MyAssist Reminder',
        body: body || 'Task reminder due now!',
        icon: fs.existsSync(icoPath) ? icoPath : undefined,
        silent: false
      });

      notif.on('click', () => {
        toggleWindowVisibility();
      });

      notif.show();
    }
  } catch (err) {
    console.error('Failed to trigger native toast notification:', err);
  }
}

function createWindow() {
  db = new DatabaseService();
  const settings = db.getSettings();
  gemini = new GeminiService(settings.geminiApiKey || '');

  mainWindow = new BrowserWindow({
    width: 580,
    height: 620,
    minWidth: 420,
    minHeight: 360,
    title: 'MyAssist - Desktop Task Assistant',
    backgroundColor: '#0f172a',
    show: false,
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

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

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
    tray.setToolTip('MyAssist - Click to toggle dashboard');

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
        label: 'Exit MyAssist',
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
    mainWindow.setSize(480, 280);
    mainWindow.setAlwaysOnTop(true);
  } else {
    mainWindow.setSize(580, 620);
    mainWindow.setAlwaysOnTop(false);
  }
  mainWindow.webContents.send('widget-mode-changed', isWidgetMode);
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

          // Trigger Instant Windows Native Desktop Notification
          sendWindowsToastNotification(
            `🔔 MyAssist [${(task.priority || 'medium').toUpperCase()}]`,
            task.title + (task.recurring !== 'none' ? ` (🔄 ${task.recurring})` : '')
          );
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

ipcMain.handle('get-settings', () => db.getSettings());

ipcMain.handle('update-settings', (event, settings) => {
  if (settings.geminiApiKey !== undefined) {
    gemini.setApiKey(settings.geminiApiKey);
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
