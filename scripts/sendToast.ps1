param (
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
