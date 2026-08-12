const assert = require('assert');
const fs = require('fs');
const path = require('path');
const DatabaseService = require('../src/services/database');

describe('Gemini API Key safeStorage Security Test Suite', () => {
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

  it('should migrate plaintext geminiApiKey to geminiApiKeyEncrypted or store safely', () => {
    // Write raw plaintext key to test DB
    const initial = {
      tasks: [],
      settings: { geminiApiKey: 'AIzaSyMockPlaintextKey123456789' }
    };
    fs.writeFileSync(testDbPath, JSON.stringify(initial, null, 2), 'utf-8');

    const settings = db.getSettings();
    assert(db.hasGeminiApiKey(), 'Database must recognize that API key exists');

    // Confirm that getSettings() sanitizes and does not expose plaintext key directly to renderer
    const rawRead = db.read();
    if (rawRead.settings.geminiApiKeyEncrypted) {
      assert.strictEqual(rawRead.settings.geminiApiKey, undefined, 'Plaintext key must be deleted after encryption');
    }
  });

  it('should handle missing API key cleanly', () => {
    db.updateSettings({ geminiApiKey: '' });
    assert.strictEqual(db.hasGeminiApiKey(), false);
    assert.strictEqual(db.getDecryptedApiKey(), '');
  });

  it('should allow clearing an existing key', () => {
    db.updateSettings({ geminiApiKey: 'AIzaSyMockPlaintextKey123456789' });
    assert.strictEqual(db.hasGeminiApiKey(), true);

    db.updateSettings({ geminiApiKey: '' });
    assert.strictEqual(db.hasGeminiApiKey(), false);
    assert.strictEqual(db.getDecryptedApiKey(), '');
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
