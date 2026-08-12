Set WshShell = CreateObject("WScript.Shell")

strAppData = WshShell.SpecialFolders("AppData")
strTaskbar = strAppData & "\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"

Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FolderExists(strTaskbar) Then
    fso.CreateFolder(strTaskbar)
End If

Set oShortcut = WshShell.CreateShortcut(strTaskbar & "\Nova.lnk")
oShortcut.TargetPath = "wscript.exe"
oShortcut.Arguments = """c:\Users\adity\Desktop\MyAssist\launch-silent.vbs"""
oShortcut.WorkingDirectory = "c:\Users\adity\Desktop\MyAssist"
oShortcut.WindowStyle = 1
oShortcut.IconLocation = "c:\Users\adity\Desktop\MyAssist\assets\icon.ico"
oShortcut.Description = "Nova Desktop Task Assistant"
oShortcut.Save

' Also place shortcut in Start Menu Programs for instant pinning
strStartMenu = WshShell.SpecialFolders("Programs")
Set oStartShortcut = WshShell.CreateShortcut(strStartMenu & "\Nova.lnk")
oStartShortcut.TargetPath = "wscript.exe"
oStartShortcut.Arguments = """c:\Users\adity\Desktop\MyAssist\launch-silent.vbs"""
oStartShortcut.WorkingDirectory = "c:\Users\adity\Desktop\MyAssist"
oStartShortcut.WindowStyle = 1
oStartShortcut.IconLocation = "c:\Users\adity\Desktop\MyAssist\assets\icon.ico"
oStartShortcut.Description = "Nova Desktop Task Assistant"
oStartShortcut.Save
