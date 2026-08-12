# Nova Desktop Assistant — Step 0 Architecture Inventory & Audit

## 1. Overview & Current Modules

The Nova Desktop Assistant codebase (`Aditya5576/Nova-Desktop-Assistant`) is an Electron-based desktop task management application integrated with Google Gemini AI, Windows Task Scheduler, and `ntfy.sh` iPhone push notifications.

### Primary Modules & File Locations:

| Module / File | Primary Responsibility | Dependencies |
| :--- | :--- | :--- |
| **`main.js`** | Electron main process lifecycle, window creation, system tray, 1s reminder daemon, IPC handler registration, direct PowerShell/https notification helpers. | `electron`, `DatabaseService`, `GeminiService`, `nlpParser`, `logger`, `NtfySubscriber`, `child_process`, `https`, `fs`, `path` |
| **`preload.js`** | Context isolation bridge exposing IPC methods (`window.myassist`) to renderer process. | `electron` (`contextBridge`, `ipcRenderer`) |
| **`src/renderer/app.js`** | Client UI renderer script: DOM manipulation, tab navigation, clock widget, form submits, task rendering, toast banners, WebAudio chime, theme switching. | Exposed `window.myassist` IPC bridge, WebAudio API, DOM |
| **`src/services/database.js`** | Persistence engine for `myassist_tasks.json`: Task CRUD operations, recurring task creation, snooze calculations, settings management, `safeStorage` API key encryption/decryption, atomic temp file writes (`.tmp` → `renameSync`), and kernel-level OS lock claims (`.locks/claim_<id>.lock`). | `TaskSchedulerService`, `electron.safeStorage`, `fs`, `path` |
| **`src/services/taskSchedulerService.js`** | Manages Windows OS Task Scheduler integration (`schtasks`), generates closed-app PowerShell runner script `scripts/runTask.ps1`. | `child_process.exec`, `fs`, `path` |
| **`src/services/geminiService.js`** | Communicates with Google Gemini REST API (`gemini-3.6-flash`), handles structured intent parsing (`ADD_TASK` JSON extraction), daily productivity summaries. | Native `fetch`, Google Generative Language API |
| **`src/services/nlpParser.js`** | Natural language parser converting strings into structured task objects (title, priority, category, recurring, dueDate, dueTime). | Native JS Date regex parsing |
| **`src/services/ntfySubscriber.js`** | Long-polling HTTP subscriber listening to `ntfy.sh/<topic>` for remote task injection from iPhone/external devices. | Node.js `https`, `events.EventEmitter` |
| **`src/services/logger.js`** | File logger writing events to `myassist.log`. | `fs`, `path` |
| **`scripts/runTask.ps1`** | Generated closed-app PowerShell runner invoked by Windows Task Scheduler. Performs OS kernel lock claim, checks notification settings, dispatches Windows toast, audio chime, and `ntfy.sh` push notification. | Windows Runtime Toast API, System.Media, System.Security |
| **`scripts/sendToast.ps1`** | PowerShell Toast notification dispatcher used by `main.js`. | Windows Runtime Toast API, `ntfy.sh` REST API |
| **`launch-silent.vbs` / `start-myassist.bat` / `sync-myassist.bat`** | VBScript & Batch silent background app launchers with dynamic path resolution (`%~dp0`, `WScript.ScriptFullName`). | Windows Script Host (`wscript.exe`), cmd.exe |

---

## 2. IPC Flow (Renderer ↔ Preload ↔ Main ↔ Services)

