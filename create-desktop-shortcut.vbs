Set WshShell = CreateObject("WScript.Shell")
strDesktop = WshShell.SpecialFolders("Desktop")

' Create main desktop shortcut Nova.lnk using wscript silent launcher
Set oShortcut = WshShell.CreateShortcut(strDesktop & "\Nova.lnk")
oShortcut.TargetPath = "wscript.exe"
oShortcut.Arguments = """c:\Users\adity\Desktop\MyAssist\launch-silent.vbs"""
oShortcut.WorkingDirectory = "c:\Users\adity\Desktop\MyAssist"
oShortcut.WindowStyle = 1
oShortcut.IconLocation = "c:\Users\adity\Desktop\MyAssist\assets\icon.ico"
oShortcut.Description = "Nova Desktop Task Assistant"
oShortcut.Save

' Clean up any old MyAssist shortcut if present
Set fso = CreateObject("Scripting.FileSystemObject")
If fso.FileExists(strDesktop & "\MyAssist.lnk") Then
    fso.DeleteFile(strDesktop & "\MyAssist.lnk")
End If
