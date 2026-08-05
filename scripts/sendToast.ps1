param (
    [string]$Title = "🔔 MyAssist Reminder",
    [string]$Body = "You have a scheduled task reminder!",
    [string]$Category = "General",
    [string]$Priority = "MEDIUM"
)

try {
    [System.Media.SystemSounds]::Exclamation.Play()
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

    $template = @"
<toast scenario="reminder">
  <visual>
    <binding template="ToastGeneric">
      <text hint-maxLines="1">$Title</text>
      <text hint-maxLines="3">$Body</text>
      <text placement="attribution">MyAssist Task Assistant • Priority: $Priority</text>
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
