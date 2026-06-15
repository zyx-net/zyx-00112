const path = require('path');

module.exports = {
  port: process.env.PORT || 3000,
  dbPath: path.join(__dirname, '../data/sandbox.db'),
  snapshotsPath: path.join(__dirname, '../data/snapshots'),
  logsPath: path.join(__dirname, '../data/logs'),
  maxConcurrentExecutions: 1
};