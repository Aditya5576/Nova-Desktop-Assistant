const fs = require('fs');
const path = require('path');
const assert = require('assert');

const DatabaseService = require('../src/services/database');
const TaskService = require('../src/services/taskService');
const TaskSchedulerService = require('../src/services/taskSchedulerService');

// Create test isolated directory
const testDir = path.join(__dirname, 'qa_db_test_env');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

const testDbPath = path.join(testDir, 'test_myassist_tasks.json');

const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  bugs: [],
  details: []
};

function runTest(name, fn) {
  testResults.total++;
  try {
    fn();
    testResults.passed++;
    testResults.details.push({ name, status: 'PASS' });
    console.log(`[PASS] ${name}`);
  } catch (err) {
    testResults.failed++;
    testResults.details.push({ name, status: 'FAIL', error: err.message });
    console.error(`[FAIL] ${name}: ${err.message}`);
  }
}

function cleanup() {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

function createFreshDb() {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  const db = new DatabaseService();
  db.dbPath = testDbPath;
  db.init();
  return db;
}

console.log('=== STARTING NOVA DATABASE & TASK SERVICE QA AUDIT ===\n');

try {
  // ==========================================
  // SECTION 1: Database Initialization & Defaults
  // ==========================================
  console.log('--- 1. DATABASE INITIALIZATION & DEFAULTS ---');

  runTest('DB Init creates database file if not existing', () => {
    const db = createFreshDb();
    assert(fs.existsSync(testDbPath), 'Database file must exist after init()');
  });

  runTest('DB Init creates default welcome task with valid structure', () => {
    const db = createFreshDb();
    const tasks = db.getTasks();
    assert.strictEqual(tasks.length, 1, 'Default DB should have exactly 1 welcome task');
    const welcome = tasks[0];
    assert.strictEqual(welcome.id, 'init-1');
    assert.strictEqual(welcome.title, 'Welcome to Nova! Desktop Task Assistant is ready.');
    assert.strictEqual(welcome.type, 'scheduled');
    assert.strictEqual(welcome.status, 'pending');
    assert.strictEqual(welcome.category, 'General');
    assert.strictEqual(welcome.priority, 'high');
    assert.strictEqual(welcome.recurring, 'none');
    assert.strictEqual(welcome.reminder, true);
    assert.strictEqual(welcome.notified, false);
    assert(welcome.createdAt, 'createdAt must exist');
    assert(welcome.dueDate, 'dueDate must exist');
    assert.strictEqual(welcome.dueTime, '18:00:00');
  });

  runTest('DB Init creates default settings structure', () => {
    const db = createFreshDb();
    const rawData = JSON.parse(fs.readFileSync(testDbPath, 'utf-8'));
    assert.deepStrictEqual(rawData.settings, {
      assistantName: 'Nova',
      theme: 'dark',
      soundEnabled: true,
      notificationsEnabled: true,
      geminiApiKey: '',
      ntfyTopic: ''
    }, 'Default settings in JSON file must match exact schema');
  });

  runTest('getSettings() returns default ntfyTopic if empty', () => {
    const db = createFreshDb();
    const settings = db.getSettings();
    assert.strictEqual(settings.ntfyTopic, 'nova-my-tasks');
  });

  runTest('DB Atomic Write uses .tmp file and renames', () => {
    const db = createFreshDb();
    const writeRes = db.write({ tasks: [], settings: {} });
    assert.strictEqual(writeRes, true, 'db.write should return true');
    assert(!fs.existsSync(`${testDbPath}.tmp`), '.tmp file should be cleaned up after renameSync');
  });

  // ==========================================
  // SECTION 2: Task CRUD Operations Audit
  // ==========================================
  console.log('\n--- 2. TASK CRUD OPERATIONS (addTask, updateTask, snoozeTask, deleteTask) ---');

  runTest('addTask creates task with custom fields', () => {
    const db = createFreshDb();
    const task = db.addTask({
      title: 'Custom Task',
      type: 'scheduled',
      category: 'Work',
      priority: 'high',
      recurring: 'daily',
      dueDate: '2026-09-01',
      dueTime: '10:30:00',
      reminder: true,
      notes: 'Important work task'
    });

    assert(task.id.startsWith('task_'), 'Task ID must start with task_');
    assert.strictEqual(task.title, 'Custom Task');
    assert.strictEqual(task.status, 'pending');
    assert.strictEqual(task.category, 'Work');
    assert.strictEqual(task.priority, 'high');
    assert.strictEqual(task.recurring, 'daily');
    assert.strictEqual(task.dueDate, '2026-09-01');
    assert.strictEqual(task.dueTime, '10:30:00');
    assert.strictEqual(task.reminder, true);
    assert.strictEqual(task.notified, false);
    assert.strictEqual(task.snoozedUntil, null);
    assert.strictEqual(task.notes, 'Important work task');
  });

  runTest('addTask handles minimal/empty task object and assigns defaults', () => {
    const db = createFreshDb();
    const task = db.addTask({});

    assert(task.id.startsWith('task_'));
    assert.strictEqual(task.title, 'Untitled Task');
    assert.strictEqual(task.type, 'scheduled');
    assert.strictEqual(task.status, 'pending');
    assert.strictEqual(task.category, 'General');
    assert.strictEqual(task.priority, 'medium');
    assert.strictEqual(task.recurring, 'none');
    assert.strictEqual(task.dueTime, '09:00:00');
    assert.strictEqual(task.reminder, true);
    assert.strictEqual(task.notified, false);
    assert.strictEqual(task.notes, '');
  });

  runTest('addTask with type completed defaults status to done and sets completedAt', () => {
    const db = createFreshDb();
    const task = db.addTask({ title: 'Finished Task', type: 'completed' });

    assert.strictEqual(task.status, 'done');
    assert(task.completedAt, 'completedAt must be populated');
  });

  runTest('TaskService.addTask handles null/invalid input gracefully', () => {
    const db = createFreshDb();
    const taskService = new TaskService(db);
    assert.strictEqual(taskService.addTask(null), null);
    assert.strictEqual(taskService.addTask(undefined), null);
    assert.strictEqual(taskService.addTask("not an object"), null);
  });

  runTest('updateTask updates fields correctly', () => {
    const db = createFreshDb();
    const task = db.addTask({ title: 'Old Title', priority: 'low' });
    const updated = db.updateTask(task.id, { title: 'New Title', priority: 'high', notes: 'Updated notes' });

    assert.strictEqual(updated.title, 'New Title');
    assert.strictEqual(updated.priority, 'high');
    assert.strictEqual(updated.notes, 'Updated notes');

    const fetched = db.getTasks().find(t => t.id === task.id);
    assert.strictEqual(fetched.title, 'New Title');
  });

  runTest('updateTask status to done sets completedAt', () => {
    const db = createFreshDb();
    const task = db.addTask({ title: 'To Finish' });
    assert.strictEqual(task.completedAt, null);

    const updated = db.updateTask(task.id, { status: 'done' });
    assert.strictEqual(updated.status, 'done');
    assert(updated.completedAt !== null, 'completedAt timestamp must be set upon completion');
  });

  runTest('updateTask status to done on daily recurring task creates next day task', () => {
    const db = createFreshDb();
    const task = db.addTask({
      title: 'Daily Workout',
      type: 'scheduled',
      recurring: 'daily',
      dueDate: '2026-08-20',
      dueTime: '07:00:00'
    });

    db.updateTask(task.id, { status: 'done' });

    const tasks = db.getTasks();
    const nextTask = tasks.find(t => t.title === 'Daily Workout' && t.status === 'pending');
    assert(nextTask, 'Next daily task should exist');
    assert.strictEqual(nextTask.dueDate, '2026-08-21');
    assert.strictEqual(nextTask.dueTime, '07:00:00');
    assert.strictEqual(nextTask.recurring, 'daily');
  });

  runTest('updateTask status to done on weekly recurring task creates next week task', () => {
    const db = createFreshDb();
    const task = db.addTask({
      title: 'Weekly Report',
      type: 'scheduled',
      recurring: 'weekly',
      dueDate: '2026-08-20'
    });

    db.updateTask(task.id, { status: 'done' });

    const tasks = db.getTasks();
    const nextTask = tasks.find(t => t.title === 'Weekly Report' && t.status === 'pending');
    assert(nextTask, 'Next weekly task should exist');
    assert.strictEqual(nextTask.dueDate, '2026-08-27');
  });

  runTest('updateTask status to done on monthly recurring task creates next month task', () => {
    const db = createFreshDb();
    const task = db.addTask({
      title: 'Monthly Rent',
      type: 'scheduled',
      recurring: 'monthly',
      dueDate: '2026-08-01'
    });

    db.updateTask(task.id, { status: 'done' });

    const tasks = db.getTasks();
    const nextTask = tasks.find(t => t.title === 'Monthly Rent' && t.status === 'pending');
    assert(nextTask, 'Next monthly task should exist');
    assert.strictEqual(nextTask.dueDate, '2026-09-01');
  });

  runTest('updateTask returns null for invalid/non-existent ID', () => {
    const db = createFreshDb();
    assert.strictEqual(db.updateTask('non-existent-id', { title: 'Test' }), null);

    const taskService = new TaskService(db);
    assert.strictEqual(taskService.updateTask(null, { title: 'Test' }), null);
    assert.strictEqual(taskService.updateTask('non-existent-id', null), null);
  });

  runTest('snoozeTask updates snoozedUntil, dueDate, dueTime, and resets notified', () => {
    const db = createFreshDb();
    const task = db.addTask({
      title: 'Snooze Target',
      dueDate: '2026-08-19',
      dueTime: '10:00:00'
    });
    // Mark as notified first
    db.updateTask(task.id, { notified: true });

    const snoozed = db.snoozeTask(task.id, 30);
    assert(snoozed, 'Snoozed task returned should not be null');
    assert(snoozed.snoozedUntil !== null, 'snoozedUntil must be set');
    assert.strictEqual(snoozed.notified, false, 'notified must be reset to false');

    const snoozedDateObj = new Date(snoozed.snoozedUntil);
    assert(!isNaN(snoozedDateObj.getTime()), 'snoozedUntil must be valid ISO date string');

    const fetched = db.getTasks().find(t => t.id === task.id);
    assert.strictEqual(fetched.notified, false);
    assert(fetched.snoozedUntil);
  });

  runTest('snoozeTask returns null for non-existent ID', () => {
    const db = createFreshDb();
    assert.strictEqual(db.snoozeTask('non-existent-id', 15), null);

    const taskService = new TaskService(db);
    assert.strictEqual(taskService.snoozeTask(null, 15), null);
  });

  runTest('deleteTask removes task from DB and returns true', () => {
    const db = createFreshDb();
    const task = db.addTask({ title: 'To Delete' });
    const initialCount = db.getTasks().length;

    const res = db.deleteTask(task.id);
    assert.strictEqual(res, true);
    assert.strictEqual(db.getTasks().length, initialCount - 1);
    assert.strictEqual(db.getTasks().find(t => t.id === task.id), undefined);
  });

  runTest('deleteTask returns false for non-existent ID', () => {
    const db = createFreshDb();
    assert.strictEqual(db.deleteTask('non-existent-id'), false);

    const taskService = new TaskService(db);
    assert.strictEqual(taskService.deleteTask(null), false);
  });

  // ==========================================
  // SECTION 3: cleanStalePastTasks() Audit
  // ==========================================
  console.log('\n--- 3. cleanStalePastTasks() BEHAVIOR AUDIT ---');

  runTest('cleanStalePastTasks marks past-due pending tasks (> 2 mins ago) as notified=true', () => {
    const db = createFreshDb();
    const now = new Date();

    // Past task 10 minutes ago
    const past10Min = new Date(now.getTime() - 10 * 60000);
    const pastDateStr = past10Min.toISOString().split('T')[0];
    const pastTimeStr = past10Min.toTimeString().split(' ')[0]; // HH:MM:SS

    const pastTask = db.addTask({
      title: 'Past Due Task',
      status: 'pending',
      dueDate: pastDateStr,
      dueTime: pastTimeStr,
      reminder: true
    });

    // Ensure notified is false before cleaning
    db.updateTask(pastTask.id, { notified: false });

    db.cleanStalePastTasks();

    const fetched = db.getTasks().find(t => t.id === pastTask.id);
    assert.strictEqual(fetched.notified, true, 'Past due task (>2 min) must be marked notified=true');
  });

  runTest('cleanStalePastTasks ignores tasks due < 2 minutes ago', () => {
    const db = createFreshDb();
    const now = new Date();

    // Past task 30 seconds ago
    const past30Sec = new Date(now.getTime() - 30 * 1000);
    const dateStr = past30Sec.toISOString().split('T')[0];
    const timeStr = past30Sec.toTimeString().split(' ')[0];

    const recentTask = db.addTask({
      title: 'Recent Past Task',
      status: 'pending',
      dueDate: dateStr,
      dueTime: timeStr,
      reminder: true
    });

    db.updateTask(recentTask.id, { notified: false });

    db.cleanStalePastTasks();

    const fetched = db.getTasks().find(t => t.id === recentTask.id);
    assert.strictEqual(fetched.notified, false, 'Recent past task (<2 min) must NOT be marked notified');
  });

  runTest('cleanStalePastTasks handles 5-character dueTime strings (HH:MM)', () => {
    const db = createFreshDb();
    const pastDate = new Date(Date.now() - 3600000); // 1 hour ago
    const dateStr = pastDate.toISOString().split('T')[0];
    const hours = String(pastDate.getHours()).padStart(2, '0');
    const mins = String(pastDate.getMinutes()).padStart(2, '0');
    const shortTimeStr = `${hours}:${mins}`; // HH:MM (length 5)

    const task = db.addTask({
      title: 'Short Time Task',
      status: 'pending',
      dueDate: dateStr,
      dueTime: shortTimeStr
    });

    db.updateTask(task.id, { notified: false });

    db.cleanStalePastTasks();

    const fetched = db.getTasks().find(t => t.id === task.id);
    assert.strictEqual(fetched.notified, true, 'Task with HH:MM dueTime must be parsed correctly and marked notified');
  });

  runTest('cleanStalePastTasks ignores future tasks, done tasks, and already notified tasks', () => {
    const db = createFreshDb();
    const futureDate = new Date(Date.now() + 86400000); // tomorrow
    const futureDateStr = futureDate.toISOString().split('T')[0];

    const futureTask = db.addTask({ title: 'Future Task', dueDate: futureDateStr, dueTime: '12:00:00' });
    const doneTask = db.addTask({ title: 'Done Task', status: 'done', dueDate: '2020-01-01', dueTime: '12:00:00' });

    db.cleanStalePastTasks();

    assert.strictEqual(db.getTasks().find(t => t.id === futureTask.id).notified, false);
    assert.strictEqual(db.getTasks().find(t => t.id === doneTask.id).notified, false);
  });

  runTest('cleanStalePastTasks handles invalid dueDate or dueTime strings without throwing', () => {
    const db = createFreshDb();
    const badTask = db.addTask({ title: 'Bad Date Task', dueDate: 'invalid-date', dueTime: 'invalid-time' });
    db.updateTask(badTask.id, { notified: false });

    assert.doesNotThrow(() => {
      db.cleanStalePastTasks();
    });

    const fetched = db.getTasks().find(t => t.id === badTask.id);
    assert.strictEqual(fetched.notified, false, 'Invalid date task should be skipped');
  });

  // ==========================================
  // SECTION 4: Settings Persistence & Gemini API Key Resolution Audit
  // ==========================================
  console.log('\n--- 4. SETTINGS PERSISTENCE & GEMINI API KEY AUDIT ---');

  runTest('updateSettings updates theme, soundEnabled, notificationsEnabled', () => {
    const db = createFreshDb();
    const updated = db.updateSettings({
      theme: 'cyberpunk',
      soundEnabled: false,
      notificationsEnabled: false
    });

    assert.strictEqual(updated.theme, 'cyberpunk');
    assert.strictEqual(updated.soundEnabled, false);
    assert.strictEqual(updated.notificationsEnabled, false);

    const retrieved = db.getSettings();
    assert.strictEqual(retrieved.theme, 'cyberpunk');
    assert.strictEqual(retrieved.soundEnabled, false);
    assert.strictEqual(retrieved.notificationsEnabled, false);
  });

  runTest('Gemini API key is NEVER persisted in plaintext to disk', () => {
    const db = createFreshDb();
    const testApiKey = 'AIzaSyD_TestKey_12345678901234567890';

    db.updateSettings({ geminiApiKey: testApiKey });

    // Inspect disk file raw JSON directly
    const rawFileContent = fs.readFileSync(testDbPath, 'utf-8');
    const diskJson = JSON.parse(rawFileContent);

    assert.strictEqual(diskJson.settings.geminiApiKey, undefined, 'Plaintext geminiApiKey MUST NOT be present in saved JSON file');
  });

  runTest('Gemini API key resolution works via getDecryptedApiKey() and hasGeminiApiKey()', () => {
    const db = createFreshDb();
    const testApiKey = 'AIzaSyD_TestKey_12345678901234567890';

    db.updateSettings({ geminiApiKey: testApiKey });

    assert.strictEqual(db.getDecryptedApiKey(), testApiKey, 'getDecryptedApiKey must return set API key');
    assert.strictEqual(db.hasGeminiApiKey(), true, 'hasGeminiApiKey must return true when valid key is set');

    // Test clearing key
    db.updateSettings({ geminiApiKey: '' });
    assert.strictEqual(db.getDecryptedApiKey(), '', 'getDecryptedApiKey must return empty string after clear');
    assert.strictEqual(db.hasGeminiApiKey(), false, 'hasGeminiApiKey must return false after clear');
  });

  // ==========================================
  // SECTION 5: Data Integrity, Edge Cases & Code Parity Audit
  // ==========================================
  console.log('\n--- 5. DATA INTEGRITY & CODE PARITY AUDIT ---');

  runTest('Parity Check: DatabaseService vs TaskService methods', () => {
    const db = createFreshDb();
    const taskService = new TaskService(db);

    const task1 = taskService.addTask({ title: 'Task via TaskService', priority: 'high' });
    const task2 = db.addTask({ title: 'Task via DatabaseService', priority: 'high' });

    assert(task1.id);
    assert(task2.id);

    const allTasks = taskService.getTasks();
    assert.strictEqual(allTasks.length, 3); // welcome + 2 added

    const snoozed1 = taskService.snoozeTask(task1.id, 10);
    assert(snoozed1.snoozedUntil);

    const deleted2 = taskService.deleteTask(task2.id);
    assert.strictEqual(deleted2, true);
    assert.strictEqual(taskService.getTasks().length, 2);
  });

  runTest('claimTaskReminder locks task atomically and prevents double notifications', () => {
    const db = createFreshDb();
    const task = db.addTask({ title: 'Reminder Task' });

    const claimed1 = db.claimTaskReminder(task.id);
    assert(claimed1, 'First claimTaskReminder must return task object');
    assert.strictEqual(claimed1.notified, true);

    const claimed2 = db.claimTaskReminder(task.id);
    assert.strictEqual(claimed2, null, 'Second claimTaskReminder must return null (already claimed)');
  });

  runTest('claimTaskReminder returns null for done or non-existent tasks', () => {
    const db = createFreshDb();
    const task = db.addTask({ title: 'Done Task' });
    db.updateTask(task.id, { status: 'done' });

    const claimed = db.claimTaskReminder(task.id);
    assert.strictEqual(claimed, null, 'Cannot claim reminder for completed task');
  });

  runTest('Corrupted JSON database recovery test', () => {
    const db = createFreshDb();
    // Intentionally corrupt the JSON file
    fs.writeFileSync(testDbPath, '{ corrupted json: true ...', 'utf-8');

    const data = db.read();
    assert.deepStrictEqual(data, { tasks: [], settings: {} }, 'read() must return fallback object on JSON syntax error');
  });

} finally {
  cleanup();
}

console.log('\n==========================================');
console.log(`QA AUDIT SUMMARY: Total: ${testResults.total} | Passed: ${testResults.passed} | Failed: ${testResults.failed}`);
console.log('==========================================');

if (testResults.failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
