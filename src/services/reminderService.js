const DatabaseService = require('./database');
const NotificationService = require('./notificationService');
const { getLocalDateString, getLocalTimeStringSec } = require('./nlpParser');

class ReminderService {
  constructor(dbService, notificationService, schedulerService) {
    this.db = dbService || new DatabaseService();
    this.notifications = notificationService || new NotificationService();
    this.scheduler = schedulerService || (this.db ? this.db.scheduler : null);
    this.reminderInterval = null;
  }

  formatTime12Hour(timeStr) {
    if (!timeStr) return '';
    const parts = String(timeStr).split(':');
    if (parts.length < 2) return timeStr;
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1].padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
  }

  start(onReminderTriggered = null) {
    if (this.reminderInterval) clearInterval(this.reminderInterval);

    this.reminderInterval = setInterval(() => {
      if (!this.db) return;

      const settings = this.db.getSettings();
      const tasks = this.db.getTasks();
      const now = new Date();
      const currentDateStr = getLocalDateString(now);
      const currentTimeStrSec = getLocalTimeStringSec(now);

      tasks.forEach(task => {
        if (
          task.type === 'scheduled' &&
          task.status === 'pending' &&
          task.reminder &&
          !task.notified &&
          task.dueDate &&
          task.dueTime
        ) {
          const isTodayOrPastDate = task.dueDate <= currentDateStr;
          const taskTimeSec = task.dueTime.length === 5 ? `${task.dueTime}:00` : task.dueTime;
          const isTimeDue = (task.dueDate < currentDateStr) || (task.dueDate === currentDateStr && taskTimeSec <= currentTimeStrSec);

          if (isTodayOrPastDate && isTimeDue) {
            // Atomic OS Lock Claim
            const claimedTask = this.db.claimTaskReminder(task.id);
            if (!claimedTask) return; // ALREADY_CLAIMED by runTask.ps1 or another process

            // Immediately unregister OS Task to prevent Task Scheduler re-triggers
            if (this.scheduler && typeof this.scheduler.removeTask === 'function') {
              try { this.scheduler.removeTask(claimedTask.id); } catch (e) {}
            }

            if (onReminderTriggered && typeof onReminderTriggered === 'function') {
              try { onReminderTriggered(claimedTask); } catch (e) {}
            }

            const priorityStr = (claimedTask.priority || 'medium').toUpperCase();
            const timeStr = claimedTask.dueTime ? this.formatTime12Hour(claimedTask.dueTime) : '';
            const notifTitle = claimedTask.title || 'Task Reminder';
            const notifBody = `Time: ${timeStr} | Priority: ${priorityStr}`;

            try {
              this.notifications.dispatchNotification(notifTitle, notifBody, settings);
            } catch (err) {
              console.error(`Best-effort notification dispatch failed for task "${claimedTask.id}":`, err.message);
            }
          }
        }
      });
    }, 1000);
  }

  stop() {
    if (this.reminderInterval) {
      clearInterval(this.reminderInterval);
      this.reminderInterval = null;
    }
  }
}

module.exports = ReminderService;
