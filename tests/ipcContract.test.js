const assert = require('assert');
const DatabaseService = require('../src/services/database');
const path = require('path');
const fs = require('fs');

describe('IPC Contract Normalization Test Suite', () => {
  let db;
  const testDbPath = path.join(__dirname, '../scratch/test_ipc_db.json');

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

  // Mock IPC handler logic from main.js
  const handleUpdateTask = (arg1, arg2) => {
    if (typeof arg1 === 'object' && arg1 !== null && arg1.id) {
      return db.updateTask(arg1.id, arg1.updates);
    }
    return db.updateTask(arg1, arg2);
  };

  const handleSnoozeTask = (arg1, arg2) => {
    if (typeof arg1 === 'object' && arg1 !== null && arg1.id) {
      return db.snoozeTask(arg1.id, arg1.minutes);
    }
    return db.snoozeTask(arg1, arg2);
  };

  const handleDeleteTask = (idOrObj) => {
    const id = (typeof idOrObj === 'object' && idOrObj !== null) ? idOrObj.id : idOrObj;
    return db.deleteTask(id);
  };

  it('should update task using positional arguments: updateTask(id, updates)', () => {
    const task = db.addTask({ title: 'Positional Task', status: 'pending' });
    const updated = handleUpdateTask(task.id, { status: 'done' });
    assert(updated);
    assert.strictEqual(updated.status, 'done');
  });

  it('should update task using object-wrapped argument: updateTask({ id, updates })', () => {
    const task = db.addTask({ title: 'Object Task', status: 'pending' });
    const updated = handleUpdateTask({ id: task.id, updates: { status: 'done' } });
    assert(updated);
    assert.strictEqual(updated.status, 'done');
  });

  it('should snooze task using positional arguments: snoozeTask(id, minutes)', () => {
    const task = db.addTask({ title: 'Snooze Positional' });
    const snoozed = handleSnoozeTask(task.id, 20);
    assert(snoozed);
    assert(snoozed.snoozedUntil);
  });

  it('should snooze task using object-wrapped argument: snoozeTask({ id, minutes })', () => {
    const task = db.addTask({ title: 'Snooze Object' });
    const snoozed = handleSnoozeTask({ id: task.id, minutes: 20 });
    assert(snoozed);
    assert(snoozed.snoozedUntil);
  });

  it('should delete task using either string ID or object wrapper', () => {
    const task1 = db.addTask({ title: 'Delete 1' });
    const task2 = db.addTask({ title: 'Delete 2' });

    assert(handleDeleteTask(task1.id));
    assert(handleDeleteTask({ id: task2.id }));
  });
});
