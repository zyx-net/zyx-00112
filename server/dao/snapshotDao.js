const db = require('../database');
const { v4: uuidv4 } = require('uuid');

class SnapshotDao {
  create(scenarioId, executionId, data) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      db.run(
        'INSERT INTO snapshots (id, scenario_id, execution_id, data) VALUES (?, ?, ?, ?)',
        [id, scenarioId, executionId, JSON.stringify(data)],
        function(err) {
          if (err) reject(err);
          else resolve({ id, scenario_id: scenarioId, execution_id: executionId });
        }
      );
    });
  }

  getAll() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM snapshots ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => ({ ...row, data: JSON.parse(row.data) })));
      });
    });
  }

  getByScenarioId(scenarioId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM snapshots WHERE scenario_id = ? ORDER BY created_at DESC',
        [scenarioId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => ({ ...row, data: JSON.parse(row.data) })));
        }
      );
    });
  }

  getLatestByScenarioId(scenarioId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM snapshots WHERE scenario_id = ? ORDER BY created_at DESC LIMIT 1',
        [scenarioId],
        (err, row) => {
          if (err) reject(err);
          else if (!row) resolve(null);
          else resolve({ ...row, data: JSON.parse(row.data) });
        }
      );
    });
  }

  getByExecutionId(executionId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM snapshots WHERE execution_id = ? LIMIT 1',
        [executionId],
        (err, row) => {
          if (err) reject(err);
          else if (!row) resolve(null);
          else resolve({ ...row, data: JSON.parse(row.data) });
        }
      );
    });
  }

  delete(id) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM snapshots WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve({ success: this.changes > 0 });
      });
    });
  }
}

module.exports = new SnapshotDao();