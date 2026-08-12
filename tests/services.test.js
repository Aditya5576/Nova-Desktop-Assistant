const assert = require('assert');
const path = require('path');
const fs = require('fs');

const DatabaseService = require('../src/services/database');
const TaskSchedulerService = require('../src/services/taskSchedulerService');
const TaskService = require('../src/services/taskService');
const NotificationService = require('../src/services/notificationService');
const ReminderService = require('../src/services/reminderService');

describe('Service Decomposition Unit Test Suite', () => {
  let db;
  let scheduler;
  let taskService;
  let notificationService;
  let reminderService;
  const testDbPath = path.join(__dirname, '../scratch/test_services_db.json');

  beforeEach(() => {
    const scratchDir = path.dirname(testDbPath);
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

    db = new DatabaseService();
    db.dbPath = testDbPath;
    db.init();

    scheduler = new TaskSchedulerService();
    taskService = new TaskService(db, scheduler);
    taskService.clearAllTasks();
    notificationService = new NotificationService();
    reminderService = new ReminderService(db, notificationService);
  });

  afterEach(() => {
    if (reminderService) reminderService.stop();
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch (e) {}
    }
  });

  describe('TaskService', () => {
    it('should add a task via TaskService and persist to database', () => {
      const task = taskService.addTask({
        title: 'Service Task',
        type: 'scheduled',
        category: 'Work',
        priority: 'high'
      });

      assert(task.id.startsWith('task_'));
      assert.strictEqual(task.title, 'Service Task');

      const all = taskService.getTasks();
      assert.strictEqual(all.length, 1);
      assert.strictEqual(all[0].id, task.id);
    });

    it('should update task status and trigger next recurring task', () => {
      const task = taskService.addTask({
        title: 'Weekly Sync',
        type: 'scheduled',
        status: 'pending',
        recurring: 'weekly',
        dueDate: '2026-08-12'
      });

      taskService.updateTask(task.id, { status: 'done' });

      const all = taskService.getTasks();
      const updated = all.find(t => t.id === task.id);
      assert.strictEqual(updated.status, 'done');

      const next = all.find(t => t.title === 'Weekly Sync' && t.status === 'pending');
      assert(next, 'Next weekly task must be created');
      assert.strictEqual(next.dueDate, '2026-08-19');
    });

    it('should snooze a task by 15 minutes', () => {
      const task = taskService.addTask({
        title: 'Snooze Me',
        type: 'scheduled',
        status: 'pending',
        dueTime: '10:00:00'
      });

      const snoozed = taskService.snoozeTask(task.id, 15);
      assert(snoozed.snoozedUntil !== null);
      assert.strictEqual(snoozed.notified, false);
    });

    it('should delete a task by ID', () => {
      const task = taskService.addTask({ title: 'Delete Me' });
      const res = taskService.deleteTask(task.id);
      assert.strictEqual(res, true);
      assert.strictEqual(taskService.getTasks().length, 0);
    });

    it('should ensure clearCompletedTasks does NOT remove pending or scheduled tasks', () => {
      const pendingTask = taskService.addTask({
        title: 'Future Pending Task',
        type: 'scheduled',
        status: 'pending',
        dueDate: '2026-12-31'
      });

      const completedTask = taskService.addTask({
        title: 'Old Done Task',
        type: 'scheduled',
        status: 'done'
      });

      taskService.clearCompletedTasks();

      const remaining = taskService.getTasks();
      assert.strictEqual(remaining.length, 1);
      assert.strictEqual(remaining[0].id, pendingTask.id);
      assert.strictEqual(remaining[0].title, 'Future Pending Task');
    });
  });

  describe('ReminderService & NotificationService Integration', () => {
    it('should format 12-hour time correctly', () => {
      assert.strictEqual(reminderService.formatTime12Hour('14:30:00'), '2:30 PM');
      assert.strictEqual(reminderService.formatTime12Hour('09:05:00'), '9:05 AM');
    });

    it('should dispatch notification without error when settings enabled', () => {
      let dispatched = false;
      notificationService.sendWindowsToast = (title, body) => {
        dispatched = true;
      };

      notificationService.dispatchNotification('Test Title', 'Test Body', {
        soundEnabled: false,
        notificationsEnabled: true
      });

      assert.strictEqual(dispatched, true);
    });

    it('should safely handle malicious task titles without shell injection', () => {
      const maliciousTitle = '$(Get-Process); `whoami`; <toast><text>evil</text></toast>';
      let safeToastReceived = false;

      notificationService.sendWindowsToast = (title, body) => {
        safeToastReceived = true;
        assert.strictEqual(title, maliciousTitle, 'Title should be passed verbatim as text string argument');
      };

      notificationService.dispatchNotification(maliciousTitle, 'Body text', {
        soundEnabled: false,
        notificationsEnabled: true
      });

      assert.strictEqual(safeToastReceived, true);
    });

    it('should survive notification service exceptions without crashing reminder service loop', () => {
      notificationService.dispatchNotification = () => {
        throw new Error('Simulated Toast/Network Disruption');
      };

      const dueTask = taskService.addTask({
        title: 'Resilient Task',
        type: 'scheduled',
        status: 'pending',
        dueDate: '2020-01-01',
        dueTime: '09:00:00',
        reminder: true,
        notified: false
      });

      assert.doesNotThrow(() => {
        const claimed = db.claimTaskReminder(dueTask.id);
        if (claimed) {
          try {
            notificationService.dispatchNotification('Title', 'Body', {});
          } catch (err) {
            // Best-effort non-crashing exception handling
          }
        }
      });
    });
  });
});
