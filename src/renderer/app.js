// Renderer App logic for MyAssist
let tasks = [];
let settings = {};

document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initTimeWidget();
  initEventListeners();
  await loadSettings();
  await loadTasks();

  const feed = document.getElementById('chat-feed') || document.getElementById('chat-history');
  if (feed && feed.children.length === 0) {
    addChatBubble("Hello Aditya! 🤖 I'm Nova, your personal task assistant. Tell me what tasks you need to schedule or what you've finished today, or ask me anything!", 'assistant');
  }

  window.myassist.onWidgetModeChanged((isWidget) => {
    document.body.classList.toggle('widget-mode', isWidget);
  });

  window.myassist.onTriggerReminder((task) => {
    playChimeSound();
    showToast(`🔔 REMINDER DUE: ${task.title}`, 'info');
    loadTasks();
  });
});

function initTabs() {
  const navItems = document.querySelectorAll('.nav-item');
  const panels = document.querySelectorAll('.tab-panel');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabName = item.getAttribute('data-tab');
      navItems.forEach(n => n.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      item.classList.add('active');
      const targetPanel = document.getElementById(`panel-${tabName}`) || document.getElementById(tabName);
      if (targetPanel) {
        targetPanel.classList.add('active');
      } else {
        const defaultPanel = document.getElementById('panel-assistant-tab');
        if (defaultPanel) defaultPanel.classList.add('active');
      }
    });
  });
}

function initTimeWidget() {
  function updateClock() {
    const now = new Date();
    const timeEl = document.getElementById('clock-time');
    const dateEl = document.getElementById('clock-date');

    if (timeEl) {
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      timeEl.textContent = `${h}:${m}`;
    }

    if (dateEl) {
      const options = { weekday: 'short', month: 'short', day: 'numeric' };
      dateEl.textContent = now.toLocaleDateString(undefined, options);
    }
  }

  updateClock();
  setInterval(updateClock, 1000);
}

function initEventListeners() {
  const sendBtn = document.getElementById('send-btn');
  const taskInput = document.getElementById('task-input');
  const aiSummaryBtn = document.getElementById('ai-summary-btn');
  const widgetToggleBtn = document.getElementById('toggle-widget-btn');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const clearAllBtn = document.getElementById('clear-all-btn');
  const clearHistoryBtn = document.getElementById('clear-history-btn');

  if (sendBtn) sendBtn.addEventListener('click', handleUserSubmit);

  if (taskInput) {
    taskInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleUserSubmit();
      }
    });
  }

  if (aiSummaryBtn) {
    aiSummaryBtn.addEventListener('click', handleAiSummary);
  }

  if (widgetToggleBtn) {
    widgetToggleBtn.addEventListener('click', () => {
      const isWidget = !document.body.classList.contains('widget-mode');
      window.myassist.toggleWidgetMode(isWidget);
    });
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear ALL pending & scheduled tasks, Aditya?')) {
        await window.myassist.clearAllTasks();
        showToast('All tasks cleared successfully 🗑️', 'info');
        loadTasks();
      }
    });
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear task history, Aditya?')) {
        await window.myassist.clearAllTasks();
        showToast('Completed log cleared 🗑️', 'info');
        loadTasks();
      }
    });
  }

  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async () => {
      const apiKey = document.getElementById('setting-gemini-key').value.trim();
      const iosTopic = document.getElementById('setting-ios-topic').value.trim();
      const soundEnabled = document.getElementById('setting-sound').checked;
      const notifEnabled = document.getElementById('setting-notif').checked;

      const updated = await window.myassist.updateSettings({
        geminiApiKey: apiKey,
        ntfyTopic: iosTopic,
        soundEnabled,
        notificationsEnabled: notifEnabled
      });

      settings = updated || {};
      showToast('Settings saved successfully! 🔑', 'success');
      loadSettings();
    });
  }

  // Quick Action Chips
  document.querySelectorAll('.tag-chip[data-fill]').forEach(chip => {
    chip.addEventListener('click', () => {
      const textToFill = chip.getAttribute('data-fill');
      if (taskInput) {
        taskInput.value = textToFill;
        taskInput.focus();
      }
    });
  });

  document.querySelectorAll('.tag-chip[data-tag]').forEach(chip => {
    chip.addEventListener('click', () => {
      const tag = chip.getAttribute('data-tag');
      if (taskInput) {
        taskInput.value = taskInput.value ? `${taskInput.value} ${tag}` : tag;
        taskInput.focus();
      }
    });
  });
}

