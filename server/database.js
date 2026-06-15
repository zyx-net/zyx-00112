const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const config = require('./config');

const dataDir = path.dirname(config.dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(config.dbPath, (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
  } else {
    console.log('数据库连接成功');
    initDatabase();
  }
});

function initDatabase() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS api_versions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      base_path TEXT NOT NULL,
      schema TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS field_mappings (
      id TEXT PRIMARY KEY,
      api_version_id TEXT,
      source_field TEXT NOT NULL,
      target_field TEXT NOT NULL,
      transform_type TEXT DEFAULT 'direct',
      transform_expression TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (api_version_id) REFERENCES api_versions(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS compatibility_strategies (
      id TEXT PRIMARY KEY,
      api_version_id TEXT,
      strategy_type TEXT NOT NULL,
      config TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (api_version_id) REFERENCES api_versions(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS scenarios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      api_version_id TEXT,
      status TEXT DEFAULT 'draft',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (api_version_id) REFERENCES api_versions(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS failure_injections (
      id TEXT PRIMARY KEY,
      scenario_id TEXT,
      type TEXT NOT NULL,
      probability REAL DEFAULT 0,
      config TEXT,
      enabled INTEGER DEFAULT 0,
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      scenario_id TEXT,
      status TEXT DEFAULT 'pending',
      start_time TEXT,
      end_time TEXT,
      logs TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      scenario_id TEXT,
      execution_id TEXT,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id),
      FOREIGN KEY (execution_id) REFERENCES executions(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS archived_scenarios (
      id TEXT PRIMARY KEY,
      scenario_id TEXT,
      data TEXT NOT NULL,
      archived_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS scenario_packages (
      id TEXT PRIMARY KEY,
      scenario_id TEXT,
      package_data TEXT NOT NULL,
      action_type TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      archived_scenario_id TEXT,
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS import_logs (
      id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL,
      import_time TEXT DEFAULT CURRENT_TIMESTAMP,
      source_package TEXT NOT NULL,
      conflict_decisions TEXT,
      result TEXT NOT NULL,
      details TEXT
    )`);
  });
}

module.exports = db;