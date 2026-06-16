const {
  auditExecutionBatchDao,
  auditLogEntryDao,
  auditTimelineDao,
  auditConflictDecisionDao,
  auditRecoveryRecordDao
} = require('../dao/auditExecutionDao');

const scenarioDao = require('../dao/scenarioDao');
const executionDao = require('../dao/executionDao');
const snapshotDao = require('../dao/snapshotDao');
const fs = require('fs');
const path = require('path');
const config = require('../config');

class AuditExecutionService {
  constructor() {
    this.logsDir = path.join(path.dirname(config.dbPath), 'audit-logs');
    this.ensureLogsDir();
    
    this.STATES = {
      PENDING: 'pending',
      PRE_CHECK: 'pre_check',
      PRE_CHECK_PASSED: 'pre_check_passed',
      PRE_CHECK_FAILED: 'pre_check_failed',
      IN_PROGRESS: 'in_progress',
      COMPLETED: 'completed',
      FAILED: 'failed',
      CANCELLED: 'cancelled',
      RECOVERING: 'recovering',
      RECOVERED: 'recovered',
      RECOVERY_FAILED: 'recovery_failed'
    };

    this.STATE_TRANSITIONS = {
      [this.STATES.PENDING]: [this.STATES.PRE_CHECK, this.STATES.IN_PROGRESS, this.STATES.CANCELLED],
      [this.STATES.PRE_CHECK]: [this.STATES.PRE_CHECK_PASSED, this.STATES.PRE_CHECK_FAILED],
      [this.STATES.PRE_CHECK_PASSED]: [this.STATES.IN_PROGRESS, this.STATES.CANCELLED],
      [this.STATES.PRE_CHECK_FAILED]: [this.STATES.PRE_CHECK, this.STATES.CANCELLED],
      [this.STATES.IN_PROGRESS]: [this.STATES.COMPLETED, this.STATES.FAILED],
      [this.STATES.COMPLETED]: [],
      [this.STATES.FAILED]: [this.STATES.RECOVERING, this.STATES.CANCELLED],
      [this.STATES.CANCELLED]: [],
      [this.STATES.RECOVERING]: [this.STATES.RECOVERED, this.STATES.RECOVERY_FAILED],
      [this.STATES.RECOVERED]: [],
      [this.STATES.RECOVERY_FAILED]: [this.STATES.RECOVERING]
    };
  }

  isValidTransition(currentState, newState) {
    const allowedTransitions = this.STATE_TRANSITIONS[currentState] || [];
    return allowedTransitions.includes(newState);
  }

  async validateAndUpdateState(batchId, newState) {
    const batch = await auditExecutionBatchDao.getById(batchId);
    if (!batch) {
      throw new Error('批次不存在');
    }

    if (!this.isValidTransition(batch.state, newState)) {
      throw new Error(`非法状态转换: ${batch.state} -> ${newState}`);
    }

    return await auditExecutionBatchDao.update(batchId, { state: newState });
  }

  ensureLogsDir() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  async createBatch(operator, scenarioId, mode = 'preview', requestInfo = {}) {
    const scenario = await scenarioDao.getById(scenarioId);
    if (!scenario) {
      throw new Error('场景不存在');
    }

    const activeBatches = await auditExecutionBatchDao.getActiveByScenarioId(scenarioId);
    if (activeBatches.length > 0) {
      throw new Error(`存在活跃批次: ${activeBatches[0].batch_number}，请先完成或取消`);
    }

    const batch = await auditExecutionBatchDao.create({
      operator,
      operator_ip: requestInfo.ip || 'unknown',
      user_agent: requestInfo.userAgent || 'unknown',
      mode,
      scenario_id: scenarioId,
      scenario_name: scenario.name,
      input_source: requestInfo.inputSource || 'api',
      input_source_type: requestInfo.inputSourceType || 'manual'
    });

    await this.addTimelineEvent(batch.id, 'batch_created', operator, '批次已创建');
    await this.log(batch.id, 'info', 'batch_created', `批次 ${batch.batch_number} 已创建，模式: ${mode}`);

    return batch;
  }

