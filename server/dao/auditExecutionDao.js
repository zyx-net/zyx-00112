const db = require('../database');
const { v4: uuidv4 } = require('uuid');

class AuditExecutionBatchDao {
  create(batchData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const batchNumber = `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const {
        operator,
        operator_ip,
        user_agent,
        mode = 'preview',
        scenario_id,
        scenario_name,
        input_source,
        input_source_type,
        metadata
      } = batchData;

      db.run(
        `INSERT INTO audit_execution_batches 
         (id, batch_number, operator, operator_ip, user_agent, mode, state,
          scenario_id, scenario_name, input_source, input_source_type, metadata) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, batchNumber, operator, operator_ip || 'unknown', user_agent || 'unknown', 
         mode, 'pending', scenario_id, scenario_name, input_source, input_source_type, 
         JSON.stringify(metadata || {})],
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

      if (updates.mode !== undefined) {
        fields.push('mode = ?');
        values.push(updates.mode);
      }
      if (updates.state !== undefined) {
        fields.push('state = ?');
        values.push(updates.state);
      }
      if (updates.hit_items !== undefined) {
        fields.push('hit_items = ?');
        values.push(JSON.stringify(updates.hit_items));
      }
      if (updates.conflict_decision !== undefined) {
        fields.push('conflict_decision = ?');
        values.push(updates.conflict_decision);
      }
      if (updates.failure_reason !== undefined) {
        fields.push('failure_reason = ?');
        values.push(updates.failure_reason);
      }
      if (updates.recovery_result !== undefined) {
        fields.push('recovery_result = ?');
        values.push(updates.recovery_result);
      }
      if (updates.completed_at !== undefined) {
        fields.push('completed_at = ?');
        values.push(updates.completed_at);
      }
      if (updates.metadata !== undefined) {
        fields.push('metadata = ?');
        values.push(JSON.stringify(updates.metadata));
      }

      if (fields.length === 0) {
        return resolve({ success: true });
      }

      values.push(id);
      db.run(
        `UPDATE audit_execution_batches SET ${fields.join(', ')} WHERE id = ?`,
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
      db.get('SELECT * FROM audit_execution_batches WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else if (!row) resolve(null);
        else resolve(this._parseRow(row));
      });
    });
  }

  getByBatchNumber(batchNumber) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM audit_execution_batches WHERE batch_number = ?', [batchNumber], (err, row) => {
        if (err) reject(err);
        else if (!row) resolve(null);
        else resolve(this._parseRow(row));
      });
    });
  }

  getAll(filter = {}) {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM audit_execution_batches';
      let params = [];
      let conditions = [];

      if (filter.mode) {
        conditions.push('mode = ?');
        params.push(filter.mode);
      }
      if (filter.state) {
        conditions.push('state = ?');
        params.push(filter.state);
      }
      if (filter.operator) {
        conditions.push('operator = ?');
        params.push(filter.operator);
      }
      if (filter.scenario_id) {
        conditions.push('scenario_id = ?');
        params.push(filter.scenario_id);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY started_at DESC';

      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => this._parseRow(row)));
      });
    });
  }

  getActiveByScenarioId(scenarioId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM audit_execution_batches 
         WHERE scenario_id = ? AND state IN ('pending', 'pre_check', 'pre_check_passed', 'in_progress')
         ORDER BY started_at DESC`,
        [scenarioId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => this._parseRow(row)));
        }
      );
    });
  }

  _parseRow(row) {
    return {
      ...row,
      hit_items: this._safeParseJson(row.hit_items),
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

class AuditLogEntryDao {
  create(logData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const {
        batch_id,
        log_level = 'info',
        log_type,
        message,
        operator,
        context,
        error_code,
        error_details
      } = logData;

      db.run(
        `INSERT INTO audit_log_entries 
         (id, batch_id, log_level, log_type, message, operator, context, error_code, error_details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, batch_id, log_level, log_type, message, operator, 
         context ? JSON.stringify(context) : null, error_code, error_details],
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
        'SELECT * FROM audit_log_entries WHERE batch_id = ? ORDER BY timestamp DESC',
        [batchId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => ({
            ...row,
            context: this._safeParseJson(row.context)
          })));
        }
      );
    });
  }

  getByBatchIdOrdered(batchId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM audit_log_entries WHERE batch_id = ? ORDER BY timestamp ASC',
        [batchId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => ({
            ...row,
            context: this._safeParseJson(row.context)
          })));
        }
      );
    });
  }

  getByLogLevel(batchId, logLevel) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM audit_log_entries WHERE batch_id = ? AND log_level = ? ORDER BY timestamp DESC',
        [batchId, logLevel],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => ({
            ...row,
            context: this._safeParseJson(row.context)
          })));
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

