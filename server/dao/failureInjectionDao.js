const db = require('../database');
const { v4: uuidv4 } = require('uuid');

class FailureInjectionDao {
  create(injectionData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const { scenario_id, type, probability, config, enabled } = injectionData;
      db.run(
        'INSERT INTO failure_injections (id, scenario_id, type, probability, config, enabled) VALUES (?, ?, ?, ?, ?, ?)',
        [id, scenario_id, type, probability || 0, config || JSON.stringify({}), enabled ? 1 : 0],
        function(err) {
          if (err) reject(err);
          else resolve({ id, scenario_id, type, probability, config, enabled });
        }
      );
    });
  }

  getAll() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM failure_injections', (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => ({ ...row, config: JSON.parse(row.config), enabled: row.enabled === 1 })));
      });
    });
  }

  getByScenarioId(scenarioId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM failure_injections WHERE scenario_id = ?',
        [scenarioId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => ({ ...row, config: JSON.parse(row.config), enabled: row.enabled === 1 })));
        }
      );
    });
  }

  update(id, injectionData) {
    return new Promise((resolve, reject) => {
      const { type, probability, config, enabled } = injectionData;
      db.run(
        'UPDATE failure_injections SET type = ?, probability = ?, config = ?, enabled = ? WHERE id = ?',
        [type, probability || 0, config || JSON.stringify({}), enabled ? 1 : 0, id],
        function(err) {
          if (err) reject(err);
          else resolve({ id, ...injectionData });
        }
      );
    });
  }

  delete(id) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM failure_injections WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve({ success: this.changes > 0 });
      });
    });
  }
}

module.exports = new FailureInjectionDao();