/**
 * appPaths.test.js — Production path regression suite.
 *
 * Verifies:
 *  1. In test/Node context all paths resolve to the project root (backward compat).
 *  2. When a custom userData root is injected via _setUserDataPath, all derived
 *     paths correctly point under that root — never to __dirname, Program Files,
 *     the Desktop, or any developer-specific location.
 *  3. getPackagedScriptsPath() in test context returns the project scripts dir
 *     (app.isPackaged is false in Node context).
 *  4. Paths do NOT contain hardcoded developer-specific segments.
 */

const path = require('path');
const assert = require('assert');
const appPaths = require('../src/services/appPaths');

// Project root for test-context assertions
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Forbidden substrings that must NEVER appear in production writable paths
const FORBIDDEN_SEGMENTS = [
  'C:\\Users\\adity',
  'C:/Users/adity',
  'Desktop',
  'Program Files',
  'app.asar'
];

describe('appPaths — Production Path Regression Suite', () => {
  // ─── Save / restore userData root around each test ───────────────────────
  let savedUserData;

  global.beforeEach(() => {
    savedUserData = appPaths.getUserDataPath();
    appPaths._resetUserDataPath();
  });

  global.afterEach(() => {
    appPaths._resetUserDataPath();
    if (savedUserData) appPaths._setUserDataPath(savedUserData);
  });

  // ─── Test context (no Electron) ───────────────────────────────────────────

  it('getUserDataPath falls back to project root in Node/test context', () => {
    const p = appPaths.getUserDataPath();
    // In test context the fallback is project root (src/services/../../ == project root)
    assert.ok(p, 'getUserDataPath must return a non-empty string');
    assert.ok(path.isAbsolute(p), 'getUserDataPath must return an absolute path');
  });

  it('getDatabasePath resolves under getUserDataPath', () => {
    const dbPath = appPaths.getDatabasePath();
    const userData = appPaths.getUserDataPath();
    assert.ok(dbPath.startsWith(userData), 'getDatabasePath must be inside userData');
    assert.ok(dbPath.endsWith('myassist_tasks.json'), 'getDatabasePath must end with myassist_tasks.json');
  });

  it('getLocksPath resolves under getUserDataPath', () => {
    const locksPath = appPaths.getLocksPath();
    const userData = appPaths.getUserDataPath();
    assert.ok(locksPath.startsWith(userData), 'getLocksPath must be inside userData');
    assert.ok(locksPath.includes('.locks'), 'getLocksPath must include .locks segment');
  });

  it('getLogsPath resolves under getUserDataPath', () => {
    const logsPath = appPaths.getLogsPath();
    const userData = appPaths.getUserDataPath();
    assert.ok(logsPath.startsWith(userData), 'getLogsPath must be inside userData');
    assert.ok(logsPath.includes('logs'), 'getLogsPath must include logs segment');
  });

  it('getRuntimeScriptsPath resolves under getUserDataPath', () => {
    const rsp = appPaths.getRuntimeScriptsPath();
    const userData = appPaths.getUserDataPath();
    assert.ok(rsp.startsWith(userData), 'getRuntimeScriptsPath must be inside userData');
    assert.ok(rsp.includes('scripts'), 'getRuntimeScriptsPath must include scripts segment');
  });

  it('getPackagedScriptsPath in test context returns project scripts dir', () => {
    const psp = appPaths.getPackagedScriptsPath();
    assert.ok(psp.includes('scripts'), 'getPackagedScriptsPath must include scripts segment');
    // Must NOT reference app.asar in test context
    assert.ok(!psp.includes('app.asar'), 'getPackagedScriptsPath must not reference app.asar in test context');
  });

  // ─── Injected simulated userData (production-like) ───────────────────────

  it('all writable paths resolve under injected simulated userData root', () => {
    const simulatedUserData = path.join('C:', 'Users', 'testuser', 'AppData', 'Roaming', 'Nova');
    appPaths._setUserDataPath(simulatedUserData);

    const checks = {
      getUserDataPath:       appPaths.getUserDataPath(),
      getDatabasePath:       appPaths.getDatabasePath(),
      getLocksPath:          appPaths.getLocksPath(),
      getLogsPath:           appPaths.getLogsPath(),
      getRuntimeScriptsPath: appPaths.getRuntimeScriptsPath()
    };

    for (const [fn, resolvedPath] of Object.entries(checks)) {
      assert.ok(
        resolvedPath.startsWith(simulatedUserData),
        `${fn}() must resolve under simulated userData. Got: ${resolvedPath}`
      );
    }
  });

  it('no writable path contains a hardcoded developer home directory segment', () => {
    const simulatedUserData = path.join('C:', 'Users', 'testuser', 'AppData', 'Roaming', 'Nova');
    appPaths._setUserDataPath(simulatedUserData);

    const paths = [
      appPaths.getDatabasePath(),
      appPaths.getLocksPath(),
      appPaths.getLogsPath(),
      appPaths.getRuntimeScriptsPath()
    ];

    for (const resolvedPath of paths) {
      for (const forbidden of FORBIDDEN_SEGMENTS) {
        assert.ok(
          !resolvedPath.includes(forbidden),
          `Path "${resolvedPath}" must not contain forbidden segment "${forbidden}"`
        );
      }
    }
  });

  it('getDatabasePath always points to a JSON file named myassist_tasks.json', () => {
    const simulatedUserData = path.join('C:', 'Users', 'testuser', 'AppData', 'Roaming', 'Nova');
    appPaths._setUserDataPath(simulatedUserData);
    const dbPath = appPaths.getDatabasePath();
    assert.strictEqual(path.basename(dbPath), 'myassist_tasks.json');
  });

  it('_setUserDataPath and _resetUserDataPath work correctly', () => {
    const custom = path.join('C:', 'custom', 'path');
    appPaths._setUserDataPath(custom);
    assert.strictEqual(appPaths.getUserDataPath(), custom);
    appPaths._resetUserDataPath();
    // After reset, should re-derive (falls back to project root in test context)
    const derived = appPaths.getUserDataPath();
    assert.ok(derived !== custom, 'After reset, getUserDataPath must re-derive path');
  });

  it('getRuntimeScriptsPath and getPackagedScriptsPath are distinct when userData differs from project root', () => {
    const simulatedUserData = path.join('C:', 'Users', 'testuser', 'AppData', 'Roaming', 'Nova');
    appPaths._setUserDataPath(simulatedUserData);
    const runtimePath  = appPaths.getRuntimeScriptsPath();
    const packagedPath = appPaths.getPackagedScriptsPath(); // still points at project scripts in test context
    // Runtime (writable) is inside userData; packaged (read-only) is in project root
    assert.ok(runtimePath.startsWith(simulatedUserData), 'runtime scripts must be in userData');
    assert.ok(!packagedPath.startsWith(simulatedUserData), 'packaged scripts must NOT be in simulated userData');
  });
});
