const db = require('../database');
const { v4: uuidv4 } = require('uuid');

class ImportAuditBatchDao {
  create(batchData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const batchNumber = `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const {
        operator,
        operator_ip,
        user_agent,
        import_type,
        scenario_action,
        execution_history_action,
        metadata
      } = batchData;

      db.run(
        `INSERT INTO import_audit_batches 
         (id, batch_number, operator, operator_ip, user_agent, import_type, 
          scenario_action, execution_history_action, metadata) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, batchNumber, operator, operator_ip, user_agent, import_type,
         scenario_action, execution_history_action, JSON.stringify(metadata || {})],
        function(err) {
          if (err) reject(err);
          else resolve({ id, batch_number: batchNumber });
        }
      );
    });
  }

  update(id, updates) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];

      if (updates.successful_imports !== undefined) {
        fields.push('successful_imports = ?');
        values.push(updates.successful_imports);
      }
      if (updates.failed_imports !== undefined) {
        fields.push('failed_imports = ?');
        values.push(updates.failed_imports);
      }
      if (updates.completed_at !== undefined) {
        fields.push('completed_at = ?');
        values.push(updates.completed_at);
      }
      if (updates.status !== undefined) {
        fields.push('status = ?');
        values.push(updates.status);
      }

      if (fields.length === 0) {
        return resolve({ success: true });
      }

      values.push(id);
      db.run(
        `UPDATE import_audit_batches SET ${fields.join(', ')} WHERE id = ?`,
        values,
        function(err) {
          if (err) reject(err);
          else resolve({ success: this.changes > 0 });
        }
      );
    });
  }

  getById(id) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM import_audit_batches WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else if (!row) resolve(null);
        else resolve({
          ...row,
          metadata: this._safeParseJson(row.metadata)
        });
      });
    });
  }

  getAll(limit = 100, offset = 0) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM import_audit_batches ORDER BY started_at DESC LIMIT ? OFFSET ?',
        [limit, offset],
        (err, rows) => {
          if (err) reject(err);
          else {
            const result = rows.map(row => ({
              ...row,
              metadata: this._safeParseJson(row.metadata)
            }));
            resolve(result);
          }
        }
      );
    });
  }

  getLatest() {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM import_audit_batches ORDER BY started_at DESC LIMIT 1',
        [],
        (err, row) => {
          if (err) reject(err);
          else if (!row) resolve(null);
          else resolve({
            ...row,
            metadata: this._safeParseJson(row.metadata)
          });
        }
      );
    });
  }

  _safeParseJson(str, defaultValue = {}) {
    if (!str) return defaultValue;
    try {
      return typeof str === 'object' ? str : JSON.parse(str);
    } catch (e) {
      return defaultValue;
    }
  }
}

class SnapshotVersionChainDao {
  create(record) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const {
        batch_id,
        snapshot_id,
        scenario_id,
        execution_id,
        previous_snapshot_id,
        version_number,
        data
      } = record;

