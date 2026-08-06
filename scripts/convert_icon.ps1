Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\adity\.gemini\antigravity\brain\e5d663cd-b414-42ed-870e-2f46e5d74029\nova_app_logo_1785999432016.jpg"
$pngPath = "c:\Users\adity\Desktop\MyAssist\assets\icon.png"
$icoPath = "c:\Users\adity\Desktop\MyAssist\assets\icon.ico"

$img = [System.Drawing.Image]::FromFile($srcPath)
$img.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$bmp = New-Object System.Drawing.Bitmap($img, 256, 256)
$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)

$stream = [System.IO.File]::Create($icoPath)
$icon.Save($stream)
$stream.Close()
$img.Dispose()
$bmp.Dispose()

Write-Host "Nova App Logo converted to PNG and ICO successfully!"
