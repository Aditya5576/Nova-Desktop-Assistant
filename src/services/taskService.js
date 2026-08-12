const DatabaseService = require('./database');
const TaskSchedulerService = require('./taskSchedulerService');

class TaskService {
  constructor(dbService, schedulerService) {
    this.db = dbService || new DatabaseService();
    this.scheduler = schedulerService || new TaskSchedulerService();
  }

  getTasks() {
    return this.db.getTasks();
  }

  addTask(taskData) {
    if (!taskData || typeof taskData !== 'object') return null;

    const data = this.db.read();
    const newTask = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      title: taskData.title || 'Untitled Task',
      type: taskData.type || 'scheduled',
      status: taskData.status || (taskData.type === 'completed' ? 'done' : 'pending'),
      category: taskData.category || 'General',
      priority: taskData.priority || 'medium',
      recurring: taskData.recurring || 'none',
      createdAt: new Date().toISOString(),
      completedAt: taskData.type === 'completed' || taskData.status === 'done' ? new Date().toISOString() : null,
      dueDate: taskData.dueDate || new Date().toISOString().split('T')[0],
      dueTime: taskData.dueTime || '09:00:00',
      reminder: taskData.reminder !== undefined ? taskData.reminder : true,
      notified: false,
      snoozedUntil: null,
      notes: taskData.notes || ''
    };

    data.tasks.unshift(newTask);
    this.db.write(data);

    if (newTask.reminder && newTask.type === 'scheduled') {
      try {
        this.scheduler.scheduleTask(newTask);
      } catch (e) {
        console.error('Task scheduler error:', e);
      }
    }

    return newTask;
  }

  updateTask(id, updates) {
    if (!id || typeof updates !== 'object' || updates === null) return null;

    const data = this.db.read();
    const tasks = data.tasks || [];
    const index = tasks.findIndex(t => t.id === id);
    if (index !== -1) {
      const task = tasks[index];

      if (updates.status === 'done' && task.status !== 'done') {
        updates.completedAt = new Date().toISOString();
        try {
          this.scheduler.removeTask(id);
        } catch (e) {}
      }

      tasks[index] = { ...tasks[index], ...updates };
      data.tasks = tasks;
      this.db.write(data);

      if (updates.status === 'done' && task.status !== 'done' && task.recurring && task.recurring !== 'none') {
        this.createNextRecurringTask(task);
      }

      if (data.tasks[index].status === 'pending' && data.tasks[index].reminder && !data.tasks[index].notified) {
        try {
          this.scheduler.scheduleTask(data.tasks[index]);
        } catch (e) {}
      } else if (data.tasks[index].notified) {
        try {
          this.scheduler.removeTask(id);
        } catch (e) {}
      }

      return data.tasks[index];
    }
    return null;
  }

  snoozeTask(id, minutes = 15) {
    if (!id) return null;

    const data = this.db.read();
    const tasks = data.tasks || [];
    const index = tasks.findIndex(t => t.id === id);
    if (index !== -1) {
      const snoozedTime = new Date(Date.now() + minutes * 60000);
      const hours = String(snoozedTime.getHours()).padStart(2, '0');
      const mins = String(snoozedTime.getMinutes()).padStart(2, '0');
      const secs = String(snoozedTime.getSeconds()).padStart(2, '0');

      tasks[index].snoozedUntil = snoozedTime.toISOString();
      tasks[index].dueDate = `${snoozedTime.getFullYear()}-${String(snoozedTime.getMonth() + 1).padStart(2, '0')}-${String(snoozedTime.getDate()).padStart(2, '0')}`;
      tasks[index].dueTime = `${hours}:${mins}:${secs}`;
      tasks[index].notified = false;

      data.tasks = tasks;
      this.db.write(data);
      try {
        this.scheduler.scheduleTask(tasks[index]);
      } catch (e) {}

      return tasks[index];
    }
    return null;
  }

  createNextRecurringTask(originalTask) {
    if (!originalTask || !originalTask.dueDate) return;

    const currentDue = new Date(originalTask.dueDate);
    let nextDate = new Date(currentDue);

    if (originalTask.recurring === 'daily') {
      nextDate.setDate(nextDate.getDate() + 1);
    } else if (originalTask.recurring === 'weekly') {
      nextDate.setDate(nextDate.getDate() + 7);
    } else if (originalTask.recurring === 'monthly') {
      nextDate.setMonth(nextDate.getMonth() + 1);
    }

    const nextDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;

    const newTaskData = {
      title: originalTask.title,
      type: 'scheduled',
      status: 'pending',
      category: originalTask.category,
      priority: originalTask.priority,
      recurring: originalTask.recurring,
      dueDate: nextDateStr,
      dueTime: originalTask.dueTime,
      reminder: originalTask.reminder,
      notes: originalTask.notes
    };

    this.addTask(newTaskData);
  }

  deleteTask(id) {
    if (!id) return false;

    const data = this.db.read();
    const tasks = data.tasks || [];
    const initialLen = tasks.length;
    data.tasks = tasks.filter(t => t.id !== id);
    if (data.tasks.length !== initialLen) {
      this.db.write(data);
      try {
        this.scheduler.removeTask(id);
      } catch (e) {}
      return true;
    }
    return false;
  }

  clearCompletedTasks() {
    const data = this.db.read();
    const existingTasks = data.tasks || [];
    const completedTasks = existingTasks.filter(t => t.status === 'done' || t.type === 'completed');

    completedTasks.forEach(task => {
      try {
        this.scheduler.removeTask(task.id);
      } catch (e) {}
    });

    data.tasks = existingTasks.filter(t => t.status !== 'done' && t.type !== 'completed');
    this.db.write(data);
    return true;
  }

  clearAllTasks() {
    const data = this.db.read();
    const existingTasks = data.tasks || [];

    existingTasks.forEach(task => {
      try {
        this.scheduler.removeTask(task.id);
      } catch (e) {}
    });

    data.tasks = [];
    this.db.write(data);
    return true;
  }
}

module.exports = TaskService;
