const db = require('../database');
const { v4: uuidv4 } = require('uuid');

const VALID_INJECTION_TYPES = ['network_delay', 'error_response', 'timeout', 'data_corruption'];

const REQUIRED_CONFIG_FIELDS = {
  network_delay: ['delay'],
  error_response: ['statusCode'],
  timeout: ['timeout'],
  data_corruption: []
};

class FailureInjectionDao {
  _validateInjectionData(data, isCreate = false) {
    if (isCreate && !data.scenario_id) {
      throw new Error('缺少必填字段: scenario_id');
    }
    if (!data.type) {
      throw new Error('缺少必填字段: type');
    }
    if (!VALID_INJECTION_TYPES.includes(data.type)) {
      throw new Error(`无效的注入类型: ${data.type}，有效值: ${VALID_INJECTION_TYPES.join(', ')}`);
    }
    if (data.probability !== undefined && (typeof data.probability !== 'number' || data.probability < 0 || data.probability > 1)) {
      throw new Error('probability 必须是 0-1 之间的数字');
    }
    if (data.config !== undefined && data.config !== null) {
      if (typeof data.config === 'string') {
        try {
          JSON.parse(data.config);
        } catch (e) {
          throw new Error('config 必须是有效的 JSON 对象');
        }
      } else if (typeof data.config !== 'object') {
        throw new Error('config 必须是 JSON 对象');
      }
    }
  }

  _validateConfig(type, config) {
    if (!config || typeof config !== 'object') {
      throw new Error(`注入类型 ${type} 的配置必须是对象`);
    }
    const requiredFields = REQUIRED_CONFIG_FIELDS[type] || [];
    for (const field of requiredFields) {
      if (config[field] === undefined || config[field] === null) {
        throw new Error(`注入类型 ${type} 的配置缺少必填字段: ${field}`);
      }
    }
    if (type === 'network_delay' && config.delay !== undefined) {
      if (typeof config.delay !== 'number' || config.delay < 0) {
        throw new Error('network_delay 的 delay 必须是大于等于 0 的数字');
      }
    }
    if (type === 'error_response' && config.statusCode !== undefined) {
      if (!Number.isInteger(config.statusCode) || config.statusCode < 100 || config.statusCode > 599) {
        throw new Error('error_response 的 statusCode 必须是 100-599 之间的整数');
      }
    }
    if (type === 'timeout' && config.timeout !== undefined) {
      if (typeof config.timeout !== 'number' || config.timeout < 0) {
        throw new Error('timeout 的 timeout 必须是大于等于 0 的数字');
      }
    }
  }

  create(injectionData) {
    return new Promise((resolve, reject) => {
      try {
        this._validateInjectionData(injectionData, true);
        
        let configObj = injectionData.config;
        if (typeof configObj === 'string') {
          try {
            configObj = JSON.parse(configObj);
          } catch (e) {
            return reject(new Error('config 必须是有效的 JSON 对象'));
          }
        }
        this._validateConfig(injectionData.type, configObj || {});
        
        const id = uuidv4();
        const { scenario_id, type, probability, config, enabled } = injectionData;
        const configStr = typeof configObj === 'object' ? JSON.stringify(configObj) : JSON.stringify(configObj || {});
        db.run(
          'INSERT INTO failure_injections (id, scenario_id, type, probability, config, enabled) VALUES (?, ?, ?, ?, ?, ?)',
          [id, scenario_id, type, probability || 0, configStr, enabled ? 1 : 0],
          function(err) {
            if (err) reject(err);
            else resolve({ id, scenario_id, type, probability: probability || 0, config: configObj || {}, enabled: !!enabled });
          }
        );
      } catch (err) {
        reject(err);
      }
    });
  }

  _safeParseConfig(configStr, defaultConfig = {}) {
    if (!configStr) return defaultConfig;
    try {
      const parsed = JSON.parse(configStr);
      if (typeof parsed !== 'object' || parsed === null) return defaultConfig;
      return parsed;
    } catch (e) {
      return defaultConfig;
    }
  }

  getAll() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM failure_injections', (err, rows) => {
        if (err) reject(err);
        else {
          const result = rows.map(row => {
            try {
              return {
                id: row.id,
                scenario_id: row.scenario_id,
                type: row.type,
                probability: row.probability,
                config: this._safeParseConfig(row.config),
                enabled: row.enabled === 1
              };
            } catch (e) {
              return {
                id: row.id,
                scenario_id: row.scenario_id,
                type: row.type || 'unknown',
                probability: 0,
                config: {},
                enabled: false
              };
            }
          });
          resolve(result);
        }
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
          else {
            const result = rows.map(row => {
              try {
                return {
                  id: row.id,
                  scenario_id: row.scenario_id,
                  type: row.type,
                  probability: row.probability,
                  config: this._safeParseConfig(row.config),
                  enabled: row.enabled === 1
                };
              } catch (e) {
                return {
                  id: row.id,
                  scenario_id: row.scenario_id,
                  type: row.type || 'unknown',
                  probability: 0,
                  config: {},
                  enabled: false
                };
              }
            });
            resolve(result);
          }
        }
      );
    });
  }

  update(id, injectionData) {
    return new Promise((resolve, reject) => {
      try {
        this._validateInjectionData(injectionData);
        
        let configObj = injectionData.config;
        if (typeof configObj === 'string') {
          try {
            configObj = JSON.parse(configObj);
          } catch (e) {
            return reject(new Error('config 必须是有效的 JSON 对象'));
          }
        }
        if (configObj) {
          this._validateConfig(injectionData.type, configObj);
        }
        
        const { type, probability, config, enabled } = injectionData;
        const configStr = typeof configObj === 'object' ? JSON.stringify(configObj) : (configObj ? JSON.stringify(configObj) : JSON.stringify({}));
        db.run(
          'UPDATE failure_injections SET type = ?, probability = ?, config = ?, enabled = ? WHERE id = ?',
          [type, probability || 0, configStr, enabled ? 1 : 0, id],
          function(err) {
            if (err) reject(err);
            else resolve({ id, type, probability: probability || 0, config: configObj || {}, enabled: !!enabled });
          }
        );
      } catch (err) {
        reject(err);
      }
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