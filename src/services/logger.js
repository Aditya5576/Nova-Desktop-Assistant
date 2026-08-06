const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../../logs');
    this.logFile = path.join(this.logDir, 'nova-app.log');
    this.ensureLogDir();
  }

  ensureLogDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (e) {
      console.error('Failed to create log directory:', e);
    }
  }

  formatMessage(level, message, meta = null) {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` | Meta: ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}\n`;
  }

  log(level, message, meta = null) {
    const formatted = this.formatMessage(level, message, meta);
    console.log(formatted.trim());
    try {
      fs.appendFileSync(this.logFile, formatted, 'utf-8');
    } catch (e) {
      console.error('Failed to write to log file:', e);
    }
  }

  info(message, meta = null) { this.log('INFO', message, meta); }
  warn(message, meta = null) { this.log('WARN', message, meta); }
  error(message, meta = null) { this.log('ERROR', message, meta); }
}

module.exports = new Logger();
