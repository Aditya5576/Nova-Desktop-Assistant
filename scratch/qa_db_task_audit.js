const assert = require('assert');
const fs = require('fs');
const path = require('path');
const DatabaseService = require('../src/services/database');
const TaskService = require('../src/services/taskService');

const testDbPath = path.join(__dirname, 'qa_audit_db.json');

// Mock TaskSchedulerService to avoid actual OS task scheduling during QA test
class MockScheduler {
  syncAllPendingTasks() {}
  scheduleTask() {}
  removeTask() {}
}

const results = [];

function recordTest(suite, name, fn) {
  try {
    fn();
    results.push({ suite, name, status: 'PASS', error: null });
    console.log(`  ✅ [PASS] ${suite} - ${name}`);
  } catch (err) {
    results.push({ suite, name, status: 'FAIL', error: err.message });
    console.error(`  ❌ [FAIL] ${suite} - ${name}\n     ${err.stack || err.message}`);
  }
}

function cleanTestDb() {
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch (e) {}
  }
}

console.log('🚀 Starting Nova Database & Task Service QA Audit...\n');

cleanTestDb();

// --- TEST SUITE 1: DB Initialization & Default Settings ---
console.log('📌 Test Suite 1: Database Initialization & Default Settings Structure');

recordTest('DB Init', 'Database creates default JSON file when missing', () => {
  cleanTestDb();
  const db = new DatabaseService();
  db.scheduler = new MockScheduler();
  db.dbPath = testDbPath;
  db.init();

  assert(fs.existsSync(testDbPath), 'Database file must be created on disk');
  const data = db.read();
  assert(Array.isArray(data.tasks), 'tasks must be an array');
  assert.strictEqual(data.tasks.length, 1, 'Initial tasks array should contain welcome task');
  assert.strictEqual(data.tasks[0].id, 'init-1');
  assert.strictEqual(data.tasks[0].title, 'Welcome to Nova! Desktop Task Assistant is ready.');
  assert.strictEqual(data.tasks[0].type, 'scheduled');
  assert.strictEqual(data.tasks[0].status, 'pending');
  assert.strictEqual(data.tasks[0].category, 'General');
  assert.strictEqual(data.tasks[0].priority, 'high');
});

recordTest('DB Settings', 'Default settings structure and getSettings behavior', () => {
  cleanTestDb();
  const db = new DatabaseService();
  db.scheduler = new MockScheduler();
  db.dbPath = testDbPath;
  db.init();
  
  const settings = db.getSettings();
  assert.strictEqual(settings.assistantName, 'Nova');
  assert.strictEqual(settings.theme, 'dark');
  assert.strictEqual(settings.soundEnabled, true);
  assert.strictEqual(settings.notificationsEnabled, true);
  assert.strictEqual(settings.ntfyTopic, 'nova-my-tasks');
});

// --- TEST SUITE 2: Task CRUD Operations ---
console.log('\n📌 Test Suite 2: Task CRUD Operations (addTask, updateTask, snoozeTask, deleteTask)');

recordTest('Task Operations', 'addTask adds valid scheduled and completed tasks', () => {
  cleanTestDb();
  const db = new DatabaseService();
  db.scheduler = new MockScheduler();
  db.dbPath = testDbPath;
  db.init();

  const taskService = new TaskService(db, db.scheduler);

  const t1 = taskService.addTask({
    title: 'Prepare Quarterly Report',
    category: 'Work',
    priority: 'high',
    dueDate: '2026-09-01',
    dueTime: '10:00:00',
    notes: 'Draft presentation slides'
  });

  assert(t1, 't1 should be created');
  assert(t1.id.startsWith('task_'), 't1.id should start with task_');
  assert.strictEqual(t1.title, 'Prepare Quarterly Report');
  assert.strictEqual(t1.status, 'pending');
  assert.strictEqual(t1.category, 'Work');
  assert.strictEqual(t1.priority, 'high');
  assert.strictEqual(t1.dueDate, '2026-09-01');
  assert.strictEqual(t1.dueTime, '10:00:00');
  assert.strictEqual(t1.notes, 'Draft presentation slides');
  assert.strictEqual(t1.notified, false);

  const t2 = taskService.addTask({
    title: 'Completed Task Item',
    type: 'completed'
  });

  assert(t2, 't2 should be created');
  assert.strictEqual(t2.status, 'done');
  assert(t2.completedAt, 'completedAt should be populated for completed type');
});