  async checkDuplicateSubmission(scenarioId) {
    const activeBatches = await auditExecutionBatchDao.getActiveByScenarioId(scenarioId);
    if (activeBatches.length > 0) {
      return {
        has_duplicate: true,
        active_batch: activeBatches[0],
        message: `场景 ${scenarioId} 存在活跃批次 ${activeBatches[0].batch_number}`
      };
    }
    return { has_duplicate: false };
  }

  async checkReplay(batchNumber) {
    const batch = await auditExecutionBatchDao.getByBatchNumber(batchNumber);
    if (!batch) {
      return { exists: false, message: '批次不存在' };
    }

    if (batch.state === 'completed' || batch.state === 'cancelled') {
      return {
        exists: true,
        can_replay: false,
        message: `批次 ${batchNumber} 已${batch.state === 'completed' ? '完成' : '取消'}，不允许重放`,
        batch
      };
    }

    return {
      exists: true,
      can_replay: true,
      message: `批次 ${batchNumber} 状态为 ${batch.state}，允许继续`,
      batch
    };
  }

  async updateMode(batchId, newMode) {
    if (!['preview', 'execute'].includes(newMode)) {
      throw new Error('无效的模式值，必须是 preview 或 execute');
    }

    const batch = await auditExecutionBatchDao.getById(batchId);
    if (!batch) {
      throw new Error('批次不存在');
    }

    if (batch.state === 'completed' || batch.state === 'cancelled') {
      throw new Error('已完成或已取消的批次不能修改模式');
    }

    await auditExecutionBatchDao.update(batchId, { mode: newMode });

    await this.addTimelineEvent(batchId, 'mode_changed', batch.operator, 
      `模式已从 ${batch.mode} 切换为 ${newMode}`);
    await this.log(batchId, 'info', 'mode_changed', `批次 ${batch.batch_number} 模式已切换为 ${newMode}`);

    return { success: true, mode: newMode };
  }

  async runPreCheck(batchId) {
    const batch = await auditExecutionBatchDao.getById(batchId);
    if (!batch) {
      throw new Error('批次不存在');
    }

    await this.validateAndUpdateState(batchId, this.STATES.PRE_CHECK);
    await this.addTimelineEvent(batchId, 'pre_check_start', batch.operator, '开始预检查');
    await this.log(batchId, 'info', 'pre_check_start', `批次 ${batch.batch_number} 开始预检查`);

    const checkResults = await this._performPreChecks(batch);
    
    const newState = checkResults.all_passed ? this.STATES.PRE_CHECK_PASSED : this.STATES.PRE_CHECK_FAILED;
    await auditExecutionBatchDao.update(batchId, { 
      state: newState,
      hit_items: checkResults.hit_items
    });

    if (checkResults.all_passed) {
      await this.addTimelineEvent(batchId, 'pre_check_passed', batch.operator, '预检查通过');
      await this.log(batchId, 'info', 'pre_check_passed', `批次 ${batch.batch_number} 预检查通过`);
    } else {
      await this.addTimelineEvent(batchId, 'pre_check_failed', batch.operator, '预检查失败');
      await this.log(batchId, 'error', 'pre_check_failed', `批次 ${batch.batch_number} 预检查失败: ${checkResults.errors.join(', ')}`);
    }

    return checkResults;
  }

  async _performPreChecks(batch) {
    const results = {
      checks: [],
      hit_items: [],
      errors: [],
      warnings: [],
      all_passed: true
    };

    const scenario = await scenarioDao.getById(batch.scenario_id);
    if (!scenario) {
      results.checks.push({ name: '场景存在性检查', passed: false });
      results.errors.push('场景不存在');
      results.all_passed = false;
      return results;
    }

    results.checks.push({ name: '场景存在性检查', passed: true });
    results.hit_items.push({ type: 'scenario', id: scenario.id, name: scenario.name });

    const executions = await executionDao.getByScenarioId(batch.scenario_id);
    results.checks.push({ 
      name: '执行记录检查', 
      passed: true,
      details: `找到 ${executions.length} 条执行记录`
    });
    
    executions.forEach(e => {
      results.hit_items.push({ type: 'execution', id: e.id, status: e.status });
    });

    const snapshots = await snapshotDao.getByScenarioId(batch.scenario_id);
    results.checks.push({ 
      name: '快照检查', 
      passed: true,
      details: `找到 ${snapshots.length} 个快照`
    });

    snapshots.forEach(s => {
      results.hit_items.push({ type: 'snapshot', id: s.id, execution_id: s.execution_id });
    });

    if (scenario.status === 'running') {
      results.warnings.push('场景当前正在运行中');
    }

    if (executions.length === 0) {
      results.warnings.push('场景暂无执行记录');
    }

    return results;
  }

