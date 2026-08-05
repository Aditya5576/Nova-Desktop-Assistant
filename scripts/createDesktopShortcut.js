const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const desktopPath = path.join(process.env.USERPROFILE, 'Desktop');
const shortcutPath = path.join(desktopPath, 'MyAssist.lnk');
const vbsLauncher = path.join(__dirname, '../launch-silent.vbs');
const iconPath = path.join(__dirname, '../assets/icon.ico');

const createShortcutScript = `
Set WshShell = CreateObject("WScript.Shell")
Set shortcut = WshShell.CreateShortcut("${shortcutPath.replace(/\\/g, '\\\\')}")
shortcut.TargetPath = "wscript.exe"
shortcut.Arguments = "${vbsLauncher.replace(/\\/g, '\\\\')}"
shortcut.WorkingDirectory = "${path.join(__dirname, '..').replace(/\\/g, '\\\\')}"
shortcut.Description = "MyAssist Personal Task Assistant"
shortcut.IconLocation = "${iconPath.replace(/\\/g, '\\\\')}"
shortcut.Save
`;

const tempScriptPath = path.join(__dirname, 'tempShortcut.vbs');
fs.writeFileSync(tempScriptPath, createShortcutScript, 'utf-8');

try {
  execSync(`cscript //Nologo "${tempScriptPath}"`);
  fs.unlinkSync(tempScriptPath);
  console.log('Successfully updated Desktop shortcut for silent CMD-less launch!');
} catch (e) {
  console.error('Failed to create desktop shortcut:', e);
}
