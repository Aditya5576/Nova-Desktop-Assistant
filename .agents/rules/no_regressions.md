# Strict Non-Regression Policy
Whenever modifying code, styles, IPC handlers, or services in Nova Desktop Assistant:
1. NEVER break or regress previously resolved features.
2. Maintain 100% operational status for:
   - Windows OS Desktop Toast Notifications (`sendToast.ps1` with standard AppID).
   - Loud 3-Tone Tri-Chime Audio Alert (`playChimeSound()`).
   - Natural language task parsing (including plural `secs`, `mins`, `hrs`, decimal floats, and absolute dates).
   - Clean tab navigation (Tab 1, Tab 2, Tab 3, Tab 4).
   - Windows OS Task Scheduler (`schtasks.exe`).
   - Single-instance process lock and silent VBS launcher.
