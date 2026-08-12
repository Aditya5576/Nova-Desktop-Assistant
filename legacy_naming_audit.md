# Nova Desktop Assistant — Step 11 Legacy Naming Audit

## Classification of `MyAssist` / `myassist` Identifiers:

| Identifier | Context | Category | Recommendation / Migration Plan |
| :--- | :--- | :--- | :--- |
| `myassist_tasks.json` | Core JSON database file on disk | **B. Internal Database Filename** | Preserve filename to maintain backward compatibility with existing installations. |
| `MyAssist_Rem_<id>` | Windows Task Scheduler task name prefix (`schtasks /Create /TN ...`) | **C. Windows Task Scheduler Name** | Retain prefix to prevent breaking existing OS-level scheduled tasks on user machines. |
| `window.myassist` | Context bridge API namespace in `preload.js` | **D. Compatibility Identifier** | Retain `window.myassist` while adding optional alias `window.nova` for clean forward-compatibility. |
| `start-myassist.bat` | Background silent launcher script | **D. Compatibility Launcher Script** | Keep launcher scripts intact to preserve user shortcuts. |
| `myassist.log` | Local application log file | **F. Internal Logging** | Retain for local debugging. |

### Migration Decision:
Per Phase 4 directives, **NO unsafe renames are performed** to guarantee 100% non-regression across existing Windows shortcuts, registered Task Scheduler tasks, and persistent database files.
