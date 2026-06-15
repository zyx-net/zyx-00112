const db = require('../database');
const { v4: uuidv4 } = require('uuid');

class FieldMappingDao {
  create(mappingData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const { api_version_id, source_field, target_field, transform_type, transform_expression } = mappingData;
      db.run(
        'INSERT INTO field_mappings (id, api_version_id, source_field, target_field, transform_type, transform_expression) VALUES (?, ?, ?, ?, ?, ?)',
        [id, api_version_id, source_field, target_field, transform_type || 'direct', transform_expression || ''],
        function(err) {
          if (err) reject(err);
          else resolve({ id, api_version_id, source_field, target_field, transform_type: transform_type || 'direct', transform_expression: transform_expression || '' });
        }
      );
    });
  }

  getAll() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM field_mappings ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  getByApiVersionId(apiVersionId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM field_mappings WHERE api_version_id = ? ORDER BY created_at DESC',
        [apiVersionId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  update(id, mappingData) {
    return new Promise((resolve, reject) => {
      const { source_field, target_field, transform_type, transform_expression } = mappingData;
      db.run(
        'UPDATE field_mappings SET source_field = ?, target_field = ?, transform_type = ?, transform_expression = ? WHERE id = ?',
        [source_field, target_field, transform_type || 'direct', transform_expression || '', id],
        function(err) {
          if (err) reject(err);
          else resolve({ id, ...mappingData });
        }
      );
    });
  }

  delete(id) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM field_mappings WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve({ success: this.changes > 0 });
      });
    });
  }

  deleteByApiVersionId(apiVersionId) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM field_mappings WHERE api_version_id = ?', [apiVersionId], function(err) {
        if (err) reject(err);
        else resolve({ success: this.changes > 0 });
      });
    });
  }
}

module.exports = new FieldMappingDao();