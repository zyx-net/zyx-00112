const db = require('../database');
const { v4: uuidv4 } = require('uuid');

class ScenarioDao {
  create(scenarioData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const { name, description, api_version_id } = scenarioData;
      db.run(
        'INSERT INTO scenarios (id, name, description, api_version_id, status) VALUES (?, ?, ?, ?, ?)',
        [id, name, description || '', api_version_id, 'draft'],
        function(err) {
          if (err) reject(err);
          else resolve({ id, name, description, api_version_id, status: 'draft' });
        }
      );
    });
  }

  getAll() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM scenarios ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  getById(id) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM scenarios WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  update(id, scenarioData) {
    return new Promise((resolve, reject) => {
      const { name, description, status } = scenarioData;
      db.run(
        'UPDATE scenarios SET name = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [name, description || '', status, id],
        function(err) {
          if (err) reject(err);
          else resolve({ id, ...scenarioData });
        }
      );
    });
  }

  delete(id) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM scenarios WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve({ success: this.changes > 0 });
      });
    });
  }

  updateStatus(id, status) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE scenarios SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, id],
        function(err) {
          if (err) reject(err);
          else resolve({ success: this.changes > 0 });
        }
      );
    });
  }
}

module.exports = new ScenarioDao();