async function loadSettings() {
  settings = await window.myassist.getSettings();
  const apiKeyEl = document.getElementById('setting-gemini-key');
  const iosTopicEl = document.getElementById('setting-ios-topic');
  const soundEl = document.getElementById('setting-sound');
  const notifEl = document.getElementById('setting-notif');

  if (apiKeyEl) apiKeyEl.value = settings.geminiApiKey || '';
  if (iosTopicEl) iosTopicEl.value = settings.ntfyTopic || '';
  if (soundEl) soundEl.checked = settings.soundEnabled !== false;
  if (notifEl) notifEl.checked = settings.notificationsEnabled !== false;
}

async function loadTasks() {
  tasks = await window.myassist.getTasks();
  renderTodayTomorrow();
  renderHistoryLog();
  updateStats();
}

function updateStats() {
  const doneTodayCount = tasks.filter(t => t.status === 'done').length;
  const pendingCount = tasks.filter(t => t.status === 'pending').length;

  const doneEl = document.getElementById('stat-done-today');
  const pendingEl = document.getElementById('stat-pending');

  if (doneEl) doneEl.textContent = doneTodayCount;
  if (pendingEl) pendingEl.textContent = pendingCount;
}

async function handleUserSubmit() {
  try {
    const taskInput = document.getElementById('task-input');
    const inputStr = taskInput.value.trim();
    if (!inputStr) return;

    addChatBubble(inputStr, 'user');
    taskInput.value = '';

    const parsed = await window.myassist.parseInput(inputStr);

    if (parsed) {
      const newTask = await window.myassist.addTask(parsed);
      await loadTasks();

      let replyMsg = `Right away, Aditya! Scheduled for **${newTask.dueDate}** at **${newTask.dueTime}**: "${newTask.title}".`;
      if (newTask.type === 'completed') {
        replyMsg = `Awesome work, Aditya! Logged "${newTask.title}" as completed.`;
      }

      addChatBubble(replyMsg, 'assistant', newTask);
      playChimeSound();
    } else {
      try {
        const response = await window.myassist.geminiChat(inputStr);
        addChatBubble(response, 'assistant');
      } catch (err) {
        addChatBubble("I'm here for you, Aditya! Ask me anything or tell me a task to schedule.", 'assistant');
      }
    }
  } catch (e) {
    console.error('Error handling submit:', e);
    showToast('Task submitted', 'info');
    loadTasks();
  }
}

async function handleAiSummary() {
  addChatBubble("✨ Generating your daily productivity summary, Aditya...", 'assistant');
  try {
    const summary = await window.myassist.geminiSummary();
    addChatBubble(summary, 'assistant');
  } catch (e) {
    showToast("Failed to generate AI summary. Check your Gemini API key in Settings.", 'error');
  }
}

