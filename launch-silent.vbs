Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "c:\Users\adity\Desktop\MyAssist"
WshShell.Run """c:\Users\adity\Desktop\MyAssist\node_modules\.bin\electron.cmd"" .", 0, False
