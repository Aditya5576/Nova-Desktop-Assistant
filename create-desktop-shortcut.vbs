Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strDesktop = WshShell.SpecialFolders("Desktop")
strAppDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Create main desktop shortcut Nova.lnk using wscript silent launcher
Set oShortcut = WshShell.CreateShortcut(strDesktop & "\Nova.lnk")
oShortcut.TargetPath = "wscript.exe"
oShortcut.Arguments = """" & strAppDir & "\launch-silent.vbs"""
oShortcut.WorkingDirectory = strAppDir
oShortcut.WindowStyle = 1
oShortcut.IconLocation = strAppDir & "\assets\icon.ico"
oShortcut.Description = "Nova Desktop Task Assistant"
oShortcut.Save

' Clean up any legacy shortcut if present
If fso.FileExists(strDesktop & "\MyAssist.lnk") Then
    On Error Resume Next
    fso.DeleteFile(strDesktop & "\MyAssist.lnk")
    On Error GoTo 0
End If
