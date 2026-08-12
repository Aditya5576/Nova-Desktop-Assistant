param (
    [string]$Title = "Task Reminder",
    [string]$Body = "Reminder due now!",
    [string]$Topic = "none"
)

try {
    Add-Type -AssemblyName System.Security
    $xmlTitle = [System.Security.SecurityElement]::Escape($Title)
    $xmlBody = [System.Security.SecurityElement]::Escape($Body)

    [System.Media.SystemSounds]::Exclamation.Play()
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

    $template = @"
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>$($xmlTitle)</text>
      <text>$($xmlBody)</text>
    </binding>
  </visual>
</toast>
"@

    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml($template)
    $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
    $toast.ExpirationTime = [System.DateTimeOffset]::Now.AddMinutes(10)
    
    $appIds = @(
        "com.nova.desktop",
        "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe",
        "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\cmd.exe"
    )

    foreach ($appId in $appIds) {
        try {
            [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
            break
        } catch {}
    }
} catch {
    [System.Media.SystemSounds]::Exclamation.Play()
}

if ($Topic -and $Topic.Trim() -and $Topic.Trim() -ne "none") {
    try {
        $safeTopic = $Topic.Trim()
        $url = "https://ntfy.sh/${safeTopic}"
        $safeTitle = $Title -replace '[^\x00-\x7F]', ''
        Invoke-RestMethod -Uri $url -Method Post -Body "${Body}" -Headers @{ "Title" = "${safeTitle}"; "Priority" = "high"; "Tags" = "bell" } -ErrorAction SilentlyContinue
    } catch {}
}
