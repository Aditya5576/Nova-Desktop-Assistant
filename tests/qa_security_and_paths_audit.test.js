/**
 * qa_security_and_paths_audit.test.js
 * Comprehensive QA Audit Suite for Nova's Gemini Security & Path Resolution
 *
 * Audit Requirements:
 * 1. Verify `safeStorage` encryption and `geminiApiKeyFallback` base64 persistence.
 * 2. Verify bullet mask (`••••`) protection in `updateSettings()`.
 * 3. Audit `%APPDATA%\\Nova` path resolution across production and test environments.
 * 4. Verify lockfile stale recovery (60-second threshold).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const DatabaseService = require('../src/services/database');
const appPaths = require('../src/services/appPaths');

describe('QA Audit: Gemini Security & Path Resolution', () => {
  let db;
  const testDbPath = path.join(__dirname, '../scratch/test_qa_security_db.json');

  beforeEach(() => {
    const scratchDir = path.dirname(testDbPath);
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

    db = new DatabaseService();
    db.dbPath = testDbPath;
    db.init();
  });

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch (e) {}
    }
    appPaths._resetUserDataPath();
  });

  // ---------------------------------------------------------------------------
  // Audit Item 1: safeStorage Encryption & Base64 Fallback Persistence
  // ---------------------------------------------------------------------------
  describe('1. Gemini API Key Encryption & Fallback Persistence', () => {
    it('1.1 Should store Base64 fallback when safeStorage is unavailable in Node context', () => {
      const testKey = 'AIzaSyTestSecretKey_987654321';
      db.updateSettings({ geminiApiKey: testKey });

      const rawDisk = JSON.parse(fs.readFileSync(testDbPath, 'utf-8'));
      assert.strictEqual(rawDisk.settings.geminiApiKey, undefined, 'Plaintext geminiApiKey MUST NOT exist on disk');
      
      const isEncrypted = Boolean(rawDisk.settings.geminiApiKeyEncrypted);
      const isFallback = Boolean(rawDisk.settings.geminiApiKeyFallback);

      assert.ok(isEncrypted || isFallback, 'Key must be stored encrypted or as base64 fallback');

      if (isFallback) {
        const decoded = Buffer.from(rawDisk.settings.geminiApiKeyFallback, 'base64').toString('utf-8');
        assert.strictEqual(decoded, testKey, 'Fallback key must correctly decode from base64');
      }

      assert.strictEqual(db.getDecryptedApiKey(), testKey, 'getDecryptedApiKey() must return original key');
      assert.strictEqual(db.hasGeminiApiKey(), true, 'hasGeminiApiKey() must be true');
    });

    it('1.2 Should purge plaintext key from disk upon legacy migration', () => {
      const legacyData = {
        tasks: [],
        settings: { geminiApiKey: 'AIzaSyLegacyKey_112233' }
      };
      fs.writeFileSync(testDbPath, JSON.stringify(legacyData, null, 2), 'utf-8');

      // Instantiating DB and calling getSettings triggers legacy migration
      const dbMigrated = new DatabaseService();
      dbMigrated.dbPath = testDbPath;
      dbMigrated.getSettings();

      const rawDisk = JSON.parse(fs.readFileSync(testDbPath, 'utf-8'));
      assert.strictEqual(rawDisk.settings.geminiApiKey, undefined, 'Legacy plaintext key must be removed from disk');
      assert.strictEqual(dbMigrated.getDecryptedApiKey(), 'AIzaSyLegacyKey_112233', 'Migrated key must be retrievable');
    });

    it('1.3 Should completely purge encrypted and fallback keys when API key is cleared', () => {
      db.updateSettings({ geminiApiKey: 'AIzaSyTempKey_4455' });
      assert.strictEqual(db.hasGeminiApiKey(), true);

      db.updateSettings({ geminiApiKey: '' });
      const rawDisk = JSON.parse(fs.readFileSync(testDbPath, 'utf-8'));
      assert.strictEqual(rawDisk.settings.geminiApiKey, undefined);
      assert.strictEqual(rawDisk.settings.geminiApiKeyEncrypted, undefined);
      assert.strictEqual(rawDisk.settings.geminiApiKeyFallback, undefined);
      assert.strictEqual(db.getDecryptedApiKey(), '');
      assert.strictEqual(db.hasGeminiApiKey(), false);
    });
  });

  // ---------------------------------------------------------------------------
  // Audit Item 2: Bullet Mask ('••••') Protection
  // ---------------------------------------------------------------------------
  describe('2. Bullet Mask (••••) Protection', () => {
    it('2.1 Should ignore update when geminiApiKey contains bullet mask ••••', () => {
      const originalKey = 'AIzaSyOriginalSecretKey_12345';
      db.updateSettings({ geminiApiKey: originalKey });

      const keyBefore = db.getDecryptedApiKey();
      assert.strictEqual(keyBefore, originalKey);

      // UI sends bullet mask string
      db.updateSettings({ assistantName: 'Nova UI', geminiApiKey: '••••••••' });

      const keyAfter = db.getDecryptedApiKey();
      assert.strictEqual(keyAfter, originalKey, 'Bullet mask update must NOT overwrite or erase existing key');
      
      const settings = db.getSettings();
      assert.strictEqual(settings.assistantName, 'Nova UI', 'Other settings updates must still succeed');

      const rawDisk = JSON.parse(fs.readFileSync(testDbPath, 'utf-8'));
      assert.strictEqual(rawDisk.settings.geminiApiKey, undefined, 'Plaintext key must remain deleted from disk');
    });

    it('2.2 Should correctly identify bullet mask in hasGeminiApiKey() check', () => {
      // If inMemoryApiKey accidentally contains bullet mask, hasGeminiApiKey must return false
      db.inMemoryApiKey = '••••••••';
      assert.strictEqual(db.hasGeminiApiKey(), false, 'hasGeminiApiKey must return false for bullet mask');
    });
  });

  // ---------------------------------------------------------------------------
  // Audit Item 3: %APPDATA%\Nova Path Resolution Audit
  // ---------------------------------------------------------------------------
  describe('3. Path Resolution (%APPDATA%\\Nova)', () => {
    it('3.1 Should fallback to project root in plain Node test environment', () => {
      const userData = appPaths.getUserDataPath();
      assert.ok(path.isAbsolute(userData), 'userData path must be absolute');
      assert.ok(fs.existsSync(userData), 'userData directory should exist');
    });

    it('3.2 Should resolve all subdirectories under simulated production APPDATA\\Nova', () => {
      const mockAppDataNova = path.join('C:', 'Users', 'QA_User', 'AppData', 'Roaming', 'Nova');
      appPaths._setUserDataPath(mockAppDataNova);

      assert.strictEqual(appPaths.getUserDataPath(), mockAppDataNova);
      assert.strictEqual(appPaths.getDatabasePath(), path.join(mockAppDataNova, 'myassist_tasks.json'));
      assert.strictEqual(appPaths.getLocksPath(), path.join(mockAppDataNova, '.locks'));
      assert.strictEqual(appPaths.getLogsPath(), path.join(mockAppDataNova, 'logs'));
      assert.strictEqual(appPaths.getRuntimeScriptsPath(), path.join(mockAppDataNova, 'scripts'));
    });

    it('3.3 Should separate writable runtime script path from packaged read-only script path', () => {
      const mockAppDataNova = path.join('C:', 'Users', 'QA_User', 'AppData', 'Roaming', 'Nova');
      appPaths._setUserDataPath(mockAppDataNova);

      const runtimeScripts = appPaths.getRuntimeScriptsPath();
      const packagedScripts = appPaths.getPackagedScriptsPath();

      assert.ok(runtimeScripts.startsWith(mockAppDataNova), 'Runtime scripts must be in APPDATA\\Nova');
      assert.ok(!packagedScripts.startsWith(mockAppDataNova), 'Packaged scripts must NOT be inside APPDATA');
    });

    it('3.4 Should not contain developer home or hardcoded user paths', () => {
      const mockAppDataNova = path.join('C:', 'Users', 'QA_User', 'AppData', 'Roaming', 'Nova');
      appPaths._setUserDataPath(mockAppDataNova);

      const pathsToCheck = [
        appPaths.getDatabasePath(),
        appPaths.getLocksPath(),
        appPaths.getLogsPath(),
        appPaths.getRuntimeScriptsPath()
      ];

      const forbidden = ['C:\\Users\\adity', 'Desktop', 'Program Files'];
      for (const p of pathsToCheck) {
        for (const bad of forbidden) {
          assert.ok(!p.includes(bad), `Path ${p} must not contain forbidden segment ${bad}`);
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Audit Item 4: Lockfile Stale Recovery (60-second threshold)
  // ---------------------------------------------------------------------------
  describe('4. Lockfile Stale Recovery (60-second threshold)', () => {
    let testLocksDir;

    beforeEach(() => {
      testLocksDir = path.join(__dirname, '../scratch/test_locks');
      if (!fs.existsSync(testLocksDir)) fs.mkdirSync(testLocksDir, { recursive: true });
      // Override getLocksDir for database instance
      db.getLocksDir = () => testLocksDir;
    });

    afterEach(() => {
      if (fs.existsSync(testLocksDir)) {
        try { fs.rmSync(testLocksDir, { recursive: true, force: true }); } catch (e) {}
      }
    });

    it('4.1 Should successfully claim fresh task reminder lock', () => {
      const task = db.addTask({ title: 'Lock Test Task', reminder: true });
      const claimed = db.claimTaskReminder(task.id);

      assert.ok(claimed, 'Task claim should succeed when lock does not exist');
      assert.strictEqual(claimed.notified, true, 'Task notified flag must be updated');

      const safeId = String(task.id).replace(/[^a-zA-Z0-9_]/g, '_');
      const lockFile = path.join(testLocksDir, `claim_${safeId}.lock`);
      assert.ok(fs.existsSync(lockFile), 'Lockfile must be created on disk');
    });

    it('4.2 Should reject claim when an active lock exists (< 60s old)', () => {
      const task = db.addTask({ title: 'Active Lock Task', reminder: true });
      const safeId = String(task.id).replace(/[^a-zA-Z0-9_]/g, '_');
      const lockFile = path.join(testLocksDir, `claim_${safeId}.lock`);

      // Pre-create active lock (10 seconds old)
      fs.writeFileSync(lockFile, JSON.stringify({ pid: 9999, time: Date.now() - 10000 }), 'utf-8');

      const db2 = new DatabaseService();
      db2.dbPath = testDbPath;
      db2.getLocksDir = () => testLocksDir;

      const claimed = db2.claimTaskReminder(task.id);
      assert.strictEqual(claimed, null, 'Claim MUST fail if existing lock is active (< 60s old)');
    });

    it('4.3 Should recover and claim lock when existing lock is stale (> 60s old)', () => {
      const task = db.addTask({ title: 'Stale Lock Task', reminder: true });
      const safeId = String(task.id).replace(/[^a-zA-Z0-9_]/g, '_');
      const lockFile = path.join(testLocksDir, `claim_${safeId}.lock`);

      // Pre-create stale lock (75 seconds old)
      fs.writeFileSync(lockFile, JSON.stringify({ pid: 8888, time: Date.now() - 75000 }), 'utf-8');
      
      // Set modification time to 75 seconds ago
      const staleTime = (Date.now() - 75000) / 1000;
      fs.utimesSync(lockFile, staleTime, staleTime);

      const db2 = new DatabaseService();
      db2.dbPath = testDbPath;
      db2.getLocksDir = () => testLocksDir;

      const claimed = db2.claimTaskReminder(task.id);
      assert.ok(claimed, 'Claim MUST succeed and recover stale lock (> 60s old)');
      assert.strictEqual(claimed.notified, true);

      const newContent = JSON.parse(fs.readFileSync(lockFile, 'utf-8'));
      assert.strictEqual(newContent.recovered, true, 'Recovered lockfile content should set recovered: true');
    });
  });
});
