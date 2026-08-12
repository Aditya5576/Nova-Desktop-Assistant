import os, sys
try:
    import win32com.client
    shell = win32com.client.Dispatch("WScript.Shell")
    paths = [
        os.path.expanduser(r"~\Desktop\Nova.lnk"),
        os.path.expanduser(r"~\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Nova.lnk"),
        os.path.expanduser(r"~\AppData\Roaming\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Nova.lnk")
    ]
    for p in paths:
        if os.path.exists(p):
            sc = shell.CreateShortcut(p)
            print(f"Path: {p}")
            print(f"  Target: {sc.TargetPath}")
            print(f"  Args:   {sc.Arguments}")
            print(f"  Icon:   {sc.IconLocation}")
        else:
            print(f"Path DOES NOT EXIST: {p}")
except Exception as e:
    print("Error:", e)
