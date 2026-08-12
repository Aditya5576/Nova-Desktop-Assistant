$appId = "com.nova.desktop"
$startMenuDir = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs")
$shortcutPath = [System.IO.Path]::Combine($startMenuDir, "Nova.lnk")

$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$appDir = Split-Path -Parent $scriptDir

# Register AppUserModelID in Registry
$regPath = "HKCU:\Software\Classes\AppUserModelId\$appId"
if (!(Test-Path $regPath)) {
    New-Item -Path $regPath -Force | Out-Null
}
Set-ItemProperty -Path $regPath -Name "DisplayName" -Value "Nova" -Type String -Force
Set-ItemProperty -Path $regPath -Name "ShowInActionCenter" -Value 1 -Type DWord -Force

$startBat = [System.IO.Path]::Combine($appDir, "start-myassist.bat")

# Create Start Menu Shortcut with AppUserModelID property
$vbsScript = @"
Set WshShell = CreateObject("WScript.Shell")
Set Shortcut = WshShell.CreateShortcut("$shortcutPath")
Shortcut.TargetPath = "$startBat"
Shortcut.WorkingDirectory = "$appDir"
Shortcut.Description = "Nova Desktop Task Assistant"
Shortcut.Save
"@

$vbsPath = [System.IO.Path]::Combine($env:TEMP, "create_lnk.vbs")
[System.IO.File]::WriteAllText($vbsPath, $vbsScript)
cscript //nologo $vbsPath
Remove-Item -Path $vbsPath -Force -ErrorAction SilentlyContinue

Write-Host "Registered Nova AppUserModelID and Start Menu shortcut successfully!"
