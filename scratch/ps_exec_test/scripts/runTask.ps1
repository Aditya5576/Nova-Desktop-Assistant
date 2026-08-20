param (
    [string]$Id = ""
)

if (-not $Id) { exit }

try {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $appDir = Split-Path -Parent $scriptDir

    $possibleDbPaths = @(
        (Join-Path $env:APPDATA "Nova\myassist_tasks.json"),
        (Join-Path $env:APPDATA "MyAssist\myassist_tasks.json"),
        (Join-Path $appDir "myassist_tasks.json")
    )

    $dbPath = ""
    foreach ($p in $possibleDbPaths) {
        if (Test-Path $p) {
            $dbPath = $p
            $appDir = Split-Path -Parent $p
            break
        }
    }

    if (-not $dbPath) { exit }
    $locksDir = Join-Path $appDir ".locks"

    $safeId = $Id -replace '[^a-zA-Z0-9_]', '_'
    $taskName = "MyAssist_Rem_${safeId}"

    # 1. Self-deletion: Immediately unregister own Windows Scheduled Task to prevent Task Scheduler re-triggers
    try {
        & schtasks.exe /Delete /TN "$taskName" /F 2>&1 | Out-Null
    } catch {}

    if (-not (Test-Path $locksDir)) {
        New-Item -ItemType Directory -Path $locksDir -Force | Out-Null
    }

    $json = Get-Content $dbPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $task = $json.tasks | Where-Object { $_.id -eq $Id }

    # Strict Deduplication Guard: Exit if task does not exist, is marked done, or is ALREADY notified
    if (-not $task -or $task.notified -eq $true -or $task.status -ne "pending") {
        exit
    }

    # 2. Cross-Process Atomic OS Kernel Lock File Claim
    $lockPath = Join-Path $locksDir "claim_${safeId}.lock"

    $lockAcquired = $false
    try {
        $stream = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        $writer = New-Object System.IO.StreamWriter($stream)
        $writer.WriteLine("PowerShell PID ${PID} at $(Get-Date -Format 'o')")
        $writer.Close()
        $stream.Close()
        $lockAcquired = $true
    } catch {
        if (Test-Path $lockPath) {
            $lastWrite = (Get-Item $lockPath).LastWriteTime
            if ((Get-Date) - $lastWrite -gt [TimeSpan]::FromSeconds(60)) {
                try {
                    Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
                    $stream = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
                    $writer = New-Object System.IO.StreamWriter($stream)
                    $writer.WriteLine("PowerShell Recovered PID ${PID} at $(Get-Date -Format 'o')")
                    $writer.Close()
                    $stream.Close()
                    $lockAcquired = $true
                } catch {}
            }
        }
    }

    if (-not $lockAcquired) {
        exit # ALREADY_CLAIMED by Electron main process
    }

    # 3. Mark as notified in Database with Retry Write Loop
    $task.notified = $true
    $jsonStr = $json | ConvertTo-Json -Depth 10
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false

    $written = $false
    for ($i = 0; $i -lt 3; $i++) {
        try {
            [System.IO.File]::WriteAllText($dbPath, $jsonStr, $utf8NoBom)
            $written = $true
            break
        } catch {
            Start-Sleep -Milliseconds 100
        }
    }

    # If database write failed after retries, abort notification dispatch to preserve invariant
    if (-not $written) {
        exit
    }

    $title = if ($task.title) { $task.title } else { "Task Reminder" }
    $priority = if ($task.priority) { $task.priority.ToUpper() } else { "MEDIUM" }
    $timeStr = ""
    if ($task.dueTime) {
        $tParts = $task.dueTime.ToString().Split(':')
        if ($tParts.Length -ge 2) {
            $h = [int]$tParts[0]
            $m = $tParts[1]
            $ampm = if ($h -ge 12) { "PM" } else { "AM" }
            $h12 = if ($h % 12 -eq 0) { 12 } else { $h % 12 }
            $timeStr = "${h12}:${m} ${ampm}"
        }
    }

    $body = "Time: ${timeStr} | Priority: ${priority}"

    $topic = "nova-my-tasks"
    if ($json.settings -and $json.settings.ntfyTopic -and $json.settings.ntfyTopic.Trim()) {
        $topic = $json.settings.ntfyTopic.Trim()
    }

    $soundOn = ($json.settings -and $json.settings.soundEnabled -ne $false)
    $notifOn = ($json.settings -and $json.settings.notificationsEnabled -ne $false)

    # 4. Play Audio Sound if enabled
    if ($soundOn) {
        try { [System.Media.SystemSounds]::Exclamation.Play() } catch {}
    }

    # 5. Show Native Windows Toast Notification Banner if enabled
    if ($notifOn) {
        try {
            [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
            [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

            Add-Type -AssemblyName System.Security
            $xmlTitle = [System.Security.SecurityElement]::Escape($title)
            $xmlBody = [System.Security.SecurityElement]::Escape($body)

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
            [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("com.nova.desktop").Show($toast)
        } catch {}

        # 6. Dispatch Push Notification directly to iPhone 15 (via ntfy.sh) if enabled
        if ($topic -and $topic -ne "none") {
            try {
                $url = "https://ntfy.sh/${topic}"
                $safeTitle = $title -replace '[^\x00-\x7F]', ''
                Invoke-RestMethod -Uri $url -Method Post -Body $body -Headers @{ "Title" = "${safeTitle}"; "Priority" = "high"; "Tags" = "bell,alarm_clock" } -ErrorAction SilentlyContinue
            } catch {}
        }
    }
} catch {}
