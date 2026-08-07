[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

$template = @"
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>Nova Desktop Test Banner</text>
      <text>Time: 11:28 AM | Priority: HIGH</text>
    </binding>
  </visual>
</toast>
"@

$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)

# Fallback AppIDs for guaranteed Windows Toast display
$appIds = @(
    "com.nova.desktop",
    "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe",
    "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\cmd.exe"
)

$shown = $false
foreach ($appId in $appIds) {
    try {
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
        Write-Host "Successfully displayed Toast using AppID: $appId"
        $shown = $true
        break
    } catch {
        Write-Host "Failed AppID $appId : $_"
    }
}
