$appId = "com.myassist.desktop"
$startMenuDir = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs")
$shortcutPath = [System.IO.Path]::Combine($startMenuDir, "MyAssist.lnk")

# Register AppUserModelID in Registry
$regPath = "HKCU:\Software\Classes\AppUserModelId\$appId"
if (!(Test-Path $regPath)) {
    New-Item -Path $regPath -Force | Out-Null
}
Set-ItemProperty -Path $regPath -Name "DisplayName" -Value "MyAssist" -Type String -Force
Set-ItemProperty -Path $regPath -Name "ShowInActionCenter" -Value 1 -Type DWord -Force

# Create Start Menu Shortcut with AppUserModelID property
$vbsScript = @"
Set WshShell = CreateObject("WScript.Shell")
Set Shortcut = WshShell.CreateShortcut("$shortcutPath")
Shortcut.TargetPath = "c:\Users\adity\Desktop\MyAssist\start-myassist.bat"
Shortcut.WorkingDirectory = "c:\Users\adity\Desktop\MyAssist"
Shortcut.Description = "MyAssist Desktop Task Assistant"
Shortcut.Save
"@

$vbsPath = [System.IO.Path]::Combine($env:TEMP, "create_lnk.vbs")
[System.IO.File]::WriteAllText($vbsPath, $vbsScript)
cscript //nologo $vbsPath
Remove-Item -Path $vbsPath -Force -ErrorAction SilentlyContinue

Write-Host "Registered MyAssist AppUserModelID and Start Menu shortcut successfully!"
