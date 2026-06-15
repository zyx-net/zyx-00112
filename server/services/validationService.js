const scenarioDao = require('../dao/scenarioDao');
const executionDao = require('../dao/executionDao');

class ValidationService {
  async validateScenarioUpdate(scenarioId) {
    const scenario = await scenarioDao.getById(scenarioId);
    if (!scenario) {
      throw new Error('场景不存在');
    }

    if (scenario.status === 'running') {
      throw new Error('运行中的场景不能被直接修改配置');
    }

    return true;
  }

  async validateRollback(scenarioId) {
    const scenario = await scenarioDao.getById(scenarioId);
    if (!scenario) {
      throw new Error('场景不存在');
    }

    if (scenario.status === 'running') {
      throw new Error('运行中的场景不能执行回滚');
    }

    const executions = await executionDao.getByScenarioId(scenarioId);
    const successfulExecutions = executions.filter(e => e.status === 'success');
    
    if (successfulExecutions.length === 0) {
      throw new Error('没有成功提交过的场景不能伪造回滚');
    }

    return true;
  }

  async validateExecution(scenarioId, runningSet) {
    const scenario = await scenarioDao.getById(scenarioId);
    if (!scenario) {
      throw new Error('场景不存在');
    }

    if (runningSet.has(scenarioId)) {
      throw new Error('同一版本被并发发起两次运行时后一次被阻塞');
    }

    return true;
  }
}

module.exports = new ValidationService();