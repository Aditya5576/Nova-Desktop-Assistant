const fs = require('fs');
const path = require('path');
const appPaths = require('./appPaths');

/**
 * Logger — writes timestamped log lines to console and to a file under userData/logs/.
 *
 * Path resolution is intentionally lazy: the log directory is only resolved
 * and created on the first write. This allows the singleton to be imported
 * before Electron app.getPath() is available (e.g. at module-load time in
 * main.js) without triggering premature path resolution.
 */
class Logger {
  constructor() {
    // Paths are resolved lazily on first write so Electron app can be ready.
    this._ready = false;
    this.logDir = null;
    this.logFile = null;
  }

  _ensureReady() {
    if (this._ready) return;
    this._ready = true;
    this.logDir = appPaths.getLogsPath();
    this.logFile = path.join(this.logDir, 'nova-app.log');
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (e) {
      console.error('Failed to create log directory:', e);
      this.logFile = null; // disable file logging if dir is inaccessible
    }
  }

  formatMessage(level, message, meta = null) {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` | Meta: ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}\n`;
  }

  log(level, message, meta = null) {
    this._ensureReady();
    const formatted = this.formatMessage(level, message, meta);
    console.log(formatted.trim());
    if (this.logFile) {
      try {
        fs.appendFileSync(this.logFile, formatted, 'utf-8');
      } catch (e) {
        console.error('Failed to write to log file:', e);
      }
    }
  }

  info(message, meta = null) { this.log('INFO', message, meta); }
  warn(message, meta = null) { this.log('WARN', message, meta); }
  error(message, meta = null) { this.log('ERROR', message, meta); }
}

module.exports = new Logger();
