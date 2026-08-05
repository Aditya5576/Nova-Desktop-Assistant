const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Windows Task Scheduler Service (Fail-Safe Error Wrapped)
 */

class TaskSchedulerService {
  constructor() {
    this.scriptsDir = path.join(__dirname, '../../scripts');
    if (!fs.existsSync(this.scriptsDir)) {
      fs.mkdirSync(this.scriptsDir, { recursive: true });
    }
    this.ensureNotifyScript();
  }

  ensureNotifyScript() {
    try {
      const notifyPs1 = path.join(this.scriptsDir, 'sendToast.ps1');
      const psContent = `
param (
    [string]$Title = "🔔 MyAssist Reminder",
    [string]$Body = "You have a scheduled task reminder!"
)

try {
    [System.Media.SystemSounds]::Asterisk.Play()
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

    $template = @"
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>$Title</text>
      <text>$Body</text>
    </binding>
  </visual>
</toast>
"@

    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml($template)
    $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("MyAssist").Show($toast)
} catch {
    # Silently ignore toast errors
}
`;
      fs.writeFileSync(notifyPs1, psContent, 'utf-8');
    } catch (err) {
      console.error('Failed to create notify script:', err);
    }
  }

  scheduleTask(task) {
    try {
      if (!task || !task.dueDate || !task.reminder || task.status === 'done') return;

      const taskId = String(task.id).replace(/[^a-zA-Z0-9_]/g, '_');
      const taskName = `MyAssist_Rem_${taskId}`;

      const dateParts = String(task.dueDate).split('-');
      if (dateParts.length !== 3) return;
      const [year, month, day] = dateParts;

      let schTime = task.dueTime || '09:00:00';
      if (schTime.length === 5) {
        schTime = `${schTime}:00`;
      }

      const notifyScript = path.join(this.scriptsDir, 'sendToast.ps1');
      const cleanTitle = (task.title || 'Task Reminder').replace(/[^a-zA-Z0-9\s\-]/g, '');

      const trCommand = `powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File '${notifyScript}' -Title 'MyAssist Reminder' -Body '${cleanTitle}'`;

      exec(`powershell -NoProfile -Command "(Get-Date -Year ${year} -Month ${month} -Day ${day}).ToString('d')"`, (err, stdout) => {
        if (err) {
          const fallbackDate = `${month}/${day}/${year}`;
          this.executeSchtasks(taskName, trCommand, fallbackDate, schTime);
          return;
        }
        const schDate = stdout.trim() || `${month}/${day}/${year}`;
        this.executeSchtasks(taskName, trCommand, schDate, schTime);
      });
    } catch (e) {
      console.error('Fail-safe caught error in scheduleTask:', e);
    }
  }

  executeSchtasks(taskName, trCommand, schDate, schTime) {
    const cmd = `schtasks /Create /TN "${taskName}" /TR "${trCommand}" /SC ONCE /SD ${schDate} /ST ${schTime} /F`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.warn(`Windows Task Scheduler Notice for ${taskName}:`, stderr || error.message);
      } else {
        console.log(`SUCCESS: Registered Windows OS Task Scheduler for ${taskName} at ${schDate} ${schTime}`);
      }
    });
  }

  removeTask(taskId) {
    try {
      if (!taskId) return;
      const cleanId = String(taskId).replace(/[^a-zA-Z0-9_]/g, '_');
      const taskName = `MyAssist_Rem_${cleanId}`;

      const cmd = `schtasks /Delete /TN "${taskName}" /F`;
      exec(cmd, () => {});
    } catch (e) {
      console.error('Error removing schtasks task:', e);
    }
  }
}

module.exports = TaskSchedulerService;
