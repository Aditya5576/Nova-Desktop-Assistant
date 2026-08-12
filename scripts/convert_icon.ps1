Add-Type -AssemblyName System.Drawing

$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$appDir = Split-Path -Parent $scriptDir

$pngPath = Join-Path $appDir "assets\icon.png"
$icoPath = Join-Path $appDir "assets\icon.ico"

if (Test-Path $pngPath) {
    $img = [System.Drawing.Image]::FromFile($pngPath)
    $bmp = New-Object System.Drawing.Bitmap($img, 256, 256)
    $hIcon = $bmp.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($hIcon)

    $stream = [System.IO.File]::Create($icoPath)
    $icon.Save($stream)
    $stream.Close()
    $img.Dispose()
    $bmp.Dispose()

    Write-Host "Nova App Logo updated successfully!"
}
