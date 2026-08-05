const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const startupDir = path.join(process.env.APPDATA, 'Microsoft\\Windows\\Start Menu\\Programs\\Startup');
const batPath = path.join(__dirname, '../start-myassist.bat');
const vbsPath = path.join(startupDir, 'MyAssistAutoStart.vbs');

// Create a VBScript launcher in Windows Startup folder so it runs completely hidden without CMD window popup!
const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """${batPath}""", 0, False
`;

fs.writeFileSync(vbsPath, vbsContent, 'utf-8');
console.log('Successfully created auto-start launcher at:', vbsPath);
