const fs = require('fs');
const path = require('path');
const config = require('../config');

class ForensicsLogger {
  constructor() {
    this.logsDir = path.join(path.dirname(config.dbPath), 'forensics-logs');
    this.ensureLogsDir();
  }

  ensureLogsDir() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  getBatchLogPath(batchNumber) {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0];
    const safeBatchNumber = batchNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.logsDir, `${dateStr}_${safeBatchNumber}.log`);
  }

  formatLogEntry(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const entry = {
      timestamp,
      level,
      message,
      ...data
    };
    return JSON.stringify(entry) + '\n';
  }

  log(batchNumber, level, message, data = {}) {
    const logPath = this.getBatchLogPath(batchNumber);
    const entry = this.formatLogEntry(level, message, data);
    
    fs.appendFileSync(logPath, entry, 'utf8');
    
    if (config.forensicsWorkbench.logLevel === 'debug' || level === 'error') {
      console.log(`[Forensics ${level.toUpperCase()}] ${batchNumber}: ${message}`, data);
    }
  }

  info(batchNumber, message, data = {}) {
    this.log(batchNumber, 'info', message, data);
  }

  warn(batchNumber, message, data = {}) {
    this.log(batchNumber, 'warn', message, data);
  }

  error(batchNumber, message, data = {}) {
    this.log(batchNumber, 'error', message, data);
  }

  debug(batchNumber, message, data = {}) {
    if (config.forensicsWorkbench.logLevel === 'debug') {
      this.log(batchNumber, 'debug', message, data);
    }
  }

  logOperation(batchNumber, operation) {
    this.info(batchNumber, `Operation: ${operation.type}`, {
      operation_id: operation.id,
      operation_type: operation.type,
      previous_state: operation.previous_state,
      new_state: operation.new_state
    });
  }

  logTimelineEvent(batchNumber, event) {
    this.info(batchNumber, `Event: ${event.event_type}`, {
      event_id: event.id,
      event_type: event.event_type,
      is_critical: event.is_critical,
      event_data: event.event_data
    });
  }

  logStateChange(batchNumber, previousState, newState, reason = '') {
    this.info(batchNumber, 'State changed', {
      previous_state: previousState,
      new_state: newState,
      reason
    });
  }

  logError(batchNumber, errorCode, errorMessage, details = {}) {
    this.error(batchNumber, `Error: ${errorCode}`, {
      error_code: errorCode,
      error_message: errorMessage,
      ...details
    });
  }

  logRecovery(batchNumber, recoveryRecord) {
    this.info(batchNumber, `Recovery: ${recoveryRecord.recovery_type}`, {
      recovery_id: recoveryRecord.id,
      resource_type: recoveryRecord.original_resource_type,
      resource_id: recoveryRecord.original_resource_id,
      recovery_state: recoveryRecord.recovery_state
    });
  }

  readBatchLog(batchNumber) {
    const logPath = this.getBatchLogPath(batchNumber);
    
    if (!fs.existsSync(logPath)) {
      return null;
    }
    
    try {
      const content = fs.readFileSync(logPath, 'utf8');
      return content;
    } catch (err) {
      console.error(`Failed to read log file: ${logPath}`, err);
      return null;
    }
  }

  readBatchLogAsJson(batchNumber) {
    const content = this.readBatchLog(batchNumber);
    if (!content) return [];
    
    try {
      const lines = content.trim().split('\n');
      return lines.map(line => JSON.parse(line));
    } catch (err) {
      console.error(`Failed to parse log file as JSON`, err);
      return [];
    }
  }

  listBatchLogs() {
    this.ensureLogsDir();
    
    try {
      const files = fs.readdirSync(this.logsDir);
      return files
        .filter(f => f.endsWith('.log'))
        .map(f => {
          const stats = fs.statSync(path.join(this.logsDir, f));
          return {
            filename: f,
            path: path.join(this.logsDir, f),
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          };
        })
        .sort((a, b) => b.modified - a.modified);
    } catch (err) {
      console.error('Failed to list log files', err);
      return [];
    }
  }

  findLogByBatchNumber(batchNumber) {
    const logs = this.listBatchLogs();
    const safeBatchNumber = batchNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
    return logs.find(log => log.filename.includes(safeBatchNumber));
  }

  checkLogExists(batchNumber) {
    const logPath = this.getBatchLogPath(batchNumber);
    return fs.existsSync(logPath);
  }

  getLogStats(batchNumber) {
    const content = this.readBatchLog(batchNumber);
    if (!content) return null;
    
    const entries = this.readBatchLogAsJson(batchNumber);
    return {
      total_entries: entries.length,
      errors: entries.filter(e => e.level === 'error').length,
      warnings: entries.filter(e => e.level === 'warn').length,
      info: entries.filter(e => e.level === 'info').length,
      first_entry: entries[0]?.timestamp,
      last_entry: entries[entries.length - 1]?.timestamp
    };
  }

  cleanupOldLogs(daysToKeep = 90) {
    const logs = this.listBatchLogs();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);
    
    let cleaned = 0;
    for (const log of logs) {
      if (log.modified < cutoff) {
        try {
          fs.unlinkSync(log.path);
          cleaned++;
        } catch (err) {
          console.error(`Failed to delete old log: ${log.path}`, err);
        }
      }
    }
    
    return cleaned;
  }
}

module.exports = new ForensicsLogger();
