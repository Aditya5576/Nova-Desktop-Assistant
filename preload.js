const { contextBridge, ipcRenderer } = require('electron');

const apiBridge = {
  getTasks: () => ipcRenderer.invoke('get-tasks'),
  addTask: (taskData) => ipcRenderer.invoke('add-task', taskData),
  parseInput: (inputStr) => ipcRenderer.invoke('parse-input', inputStr),
  updateTask: (id, updates) => ipcRenderer.invoke('update-task', { id, updates }),
  snoozeTask: (id, minutes) => ipcRenderer.invoke('snooze-task', { id, minutes }),
  deleteTask: (id) => ipcRenderer.invoke('delete-task', id),
  clearAllTasks: () => ipcRenderer.invoke('clear-all-tasks'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
  geminiChat: (userInput) => ipcRenderer.invoke('gemini-chat', userInput),
  geminiSummary: () => ipcRenderer.invoke('gemini-summary'),
  toggleWidgetMode: (isWidget) => ipcRenderer.send('toggle-widget-mode', isWidget),
  showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
  onWidgetModeChanged: (callback) => {
    ipcRenderer.on('widget-mode-changed', (event, isWidget) => callback(isWidget));
  },
  onTriggerReminder: (callback) => {
    ipcRenderer.on('trigger-reminder', (event, task) => callback(task));
  },
  onGlobalHotkeyTrigger: (callback) => {
    ipcRenderer.on('global-hotkey-toggle', () => callback());
  }
};

contextBridge.exposeInMainWorld('myassist', apiBridge);
contextBridge.exposeInMainWorld('myAssistAPI', apiBridge);
