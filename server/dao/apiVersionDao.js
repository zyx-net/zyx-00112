const db = require('../database');
const { v4: uuidv4 } = require('uuid');

class ApiVersionDao {
  create(versionData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const { name, version, base_path, schema } = versionData;
      db.run(
        'INSERT INTO api_versions (id, name, version, base_path, schema) VALUES (?, ?, ?, ?, ?)',
        [id, name, version, base_path, schema || JSON.stringify({})],
        function(err) {
          if (err) reject(err);
          else resolve({ id, name, version, base_path, schema });
        }
      );
    });
  }

  getAll() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM api_versions ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => ({ ...row, schema: JSON.parse(row.schema) })));
      });
    });
  }

  getById(id) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM api_versions WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else if (!row) resolve(null);
        else resolve({ ...row, schema: JSON.parse(row.schema) });
      });
    });
  }

  update(id, versionData) {
    return new Promise((resolve, reject) => {
      const { name, version, base_path, schema } = versionData;
      db.run(
        'UPDATE api_versions SET name = ?, version = ?, base_path = ?, schema = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [name, version, base_path, schema || JSON.stringify({}), id],
        function(err) {
          if (err) reject(err);
          else resolve({ id, ...versionData });
        }
      );
    });
  }

  delete(id) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM api_versions WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve({ success: this.changes > 0 });
      });
    });
  }
}

module.exports = new ApiVersionDao();