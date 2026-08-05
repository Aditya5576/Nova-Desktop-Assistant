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
      const psContent = `param (
    [string]$Title = "Task Reminder",
    [string]$Body = "Reminder due now!"
)

try {
    [System.Media.SystemSounds]::Exclamation.Play()
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
    $toast.ExpirationTime = [System.DateTimeOffset]::Now.AddMinutes(5)
    
    $appId = "com.myassist.desktop"
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
} catch {
    [System.Media.SystemSounds]::Exclamation.Play()
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

      // Format date for Windows schtasks /SD
      const formattedDateStr = `${day}-${month}-${year}`;

      const psScript = path.join(this.scriptsDir, 'sendToast.ps1');
      const safeTitle = (task.title || 'Task Reminder').replace(/"/g, '`"');
      const priorityStr = (task.priority || 'medium').toUpperCase();
      const bodyDetails = `Priority: ${priorityStr}${task.recurring !== 'none' ? ` | Recurring: ${task.recurring}` : ''}`;
      
      const taskAction = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${psScript}" -Title "${safeTitle}" -Body "${bodyDetails}"`;

      // Remove previous task if exists
      exec(`schtasks /Delete /TN "${taskName}" /F`, () => {
        // Create new OS task
        const createCmd = `schtasks /Create /TN "${taskName}" /TR "${taskAction}" /SC ONCE /SD "${formattedDateStr}" /ST "${schTime}" /F /RL HIGHEST`;
        exec(createCmd, (err) => {
          if (!err) {
            console.log(`Registered Windows Task Scheduler for ${taskName} at ${formattedDateStr} ${schTime}`);
          }
        });
      });
    } catch (err) {
      console.error('Failed to schedule Windows OS task:', err);
    }
  }

  removeTask(id) {
    try {
      const taskId = String(id).replace(/[^a-zA-Z0-9_]/g, '_');
      const taskName = `MyAssist_Rem_${taskId}`;
      exec(`schtasks /Delete /TN "${taskName}" /F`, () => {});
    } catch (err) {
      console.error('Failed to delete Windows OS task:', err);
    }
  }
}

module.exports = TaskSchedulerService;
