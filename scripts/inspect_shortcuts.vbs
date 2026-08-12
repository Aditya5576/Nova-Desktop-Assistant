Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

desktop = sh.SpecialFolders("Desktop") & "\Nova.lnk"
startmenu = sh.SpecialFolders("Programs") & "\Nova.lnk"
taskbar = sh.SpecialFolders("AppData") & "\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Nova.lnk"

Sub CheckLink(p)
    If fso.FileExists(p) Then
        Set sc = sh.CreateShortcut(p)
        WScript.Echo "LNK: " & p
        WScript.Echo "  Target: " & sc.TargetPath
        WScript.Echo "  Args:   " & sc.Arguments
    Else
        WScript.Echo "LNK MISSING: " & p
    End If
End Sub

CheckLink(desktop)
CheckLink(startmenu)
CheckLink(taskbar)
