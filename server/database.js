const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const config = require('./config');

const dataDir = path.dirname(config.dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(config.dbPath, (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
  } else {
    console.log('数据库连接成功');
    initDatabase();
  }
});

function initDatabase() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS api_versions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      base_path TEXT NOT NULL,
      schema TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS field_mappings (
      id TEXT PRIMARY KEY,
      api_version_id TEXT,
      source_field TEXT NOT NULL,
      target_field TEXT NOT NULL,
      transform_type TEXT DEFAULT 'direct',
      transform_expression TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (api_version_id) REFERENCES api_versions(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS compatibility_strategies (
      id TEXT PRIMARY KEY,
      api_version_id TEXT,
      strategy_type TEXT NOT NULL,
      config TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (api_version_id) REFERENCES api_versions(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS scenarios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      api_version_id TEXT,
      status TEXT DEFAULT 'draft',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (api_version_id) REFERENCES api_versions(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS failure_injections (
      id TEXT PRIMARY KEY,
      scenario_id TEXT,
      type TEXT NOT NULL,
      probability REAL DEFAULT 0,
      config TEXT,
      enabled INTEGER DEFAULT 0,
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      scenario_id TEXT,
      status TEXT DEFAULT 'pending',
      start_time TEXT,
      end_time TEXT,
      logs TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      scenario_id TEXT,
      execution_id TEXT,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id),
      FOREIGN KEY (execution_id) REFERENCES executions(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS archived_scenarios (
      id TEXT PRIMARY KEY,
      scenario_id TEXT,
      data TEXT NOT NULL,
      archived_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS scenario_packages (
      id TEXT PRIMARY KEY,
      scenario_id TEXT,
      package_data TEXT NOT NULL,
      action_type TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      archived_scenario_id TEXT,
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS import_logs (
      id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL,
      import_time TEXT DEFAULT CURRENT_TIMESTAMP,
      source_package TEXT NOT NULL,
      conflict_decisions TEXT,
      result TEXT NOT NULL,
      details TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS import_audit_batches (
      id TEXT PRIMARY KEY,
      batch_number TEXT UNIQUE NOT NULL,
      operator TEXT,
      operator_ip TEXT,
      user_agent TEXT,
      import_type TEXT NOT NULL,
      scenario_action TEXT,
      execution_history_action TEXT,
      total_imports INTEGER DEFAULT 0,
      successful_imports INTEGER DEFAULT 0,
      failed_imports INTEGER DEFAULT 0,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      status TEXT DEFAULT 'in_progress',
      metadata TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS snapshot_version_chain (
      id TEXT PRIMARY KEY,
      batch_id TEXT,
      snapshot_id TEXT NOT NULL,
      scenario_id TEXT NOT NULL,
      execution_id TEXT,
      previous_snapshot_id TEXT,
      replaced_by_snapshot_id TEXT,
      version_number INTEGER NOT NULL,
      data TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      replaced_at TEXT,
      replaced_by_batch_id TEXT,
      replaced_reason TEXT,
      FOREIGN KEY (batch_id) REFERENCES import_audit_batches(id),
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id),
      FOREIGN KEY (execution_id) REFERENCES executions(id),
      FOREIGN KEY (previous_snapshot_id) REFERENCES snapshots(id),
      FOREIGN KEY (replaced_by_snapshot_id) REFERENCES snapshots(id),
      FOREIGN KEY (replaced_by_batch_id) REFERENCES import_audit_batches(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS replaced_snapshot_details (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      import_log_id TEXT,
      original_snapshot_id TEXT NOT NULL,
      original_scenario_id TEXT NOT NULL,
      original_execution_id TEXT,
      original_execution_status TEXT,
      original_data TEXT,
      original_created_at TEXT,
      replacement_snapshot_id TEXT,
      replacement_created_at TEXT,
      replaced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      replaced_reason TEXT,
      conflict_type TEXT,
      conflict_decision TEXT,
      operator TEXT,
      FOREIGN KEY (batch_id) REFERENCES import_audit_batches(id),
      FOREIGN KEY (import_log_id) REFERENCES import_logs(id),
      FOREIGN KEY (original_scenario_id) REFERENCES scenarios(id),
      FOREIGN KEY (original_execution_id) REFERENCES executions(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS rollback_resource_changes (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      rollback_type TEXT NOT NULL,
      import_log_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      resource_name TEXT,
      previous_state TEXT,
      new_state TEXT,
      restored_associations TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_id) REFERENCES import_audit_batches(id),
      FOREIGN KEY (import_log_id) REFERENCES import_logs(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS restart_review_records (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      review_type TEXT NOT NULL,
      scenario_id TEXT NOT NULL,
      scenario_name TEXT,
      is_simulation INTEGER DEFAULT 0,
      simulation_result TEXT,
      real_restart_verified INTEGER DEFAULT 0,
      restart_verified_at TEXT,
      restart_verified_by TEXT,
      consistency_check_passed INTEGER DEFAULT 0,
      consistency_details TEXT,
      errors_found TEXT,
      warnings TEXT,
      review_started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      review_completed_at TEXT,
      FOREIGN KEY (batch_id) REFERENCES import_audit_batches(id),
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id)
    )`);

    db.run(`CREATE INDEX IF NOT EXISTS idx_snapshot_version_chain_scenario ON snapshot_version_chain(scenario_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_snapshot_version_chain_batch ON snapshot_version_chain(batch_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_replaced_snapshot_batch ON replaced_snapshot_details(batch_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_rollback_changes_batch ON rollback_resource_changes(batch_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_restart_review_batch ON restart_review_records(batch_id)`);

    db.run(`CREATE TABLE IF NOT EXISTS forensics_batches (
      id TEXT PRIMARY KEY,
      batch_number TEXT UNIQUE NOT NULL,
      operator TEXT,
      operator_ip TEXT,
      user_agent TEXT,
      mode TEXT NOT NULL DEFAULT 'simulate',
      state TEXT NOT NULL DEFAULT 'pending',
      scenario_id TEXT,
      scenario_name TEXT,
      original_scenario_id TEXT,
      original_snapshot_id TEXT,
      original_execution_id TEXT,
      conflict_decision TEXT,
      replacement_scenario_id TEXT,
      replacement_snapshot_id TEXT,
      rollback_execution_id TEXT,
      restart_review_id TEXT,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      error_code TEXT,
      error_message TEXT,
      metadata TEXT,
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id),
      FOREIGN KEY (original_scenario_id) REFERENCES scenarios(id),
      FOREIGN KEY (original_snapshot_id) REFERENCES snapshots(id),
      FOREIGN KEY (original_execution_id) REFERENCES executions(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS forensics_operations (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      operation_order INTEGER NOT NULL,
      operator TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      previous_state TEXT,
      new_state TEXT,
      details TEXT,
      is_reversible INTEGER DEFAULT 1,
      reverse_operation_id TEXT,
      FOREIGN KEY (batch_id) REFERENCES forensics_batches(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS forensics_timeline (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_order INTEGER NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      actor TEXT,
      source_module TEXT,
      target_resource_type TEXT,
      target_resource_id TEXT,
      event_data TEXT,
      is_critical INTEGER DEFAULT 0,
      FOREIGN KEY (batch_id) REFERENCES forensics_batches(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS forensics_replaced_snapshots (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      operation_id TEXT,
      original_snapshot_id TEXT NOT NULL,
      original_scenario_id TEXT NOT NULL,
      original_execution_id TEXT,
      original_execution_status TEXT,
      original_data TEXT,
      original_created_at TEXT,
      replaced_by_snapshot_id TEXT,
      replaced_by_scenario_id TEXT,
      replaced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      replaced_reason TEXT,
      conflict_type TEXT,
      conflict_decision TEXT,
      operator TEXT,
      FOREIGN KEY (batch_id) REFERENCES forensics_batches(id),
      FOREIGN KEY (original_scenario_id) REFERENCES scenarios(id),
      FOREIGN KEY (original_execution_id) REFERENCES executions(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS forensics_recovery_records (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      recovery_type TEXT NOT NULL,
      original_resource_type TEXT NOT NULL,
      original_resource_id TEXT NOT NULL,
      original_resource_name TEXT,
      recovery_state TEXT NOT NULL,
      recovery_data TEXT,
      recovery_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      verified INTEGER DEFAULT 0,
      verified_by TEXT,
      verified_at TEXT,
      verification_notes TEXT,
      FOREIGN KEY (batch_id) REFERENCES forensics_batches(id)
    )`);

    db.run(`CREATE INDEX IF NOT EXISTS idx_forensics_batches_batch_number ON forensics_batches(batch_number)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_forensics_batches_scenario ON forensics_batches(scenario_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_forensics_batches_state ON forensics_batches(state)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_forensics_batches_mode ON forensics_batches(mode)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_forensics_operations_batch ON forensics_operations(batch_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_forensics_timeline_batch ON forensics_timeline(batch_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_forensics_timeline_order ON forensics_timeline(batch_id, event_order)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_forensics_replaced_batch ON forensics_replaced_snapshots(batch_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_forensics_recovery_batch ON forensics_recovery_records(batch_id)`);
  });
}

module.exports = db;