  async execute(batchId) {
    const batch = await auditExecutionBatchDao.getById(batchId);
    if (!batch) {
      throw new Error('批次不存在');
    }

    await this.validateAndUpdateState(batchId, this.STATES.IN_PROGRESS);
    await this.addTimelineEvent(batchId, 'execution_start', batch.operator, '开始执行');
    await this.log(batchId, 'info', 'execution_start', `批次 ${batch.batch_number} 开始执行，模式: ${batch.mode}`);

    let success = true;
    let failureReason = null;

    try {
      if (batch.mode === 'execute') {
        await this._performRealExecution(batch);
      } else {
        await this._performPreviewExecution(batch);
      }
    } catch (error) {
      success = false;
      failureReason = error.message;
      await this.log(batchId, 'error', 'execution_failed', `批次 ${batch.batch_number} 执行失败: ${error.message}`, { error_code: 'EXEC_ERROR' });
    }

    const finalState = success ? this.STATES.COMPLETED : this.STATES.FAILED;
    await auditExecutionBatchDao.update(batchId, { 
      state: finalState,
      completed_at: new Date().toISOString(),
      failure_reason: failureReason
    });

    if (success) {
      await this.addTimelineEvent(batchId, 'execution_completed', batch.operator, '执行完成');
      await this.log(batchId, 'info', 'execution_completed', `批次 ${batch.batch_number} 执行完成`);
      await this.writeLogToFile(batch);
    } else {
      await this.addTimelineEvent(batchId, 'execution_failed', batch.operator, `执行失败: ${failureReason}`);
    }

    return { success, failure_reason: failureReason };
  }

  async _performRealExecution(batch) {
    const executions = await executionDao.getByScenarioId(batch.scenario_id);
    for (const exec of executions) {
      if (exec.status === 'pending') {
        await executionDao.update(exec.id, { status: 'completed', end_time: new Date().toISOString() });
        await this.log(batch.id, 'info', 'execution_update', `执行记录 ${exec.id} 已更新为完成状态`);
      }
    }
  }

