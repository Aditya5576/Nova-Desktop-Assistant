const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Windows Task Scheduler Service (Production 100% Closed-App Verification)
 */

class TaskSchedulerService {
  constructor() {
    this.scriptsDir = path.join(__dirname, '../../scripts');
    this.dbPath = path.join(__dirname, '../../myassist_tasks.json');
    if (!fs.existsSync(this.scriptsDir)) {
      fs.mkdirSync(this.scriptsDir, { recursive: true });
    }
    this.ensureTaskRunnerScript();
  }

  ensureTaskRunnerScript() {
    try {
      const runnerPs1 = path.join(this.scriptsDir, 'runTask.ps1');
      const psContent = `param (
    [string]$Id = ""
)

if (-not $Id) { exit }

try {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $dbPath = Join-Path (Split-Path -Parent $scriptDir) "myassist_tasks.json"

    if (-not (Test-Path $dbPath)) { exit }

    $json = Get-Content $dbPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $task = $json.tasks | Where-Object { $_.id -eq $Id }

    if (-not $task) { exit }

    $title = if ($task.title) { $task.title } else { "Task Reminder" }
    $priority = if ($task.priority) { $task.priority.ToUpper() } else { "MEDIUM" }
    $body = "Priority: $priority"
    if ($task.recurring -and $task.recurring -ne "none") {
        $body += " | Recurring: $($task.recurring)"
    }

    $topic = ""
    if ($json.settings -and $json.settings.ntfyTopic) {
        $topic = $json.settings.ntfyTopic.Trim()
    }

    # 1. Play Audio Sound
    [System.Media.SystemSounds]::Exclamation.Play()

    # 2. Show Native Windows Toast Notification Banner
    try {
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

        $template = @"
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>$($title)</text>
      <text>$($body)</text>
    </binding>
  </visual>
</toast>
"@
        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml($template)
        $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
        $toast.ExpirationTime = [System.DateTimeOffset]::Now.AddMinutes(10)
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("com.nova.desktop").Show($toast)
    } catch {}

    # 3. Dispatch Push Notification directly to iPhone 15 (via ntfy.sh)
    if ($topic -and $topic -ne "none") {
        try {
            $url = "https://ntfy.sh/$topic"
            $safeTitle = $title -replace '[^\x00-\x7F]', ''
            Invoke-RestMethod -Uri $url -Method Post -Body $body -Headers @{ "Title" = "$safeTitle"; "Priority" = "high"; "Tags" = "bell,alarm_clock" } -ErrorAction SilentlyContinue
        } catch {}
    }

    # Mark as notified in Database
    $task.notified = $true
    $json | ConvertTo-Json -Depth 10 | Set-Content $dbPath -Encoding UTF8
} catch {}
`;
      fs.writeFileSync(runnerPs1, psContent, 'utf-8');
    } catch (err) {
      console.error('Failed to create runTask script:', err);
    }
  }

  scheduleTask(task) {
    try {
      if (!task || !task.id || !task.dueDate || task.status === 'done') return;

      const taskId = String(task.id);
      const safeTaskNameId = taskId.replace(/[^a-zA-Z0-9_]/g, '_');
      const taskName = `MyAssist_Rem_${safeTaskNameId}`;

      const dateParts = String(task.dueDate).split('-');
      if (dateParts.length !== 3) return;
      const [year, month, day] = dateParts;

      let schTime = task.dueTime || '09:00:00';
      if (schTime.length === 5) {
        schTime = `${schTime}:00`;
      }

      // Format date as dd/MM/yyyy for Windows Task Scheduler
      const formattedDateStr = `${day}/${month}/${year}`;

      const runnerScript = path.join(this.scriptsDir, 'runTask.ps1');
      const taskAction = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${runnerScript}" -Id "${taskId}"`;

      // Remove previous task if exists, then create new OS task
      exec(`schtasks /Delete /TN "${taskName}" /F`, () => {
        const createCmd = `schtasks /Create /TN "${taskName}" /TR "${taskAction}" /SC ONCE /SD "${formattedDateStr}" /ST "${schTime}" /F`;
        exec(createCmd, (err, stdout, stderr) => {
          if (!err) {
            console.log(`[TaskScheduler] Registered Windows OS Task "${taskName}" for ${formattedDateStr} at ${schTime}`);
          } else {
            console.error(`[TaskScheduler] Error creating ${taskName}:`, stderr || err.message);
          }
        });
      });
    } catch (err) {
      console.error('Failed to schedule Windows OS task:', err);
    }
  }

  removeTask(id) {
    try {
      const safeTaskNameId = String(id).replace(/[^a-zA-Z0-9_]/g, '_');
      const taskName = `MyAssist_Rem_${safeTaskNameId}`;
      exec(`schtasks /Delete /TN "${taskName}" /F`, () => {});
    } catch (err) {
      console.error('Failed to delete Windows OS task:', err);
    }
  }

  syncAllPendingTasks(tasks = []) {
    try {
      tasks.forEach(task => {
        if (task.status === 'pending' && task.dueDate) {
          this.scheduleTask(task);
        }
      });
    } catch (e) {
      console.error('Failed to sync pending tasks with Task Scheduler:', e);
    }
  }
}

module.exports = TaskSchedulerService;
