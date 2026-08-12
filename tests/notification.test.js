const assert = require('assert');
const DatabaseService = require('../src/services/database');
const path = require('path');
const fs = require('fs');

describe('Notification Engine & Deduplication Test Suite', () => {
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

  it('should allow exactly ONE logical claim via claimTaskReminder to prevent double dispatch', () => {
    const task = db.addTask({
      title: 'Due Now Task',
      type: 'scheduled',
      status: 'pending',
      reminder: true,
      notified: false
    });

    const firstClaim = db.claimTaskReminder(task.id);
    assert(firstClaim !== null, 'First claim must succeed');
    assert.strictEqual(firstClaim.notified, true);

    const secondClaim = db.claimTaskReminder(task.id);
    assert.strictEqual(secondClaim, null, 'Second claim must fail (preventing double notification)');
  });

  it('should respect notificationsEnabled: false setting in reminder loop logic', () => {
    db.updateSettings({ notificationsEnabled: false, soundEnabled: false });
    const settings = db.getSettings();

    const soundOn = settings.soundEnabled !== false;
    const notifOn = settings.notificationsEnabled !== false;

    assert.strictEqual(soundOn, false, 'Sound should be disabled');
    assert.strictEqual(notifOn, false, 'Desktop notifications should be disabled');
  });

  it('should process missed past-due reminders when Electron starts up', () => {
    const pastTask = db.addTask({
      title: 'Missed Task Yesterday',
      type: 'scheduled',
      status: 'pending',
      dueDate: '2020-01-01',
      dueTime: '09:00:00',
      reminder: true,
      notified: false
    });

    // Simulating app startup reminder check
    const claimed = db.claimTaskReminder(pastTask.id);
    assert(claimed !== null, 'Missed past-due task must be claimed and processed');
    assert.strictEqual(claimed.notified, true);
  });

  it('should generate next recurring task when task marked done', () => {
    const dailyTask = db.addTask({
      title: 'Daily Standup',
      type: 'scheduled',
      status: 'pending',
      recurring: 'daily',
      dueDate: '2026-08-12',
      dueTime: '10:00:00'
    });

    db.updateTask(dailyTask.id, { status: 'done' });

    const allTasks = db.getTasks();
    const nextTask = allTasks.find(t => t.title === 'Daily Standup' && t.status === 'pending');
    assert(nextTask, 'Next daily recurring task must be automatically created');
    assert.strictEqual(nextTask.dueDate, '2026-08-13');
  });
});
