Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "c:\Users\adity\Desktop\MyAssist"
WshShell.Run "cmd /c start /b npx electron .", 0, False