recordTest('Task Operations', 'updateTask modifies properties and handles completion & recurring tasks', () => {
  cleanTestDb();
  const db = new DatabaseService();
  db.scheduler = new MockScheduler();
  db.dbPath = testDbPath;
  db.init();

  const taskService = new TaskService(db, db.scheduler);

  const task = taskService.addTask({
    title: 'Weekly Standup',
    recurring: 'weekly',
    dueDate: '2026-08-20',
    dueTime: '09:00:00'
  });

  const updated = taskService.updateTask(task.id, { priority: 'high', status: 'done' });
  assert.strictEqual(updated.priority, 'high');
  assert.strictEqual(updated.status, 'done');
  assert(updated.completedAt, 'completedAt must be populated upon completion');

  // Verify recurring task created next week's task
  const allTasks = taskService.getTasks();
  const nextRecurring = allTasks.find(t => t.title === 'Weekly Standup' && t.status === 'pending');
  assert(nextRecurring, 'Next recurring task should exist');
  assert.strictEqual(nextRecurring.dueDate, '2026-08-27');
});

recordTest('Task Operations', 'snoozeTask updates due time and resets notified flag', () => {
  cleanTestDb();
  const db = new DatabaseService();
  db.scheduler = new MockScheduler();
  db.dbPath = testDbPath;
  db.init();

  const taskService = new TaskService(db, db.scheduler);

  const task = taskService.addTask({
    title: 'Snooze Test Task',
    dueDate: '2026-08-20',
    dueTime: '10:00:00'
  });

  // Mark task as notified
  db.updateTask(task.id, { notified: true });

  const snoozed = taskService.snoozeTask(task.id, 30);
  assert(snoozed, 'Snoozed task returned');
  assert.strictEqual(snoozed.notified, false, 'notified flag must be reset to false');
  assert(snoozed.snoozedUntil, 'snoozedUntil ISO string must be set');
});

recordTest('Task Operations', 'deleteTask removes task and handles invalid ID', () => {
  cleanTestDb();
  const db = new DatabaseService();
  db.scheduler = new MockScheduler();
  db.dbPath = testDbPath;
  db.init();

  const taskService = new TaskService(db, db.scheduler);

  const task = taskService.addTask({ title: 'Task To Delete' });
  const deleted = taskService.deleteTask(task.id);
  assert.strictEqual(deleted, true, 'deleteTask should return true for existing ID');

  const tasksAfter = taskService.getTasks();
  assert(!tasksAfter.find(t => t.id === task.id), 'Task should no longer exist in DB');

  const deletedNonExistent = taskService.deleteTask('non-existent-id-123');
  assert.strictEqual(deletedNonExistent, false, 'deleteTask should return false for missing ID');
});

// --- TEST SUITE 3: Junk Sanitizer, Quote Stripper, and Deduplication Guard ---
console.log('\n📌 Test Suite 3: Junk Sanitizer, Quote Stripper & Deduplication Guard');

recordTest('Sanitizer & Stripper', 'Quote stripper removes surrounding double quotes', () => {
  cleanTestDb();
  const db = new DatabaseService();
  db.scheduler = new MockScheduler();
  db.dbPath = testDbPath;
  db.init();

  const taskService = new TaskService(db, db.scheduler);

  const task1 = taskService.addTask({ title: '"Read a Book"' });
  assert(task1, 'Task should be created');
  assert.strictEqual(task1.title, 'Read a Book', 'Surrounding quotes should be stripped');

  const task2 = taskService.addTask({ title: '""Finish Report""' });
  assert(task2, 'Task should be created');
  assert.strictEqual(task2.title, 'Finish Report', 'Multiple surrounding quotes should be stripped');
});

