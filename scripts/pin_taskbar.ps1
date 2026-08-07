$sa = New-Object -ComObject Shell.Application
$startFolder = [System.IO.Path]::Combine($env:APPDATA, 'Microsoft\Windows\Start Menu\Programs')
$folder = $sa.NameSpace($startFolder)
$item = $folder.ParseName("Nova.lnk")

if ($null -ne $item) {
    $verbs = $item.Verbs()
    foreach ($v in $verbs) {
        $cleanName = $v.Name.Replace("&", "")
        if ($cleanName -match "Pin to taskbar|Pin to Taskbar") {
            $v.DoIt()
            Write-Host "Successfully pinned Nova to Taskbar!"
        }
    }
}
