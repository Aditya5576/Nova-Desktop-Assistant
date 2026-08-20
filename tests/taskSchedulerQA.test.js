/**
 * taskSchedulerQA.test.js — Task Scheduler QA Audit Verification Suite
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const TaskSchedulerService = require('../src/services/taskSchedulerService');
const TaskService = require('../src/services/taskService');
const DatabaseService = require('../src/services/database');

describe('Task Scheduler Comprehensive QA Audit Suite', () => {
  let db;
  let scheduler;
  let taskService;
  const testDbPath = path.join(__dirname, '../scratch/test_qa_db.json');

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    const scratchDir = path.dirname(testDbPath);
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

    db = new DatabaseService();
    db.dbPath = testDbPath;
    db.init();
    db.clearAllTasks();

    scheduler = new TaskSchedulerService();
    scheduler.mockRegistry.clear();
    taskService = new TaskService(db, scheduler);
  });

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch (e) {}
    }
    if (scheduler) scheduler.mockRegistry.clear();
  });

  describe('1. Pure JS Date Formatting & Detection (Zero-Blocking)', () => {
    it('detectWindowsShortDateFormat() returns standard format in pure JS', () => {
      const format = scheduler.detectWindowsShortDateFormat();
      assert.ok(['MM/DD/YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY'].includes(format), `Format should be standard, got: ${format}`);
      assert.strictEqual(scheduler.osDateFormat, format, 'Format must be memoized in instance');
    });

    it('formatDateForOs() operates in pure JS without child_process execution', () => {
      const formatted = scheduler.formatDateForOs(2026, 12, 31);
      assert.ok(typeof formatted === 'string' && formatted.length >= 8);
      
      // Benchmarking speed: 10,000 iterations must take < 50ms (pure JS)
      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        scheduler.formatDateForOs(2026, 12, 31);
      }
      const duration = Date.now() - start;
      assert.ok(duration < 50, `10,000 date format calls took ${duration}ms, expected < 50ms (pure JS zero-blocking)`);
    });
  });

  describe('2. Core API Testing (scheduleTask, removeTask, syncAllPendingTasks)', () => {
    it('scheduleTask() registers active pending tasks and filters invalid/past-due tasks', () => {
      const activeTask = { id: 'task_active_1', status: 'pending', notified: false, reminder: true, dueDate: '2026-12-31', dueTime: '10:00' };
      const completedTask = { id: 'task_done_1', status: 'done', notified: false, reminder: true, dueDate: '2026-12-31' };
      const notifiedTask = { id: 'task_notified_1', status: 'pending', notified: true, reminder: true, dueDate: '2026-12-31' };
      const disabledReminder = { id: 'task_disabled_1', status: 'pending', notified: false, reminder: false, dueDate: '2026-12-31' };
      const pastDueTask = { id: 'task_past_1', status: 'pending', notified: false, reminder: true, dueDate: '2020-01-01', dueTime: '09:00:00' };

      scheduler.scheduleTask(activeTask);
      assert.strictEqual(scheduler.mockRegistry.size, 1);
      assert.ok(scheduler.mockRegistry.has('MyAssist_Rem_task_active_1'));

      scheduler.scheduleTask(completedTask);
      scheduler.scheduleTask(notifiedTask);
      scheduler.scheduleTask(disabledReminder);
      scheduler.scheduleTask(pastDueTask);

      assert.strictEqual(scheduler.mockRegistry.size, 1, 'Only active pending non-past-due tasks should remain scheduled');
    });

    it('removeTask() unregisters task cleanly', () => {
      scheduler.scheduleTask({ id: 'task_rem_1', status: 'pending', notified: false, reminder: true, dueDate: '2026-12-31' });
      assert.strictEqual(scheduler.mockRegistry.size, 1);

      scheduler.removeTask('task_rem_1');
      assert.strictEqual(scheduler.mockRegistry.size, 0);
    });

    it('syncAllPendingTasks() synchronizes state and prunes stale tasks', () => {
      const task1 = { id: 'sync_1', status: 'pending', notified: false, reminder: true, dueDate: '2026-12-31' };
      const task2 = { id: 'sync_2', status: 'pending', notified: false, reminder: true, dueDate: '2026-12-31' };
      
      // Inject stale tasks into registry
      scheduler.mockRegistry.set('MyAssist_Rem_stale_task', { name: 'MyAssist_Rem_stale_task' });
      assert.strictEqual(scheduler.mockRegistry.size, 1);

      scheduler.syncAllPendingTasks([task1, task2]);
      assert.strictEqual(scheduler.mockRegistry.size, 2, 'Should prune stale tasks and retain 2 active tasks');
      assert.ok(scheduler.mockRegistry.has('MyAssist_Rem_sync_1'));
      assert.ok(scheduler.mockRegistry.has('MyAssist_Rem_sync_2'));
      assert.ok(!scheduler.mockRegistry.has('MyAssist_Rem_stale_task'));
    });
  });

  describe('3. Windows schtasks.exe Integration & Single-Registration Invariant', () => {
    it('generates sanitized schtasks name MyAssist_Rem_<safeId>', () => {
      const task = { id: 'task-with-special!@#chars', status: 'pending', notified: false, reminder: true, dueDate: '2026-12-31' };
      scheduler.scheduleTask(task);
      assert.ok(scheduler.mockRegistry.has('MyAssist_Rem_task_with_special___chars'));
    });

    it('enforces single-registration invariant across repeated syncs', () => {
      const task = { id: 'task_repeat', status: 'pending', notified: false, reminder: true, dueDate: '2026-12-31' };
      for (let i = 0; i < 10; i++) {
        scheduler.scheduleTask(task);
      }
      assert.strictEqual(scheduler.mockRegistry.size, 1, 'Single-registration invariant: size must be 1');
    });

    it('constructs correct PowerShell runner command string', () => {
      const task = { id: 'task_cmd_test', status: 'pending', notified: false, reminder: true, dueDate: '2026-12-31', dueTime: '14:30:00' };
      scheduler.scheduleTask(task);
      const reg = scheduler.mockRegistry.get('MyAssist_Rem_task_cmd_test');
      assert.ok(reg.action.includes('powershell.exe -NoProfile -ExecutionPolicy Bypass -File'));
      assert.ok(reg.action.includes('runTask.ps1'));
      assert.ok(reg.action.includes('-Id "task_cmd_test"'));
    });
  });

  describe('4. Zero Main-Thread Lockups Verification', () => {
    it('verifies absence of execSync or blocking subprocess calls in TaskSchedulerService methods', () => {
      const code = fs.readFileSync(path.join(__dirname, '../src/services/taskSchedulerService.js'), 'utf-8');
      assert.ok(!code.includes('execSync'), 'TaskSchedulerService must NOT contain any execSync calls that lock main thread');
      assert.ok(!code.includes('spawnSync'), 'TaskSchedulerService must NOT contain any spawnSync calls that lock main thread');
    });
  });
});
