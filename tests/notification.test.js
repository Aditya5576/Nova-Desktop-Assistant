const assert = require('assert');
const DatabaseService = require('../src/services/database');
const path = require('path');
const fs = require('fs');

describe('Notification Settings & Deduplication Test Suite', () => {
  let db;
  const testDbPath = path.join(__dirname, '../scratch/test_notif_db.json');

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

  it('should respect notificationsEnabled: false setting in reminder loop logic', () => {
    db.updateSettings({ notificationsEnabled: false, soundEnabled: false });
    const settings = db.getSettings();

    assert.strictEqual(settings.notificationsEnabled, false);
    assert.strictEqual(settings.soundEnabled, false);

    // Simulated reminder check
    const soundOn = settings.soundEnabled !== false;
    const notifOn = settings.notificationsEnabled !== false;

    assert.strictEqual(soundOn, false, 'Sound should be disabled');
    assert.strictEqual(notifOn, false, 'Desktop notifications should be disabled');
  });

  it('should mark task as notified upon first reminder dispatch to prevent duplication', () => {
    const task = db.addTask({
      title: 'Due Now Task',
      type: 'scheduled',
      status: 'pending',
      reminder: true,
      notified: false
    });

    // Simulate reminder checker marking task notified
    const updated = db.updateTask(task.id, { notified: true });
    assert.strictEqual(updated.notified, true);

    const reChecked = db.getTasks().find(t => t.id === task.id);
    assert.strictEqual(reChecked.notified, true, 'Task must remain notified to prevent re-triggering');
  });
});
