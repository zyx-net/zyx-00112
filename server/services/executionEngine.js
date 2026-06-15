const apiVersionDao = require('../dao/apiVersionDao');
const scenarioDao = require('../dao/scenarioDao');
const executionDao = require('../dao/executionDao');
const snapshotDao = require('../dao/snapshotDao');
const failureInjectionDao = require('../dao/failureInjectionDao');
const config = require('../config');

class ExecutionEngine {
  constructor() {
    this.runningExecutions = new Set();
    this.queue = [];
  }

  async execute(scenarioId) {
    const scenario = await scenarioDao.getById(scenarioId);
    if (!scenario) {
      throw new Error('场景不存在');
    }

    if (scenario.status === 'running') {
      throw new Error('运行中的场景不能被直接改配置或重新执行');
    }

    const apiVersion = await apiVersionDao.getById(scenario.api_version_id);
    if (!apiVersion) {
      throw new Error('关联的API版本不存在');
    }

    const runningCount = this.runningExecutions.size;
    if (runningCount >= config.maxConcurrentExecutions) {
      return { status: 'queued', message: '当前执行数已达上限，已加入队列等待' };
    }

    return this._doExecute(scenarioId, scenario, apiVersion);
  }

  async _doExecute(scenarioId, scenario, apiVersion) {
    const execution = await executionDao.create(scenarioId);
    
    this.runningExecutions.add(scenarioId);
    await scenarioDao.updateStatus(scenarioId, 'running');

    const logs = [];
    const startTime = new Date().toISOString();
    
    logs.push(`[${startTime}] 开始执行演练: ${scenario.name}`);
    logs.push(`[${startTime}] API版本: ${apiVersion.name} v${apiVersion.version}`);

    let success = true;
    let resultData = null;

    try {
      const injections = await failureInjectionDao.getByScenarioId(scenarioId);
      const enabledInjections = injections.filter(i => i.enabled);
      
      if (enabledInjections.length > 0) {
        logs.push(`[${new Date().toISOString()}] 检测到 ${enabledInjections.length} 个失败注入规则`);
      }

      for (const injection of enabledInjections) {
        try {
          const safeConfig = (injection.config && typeof injection.config === 'object') ? injection.config : {};
          
          if (Math.random() < (injection.probability || 0)) {
            logs.push(`[${new Date().toISOString()}] 触发失败注入: ${injection.type || 'unknown'}`);
            logs.push(`[${new Date().toISOString()}] 注入配置: ${JSON.stringify(safeConfig)}`);
            
            if (injection.type === 'network_delay') {
              await this._simulateNetworkDelay(safeConfig);
              logs.push(`[${new Date().toISOString()}] 网络延迟模拟完成`);
            } else if (injection.type === 'error_response') {
              const errorCode = safeConfig.statusCode || 500;
              const errorMessage = safeConfig.message || '模拟错误';
              throw new Error(`HTTP ${errorCode}: ${errorMessage}`);
            } else if (injection.type === 'timeout') {
              logs.push(`[${new Date().toISOString()}] 触发超时模拟`);
              await this._simulateTimeout(safeConfig);
            } else if (injection.type === 'data_corruption') {
              logs.push(`[${new Date().toISOString()}] 触发数据损坏模拟`);
              throw new Error('数据损坏错误');
            } else {
              logs.push(`[${new Date().toISOString()}] 未知注入类型: ${injection.type}，跳过`);
            }
          }
        } catch (error) {
          if (error.message.includes('HTTP ') || error.message.includes('超时') || error.message.includes('数据损坏')) {
            throw error;
          }
          logs.push(`[${new Date().toISOString()}] 处理注入规则时出错: ${error.message}`);
        }
      }

      resultData = await this._simulateApiCall(apiVersion);
      logs.push(`[${new Date().toISOString()}] API调用成功`);
      logs.push(`[${new Date().toISOString()}] 响应数据: ${JSON.stringify(resultData)}`);

      await snapshotDao.create(scenarioId, execution.id, resultData);
      logs.push(`[${new Date().toISOString()}] 快照已保存`);

    } catch (error) {
      success = false;
      logs.push(`[${new Date().toISOString()}] 执行失败: ${error.message}`);
    } finally {
      const endTime = new Date().toISOString();
      this.runningExecutions.delete(scenarioId);
      await scenarioDao.updateStatus(scenarioId, success ? 'completed' : 'failed');
      
      await executionDao.update(execution.id, {
        status: success ? 'success' : 'failed',
        start_time: startTime,
        end_time: endTime,
        logs: logs.join('\n')
      });

      logs.push(`[${endTime}] 执行结束，状态: ${success ? '成功' : '失败'}`);
    }

    return {
      executionId: execution.id,
      status: success ? 'success' : 'failed',
      logs: logs.join('\n')
    };
  }

  async _simulateApiCall(apiVersion) {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      version: apiVersion.version,
      endpoint: apiVersion.base_path,
      timestamp: new Date().toISOString(),
      data: {
        users: [
          { id: 1, name: '测试用户', email: 'test@example.com' },
          { id: 2, name: '模拟用户', email: 'mock@example.com' }
        ],
        meta: { total: 2, page: 1 }
      }
    };
  }

  async _simulateNetworkDelay(config) {
    const delay = config.delay || 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async _simulateTimeout(config) {
    const timeout = config.timeout || 3000;
    await new Promise(resolve => setTimeout(resolve, timeout));
    throw new Error('请求超时');
  }

  isRunning(scenarioId) {
    return this.runningExecutions.has(scenarioId);
  }

  getRunningCount() {
    return this.runningExecutions.size;
  }
}

module.exports = new ExecutionEngine();