      db.run(
        `INSERT INTO snapshot_version_chain 
         (id, batch_id, snapshot_id, scenario_id, execution_id, 
          previous_snapshot_id, version_number, data) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, batch_id, snapshot_id, scenario_id, execution_id,
         previous_snapshot_id, version_number, JSON.stringify(data)],
        function(err) {
          if (err) reject(err);
          else resolve({ id, snapshot_id });
        }
      );
    });
  }

  markAsReplaced(snapshotId, replacedByBatchId, replacedBySnapshotId, reason) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE snapshot_version_chain 
         SET replaced_at = ?, replaced_by_batch_id = ?, 
             replaced_by_snapshot_id = ?, replaced_reason = ?
         WHERE snapshot_id = ?`,
        [new Date().toISOString(), replacedByBatchId, replacedBySnapshotId, reason, snapshotId],
        function(err) {
          if (err) reject(err);
          else resolve({ success: this.changes > 0 });
        }
      );
    });
  }

  getByScenarioId(scenarioId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM snapshot_version_chain WHERE scenario_id = ? ORDER BY version_number DESC',
        [scenarioId],
        (err, rows) => {
          if (err) reject(err);
          else {
            const result = rows.map(row => ({
              ...row,
              data: this._safeParseJson(row.data)
            }));
            resolve(result);
          }
        }
      );
    });
  }

  getByBatchId(batchId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM snapshot_version_chain WHERE batch_id = ? ORDER BY version_number DESC',
        [batchId],
        (err, rows) => {
          if (err) reject(err);
          else {
            const result = rows.map(row => ({
              ...row,
              data: this._safeParseJson(row.data)
            }));
            resolve(result);
          }
        }
      );
    });
  }

  getVersionChain(scenarioId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT svc.*, 
                e.status as execution_status,
                e.start_time as execution_start_time,
                ib.batch_number,
                ib.operator
         FROM snapshot_version_chain svc
         LEFT JOIN executions e ON svc.execution_id = e.id
         LEFT JOIN import_audit_batches ib ON svc.batch_id = ib.id
         WHERE svc.scenario_id = ?
         ORDER BY svc.version_number DESC`,
        [scenarioId],
        (err, rows) => {
          if (err) reject(err);
          else {
            const result = rows.map(row => ({
              ...row,
              data: this._safeParseJson(row.data)
            }));
            resolve(result);
          }
        }
      );
    });
  }

  _safeParseJson(str, defaultValue = {}) {
    if (!str) return defaultValue;
    try {
      return typeof str === 'object' ? str : JSON.parse(str);
    } catch (e) {
      return defaultValue;
    }
  }
}

class ReplacedSnapshotDetailsDao {
  create(detail) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const {
        batch_id,
        import_log_id,
        original_snapshot_id,
        original_scenario_id,
        original_execution_id,
        original_execution_status,
        original_data,
        original_created_at,
        replacement_snapshot_id,
        replacement_created_at,
        replaced_reason,
        conflict_type,
        conflict_decision,
        operator
      } = detail;

      db.run(
        `INSERT INTO replaced_snapshot_details 
         (id, batch_id, import_log_id, original_snapshot_id, original_scenario_id,
          original_execution_id, original_execution_status, original_data, 
          original_created_at, replacement_snapshot_id, replacement_created_at,
          replaced_reason, conflict_type, conflict_decision, operator)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, batch_id, import_log_id, original_snapshot_id, original_scenario_id,
         original_execution_id, original_execution_status, JSON.stringify(original_data),
         original_created_at, replacement_snapshot_id, replacement_created_at,
         replaced_reason, conflict_type, conflict_decision, operator],
        function(err) {
          if (err) reject(err);
          else resolve({ id });
        }
      );
    });
  }

  getByBatchId(batchId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT rsd.*,
                s.name as scenario_name,
                e.status as execution_status,
                e.start_time as execution_start_time
         FROM replaced_snapshot_details rsd
         LEFT JOIN scenarios s ON rsd.original_scenario_id = s.id
         LEFT JOIN executions e ON rsd.original_execution_id = e.id
         WHERE rsd.batch_id = ?
         ORDER BY rsd.replaced_at DESC`,
        [batchId],
        (err, rows) => {
          if (err) reject(err);
          else {
            const result = rows.map(row => ({
              ...row,
              original_data: this._safeParseJson(row.original_data)
            }));
            resolve(result);
          }
        }
      );
    });
  }

  getByImportLogId(importLogId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT rsd.*,
                s.name as scenario_name
         FROM replaced_snapshot_details rsd
         LEFT JOIN scenarios s ON rsd.original_scenario_id = s.id
         WHERE rsd.import_log_id = ?
         ORDER BY rsd.replaced_at DESC`,
        [importLogId],
        (err, rows) => {
          if (err) reject(err);
          else {
            const result = rows.map(row => ({
              ...row,
              original_data: this._safeParseJson(row.original_data)
            }));
            resolve(result);
          }
        }
      );
    });
  }

  _safeParseJson(str, defaultValue = {}) {
    if (!str) return defaultValue;
    try {
      return typeof str === 'object' ? str : JSON.parse(str);
    } catch (e) {
      return defaultValue;
    }
  }
}

