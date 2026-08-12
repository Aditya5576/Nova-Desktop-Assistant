Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strAppDir = fso.GetParentFolderName(WScript.ScriptFullName)

strAppData = WshShell.SpecialFolders("AppData")
strTaskbar = strAppData & "\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"

If Not fso.FolderExists(strTaskbar) Then
    On Error Resume Next
    fso.CreateFolder(strTaskbar)
    On Error GoTo 0
End If

Set oShortcut = WshShell.CreateShortcut(strTaskbar & "\Nova.lnk")
oShortcut.TargetPath = "wscript.exe"
oShortcut.Arguments = """" & strAppDir & "\launch-silent.vbs"""
oShortcut.WorkingDirectory = strAppDir
oShortcut.WindowStyle = 1
oShortcut.IconLocation = strAppDir & "\assets\icon.ico"
oShortcut.Description = "Nova Desktop Task Assistant"
oShortcut.Save

' Also place shortcut in Start Menu Programs for instant pinning
strStartMenu = WshShell.SpecialFolders("Programs")
Set oStartShortcut = WshShell.CreateShortcut(strStartMenu & "\Nova.lnk")
oStartShortcut.TargetPath = "wscript.exe"
oStartShortcut.Arguments = """" & strAppDir & "\launch-silent.vbs"""
oStartShortcut.WorkingDirectory = strAppDir
oStartShortcut.WindowStyle = 1
oStartShortcut.IconLocation = strAppDir & "\assets\icon.ico"
oStartShortcut.Description = "Nova Desktop Task Assistant"
oStartShortcut.Save
