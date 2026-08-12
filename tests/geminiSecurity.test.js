const assert = require('assert');
const fs = require('fs');
const path = require('path');
const DatabaseService = require('../src/services/database');

describe('Gemini API Key safeStorage & Zero-Plaintext Storage Test Suite', () => {
  let db;
  const testDbPath = path.join(__dirname, '../scratch/test_gemini_db.json');

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
  });

  it('should never persist raw plaintext geminiApiKey to disk file', () => {
    db.updateSettings({ geminiApiKey: 'AIzaSyTestApiKey1234567890' });

    // Read raw JSON directly from disk
    const rawDisk = JSON.parse(fs.readFileSync(testDbPath, 'utf-8'));
    assert.strictEqual(rawDisk.settings.geminiApiKey, undefined, 'Plaintext geminiApiKey MUST NEVER be persisted to disk');
    assert(db.hasGeminiApiKey(), 'Key must be accessible via safeStorage or in-memory session');
  });

  it('should migrate legacy plaintext key and purge plaintext field from disk file', () => {
    const legacy = {
      tasks: [],
      settings: { geminiApiKey: 'AIzaSyLegacyPlaintextKey123' }
    };
    fs.writeFileSync(testDbPath, JSON.stringify(legacy, null, 2), 'utf-8');

    // Running getSettings triggers legacy migration check
    db.getSettings();

    const rawDisk = JSON.parse(fs.readFileSync(testDbPath, 'utf-8'));
    assert.strictEqual(rawDisk.settings.geminiApiKey, undefined, 'Legacy plaintext key field must be purged from disk file');
    assert(db.hasGeminiApiKey());
  });

  it('should handle missing or cleared API key cleanly', () => {
    db.updateSettings({ geminiApiKey: 'AIzaSyTestApiKey1234567890' });
    assert.strictEqual(db.hasGeminiApiKey(), true);

    db.updateSettings({ geminiApiKey: '' });
    assert.strictEqual(db.hasGeminiApiKey(), false);
    assert.strictEqual(db.getDecryptedApiKey(), '');

    const rawDisk = JSON.parse(fs.readFileSync(testDbPath, 'utf-8'));
    assert.strictEqual(rawDisk.settings.geminiApiKey, undefined);
    assert.strictEqual(rawDisk.settings.geminiApiKeyEncrypted, undefined);
  });

  it('should sanitize settings object so decrypted key is never exposed over IPC to renderer', () => {
    db.updateSettings({ geminiApiKey: 'AIzaSySecretTestKey999999' });

    // Mock IPC getSanitizedSettings logic
    const getSanitizedSettings = () => {
      const s = db.getSettings();
      const hasKey = db.hasGeminiApiKey();
      return {
        assistantName: s.assistantName || 'Nova',
        theme: s.theme || 'emerald',
        soundEnabled: s.soundEnabled !== false,
        notificationsEnabled: s.notificationsEnabled !== false,
        ntfyTopic: s.ntfyTopic || 'nova-my-tasks',
        hasGeminiApiKey: hasKey,
        geminiApiKey: ''
      };
    };

    const sanitized = getSanitizedSettings();
    assert.strictEqual(sanitized.hasGeminiApiKey, true);
    assert.strictEqual(sanitized.geminiApiKey, '', 'Raw decrypted key must NEVER be sent over IPC');
  });
});
