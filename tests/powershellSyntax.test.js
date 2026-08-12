/**
 * powershellSyntax.test.js — Production PowerShell Script Syntax & Execution Regression Suite.
 *
 * Verifies:
 *  1. scripts/runTask.ps1 has ZERO PowerShell syntax/parser errors (AST parse check).
 *  2. scripts/sendToast.ps1 has ZERO PowerShell syntax/parser errors (AST parse check).
 *  3. Direct execution of runTask.ps1 against a mock DB with a scheduled task succeeds with exit code 0.
 *  4. Correct string interpolation format ($h12:$m syntax error is prevented).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

describe('PowerShell Script Syntax & Execution Regression Suite', () => {
  const runTaskPath = path.join(__dirname, '../scripts/runTask.ps1');
  const sendToastPath = path.join(__dirname, '../scripts/sendToast.ps1');

  it('scripts/runTask.ps1 must exist and contain no AST parser errors', () => {
    assert.ok(fs.existsSync(runTaskPath), 'runTask.ps1 must exist in scripts/');
    const code = fs.readFileSync(runTaskPath, 'utf-8');
    
    // Regression check for the specific $h12:$m drive/scope syntax bug
    assert.ok(!code.includes('$h12:'), 'runTask.ps1 must not contain unbraced $h12: variable reference');
    assert.ok(code.includes('${h12}:'), 'runTask.ps1 must use braced ${h12}: interpolation syntax');

    // PowerShell AST Parse validation via powershell.exe
    const psScript = `
      $errors = $null
      [System.Management.Automation.Language.Parser]::ParseFile('${runTaskPath.replace(/'/g, "''")}', [ref]$null, [ref]$errors)
      if ($errors.Count -gt 0) {
        $errors | ForEach-Object { Write-Error $_.Message }
        exit 1
      } else {
        Write-Output "PARSER_CLEAN"
      }
    `;

    try {
      const output = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
        encoding: 'utf-8'
      });
      assert.ok(output.includes('PARSER_CLEAN'), 'runTask.ps1 must pass PowerShell AST parsing cleanly');
    } catch (err) {
      assert.fail(`runTask.ps1 failed PowerShell AST parsing: ${err.stderr || err.stdout || err.message}`);
    }
  });

  it('scripts/sendToast.ps1 must exist and contain no AST parser errors', () => {
    assert.ok(fs.existsSync(sendToastPath), 'sendToast.ps1 must exist in scripts/');
    
    const psScript = `
      $errors = $null
      [System.Management.Automation.Language.Parser]::ParseFile('${sendToastPath.replace(/'/g, "''")}', [ref]$null, [ref]$errors)
      if ($errors.Count -gt 0) {
        $errors | ForEach-Object { Write-Error $_.Message }
        exit 1
      } else {
        Write-Output "PARSER_CLEAN"
      }
    `;

    try {
      const output = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
        encoding: 'utf-8'
      });
      assert.ok(output.includes('PARSER_CLEAN'), 'sendToast.ps1 must pass PowerShell AST parsing cleanly');
    } catch (err) {
      assert.fail(`sendToast.ps1 failed PowerShell AST parsing: ${err.stderr || err.stdout || err.message}`);
    }
  });

  it('direct execution of runTask.ps1 against a mock task succeeds cleanly', () => {
    const testDir = path.join(__dirname, '../scratch/ps_exec_test');
    const scriptsDir = path.join(testDir, 'scripts');
    const locksDir = path.join(testDir, '.locks');
    const dbPath = path.join(testDir, 'myassist_tasks.json');

    // Clean up test harness dir
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.mkdirSync(locksDir, { recursive: true });

    // Deploy runTask.ps1 to the test harness scripts/ dir
    const testRunnerScript = path.join(scriptsDir, 'runTask.ps1');
    fs.copyFileSync(runTaskPath, testRunnerScript);

    // Create test database with task having dueTime "14:30:00" (triggers $h12 branch)
    const testTaskId = 'ps_test_123';
    const mockDb = {
      tasks: [
        {
          id: testTaskId,
          title: 'Direct PS Execution Test',
          priority: 'high',
          dueTime: '14:30:00',
          dueDate: new Date().toISOString().split('T')[0],
          status: 'pending',
          reminder: true,
          notified: false
        }
      ],
      settings: {
        soundEnabled: false,
        notificationsEnabled: false,
        ntfyTopic: 'none'
      }
    };
    fs.writeFileSync(dbPath, JSON.stringify(mockDb, null, 2), 'utf-8');

    // Execute runTask.ps1 directly via powershell.exe
    try {
      execFileSync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        testRunnerScript,
        '-Id',
        testTaskId
      ], { encoding: 'utf-8' });
    } catch (err) {
      assert.fail(`runTask.ps1 execution failed with error: ${err.stderr || err.stdout || err.message}`);
    }

    // Verify task was claimed and marked notified = true
    const updatedDb = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    const task = updatedDb.tasks.find(t => t.id === testTaskId);
    assert.ok(task, 'Task must exist in DB');
    assert.strictEqual(task.notified, true, 'runTask.ps1 must set notified = true on successful claim');

    // Clean up test harness dir
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (e) {}
  });
});