function addChatBubble(text, sender, parsedTask = null) {
  const chatHistory = document.getElementById('chat-feed') || document.getElementById('chat-history');
  if (!chatHistory) return;

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${sender}`;

  const senderTitle = document.createElement('div');
  senderTitle.className = 'bubble-sender';
  senderTitle.textContent = sender === 'user' ? 'YOU' : '🤖 NOVA ASSISTANT';
  bubble.appendChild(senderTitle);

  const content = document.createElement('div');
  content.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  bubble.appendChild(content);

  if (parsedTask) {
    const card = document.createElement('div');
    card.className = `parsed-card ${parsedTask.type}`;

    card.innerHTML = `
      <strong>Category:</strong> ${parsedTask.category} | <strong>Priority:</strong> ${(parsedTask.priority || 'medium').toUpperCase()}<br>
      <span class="parsed-detail">Type: ${parsedTask.type === 'completed' ? '✅ Completed' : '⏰ Reminder'} Due: ${parsedTask.dueDate} ${parsedTask.dueTime || ''}</span>
    `;
    bubble.appendChild(card);
  }

  chatHistory.appendChild(bubble);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function renderTodayTomorrow() {
  const todayList = document.getElementById('today-task-list');
  const tomorrowList = document.getElementById('tomorrow-task-list');

  if (!todayList || !tomorrowList) return;

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

  const todayTasks = tasks.filter(t => t.status === 'pending' && t.dueDate <= todayStr)
                          .sort((a, b) => (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99'));

  const tomorrowTasks = tasks.filter(t => t.status === 'pending' && t.dueDate === tomorrowStr)
                             .sort((a, b) => (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99'));

  // Update Badges
  const todayCountEl = document.getElementById('today-count');
  const tomorrowCountEl = document.getElementById('tomorrow-count');
  const upcomingBadgeEl = document.getElementById('upcoming-badge');

  if (todayCountEl) todayCountEl.textContent = todayTasks.length;
  if (tomorrowCountEl) tomorrowCountEl.textContent = tomorrowTasks.length;
  if (upcomingBadgeEl) upcomingBadgeEl.textContent = todayTasks.length + tomorrowTasks.length;

  renderTaskGroup(todayList, todayTasks, 'No pending tasks for today!');
  renderTaskGroup(tomorrowList, tomorrowTasks, 'No pending tasks for tomorrow!');
}

function renderTaskGroup(container, taskGroup, emptyMsg) {
  container.innerHTML = '';

  if (taskGroup.length === 0) {
    container.innerHTML = `<div class="empty-state">${emptyMsg}</div>`;
    return;
  }

  taskGroup.forEach(task => {
    const item = document.createElement('div');
    item.className = 'task-item';

    item.innerHTML = `
      <input type="checkbox" class="task-checkbox" data-id="${task.id}">
      <div class="task-content">
        <div class="task-title">${task.title}</div>
        <div class="task-meta">
          <span class="category-tag">${task.category}</span>
          <span class="priority-tag priority-${task.priority}">${(task.priority || 'medium').toUpperCase()}</span>
          ${task.dueTime ? `<span>🕒 ${task.dueTime}</span>` : ''}
          ${task.recurring !== 'none' ? `<span class="recurring-tag">🔄 ${task.recurring}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="snooze-btn" data-id="${task.id}">+15m</button>
        <button class="icon-btn delete-btn" data-id="${task.id}">🗑️</button>
      </div>
    `;

    container.appendChild(item);
  });

  container.querySelectorAll('.task-checkbox').forEach(cb => {
    cb.addEventListener('change', async (e) => {
      const id = e.target.getAttribute('data-id');
      await window.myassist.updateTask({ id, updates: { status: 'done' } });
      playChimeSound();
      showToast('Task marked as completed! 🎉', 'success');
      loadTasks();
    });
  });

  container.querySelectorAll('.snooze-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      await window.myassist.snoozeTask({ id, minutes: 15 });
      showToast('Snoozed for 15 minutes ⏰', 'info');
      loadTasks();
    });
  });

  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      await window.myassist.deleteTask(id);
      showToast('Task deleted', 'info');
      loadTasks();
    });
  });
}

function renderHistoryLog() {
  const historyContainer = document.getElementById('history-container');
  if (!historyContainer) return;

  const completedTasks = tasks.filter(t => t.status === 'done');
  historyContainer.innerHTML = '';

  if (completedTasks.length === 0) {
    historyContainer.innerHTML = '<div class="empty-state">No completed activity logged yet.</div>';
    return;
  }

  completedTasks.forEach(task => {
    const item = document.createElement('div');
    item.className = 'history-card';
    item.innerHTML = `
      <div class="history-info">
        <div class="check-icon">✓</div>
        <div>
          <div class="task-title">${task.title}</div>
          <div class="task-meta">
            <span class="category-tag">${task.category}</span>
            <span>Logged: ${new Date(task.completedAt || task.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      </div>
      <button class="icon-btn delete-btn" data-id="${task.id}">🗑️</button>
    `;
    historyContainer.appendChild(item);
  });

  historyContainer.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      await window.myassist.deleteTask(id);
      loadTasks();
    });
  });
}

// Loud, Rich 3-Tone Tri-Chime Melody (C5 -> E5 -> G5, 100% Volume)
function playChimeSound() {
  if (settings.soundEnabled === false) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    // Tone 1: C5 (523.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, ctx.currentTime);
    gain1.gain.setValueAtTime(0.9, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.15);

    // Tone 2: E5 (659.25 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.10);
    gain2.gain.setValueAtTime(0.95, ctx.currentTime + 0.10);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.10);
    osc2.stop(ctx.currentTime + 0.28);

    // Tone 3: G5 (783.99 Hz) - Loud peak tone
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(783.99, ctx.currentTime + 0.20);
    gain3.gain.setValueAtTime(1.0, ctx.currentTime + 0.20);
    gain3.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(ctx.currentTime + 0.20);
    osc3.stop(ctx.currentTime + 0.55);
  } catch (e) {
    console.error('Audio playback failed:', e);
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    info: '🔔',
    success: '✨',
    error: '⚠️'
  };

  toast.innerHTML = `
    <span>${iconMap[type] || '🔔'}</span>
    <div>${message}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}
