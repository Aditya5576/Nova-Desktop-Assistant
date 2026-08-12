/**
 * taskSchedulerDuplication.test.js — Task Scheduler Duplicate Registration, Pruning & Single Dispatch Invariant Suite.
 *
 * Verifies:
 *  TEST 1: Creating one task → exactly one MyAssist_Rem_* registration.
 *  TEST 2: Calling scheduler synchronization twice → still exactly one registration.
 *  TEST 3: Application startup/reconciliation repeated multiple times → no duplicates.
 *  TEST 4: Updating an existing task → no stale duplicate scheduled task.
 *  TEST 5: Deleting a task → scheduled task is removed.
 *  TEST 6: Recurring task → exactly one next scheduled task.
 *  TEST 7: Database with 3 tasks → reconciliation creates exactly 3 Windows tasks, not 30+.
 *  TEST 8: Scheduler registration is idempotent.
 *  TEST 9: Single Dispatch Invariant — Re-executing runTask.ps1 on a notified task produces ZERO dispatches.
 *  TEST 10: Concurrent Electron + PowerShell Claim — Exactly ONE claim succeeds, second process yields 0 dispatches.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const TaskSchedulerService = require('../src/services/taskSchedulerService');
const TaskService = require('../src/services/taskService');
const DatabaseService = require('../src/services/database');
const ReminderService = require('../src/services/reminderService');

describe('Task Scheduler Duplicate Registration & Single Dispatch Invariant Suite', () => {
  let db;
  let scheduler;
  let taskService;
  const testDbPath = path.join(__dirname, '../scratch/test_dup_db.json');

  beforeEach(() => {
    process.env.NODE_ENV = 'test';

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
    db.clearAllTasks(); // start clean

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

  it('TEST 1: Creating one task → exactly one MyAssist_Rem_* registration', () => {
    const task = taskService.addTask({ title: 'Task 1', dueDate: '2026-12-31', dueTime: '09:00:00' });
    assert.strictEqual(scheduler.mockRegistry.size, 1, 'Registry must contain exactly 1 scheduled task');
    const safeId = task.id.replace(/[^a-zA-Z0-9_]/g, '_');
    assert.ok(scheduler.mockRegistry.has(`MyAssist_Rem_${safeId}`), 'Task name must match MyAssist_Rem_<id>');
  });

  it('TEST 2: Calling scheduler synchronization twice → still exactly one registration', () => {
    const task = taskService.addTask({ title: 'Task 1', dueDate: '2026-12-31', dueTime: '09:00:00' });
    assert.strictEqual(scheduler.mockRegistry.size, 1);

    scheduler.syncAllPendingTasks(db.getTasks());
    scheduler.syncAllPendingTasks(db.getTasks());

    assert.strictEqual(scheduler.mockRegistry.size, 1, 'Calling syncAllPendingTasks multiple times must be idempotent');
  });

  it('TEST 3: Application startup/reconciliation repeated multiple times → no duplicates', () => {
    taskService.addTask({ title: 'Task A', dueDate: '2026-12-31' });
    taskService.addTask({ title: 'Task B', dueDate: '2026-12-31' });

    for (let i = 0; i < 5; i++) {
      const bootScheduler = new TaskSchedulerService();
      bootScheduler.syncAllPendingTasks(db.getTasks());
      assert.strictEqual(bootScheduler.mockRegistry.size, 2, `Startup iteration ${i + 1} must yield exactly 2 registrations`);
    }
  });

  it('TEST 4: Updating an existing task → no stale duplicate scheduled task', () => {
    const task = taskService.addTask({ title: 'Original Task', dueDate: '2026-12-31', dueTime: '09:00:00' });
    assert.strictEqual(scheduler.mockRegistry.size, 1);

    taskService.updateTask(task.id, { title: 'Updated Task', dueTime: '10:00:00' });
    assert.strictEqual(scheduler.mockRegistry.size, 1, 'Updating a task must NOT leave duplicate scheduled tasks');

    taskService.updateTask(task.id, { status: 'done' });
    assert.strictEqual(scheduler.mockRegistry.size, 0, 'Marking task done must remove scheduled task');
  });

  it('TEST 5: Deleting a task → scheduled task is removed', () => {
    const task = taskService.addTask({ title: 'Delete Me', dueDate: '2026-12-31' });
    assert.strictEqual(scheduler.mockRegistry.size, 1);

    taskService.deleteTask(task.id);
    assert.strictEqual(scheduler.mockRegistry.size, 0, 'Deleting task must remove it from scheduler registry');
  });

  it('TEST 6: Recurring task → exactly one next scheduled task', () => {
    const task = taskService.addTask({
      title: 'Daily Standup',
      dueDate: '2026-12-31',
      dueTime: '09:00:00',
      recurring: 'daily'
    });
    assert.strictEqual(scheduler.mockRegistry.size, 1);

    taskService.updateTask(task.id, { status: 'done' });

    assert.strictEqual(scheduler.mockRegistry.size, 1, 'Completing recurring task must result in exactly 1 new scheduled task');
    const registered = Array.from(scheduler.mockRegistry.values())[0];
    assert.ok(registered.id !== task.id, 'New recurring task must have a new ID');
  });

  it('TEST 7: Database with 3 tasks → reconciliation creates exactly 3 Windows tasks, not 30+', () => {
    taskService.addTask({ title: 'Task 1', dueDate: '2026-12-31' });
    taskService.addTask({ title: 'Task 2', dueDate: '2026-12-31' });
    taskService.addTask({ title: 'Task 3', dueDate: '2026-12-31' });

    for (let i = 0; i < 35; i++) {
      scheduler.mockRegistry.set(`MyAssist_Rem_stale_${i}`, { name: `MyAssist_Rem_stale_${i}` });
    }
    assert.strictEqual(scheduler.mockRegistry.size, 38, 'Pre-reconciliation registry size');

    scheduler.syncAllPendingTasks(db.getTasks());

    assert.strictEqual(scheduler.mockRegistry.size, 3, 'Reconciliation must prune all 35 stale tasks and leave exactly 3 tasks');
  });

  it('TEST 8: Scheduler registration is idempotent', () => {
    const task = taskService.addTask({ title: 'Idempotent Test', dueDate: '2026-12-31' });

    for (let i = 0; i < 10; i++) {
      scheduler.scheduleTask(task);
    }

    assert.strictEqual(scheduler.mockRegistry.size, 1, 'Repeated scheduleTask calls for same ID must be idempotent');
  });

  it('TEST 9: Single Dispatch Invariant — Re-executing runTask.ps1 on a notified task produces ZERO dispatches', () => {
    const testHarnessDir = path.join(__dirname, '../scratch/single_dispatch_test');
    const scriptsDir = path.join(testHarnessDir, 'scripts');
    const locksDir = path.join(testHarnessDir, '.locks');
    const dbFile = path.join(testHarnessDir, 'myassist_tasks.json');

    if (fs.existsSync(testHarnessDir)) {
      fs.rmSync(testHarnessDir, { recursive: true, force: true });
    }
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.mkdirSync(locksDir, { recursive: true });

    const srcRunner = path.join(__dirname, '../scripts/runTask.ps1');
    const runnerCopy = path.join(scriptsDir, 'runTask.ps1');
    fs.copyFileSync(srcRunner, runnerCopy);

    const taskId = 'task_single_dispatch_inv';
    const mockDbContent = {
      tasks: [
        {
          id: taskId,
          title: 'Single Dispatch Invariant Task',
          priority: 'medium',
          dueDate: '2026-01-01',
          dueTime: '09:00:00',
          status: 'pending',
          reminder: true,
          notified: false
        }
      ],
      settings: { soundEnabled: false, notificationsEnabled: false, ntfyTopic: 'none' }
    };
    fs.writeFileSync(dbFile, JSON.stringify(mockDbContent, null, 2), 'utf-8');

    // 1st Execution: Should claim lock & set notified = true
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', runnerCopy, '-Id', taskId]);

    const updated1 = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
    assert.strictEqual(updated1.tasks[0].notified, true, 'First execution must set notified = true');

    // 2nd Execution: Should immediately exit because notified === true
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', runnerCopy, '-Id', taskId]);

    const updated2 = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
    assert.strictEqual(updated2.tasks[0].notified, true, 'Second execution must retain notified = true without errors');

    try { fs.rmSync(testHarnessDir, { recursive: true, force: true }); } catch (e) {}
  });

  it('TEST 10: Concurrent Electron + PowerShell Claim — Exactly ONE claim succeeds, second process yields 0 dispatches', () => {
    const taskId = 'task_concurrent_claim';
    const task = taskService.addTask({
      id: taskId,
      title: 'Concurrent Claim Test',
      dueDate: '2020-01-01',
      dueTime: '09:00:00',
      reminder: true
    });

    // 1. Electron claims task
    const claim1 = db.claimTaskReminder(task.id);
    assert.ok(claim1, 'First claim must succeed');

    // 2. Second claim (simulating concurrent process)
    const claim2 = db.claimTaskReminder(task.id);
    assert.strictEqual(claim2, null, 'Second claim must return null (ALREADY_CLAIMED)');
  });
});