recordTest('Sanitizer & Stripper', 'Junk title sanitizer rejects forbidden system and short titles', () => {
  cleanTestDb();
  const db = new DatabaseService();
  db.scheduler = new MockScheduler();
  db.dbPath = testDbPath;
  db.init();

  const taskService = new TaskService(db, db.scheduler);

  const emptyResult = taskService.addTask({ title: ' ' });
  assert.strictEqual(emptyResult, null, 'Empty title must be rejected');

  const shortResult = taskService.addTask({ title: 'a' });
  assert.strictEqual(shortResult, null, 'Single char title must be rejected');

  const testAlertResult = taskService.addTask({ title: 'System Test alert 123' });
  assert.strictEqual(testAlertResult, null, 'Title containing Test alert must be rejected');

  const novaAssistResult = taskService.addTask({ title: 'Nova Desktop Assistant notification' });
  assert.strictEqual(novaAssistResult, null, 'Title containing Nova Desktop Assistant must be rejected');

  const tripleQuoteResult = taskService.addTask({ title: 'Task with """ quotes' });
  assert.strictEqual(tripleQuoteResult, null, 'Title containing unstripped triple quotes must be rejected');

  const doubleQuoteResult = taskService.addTask({ title: 'Task with "" quotes' });
  assert.strictEqual(doubleQuoteResult, null, 'Title containing unstripped double quotes must be rejected');
});

recordTest('Deduplication Guard', 'Deduplication guard ignores duplicate pending tasks (case-insensitive)', () => {
  cleanTestDb();
  const db = new DatabaseService();
  db.scheduler = new MockScheduler();
  db.dbPath = testDbPath;
  db.init();

  const taskService = new TaskService(db, db.scheduler);

  const first = taskService.addTask({ title: 'Submit Expense Report', priority: 'low' });
  assert(first, 'First task should be added');

  const duplicate = taskService.addTask({ title: 'submit expense report', priority: 'high' });
  assert(duplicate, 'Should return existing task');
  assert.strictEqual(duplicate.id, first.id, 'Returned task should match first task ID');
  assert.strictEqual(duplicate.priority, 'low', 'Should not overwrite existing pending task');

  const taskCount = taskService.getTasks().filter(t => t.title.toLowerCase() === 'submit expense report').length;
  assert.strictEqual(taskCount, 1, 'Duplicate task must not be duplicated in DB');
});

// --- TEST SUITE 4: cleanStalePastTasks Behavior ---
console.log('\n📌 Test Suite 4: cleanStalePastTasks Behavior on Past-Due Tasks');

recordTest('Clean Stale Tasks', 'cleanStalePastTasks marks past-due pending tasks as notified', () => {
  cleanTestDb();
  const db = new DatabaseService();
  db.scheduler = new MockScheduler();
  db.dbPath = testDbPath;
  db.init();

  const pastDateStr = '2020-01-01';
  const pastTimeStr = '10:00:00';

  const futureDateStr = '2099-01-01';
  const futureTimeStr = '10:00:00';

  const data = db.read();
  data.tasks.push({
    id: 'stale-1',
    title: 'Stale Past Due Task',
    type: 'scheduled',
    status: 'pending',
    dueDate: pastDateStr,
    dueTime: pastTimeStr,
    notified: false
  });
  data.tasks.push({
    id: 'future-1',
    title: 'Future Valid Task',
    type: 'scheduled',
    status: 'pending',
    dueDate: futureDateStr,
    dueTime: futureTimeStr,
    notified: false
  });
  db.write(data);

  db.cleanStalePastTasks();

  const updatedData = db.read();
  const staleTask = updatedData.tasks.find(t => t.id === 'stale-1');
  const futureTask = updatedData.tasks.find(t => t.id === 'future-1');

  assert(staleTask, 'staleTask must exist');
  assert.strictEqual(staleTask.notified, true, 'Past-due task must have notified set to true');

  assert(futureTask, 'futureTask must exist');
  assert.strictEqual(futureTask.notified, false, 'Future task must retain notified as false');
});

cleanTestDb();

console.log('\n==================================================');
console.log('📊 COMPREHENSIVE QA AUDIT SUMMARY REPORT');
console.log('==================================================');
const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;
console.log(`Total Audited Cases: ${results.length}`);
console.log(`Passed:              ${passed}`);
console.log(`Failed:              ${failed}`);
console.log('--------------------------------------------------');
results.forEach((r, idx) => {
  console.log(`${idx + 1}. [${r.status}] ${r.suite} -> ${r.name}`);
  if (r.error) {
    console.log(`   Error: ${r.error}`);
  }
});
console.log('==================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
