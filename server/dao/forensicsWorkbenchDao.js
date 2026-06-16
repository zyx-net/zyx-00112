const db = require('../database');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

class ForensicsBatchDao {
  create(batchData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const batchNumber = `${config.forensicsWorkbench.batchPrefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const {
        operator,
        operator_ip,
        user_agent,
        mode,
        scenario_id,
        scenario_name,
        original_scenario_id,
        original_snapshot_id,
        original_execution_id,
        conflict_decision,
        metadata
      } = batchData;

      db.run(
        `INSERT INTO forensics_batches 
         (id, batch_number, operator, operator_ip, user_agent, mode, state,
          scenario_id, scenario_name, original_scenario_id, original_snapshot_id,
          original_execution_id, conflict_decision, metadata) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, batchNumber, operator, operator_ip, user_agent, mode || 'simulate', 'pending',
         scenario_id, scenario_name, original_scenario_id, original_snapshot_id,
         original_execution_id, conflict_decision, JSON.stringify(metadata || {})],
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

      const allowedFields = [
        'state', 'scenario_id', 'scenario_name', 'original_scenario_id',
        'original_snapshot_id', 'original_execution_id', 'conflict_decision',
        'replacement_scenario_id', 'replacement_snapshot_id', 'rollback_execution_id',
        'restart_review_id', 'completed_at', 'error_code', 'error_message', 'metadata'
      ];

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          fields.push(`${key} = ?`);
          values.push(typeof value === 'object' ? JSON.stringify(value) : value);
        }
      }

      if (fields.length === 0) {
        return resolve({ success: true });
      }

      values.push(id);
      db.run(
        `UPDATE forensics_batches SET ${fields.join(', ')} WHERE id = ?`,
        values,
        function(err) {
          if (err) reject(err);
          else resolve({ success: this.changes > 0, id });
        }
      );
    });
  }

  getById(id) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM forensics_batches WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else if (!row) resolve(null);
        else resolve(this._parseRow(row));
      });
    });
  }

  getByBatchNumber(batchNumber) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM forensics_batches WHERE batch_number = ?', [batchNumber], (err, row) => {
        if (err) reject(err);
        else if (!row) resolve(null);
        else resolve(this._parseRow(row));
      });
    });
  }

  getAll(limit = 100, offset = 0, filters = {}) {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM forensics_batches WHERE 1=1';
      const params = [];

      if (filters.state) {
        sql += ' AND state = ?';
        params.push(filters.state);
      }
      if (filters.mode) {
        sql += ' AND mode = ?';
        params.push(filters.mode);
      }
      if (filters.scenario_id) {
        sql += ' AND scenario_id = ?';
        params.push(filters.scenario_id);
      }
      if (filters.operator) {
        sql += ' AND operator = ?';
        params.push(filters.operator);
      }

      sql += ' ORDER BY started_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => this._parseRow(row)));
      });
    });
  }

  getLatest() {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM forensics_batches ORDER BY started_at DESC LIMIT 1',
        [],
        (err, row) => {
          if (err) reject(err);
          else if (!row) resolve(null);
          else resolve(this._parseRow(row));
        }
      );
    });
  }

  getByScenarioId(scenarioId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM forensics_batches WHERE scenario_id = ? OR original_scenario_id = ? ORDER BY started_at DESC',
        [scenarioId, scenarioId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => this._parseRow(row)));
        }
      );
    });
  }

  getPendingBatches() {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM forensics_batches 
         WHERE state IN ('pending', 'pre_check', 'pre_check_passed', 'rollback_confirm')
         ORDER BY started_at DESC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => this._parseRow(row)));
        }
      );
    });
  }

  _parseRow(row) {
    if (!row) return null;
    return {
      ...row,
      metadata: this._safeParseJson(row.metadata)
    };
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

class ForensicsOperationDao {
  create(operationData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const {
        batch_id,
        operation_type,
        operation_order,
        operator,
        previous_state,
        new_state,
        details,
        is_reversible
      } = operationData;

      db.run(
        `INSERT INTO forensics_operations 
         (id, batch_id, operation_type, operation_order, operator,
          previous_state, new_state, details, is_reversible) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, batch_id, operation_type, operation_order, operator,
         JSON.stringify(previous_state), JSON.stringify(new_state),
         JSON.stringify(details), is_reversible !== false ? 1 : 0],
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
        'SELECT * FROM forensics_operations WHERE batch_id = ? ORDER BY operation_order ASC',
        [batchId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => this._parseRow(row)));
        }
      );
    });
  }

  updateReverseOperation(id, reverseOperationId) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE forensics_operations SET reverse_operation_id = ? WHERE id = ?',
        [reverseOperationId, id],
        function(err) {
          if (err) reject(err);
          else resolve({ success: this.changes > 0 });
        }
      );
    });
  }

  getLatestOperationOrder(batchId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT MAX(operation_order) as max_order FROM forensics_operations WHERE batch_id = ?',
        [batchId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.max_order || 0);
        }
      );
    });
  }

  _parseRow(row) {
    if (!row) return null;
    return {
      ...row,
      previous_state: this._safeParseJson(row.previous_state),
      new_state: this._safeParseJson(row.new_state),
      details: this._safeParseJson(row.details),
      is_reversible: row.is_reversible === 1
    };
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

class ForensicsTimelineDao {
  create(eventData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const {
        batch_id,
        event_type,
        event_order,
        actor,
        source_module,
        target_resource_type,
        target_resource_id,
        event_data,
        is_critical
      } = eventData;

      db.run(
        `INSERT INTO forensics_timeline 
         (id, batch_id, event_type, event_order, actor, source_module,
          target_resource_type, target_resource_id, event_data, is_critical) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, batch_id, event_type, event_order, actor, source_module,
         target_resource_type, target_resource_id, JSON.stringify(event_data),
         is_critical ? 1 : 0],
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
        'SELECT * FROM forensics_timeline WHERE batch_id = ? ORDER BY event_order ASC',
        [batchId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => this._parseRow(row)));
        }
      );
    });
  }

  getLatestEventOrder(batchId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT MAX(event_order) as max_order FROM forensics_timeline WHERE batch_id = ?',
        [batchId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.max_order || 0);
        }
      );
    });
  }

  getCriticalEvents(batchId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM forensics_timeline WHERE batch_id = ? AND is_critical = 1 ORDER BY event_order ASC',
        [batchId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => this._parseRow(row)));
        }
      );
    });
  }

  _parseRow(row) {
    if (!row) return null;
    return {
      ...row,
      event_data: this._safeParseJson(row.event_data),
      is_critical: row.is_critical === 1
    };
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

class ForensicsReplacedSnapshotDao {
  create(detailData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const {
        batch_id,
        operation_id,
        original_snapshot_id,
        original_scenario_id,
        original_execution_id,
        original_execution_status,
        original_data,
        original_created_at,
        replaced_by_snapshot_id,
        replaced_by_scenario_id,
        replaced_reason,
        conflict_type,
        conflict_decision,
        operator
      } = detailData;

      db.run(
        `INSERT INTO forensics_replaced_snapshots 
         (id, batch_id, operation_id, original_snapshot_id, original_scenario_id,
          original_execution_id, original_execution_status, original_data,
          original_created_at, replaced_by_snapshot_id, replaced_by_scenario_id,
          replaced_reason, conflict_type, conflict_decision, operator) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, batch_id, operation_id, original_snapshot_id, original_scenario_id,
         original_execution_id, original_execution_status, JSON.stringify(original_data),
         original_created_at, replaced_by_snapshot_id, replaced_by_scenario_id,
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
        `SELECT frs.*, 
                sc.name as original_scenario_name,
                e.status as original_execution_status_full,
                e.start_time as original_execution_start_time
         FROM forensics_replaced_snapshots frs
         LEFT JOIN scenarios sc ON frs.original_scenario_id = sc.id
         LEFT JOIN executions e ON frs.original_execution_id = e.id
         WHERE frs.batch_id = ?
         ORDER BY frs.replaced_at DESC`,
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

  _parseRow(row) {
    if (!row) return null;
    return {
      ...row,
      original_data: this._safeParseJson(row.original_data)
    };
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

class ForensicsRecoveryRecordDao {
  create(recordData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const {
        batch_id,
        recovery_type,
        original_resource_type,
        original_resource_id,
        original_resource_name,
        recovery_state,
        recovery_data
      } = recordData;

      db.run(
        `INSERT INTO forensics_recovery_records 
         (id, batch_id, recovery_type, original_resource_type, original_resource_id,
          original_resource_name, recovery_state, recovery_data) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, batch_id, recovery_type, original_resource_type, original_resource_id,
         original_resource_name, recovery_state, JSON.stringify(recovery_data)],
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

      if (updates.verified !== undefined) {
        fields.push('verified = ?');
        values.push(updates.verified ? 1 : 0);
      }
      if (updates.verified_by) {
        fields.push('verified_by = ?');
        values.push(updates.verified_by);
      }
      if (updates.verified_at) {
        fields.push('verified_at = ?');
        values.push(updates.verified_at);
      }
      if (updates.verification_notes) {
        fields.push('verification_notes = ?');
        values.push(updates.verification_notes);
      }

      if (fields.length === 0) {
        return resolve({ success: true });
      }

      values.push(id);
      db.run(
        `UPDATE forensics_recovery_records SET ${fields.join(', ')} WHERE id = ?`,
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
        'SELECT * FROM forensics_recovery_records WHERE batch_id = ? ORDER BY recovery_timestamp DESC',
        [batchId],
        (err, rows) => {
          if (err) reject(err);
          else {
            const result = rows.map(row => ({
              ...row,
              recovery_data: this._safeParseJson(row.recovery_data),
              verified: row.verified === 1
            }));
            resolve(result);
          }
        }
      );
    });
  }

  getUnverifiedByBatchId(batchId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM forensics_recovery_records WHERE batch_id = ? AND verified = 0 ORDER BY recovery_timestamp ASC',
        [batchId],
        (err, rows) => {
          if (err) reject(err);
          else {
            const result = rows.map(row => ({
              ...row,
              recovery_data: this._safeParseJson(row.recovery_data),
              verified: false
            }));
            resolve(result);
          }
        }
      );
    });
  }

  _parseRow(row) {
    if (!row) return null;
    return {
      ...row,
      recovery_data: this._safeParseJson(row.recovery_data),
      verified: row.verified === 1
    };
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
  forensicsBatchDao: new ForensicsBatchDao(),
  forensicsOperationDao: new ForensicsOperationDao(),
  forensicsTimelineDao: new ForensicsTimelineDao(),
  forensicsReplacedSnapshotDao: new ForensicsReplacedSnapshotDao(),
  forensicsRecoveryRecordDao: new ForensicsRecoveryRecordDao()
};
