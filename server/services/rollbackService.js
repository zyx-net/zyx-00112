const scenarioDao = require('../dao/scenarioDao');
const executionDao = require('../dao/executionDao');
const snapshotDao = require('../dao/snapshotDao');

class RollbackService {
  async rollback(scenarioId) {
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

    const latestSnapshot = await snapshotDao.getLatestByScenarioId(scenarioId);
    if (!latestSnapshot) {
      throw new Error('没有可用的快照进行回滚');
    }

    const rollbackResult = {
      scenarioId,
      snapshotId: latestSnapshot.id,
      restoredData: latestSnapshot.data,
      timestamp: new Date().toISOString(),
      message: '回滚成功'
    };

    await scenarioDao.updateStatus(scenarioId, 'rolled_back');

    return rollbackResult;
  }

  async getRollbackHistory(scenarioId) {
    const snapshots = await snapshotDao.getByScenarioId(scenarioId);
    const executions = await executionDao.getByScenarioId(scenarioId);
    
    const executionMap = {};
    for (const exec of executions) {
      executionMap[exec.id] = {
        id: exec.id,
        status: exec.status,
        start_time: exec.start_time,
        end_time: exec.end_time,
        created_at: exec.created_at
      };
    }
    
    return snapshots.map(snapshot => ({
      id: snapshot.id,
      scenarioId: snapshot.scenario_id,
      executionId: snapshot.execution_id,
      execution: snapshot.execution_id ? executionMap[snapshot.execution_id] : null,
      createdAt: snapshot.created_at,
      dataPreview: JSON.stringify(snapshot.data).substring(0, 100) + '...',
      isLatest: snapshot.created_at === snapshots[0]?.created_at
    }));
  }

  async exportSummary(scenarioId) {
    const scenario = await scenarioDao.getById(scenarioId);
    const executions = await executionDao.getByScenarioId(scenarioId);
    const snapshots = await snapshotDao.getByScenarioId(scenarioId);

    return {
      scenario: {
        id: scenario.id,
        name: scenario.name,
        description: scenario.description,
        status: scenario.status,
        createdAt: scenario.created_at,
        updatedAt: scenario.updated_at
      },
      executionSummary: {
        total: executions.length,
        success: executions.filter(e => e.status === 'success').length,
        failed: executions.filter(e => e.status === 'failed').length,
        pending: executions.filter(e => e.status === 'pending').length
      },
      snapshotCount: snapshots.length,
      latestSnapshot: snapshots[0] ? {
        id: snapshots[0].id,
        createdAt: snapshots[0].created_at
      } : null,
      exportTime: new Date().toISOString()
    };
  }
}

module.exports = new RollbackService();