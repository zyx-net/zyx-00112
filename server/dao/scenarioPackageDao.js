const db = require('../database');
const { v4: uuidv4 } = require('uuid');

class ScenarioPackageDao {
  savePackage(packageData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const { scenario_id, action_type, archived_scenario_id } = packageData;
      db.run(
        'INSERT INTO scenario_packages (id, scenario_id, package_data, action_type, archived_scenario_id) VALUES (?, ?, ?, ?, ?)',
        [id, scenario_id || null, JSON.stringify(packageData.package_data), action_type, archived_scenario_id || null],
        function(err) {
          if (err) reject(err);
          else resolve({ id, scenario_id, action_type, archived_scenario_id });
        }
      );
    });
  }

  getLatestImport() {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM scenario_packages WHERE action_type = ? ORDER BY created_at DESC LIMIT 1',
        ['import'],
        (err, row) => {
          if (err) reject(err);
          else if (!row) resolve(null);
          else resolve({ ...row, package_data: JSON.parse(row.package_data) });
        }
      );
    });
  }

  delete(id) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM scenario_packages WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve({ success: this.changes > 0 });
      });
    });
  }
}

class ImportLogDao {
  create(logData) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const { package_id, source_package, conflict_decisions, result, details } = logData;
      db.run(
        'INSERT INTO import_logs (id, package_id, source_package, conflict_decisions, result, details) VALUES (?, ?, ?, ?, ?, ?)',
        [id, package_id, source_package, JSON.stringify(conflict_decisions || {}), result, JSON.stringify(details || {})],
        function(err) {
          if (err) reject(err);
          else resolve({ id, package_id, result });
        }
      );
    });
  }

  getAll() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM import_logs ORDER BY import_time DESC', (err, rows) => {
        if (err) reject(err);
        else {
          const result = rows.map(row => ({
            ...row,
            conflict_decisions: this._safeParseJson(row.conflict_decisions),
            details: this._safeParseJson(row.details)
          }));
          resolve(result);
        }
      });
    });
  }

  getLatest() {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM import_logs ORDER BY import_time DESC LIMIT 1', (err, row) => {
        if (err) reject(err);
        else if (!row) resolve(null);
        else resolve({
          ...row,
          conflict_decisions: this._safeParseJson(row.conflict_decisions),
          details: this._safeParseJson(row.details)
        });
      });
    });
  }

  _safeParseJson(str, defaultValue = {}) {
    if (!str) return defaultValue;
    try {
      const parsed = JSON.parse(str);
      return typeof parsed === 'object' ? parsed : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }
}

class ArchivedScenarioDao {
  archive(scenarioId, data) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      db.run(
        'INSERT INTO archived_scenarios (id, scenario_id, data) VALUES (?, ?, ?)',
        [id, scenarioId, JSON.stringify(data)],
        function(err) {
          if (err) reject(err);
          else resolve({ id, scenario_id: scenarioId });
        }
      );
    });
  }

  getByScenarioId(scenarioId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM archived_scenarios WHERE scenario_id = ? ORDER BY archived_at DESC LIMIT 1',
        [scenarioId],
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
      db.run('DELETE FROM archived_scenarios WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve({ success: this.changes > 0 });
      });
    });
  }
}

module.exports = {
  scenarioPackageDao: new ScenarioPackageDao(),
  importLogDao: new ImportLogDao(),
  archivedScenarioDao: new ArchivedScenarioDao()
};
