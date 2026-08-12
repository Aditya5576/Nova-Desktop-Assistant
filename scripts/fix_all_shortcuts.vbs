Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
strAppDir = fso.GetParentFolderName(strScriptDir)

strVbsLauncher = strAppDir & "\launch-silent.vbs"
strIcon = strAppDir & "\assets\icon.ico"

' 1. Write launch-silent.vbs
Set f = fso.CreateTextFile(strVbsLauncher, True)
f.WriteLine "Set WshShell = CreateObject(""WScript.Shell"")"
f.WriteLine "WshShell.CurrentDirectory = """ & strAppDir & """"
f.WriteLine "WshShell.Run """"""" & strAppDir & "\node_modules\electron\dist\electron.exe"""" ."", 0, False"
f.Close

Sub FixShortcut(p)
    Set sc = sh.CreateShortcut(p)
    sc.TargetPath = "C:\Windows\System32\wscript.exe"
    sc.Arguments = """" & strVbsLauncher & """"
    sc.WorkingDirectory = strAppDir
    sc.WindowStyle = 1
    sc.IconLocation = strIcon
    sc.Description = "Nova Desktop Task Assistant"
    sc.Save
    WScript.Echo "FIXED SHORTCUT: " & p
End Sub

desktop = sh.SpecialFolders("Desktop") & "\Nova.lnk"
startmenu = sh.SpecialFolders("Programs") & "\Nova.lnk"
taskbar = sh.SpecialFolders("AppData") & "\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Nova.lnk"
startup = sh.SpecialFolders("Startup") & "\Nova.lnk"

FixShortcut(desktop)
FixShortcut(startmenu)
FixShortcut(taskbar)

If fso.FileExists(startup) Then
    FixShortcut(startup)
End If
