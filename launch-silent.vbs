Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strAppDir = fso.GetParentFolderName(WScript.ScriptFullName)

WshShell.CurrentDirectory = strAppDir
WshShell.Run """" & strAppDir & "\node_modules\electron\dist\electron.exe"" .", 0, False
