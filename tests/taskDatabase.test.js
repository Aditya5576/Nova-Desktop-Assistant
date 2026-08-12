const assert = require('assert');
const fs = require('fs');
const path = require('path');
const DatabaseService = require('../src/services/database');

describe('Task Database Service Unit Test Suite', () => {
  let db;
  const testDbPath = path.join(__dirname, '../scratch/test_db.json');

  beforeEach(() => {
    // Ensure clean scratch directory
    const scratchDir = path.dirname(testDbPath);
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    db = new DatabaseService();
    db.dbPath = testDbPath;
    db.init();
  });

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch (e) {}
    }
  });

  it('should add a new task cleanly', () => {
    const task = db.addTask({ title: 'Test Task 1', priority: 'high' });
    assert(task.id, 'Task must have an ID');
    assert.strictEqual(task.title, 'Test Task 1');
    assert.strictEqual(task.status, 'pending');

    const tasks = db.getTasks();
    assert.strictEqual(tasks.length, 2, 'DB should contain welcome task + new task');
  });

  it('should clear completed tasks without deleting pending tasks', () => {
    const task1 = db.addTask({ title: 'Pending Task', type: 'scheduled', status: 'pending' });
    const task2 = db.addTask({ title: 'Completed Task', type: 'completed', status: 'done' });

    assert.strictEqual(db.getTasks().length, 3); // init-1 + task1 + task2

    db.clearCompletedTasks();

    const remaining = db.getTasks();
    assert.strictEqual(remaining.length, 2, 'Pending tasks must remain after clearCompletedTasks');
    const remainingTitles = remaining.map(t => t.title);
    assert(remainingTitles.includes('Pending Task'), 'Pending task must be preserved');
    assert(!remainingTitles.includes('Completed Task'), 'Completed task must be removed');
  });

  it('should clear all tasks when clearAllTasks is invoked', () => {
    db.addTask({ title: 'Task A' });
    db.addTask({ title: 'Task B' });
    db.clearAllTasks();
    assert.strictEqual(db.getTasks().length, 0, 'DB must be empty after clearAllTasks');
  });

  it('should snooze a task correctly', () => {
    const task = db.addTask({ title: 'Snooze Me', dueTime: '12:00:00' });
    const snoozed = db.snoozeTask(task.id, 15);
    assert(snoozed, 'Snoozed task returned should not be null');
    assert.strictEqual(snoozed.notified, false);
    assert(snoozed.snoozedUntil, 'snoozedUntil timestamp must be populated');
  });

  it('should save and retrieve user settings', () => {
    const updated = db.updateSettings({ theme: 'cyberpunk', soundEnabled: false });
    assert.strictEqual(updated.theme, 'cyberpunk');
    assert.strictEqual(updated.soundEnabled, false);

    const retrieved = db.getSettings();
    assert.strictEqual(retrieved.theme, 'cyberpunk');
    assert.strictEqual(retrieved.soundEnabled, false);
  });
});
