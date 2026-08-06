param (
    [string]$Title = "Task Reminder",
    [string]$Body = "Reminder due now!",
    [string]$Topic = ""
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
    
    $appId = "com.nova.desktop"
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
} catch {
    [System.Media.SystemSounds]::Exclamation.Play()
}

# Dispatch iPhone 15 Push Notification via ntfy.sh if Topic is provided
if ($Topic -and $Topic.Trim()) {
    try {
        $safeTopic = $Topic.Trim()
        $url = "https://ntfy.sh/$safeTopic"
        $safeTitle = $Title -replace '[^\x00-\x7F]', ''
        Invoke-RestMethod -Uri $url -Method Post -Body "$Body" -Headers @{ "Title" = "$safeTitle"; "Priority" = "high"; "Tags" = "bell" } -ErrorAction SilentlyContinue
    } catch {}
}
