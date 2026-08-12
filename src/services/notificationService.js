const path = require('path');
const https = require('https');
const { execFile } = require('child_process');
const logger = require('./logger');
const appPaths = require('./appPaths');

class NotificationService {
  constructor() {
    this.scriptsDir = appPaths.getPackagedScriptsPath();
    this.isTestEnv = process.env.NODE_ENV === 'test' ||
                     (process.argv && process.argv.some(arg => arg.includes('test_runner.js') || arg.includes('mocha')));
    this.mockDispatches = [];
  }

  playAudioChime() {
    if (this.isTestEnv) return;
    const args = ['-NoProfile', '-Command', '[System.Media.SystemSounds]::Exclamation.Play()'];
    execFile('powershell.exe', args, () => {});
  }

  sendWindowsToast(title, body) {
    if (this.isTestEnv) return;
    const safeTitle = title || 'Task Reminder';
    const safeBody = body || 'Reminder due now!';

    try {
      const scriptPath = path.join(this.scriptsDir, 'sendToast.ps1');
      const args = [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        '-Title', safeTitle,
        '-Body', safeBody,
        '-Topic', 'none'
      ];

      execFile('powershell.exe', args, (err) => {
        if (err) {
          logger.warn(`PowerShell Toast command exited with notice: ${err.message}`);
        } else {
          logger.info(`PowerShell Toast dispatched successfully`);
        }
      });
    } catch (err) {
      logger.error(`Failed to trigger PowerShell toast script: ${err.message}`);
    }
  }

  sendIosPushNotification(title, body, topic = 'nova-my-tasks') {
    if (this.isTestEnv) return;
    try {
      const activeTopic = (topic && topic.trim()) ? topic.trim() : 'nova-my-tasks';
      const safeTitle = (title || 'Nova Task Reminder').replace(/[^\x00-\x7F]/g, '');
      const postData = body || 'Task reminder due now!';

      const options = {
        hostname: 'ntfy.sh',
        port: 443,
        path: `/${encodeURIComponent(activeTopic)}`,
        method: 'POST',
        headers: {
          'Title': safeTitle,
          'Priority': 'high',
          'Tags': 'bell,alarm_clock',
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        console.log(`iOS Push Notification dispatched to ntfy.sh/${activeTopic} (Status: ${res.statusCode})`);
      });

      req.on('error', (e) => {
        console.error('iOS push notification failed:', e.message);
      });

      req.write(postData);
      req.end();
    } catch (err) {
      console.error('Error sending iOS push notification:', err);
    }
  }

  dispatchNotification(title, body, settings = {}) {
    const soundOn = settings.soundEnabled !== false;
    const notifOn = settings.notificationsEnabled !== false;

    if (this.isTestEnv) {
      this.mockDispatches.push({ title, body, soundOn, notifOn, topic: settings.ntfyTopic });
    }

    if (soundOn) {
      this.playAudioChime();
    }

    if (notifOn) {
      this.sendWindowsToast(title, body);
      this.sendIosPushNotification(title, body, settings.ntfyTopic);
    }
  }
}

module.exports = NotificationService;
