const db = require('../database');
const { v4: uuidv4 } = require('uuid');

class CompatibilityStrategyDao {
  create(strategyData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const { api_version_id, strategy_type, config } = strategyData;
      db.run(
        'INSERT INTO compatibility_strategies (id, api_version_id, strategy_type, config) VALUES (?, ?, ?, ?)',
        [id, api_version_id, strategy_type, config || JSON.stringify({})],
        function(err) {
          if (err) reject(err);
          else resolve({ id, api_version_id, strategy_type, config });
        }
      );
    });
  }

  getAll() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM compatibility_strategies ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => ({ ...row, config: this._safeParseConfig(row.config) })));
      });
    });
  }

  getByApiVersionId(apiVersionId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM compatibility_strategies WHERE api_version_id = ? ORDER BY created_at DESC',
        [apiVersionId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => ({ ...row, config: this._safeParseConfig(row.config) })));
        }
      );
    });
  }

  update(id, strategyData) {
    return new Promise((resolve, reject) => {
      const { strategy_type, config } = strategyData;
      db.run(
        'UPDATE compatibility_strategies SET strategy_type = ?, config = ? WHERE id = ?',
        [strategy_type, config || JSON.stringify({}), id],
        function(err) {
          if (err) reject(err);
          else resolve({ id, ...strategyData });
        }
      );
    });
  }

  delete(id) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM compatibility_strategies WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve({ success: this.changes > 0 });
      });
    });
  }

  deleteByApiVersionId(apiVersionId) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM compatibility_strategies WHERE api_version_id = ?', [apiVersionId], function(err) {
        if (err) reject(err);
        else resolve({ success: this.changes > 0 });
      });
    });
  }

  _safeParseConfig(configStr) {
    try {
      return JSON.parse(configStr);
    } catch (e) {
      return {};
    }
  }
}

module.exports = new CompatibilityStrategyDao();