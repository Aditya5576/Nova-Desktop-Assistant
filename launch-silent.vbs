Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "c:\Users\adity\Desktop\MyAssist"
WshShell.Run """c:\Users\adity\Desktop\MyAssist\node_modules\electron\dist\electron.exe"" .", 0, False