class AuditTimelineDao {
  create(eventData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const {
        batch_id,
        event_type,
        event_order,
        actor,
        action,
        target_resource_type,
        target_resource_id,
        target_resource_name,
        status,
        details
      } = eventData;

      db.run(
        `INSERT INTO audit_timeline 
         (id, batch_id, event_type, event_order, actor, action,
          target_resource_type, target_resource_id, target_resource_name, status, details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, batch_id, event_type, event_order, actor, action,
         target_resource_type, target_resource_id, target_resource_name, status, details],
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
        'SELECT * FROM audit_timeline WHERE batch_id = ? ORDER BY event_order ASC',
        [batchId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  getNextOrder(batchId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT MAX(event_order) as max_order FROM audit_timeline WHERE batch_id = ?',
        [batchId],
        (err, row) => {
          if (err) reject(err);
          else resolve((row?.max_order || 0) + 1);
        }
      );
    });
  }
}

class AuditConflictDecisionDao {
  create(decisionData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const {
        batch_id,
        conflict_type,
        conflict_description,
        decision,
        decision_made_by
      } = decisionData;

      db.run(
        `INSERT INTO audit_conflict_decisions 
         (id, batch_id, conflict_type, conflict_description, decision, decision_made_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, batch_id, conflict_type, conflict_description, decision, decision_made_by],
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
        'SELECT * FROM audit_conflict_decisions WHERE batch_id = ? ORDER BY decision_made_at DESC',
        [batchId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }
}

class AuditRecoveryRecordDao {
  create(recordData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const {
        batch_id,
        resource_type,
        resource_id,
        resource_name,
        original_state,
        recovered_state,
        recovery_status
      } = recordData;

      db.run(
        `INSERT INTO audit_recovery_records 
         (id, batch_id, resource_type, resource_id, resource_name,
          original_state, recovered_state, recovery_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, batch_id, resource_type, resource_id, resource_name,
         JSON.stringify(original_state), JSON.stringify(recovered_state), recovery_status],
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

      if (updates.recovery_status !== undefined) {
        fields.push('recovery_status = ?');
        values.push(updates.recovery_status);
      }
      if (updates.recovered_state !== undefined) {
        fields.push('recovered_state = ?');
        values.push(JSON.stringify(updates.recovered_state));
      }
      if (updates.verified !== undefined) {
        fields.push('verified = ?');
        values.push(updates.verified ? 1 : 0);
      }
      if (updates.verified_by !== undefined) {
        fields.push('verified_by = ?');
        values.push(updates.verified_by);
      }
      if (updates.verified_at !== undefined) {
        fields.push('verified_at = ?');
        values.push(updates.verified_at);
      }

      if (fields.length === 0) {
        return resolve({ success: true });
      }

      values.push(id);
      db.run(
        `UPDATE audit_recovery_records SET ${fields.join(', ')} WHERE id = ?`,
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
        'SELECT * FROM audit_recovery_records WHERE batch_id = ? ORDER BY recovery_timestamp DESC',
        [batchId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => ({
            ...row,
            original_state: this._safeParseJson(row.original_state),
            recovered_state: this._safeParseJson(row.recovered_state),
            verified: row.verified === 1
          })));
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
  auditExecutionBatchDao: new AuditExecutionBatchDao(),
  auditLogEntryDao: new AuditLogEntryDao(),
  auditTimelineDao: new AuditTimelineDao(),
  auditConflictDecisionDao: new AuditConflictDecisionDao(),
  auditRecoveryRecordDao: new AuditRecoveryRecordDao()
};