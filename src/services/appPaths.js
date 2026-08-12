/**
 * appPaths.js — Centralized path resolution for Nova Desktop Assistant.
 *
 * Separates:
 *   A. Writable user-data paths  → app.getPath('userData')
 *   B. Packaged read-only assets → process.resourcesPath  (prod)
 *                                   project root/scripts   (dev / test)
 *
 * Rules:
 *   - NEVER hardcode a user's home directory.
 *   - NEVER write to the application install directory.
 *   - Use app.getPath('userData') for all writable runtime data.
 *   - In test / Node context (no Electron), fall back to project root
 *     so existing test patterns continue to work without modification.
 */

const path = require('path');

// Cached userData root. Populated on first call to getUserDataPath().
let _userDataPath = null;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when running inside a packaged Electron binary (app.isPackaged).
 * Returns false in development (`electron .`) and in plain Node test context.
 */
function isPackaged() {
  try {
    const { app } = require('electron');
    return !!(app && app.isPackaged);
  } catch (_) {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Root of all writable application data.
 *
 * Production / dev Electron  → app.getPath('userData')
 *   e.g.  C:\Users\<user>\AppData\Roaming\Nova
 *
 * Plain Node / test context  → project root  (backward-compat with existing
 *   test patterns that override db.dbPath after construction)
 */
function getUserDataPath() {
  if (_userDataPath !== null) return _userDataPath;

  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      _userDataPath = app.getPath('userData');
      return _userDataPath;
    }
  } catch (_) {
    // Not in Electron context — tests run under plain Node
  }

  // Fallback: project root (two levels up from src/services/)
  _userDataPath = path.join(__dirname, '../..');
  return _userDataPath;
}

/** Full path to the tasks database file. */
function getDatabasePath() {
  return path.join(getUserDataPath(), 'myassist_tasks.json');
}

/** Directory for cross-process atomic lock files. */
function getLocksPath() {
  return path.join(getUserDataPath(), '.locks');
}

/** Directory for application log files. */
function getLogsPath() {
  return path.join(getUserDataPath(), 'logs');
}

/**
 * Directory for writable runtime scripts (e.g. runTask.ps1 deployed here).
 * schtasks registered actions always point here.
 */
function getRuntimeScriptsPath() {
  return path.join(getUserDataPath(), 'scripts');
}

/**
 * Directory for read-only packaged / source scripts.
 *
 * Packaged Electron  → process.resourcesPath/scripts  (extraResources)
 * Development Electron / test / Node → project_root/scripts
 */
function getPackagedScriptsPath() {
  if (isPackaged() && process.resourcesPath) {
    return path.join(process.resourcesPath, 'scripts');
  }
  // Dev / test: use the committed project scripts directory
  return path.join(__dirname, '../../scripts');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers — allow tests to override the userData root
// ─────────────────────────────────────────────────────────────────────────────

/** Override userData root (for use in unit tests only). */
function _setUserDataPath(p) {
  _userDataPath = p;
}

/** Reset the cached userData root (call in test afterEach). */
function _resetUserDataPath() {
  _userDataPath = null;
}

module.exports = {
  getUserDataPath,
  getDatabasePath,
  getLocksPath,
  getLogsPath,
  getRuntimeScriptsPath,
  getPackagedScriptsPath,
  isPackaged,
  _setUserDataPath,
  _resetUserDataPath
};