  async _performPreviewExecution(batch) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.log(batch.id, 'info', 'preview_execution', `预检执行完成，未实际修改数据`);
  }

  async handleConflict(batchId, conflictType, description, decision, operator) {
    const batch = await auditExecutionBatchDao.getById(batchId);
    if (!batch) {
      throw new Error('批次不存在');
    }

    await auditConflictDecisionDao.create({
      batch_id: batchId,
      conflict_type: conflictType,
      conflict_description: description,
      decision,
      decision_made_by: operator
    });

    await auditExecutionBatchDao.update(batchId, { conflict_decision: decision });

    await this.addTimelineEvent(batchId, 'conflict_resolved', operator, 
      `冲突已解决: ${conflictType} -> ${decision}`);
    await this.log(batchId, 'info', 'conflict_resolved', 
      `批次 ${batch.batch_number} 冲突已解决: ${conflictType} -> ${decision}`);

    return { success: true };
  }

  async recoverFromFailure(batchId, operator) {
    const batch = await auditExecutionBatchDao.getById(batchId);
    if (!batch) {
      throw new Error('批次不存在');
    }

    await this.validateAndUpdateState(batchId, this.STATES.RECOVERING);
    await this.addTimelineEvent(batchId, 'recovery_start', operator, '开始恢复');
    await this.log(batchId, 'info', 'recovery_start', `批次 ${batch.batch_number} 开始恢复`);

    const recoveryResult = await this._performRecovery(batch);

    const finalState = recoveryResult.success ? this.STATES.RECOVERED : this.STATES.RECOVERY_FAILED;
    await auditExecutionBatchDao.update(batchId, { 
      state: finalState,
      recovery_result: JSON.stringify(recoveryResult)
    });

    if (recoveryResult.success) {
      await this.addTimelineEvent(batchId, 'recovery_completed', operator, '恢复完成');
      await this.log(batchId, 'info', 'recovery_completed', `批次 ${batch.batch_number} 恢复完成`);
    } else {
      await this.addTimelineEvent(batchId, 'recovery_failed', operator, '恢复失败');
      await this.log(batchId, 'error', 'recovery_failed', `批次 ${batch.batch_number} 恢复失败: ${recoveryResult.error}`);
    }

    return recoveryResult;
  }

  async _performRecovery(batch) {
    try {
      const executions = await executionDao.getByScenarioId(batch.scenario_id);
      const recoveryRecords = [];

      for (const exec of executions) {
        if (exec.status === 'failed') {
          const record = await auditRecoveryRecordDao.create({
            batch_id: batch.id,
            resource_type: 'execution',
            resource_id: exec.id,
            resource_name: `执行记录 ${exec.id}`,
            original_state: { status: exec.status },
            recovered_state: { status: 'pending' },
            recovery_status: 'pending'
          });
          recoveryRecords.push(record);
        }
      }

      return {
        success: true,
        recovery_count: recoveryRecords.length,
        recovery_record_ids: recoveryRecords.map(r => r.id)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async completeBatch(batchId) {
    const batch = await auditExecutionBatchDao.getById(batchId);
    if (!batch) {
      throw new Error('批次不存在');
    }

    await this.validateAndUpdateState(batchId, this.STATES.COMPLETED);
    await auditExecutionBatchDao.update(batchId, { completed_at: new Date().toISOString() });

    await this.addTimelineEvent(batchId, 'batch_completed', batch.operator, '批次已完成');
    await this.log(batchId, 'info', 'batch_completed', `批次 ${batch.batch_number} 已完成`);

    await this.writeLogToFile(batch);

    return { success: true };
  }

  async cancelBatch(batchId, operator) {
    const batch = await auditExecutionBatchDao.getById(batchId);
    if (!batch) {
      throw new Error('批次不存在');
    }

    await this.validateAndUpdateState(batchId, this.STATES.CANCELLED);
    await auditExecutionBatchDao.update(batchId, { completed_at: new Date().toISOString() });

    await this.addTimelineEvent(batchId, 'batch_cancelled', operator, '批次已取消');
    await this.log(batchId, 'info', 'batch_cancelled', `批次 ${batch.batch_number} 已被 ${operator} 取消`);

    return { success: true };
  }

  async getBatchDetails(batchId) {
    const batch = await auditExecutionBatchDao.getById(batchId);
    if (!batch) {
      return null;
    }

    return await this._buildBatchDetails(batch);
  }

  async getBatchDetailsByNumber(batchNumber) {
    const batch = await auditExecutionBatchDao.getByBatchNumber(batchNumber);
    if (!batch) {
      return null;
    }

    return await this._buildBatchDetails(batch);
  }

  async _buildBatchDetails(batch) {
    const logs = await auditLogEntryDao.getByBatchIdOrdered(batch.id);
    const timeline = await auditTimelineDao.getByBatchId(batch.id);
    const conflictDecisions = await auditConflictDecisionDao.getByBatchId(batch.id);
    const recoveryRecords = await auditRecoveryRecordDao.getByBatchId(batch.id);

    return {
      ...batch,
      logs,
      timeline,
      conflict_decisions: conflictDecisions,
      recovery_records: recoveryRecords,
      has_log_file: this.checkLogFileExists(batch.batch_number),
      log_file_missing: !this.checkLogFileExists(batch.batch_number) && batch.state === 'completed'
    };
  }

  async getBatchList(filter = {}) {
    return await auditExecutionBatchDao.getAll(filter);
  }

  async getLogs(batchId) {
    return await auditLogEntryDao.getByBatchIdOrdered(batchId);
  }

  async getTimeline(batchId) {
    return await auditTimelineDao.getByBatchId(batchId);
  }

  async getRecoverySuggestion(batchId) {
    const batch = await auditExecutionBatchDao.getById(batchId);
    if (!batch) {
      throw new Error('批次不存在');
    }

    const suggestions = [];
    
    switch (batch.state) {
      case 'failed':
        suggestions.push('建议执行恢复操作');
        suggestions.push('检查失败原因后重试');
        break;
      case 'pre_check_failed':
        suggestions.push('修复预检查失败项后重新执行');
        break;
      case 'cancelled':
        suggestions.push('可重新创建批次执行');
        break;
      case 'recovering':
        suggestions.push('恢复操作进行中，请等待');
        break;
      case 'recovery_failed':
        suggestions.push('恢复失败，请手动处理');
        break;
      default:
        suggestions.push('当前状态正常');
    }

    return {
      batch_number: batch.batch_number,
      state: batch.state,
      suggestions
    };
  }

  async addTimelineEvent(batchId, eventType, actor, action) {
    const order = await auditTimelineDao.getNextOrder(batchId);
    await auditTimelineDao.create({
      batch_id: batchId,
      event_type: eventType,
      event_order: order,
      actor,
      action
    });
  }

  async log(batchId, level, type, message, context = {}) {
    await auditLogEntryDao.create({
      batch_id: batchId,
      log_level: level,
      log_type: type,
      message,
      operator: context.operator || 'system',
      context: context,
      error_code: context.error_code,
      error_details: context.error_details
    });
  }

  async writeLogToFile(batch) {
    const logs = await auditLogEntryDao.getByBatchIdOrdered(batch.id);
    const logContent = logs.map(log => JSON.stringify(log)).join('\n');
    const logPath = path.join(this.logsDir, `${batch.batch_number}.log`);
    fs.writeFileSync(logPath, logContent, 'utf8');
  }

  checkLogFileExists(batchNumber) {
    const logPath = path.join(this.logsDir, `${batchNumber}.log`);
    return fs.existsSync(logPath);
  }

  async getLogFileContent(batchNumber) {
    const logPath = path.join(this.logsDir, `${batchNumber}.log`);
    if (!fs.existsSync(logPath)) {
      return { 
        exists: false, 
        content: null, 
        error: 'LOG_FILE_MISSING',
        message: '日志文件不存在，可能已被删除或尚未生成'
      };
    }
    try {
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      const parsedLogs = lines.map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return { 
            parse_error: true, 
            line_number: index + 1, 
            raw_content: line,
            message: '日志行解析失败'
          };
        }
      });
      return { 
        exists: true, 
        content: parsedLogs,
        error: null,
        message: '日志文件读取成功'
      };
    } catch (err) {
      return { 
        exists: false, 
        content: null, 
        error: 'LOG_READ_ERROR',
        message: `日志文件读取失败: ${err.message}`
      };
    }
  }

  async regenerateLogFile(batchId) {
    const batch = await auditExecutionBatchDao.getById(batchId);
    if (!batch) {
      throw new Error('批次不存在');
    }

    const logs = await auditLogEntryDao.getByBatchIdOrdered(batchId);
    if (logs.length === 0) {
      return { success: false, message: '数据库中无日志记录可恢复' };
    }

    await this.writeLogToFile(batch);
    return { success: true, message: '日志文件已从数据库恢复', log_count: logs.length };
  }

  async listLogFiles() {
    try {
      const files = fs.readdirSync(this.logsDir);
      return files
        .filter(f => f.endsWith('.log'))
        .map(f => {
          const stats = fs.statSync(path.join(this.logsDir, f));
          return {
            filename: f,
            batch_number: f.replace('.log', ''),
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          };
        })
        .sort((a, b) => b.modified - a.modified);
    } catch (err) {
      return [];
    }
  }
}

module.exports = new AuditExecutionService();