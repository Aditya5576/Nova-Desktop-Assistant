Set WshShell = CreateObject("WScript.Shell")
strDesktop = WshShell.SpecialFolders("Desktop")
Set oShortcut = WshShell.CreateShortcut(strDesktop & "\Nova.lnk")
oShortcut.TargetPath = "c:\Users\adity\Desktop\MyAssist\start-myassist.bat"
oShortcut.WorkingDirectory = "c:\Users\adity\Desktop\MyAssist"
oShortcut.WindowStyle = 1
oShortcut.IconLocation = "c:\Users\adity\Desktop\MyAssist\assets\icon.ico"
oShortcut.Description = "Nova Desktop Task Assistant"
oShortcut.Save

' Remove old shortcut if exists
Set fso = CreateObject("Scripting.FileSystemObject")
If fso.FileExists(strDesktop & "\MyAssist.lnk") Then
    fso.DeleteFile(strDesktop & "\MyAssist.lnk")
End If
