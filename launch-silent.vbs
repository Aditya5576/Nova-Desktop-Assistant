Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\adity\Desktop\MyAssist"
WshShell.Run """C:\Users\adity\Desktop\MyAssist\node_modules\electron\dist\electron.exe"" .", 0, False