```text
  Renderer (src/renderer/app.js)
            │
            ▼
  Preload (preload.js) [window.myassist]
            │
            ▼  ipcRenderer.invoke() / ipcRenderer.send()
  ipcMain Handlers (main.js)
       ├── get-tasks           ► db.getTasks()
       ├── add-task            ► db.addTask(taskData)
       ├── parse-input         ► parseTaskInput(inputStr)
       ├── update-task         ► db.updateTask(id, updates)
       ├── snooze-task         ► db.snoozeTask(id, minutes)
       ├── delete-task         ► db.deleteTask(id)
       ├── clear-completed-tasks ► db.clearCompletedTasks()
       ├── clear-all-tasks     ► db.clearAllTasks()
       ├── get-settings        ► db.getSettings() (Sanitized, no raw key)
       ├── update-settings     ► db.updateSettings(settings) + gemini.setApiKey()
       ├── gemini-chat         ► gemini.assistantResponse(input, tasks)
       └── gemini-summary      ► gemini.generateDailySummary(tasks)
```

---

## 3. Reminder & Deduplication Flow

```text
               Scheduled Task Due Time Arrives
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   Electron main.js Loop             Windows Task Scheduler
   (1s JS Interval Checker)         (scripts/runTask.ps1)
            │                                 │
            └────────────────┬────────────────┘
                             ▼
                db.claimTaskReminder(taskId)
    [Kernel OS Lock File Creation: .locks/claim_<id>.lock (fs.openSync 'wx')]
                             │
            ┌────────────────┴────────────────┐
            │                                 │
     Claim Successful                 Already Claimed (EEXIST)
   (Returned Task Object)             (Returned null)
            │                                 │
            ▼                                 ▼
   Check User Settings                  EXIT IMMEDIATELY
  - soundEnabled                      (Zero double notification)
  - notificationsEnabled
            │
            ├──────► Play Audio Chime (if soundEnabled)
            ├──────► Display Native Windows Toast (if notificationsEnabled)
            ├──────► Send WebAudio Chime to Renderer UI
            └──────► Dispatch Push Notification to iPhone 15 via ntfy.sh (if notificationsEnabled)
```

---

## 4. Database Flow & Persistence
- **Storage Path**: `myassist_tasks.json` in project root.
- **Atomic File Writes**: All write operations in `DatabaseService` write to a temporary file (`myassist_tasks.json.tmp`) and call `fs.renameSync` for atomic file replacement, preventing JSON corruption during process crashes or power loss.
- **API Key Security**: Plaintext API key is never written to disk. If Electron `safeStorage` is available (Windows DPAPI), API key is encrypted and saved as `geminiApiKeyEncrypted`. If `safeStorage` is unavailable, API key is held in memory for the active session (`this.inMemoryApiKey`) and stripped from disk.

---

## 5. Gemini Flow
- Main process initializes `GeminiService(decryptedApiKey)`.
- Renderer invokes `geminiChat` or `geminiSummary` over IPC.
- `geminiChat` sends request to Google Gemini API (`gemini-3.6-flash`). If response contains a structured ````json ``` block (`action: "ADD_TASK"`), `geminiService` extracts the task object, strips the JSON block from text, and returns clean text + `extractedTask`. Main process adds the task if present and returns clean text to renderer.

---

## 6. Windows Integration Flow
- **AppUserModelID**: `com.nova.desktop` registered for native Windows Toast Notifications.
- **Task Scheduler**: When a task is added/updated in `DatabaseService`, `TaskSchedulerService.scheduleTask()` registers an OS task via `schtasks /Create /TN "MyAssist_Rem_<id>"`.
- **Portable Launchers**: Shortcuts target `wscript.exe launch-silent.vbs` for silent background execution without command prompt popups.

---

## 7. Current Architecture Limitations to Address in Phase 4:
1. `main.js` currently contains direct IPC endpoint implementations, direct notification functions (`playWindowsAudioChime`, `sendWindowsToastNotification`, `sendIosPushNotification`), and window lifecycle orchestration.
2. `database.js` currently contains task CRUD operations, recurring task creation logic, snooze math, settings persistence, safeStorage encryption, and OS lock file claiming.
3. Service separation will cleanly decompose these responsibilities into focused modules (`TaskService`, `ReminderService`, `NotificationService`) without altering any underlying application behavior or test expectations.
