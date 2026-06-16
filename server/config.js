const path = require('path');

module.exports = {
  port: process.env.PORT || 3000,
  dbPath: path.join(__dirname, '../data/sandbox.db'),
  snapshotsPath: path.join(__dirname, '../data/snapshots'),
  logsPath: path.join(__dirname, '../data/logs'),
  maxConcurrentExecutions: 1,

  forensicsWorkbench: {
    enabled: process.env.FORENSICS_ENABLED !== 'false',
    simulateMode: process.env.FORENSICS_SIMULATE === 'true',
    requireConfirmation: process.env.FORENSICS_REQUIRE_CONFIRM !== 'false',
    logLevel: process.env.FORENSICS_LOG_LEVEL || 'info',
    batchPrefix: 'FWB',
    timelineRetentionDays: 90,
    maxBatchSize: 1000,
    enableAutoRecovery: process.env.FORENSICS_AUTO_RECOVERY === 'true',
    strictValidation: process.env.FORENSICS_STRICT !== 'false'
  },

  rollbackModes: {
    SIMULATE: 'simulate',
    REAL: 'real'
  },

  forensicsStates: {
    PENDING: 'pending',
    PRE_CHECK: 'pre_check',
    PRE_CHECK_PASSED: 'pre_check_passed',
    PRE_CHECK_FAILED: 'pre_check_failed',
    REPLACE_IMPORT: 'replace_import',
    ROLLBACK_CONFIRM: 'rollback_confirm',
    ROLLBACK_EXECUTING: 'rollback_executing',
    ROLLBACK_COMPLETED: 'rollback_completed',
    RESTART_REVIEW: 'restart_review',
    RESTART_VERIFIED: 'restart_verified',
    OPERATION_LOGGED: 'operation_logged',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
  },

  conflictDecisionTypes: {
    SAVE_AS: 'save_as',
    REPLACE: 'replace',
    SKIP: 'skip',
    FORCE_IMPORT: 'force_import'
  },

  operationTypes: {
    REPLACE_IMPORT: 'replace_import',
    ROLLBACK: 'rollback',
    RESTART_CHECK: 'restart_check',
    RECOVERY: 'recovery',
    RE_IMPORT: 're_import'
  },

  errorCodes: {
    DUPLICATE_IMPORT: 'FWB_E001',
    MISSING_SNAPSHOT: 'FWB_E002',
    CROSS_RESTART_FAILED: 'FWB_E003',
    RE_IMPORT_AFTER_ROLLBACK: 'FWB_E004',
    INVALID_BATCH: 'FWB_E005',
    PRE_CHECK_FAILED: 'FWB_E006',
    SIMULATION_MODE_VIOLATION: 'FWB_E007',
    REAL_MODE_CONFIRM_REQUIRED: 'FWB_E008'
  }
};
