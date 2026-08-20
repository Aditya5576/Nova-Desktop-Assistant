const { contextBridge, ipcRenderer } = require('electron');

const apiBridge = {
  getTasks: () => ipcRenderer.invoke('get-tasks'),
  addTask: (taskData) => ipcRenderer.invoke('add-task', taskData),
  parseInput: (inputStr) => ipcRenderer.invoke('parse-input', inputStr),
  updateTask: (idOrObj, updates) => {
    if (typeof idOrObj === 'object' && idOrObj !== null && idOrObj.id) {
      return ipcRenderer.invoke('update-task', { id: idOrObj.id, updates: idOrObj.updates || updates });
    }
    return ipcRenderer.invoke('update-task', { id: idOrObj, updates });
  },
  snoozeTask: (idOrObj, minutes) => {
    if (typeof idOrObj === 'object' && idOrObj !== null && idOrObj.id) {
      return ipcRenderer.invoke('snooze-task', { id: idOrObj.id, minutes: idOrObj.minutes !== undefined ? idOrObj.minutes : minutes });
    }
    return ipcRenderer.invoke('snooze-task', { id: idOrObj, minutes });
  },
  deleteTask: (id) => ipcRenderer.invoke('delete-task', id),
  clearCompletedTasks: () => ipcRenderer.invoke('clear-completed-tasks'),
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
  },
  onTaskAddedFromIphone: (callback) => {
    ipcRenderer.on('task-added-from-iphone', (event, task) => callback(task));
  },
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
};

contextBridge.exposeInMainWorld('myassist', apiBridge);
contextBridge.exposeInMainWorld('myAssistAPI', apiBridge);