class RollbackResourceChangesDao {
  create(change) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const {
        batch_id,
        rollback_type,
        import_log_id,
        action,
        resource_type,
        resource_id,
        resource_name,
        previous_state,
        new_state,
        restored_associations
      } = change;

      db.run(
        `INSERT INTO rollback_resource_changes 
         (id, batch_id, rollback_type, import_log_id, action, resource_type,
          resource_id, resource_name, previous_state, new_state, restored_associations)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, batch_id, rollback_type, import_log_id, action, resource_type,
         resource_id, resource_name, JSON.stringify(previous_state),
         JSON.stringify(new_state), JSON.stringify(restored_associations || {})],
        function(err) {
          if (err) reject(err);
          else resolve({ id });
        }
      );
    });
  }

  getByBatchId(batchId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM rollback_resource_changes WHERE batch_id = ? ORDER BY timestamp DESC',
        [batchId],
        (err, rows) => {
          if (err) reject(err);
          else {
            const result = rows.map(row => ({
              ...row,
              previous_state: this._safeParseJson(row.previous_state),
              new_state: this._safeParseJson(row.new_state),
              restored_associations: this._safeParseJson(row.restored_associations)
            }));
            resolve(result);
          }
        }
      );
    });
  }

  getByImportLogId(importLogId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM rollback_resource_changes WHERE import_log_id = ? ORDER BY timestamp DESC',
        [importLogId],
        (err, rows) => {
          if (err) reject(err);
          else {
            const result = rows.map(row => ({
              ...row,
              previous_state: this._safeParseJson(row.previous_state),
              new_state: this._safeParseJson(row.new_state),
              restored_associations: this._safeParseJson(row.restored_associations)
            }));
            resolve(result);
          }
        }
      );
    });
  }

  getSummaryByBatchId(batchId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT resource_type, action, COUNT(*) as count
         FROM rollback_resource_changes
         WHERE batch_id = ?
         GROUP BY resource_type, action
         ORDER BY resource_type`,
        [batchId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  _safeParseJson(str, defaultValue = {}) {
    if (!str) return defaultValue;
    try {
      return typeof str === 'object' ? str : JSON.parse(str);
    } catch (e) {
      return defaultValue;
    }
  }
}

class RestartReviewRecordsDao {
  create(record) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const {
        batch_id,
        review_type,
        scenario_id,
        scenario_name,
        is_simulation
      } = record;

      db.run(
        `INSERT INTO restart_review_records 
         (id, batch_id, review_type, scenario_id, scenario_name, is_simulation)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, batch_id, review_type, scenario_id, scenario_name, is_simulation ? 1 : 0],
        function(err) {
          if (err) reject(err);
          else resolve({ id });
        }
      );
    });
  }

  update(id, updates) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];

      if (updates.simulation_result !== undefined) {
        fields.push('simulation_result = ?');
        values.push(updates.simulation_result);
      }
      if (updates.real_restart_verified !== undefined) {
        fields.push('real_restart_verified = ?');
        values.push(updates.real_restart_verified ? 1 : 0);
      }
      if (updates.restart_verified_at !== undefined) {
        fields.push('restart_verified_at = ?');
        values.push(updates.restart_verified_at);
      }
      if (updates.restart_verified_by !== undefined) {
        fields.push('restart_verified_by = ?');
        values.push(updates.restart_verified_by);
      }
      if (updates.consistency_check_passed !== undefined) {
        fields.push('consistency_check_passed = ?');
        values.push(updates.consistency_check_passed ? 1 : 0);
      }
      if (updates.consistency_details !== undefined) {
        fields.push('consistency_details = ?');
        values.push(JSON.stringify(updates.consistency_details));
      }
      if (updates.errors_found !== undefined) {
        fields.push('errors_found = ?');
        values.push(JSON.stringify(updates.errors_found));
      }
      if (updates.warnings !== undefined) {
        fields.push('warnings = ?');
        values.push(JSON.stringify(updates.warnings));
      }
      if (updates.review_completed_at !== undefined) {
        fields.push('review_completed_at = ?');
        values.push(updates.review_completed_at);
      }

      if (fields.length === 0) {
        return resolve({ success: true });
      }

      values.push(id);
      db.run(
        `UPDATE restart_review_records SET ${fields.join(', ')} WHERE id = ?`,
        values,
        function(err) {
          if (err) reject(err);
          else resolve({ success: this.changes > 0 });
        }
      );
    });
  }

  getByBatchId(batchId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM restart_review_records WHERE batch_id = ? ORDER BY review_started_at DESC',
        [batchId],
        (err, rows) => {
          if (err) reject(err);
          else {
            const result = rows.map(row => ({
              ...row,
              consistency_details: this._safeParseJson(row.consistency_details),
              errors_found: this._safeParseJson(row.errors_found),
              warnings: this._safeParseJson(row.warnings),
              is_simulation: row.is_simulation === 1,
              real_restart_verified: row.real_restart_verified === 1,
              consistency_check_passed: row.consistency_check_passed === 1
            }));
            resolve(result);
          }
        }
      );
    });
  }

  getByScenarioId(scenarioId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM restart_review_records WHERE scenario_id = ? ORDER BY review_started_at DESC',
        [scenarioId],
        (err, rows) => {
          if (err) reject(err);
          else {
            const result = rows.map(row => ({
              ...row,
              consistency_details: this._safeParseJson(row.consistency_details),
              errors_found: this._safeParseJson(row.errors_found),
              warnings: this._safeParseJson(row.warnings),
              is_simulation: row.is_simulation === 1,
              real_restart_verified: row.real_restart_verified === 1,
              consistency_check_passed: row.consistency_check_passed === 1
            }));
            resolve(result);
          }
        }
      );
    });
  }

  getSimulationReviews(batchId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM restart_review_records WHERE batch_id = ? AND is_simulation = 1 ORDER BY review_started_at DESC',
        [batchId],
        (err, rows) => {
          if (err) reject(err);
          else {
            const result = rows.map(row => ({
              ...row,
              consistency_details: this._safeParseJson(row.consistency_details),
              errors_found: this._safeParseJson(row.errors_found),
              warnings: this._safeParseJson(row.warnings),
              is_simulation: row.is_simulation === 1,
              real_restart_verified: row.real_restart_verified === 1,
              consistency_check_passed: row.consistency_check_passed === 1
            }));
            resolve(result);
          }
        }
      );
    });
  }

  getRealRestartReviews(batchId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM restart_review_records WHERE batch_id = ? AND is_simulation = 0 ORDER BY review_started_at DESC',
        [batchId],
        (err, rows) => {
          if (err) reject(err);
          else {
            const result = rows.map(row => ({
              ...row,
              consistency_details: this._safeParseJson(row.consistency_details),
              errors_found: this._safeParseJson(row.errors_found),
              warnings: this._safeParseJson(row.warnings),
              is_simulation: row.is_simulation === 1,
              real_restart_verified: row.real_restart_verified === 1,
              consistency_check_passed: row.consistency_check_passed === 1
            }));
            resolve(result);
          }
        }
      );
    });
  }

  _safeParseJson(str, defaultValue = {}) {
    if (!str) return defaultValue;
    try {
      return typeof str === 'object' ? str : JSON.parse(str);
    } catch (e) {
      return defaultValue;
    }
  }
}

module.exports = {
  importAuditBatchDao: new ImportAuditBatchDao(),
  snapshotVersionChainDao: new SnapshotVersionChainDao(),
  replacedSnapshotDetailsDao: new ReplacedSnapshotDetailsDao(),
  rollbackResourceChangesDao: new RollbackResourceChangesDao(),
  restartReviewRecordsDao: new RestartReviewRecordsDao()
};
