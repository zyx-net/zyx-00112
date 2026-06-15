const db = require('../database');
const { v4: uuidv4 } = require('uuid');

class ExecutionDao {
  create(scenarioId) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      db.run(
        'INSERT INTO executions (id, scenario_id, status) VALUES (?, ?, ?)',
        [id, scenarioId, 'pending'],
        function(err) {
          if (err) reject(err);
          else resolve({ id, scenario_id: scenarioId, status: 'pending' });
        }
      );
    });
  }

  getAll() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM executions ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  getById(id) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM executions WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  getByScenarioId(scenarioId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM executions WHERE scenario_id = ? ORDER BY created_at DESC',
        [scenarioId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  update(id, data) {
    return new Promise((resolve, reject) => {
      const { status, start_time, end_time, logs } = data;
      db.run(
        'UPDATE executions SET status = ?, start_time = ?, end_time = ?, logs = ? WHERE id = ?',
        [status, start_time, end_time, logs, id],
        function(err) {
          if (err) reject(err);
          else resolve({ success: this.changes > 0 });
        }
      );
    });
  }
}

module.exports = new ExecutionDao();