const config = require('../config');
const {
  forensicsBatchDao,
  forensicsOperationDao,
  forensicsTimelineDao,
  forensicsReplacedSnapshotDao,
  forensicsRecoveryRecordDao
} = require('../dao/forensicsWorkbenchDao');

const scenarioDao = require('../dao/scenarioDao');
const executionDao = require('../dao/executionDao');
const snapshotDao = require('../dao/snapshotDao');
const failureInjectionDao = require('../dao/failureInjectionDao');

const scenarioPackageService = require('./scenarioPackageService');
const forensicsLogger = require('./forensicsLogger');

let dynamicSimulateMode = null;

class ForensicsWorkbenchService {
  async initializeBatch(operator, requestInfo, options = {}) {
    const mode = options.mode || this.getEffectiveMode();
    
    if (options.original_scenario_id) {
      const duplicateCheck = await this.checkDuplicateSubmission(options.original_scenario_id, options.conflict_decision);
      if (duplicateCheck.isDuplicate) {
        throw new Error(`重复提交检测: 已存在相同场景的活跃批次 ${duplicateCheck.existingBatch.batch_number}`);
      }
    }
    
    const batch = await forensicsBatchDao.create({
      operator,
      operator_ip: requestInfo.ip || 'unknown',
      user_agent: requestInfo.userAgent || 'unknown',
      mode,
      scenario_id: options.scenario_id,
      scenario_name: options.scenario_name,
      original_scenario_id: options.original_scenario_id,
      original_snapshot_id: options.original_snapshot_id,
      original_execution_id: options.original_execution_id,
      conflict_decision: options.conflict_decision,
      metadata: options.metadata || {}
    });

    forensicsLogger.info(batch.batch_number, 'Batch initialized', {
      batch_id: batch.id,
      operator,
      mode,
      original_scenario_id: options.original_scenario_id,
      conflict_decision: options.conflict_decision
    });

    await this.recordTimelineEvent(batch.id, 'batch_initialized', {
      mode,
      operator,
      options
    });

    await forensicsBatchDao.update(batch.id, { state: 'pre_check' });
    forensicsLogger.logStateChange(batch.batch_number, 'pending', 'pre_check', 'Initialization complete');

    return batch;
  }

  async checkDuplicateSubmission(scenarioId, conflictDecision) {
    const activeBatches = await forensicsBatchDao.getPendingBatches();
    const duplicate = activeBatches.find(b => 
      b.original_scenario_id === scenarioId && 
      b.conflict_decision === conflictDecision &&
      !['completed', 'cancelled', 'failed'].includes(b.state)
    );

    return {
      isDuplicate: !!duplicate,
      existingBatch: duplicate
    };
  }

  async checkBatchReplay(batchNumber) {
    const batch = await forensicsBatchDao.getByBatchNumber(batchNumber);
    if (!batch) {
      return { canReplay: false, reason: '批次不存在' };
    }

    if (batch.state === 'completed') {
      return { 
        canReplay: false, 
        reason: '批次已完成，不能重放',
        suggestion: '如需重新执行，请创建新批次'
      };
    }

    if (batch.state === 'cancelled') {
      return { 
        canReplay: false, 
        reason: '批次已取消',
        suggestion: '如需重新执行，请创建新批次'
      };
    }

    return { canReplay: true, batch };
  }

  getEffectiveMode() {
    if (dynamicSimulateMode !== null) {
      return dynamicSimulateMode ? 'simulate' : 'real';
    }
    return config.forensicsWorkbench.simulateMode ? 'simulate' : 'real';
  }

  setMode(simulate) {
    dynamicSimulateMode = simulate;
    forensicsLogger.info('SYSTEM', 'Mode changed', {
      new_mode: simulate ? 'simulate' : 'real'
    });
    return { 
      mode: this.getEffectiveMode(),
      message: `模式已切换为: ${simulate ? '仅预检' : '真实执行'}`
    };
  }

  async performPreCheck(batchId) {
    const batch = await forensicsBatchDao.getById(batchId);
    if (!batch) {
      throw new Error(`批次 ${batchId} 不存在`);
    }

    forensicsLogger.info(batch.batch_number, 'Starting pre-check');

    const errors = [];
    const warnings = [];

    if (batch.original_scenario_id) {
      const originalScenario = await scenarioDao.getById(batch.original_scenario_id);
      if (!originalScenario) {
        errors.push({
          code: config.errorCodes.MISSING_SNAPSHOT,
          message: `原始场景 ${batch.original_scenario_id} 不存在`,
          type: 'error'
        });
        forensicsLogger.warn(batch.batch_number, 'Original scenario not found', {
          scenario_id: batch.original_scenario_id
        });
      } else {
        const executions = await executionDao.getByScenarioId(batch.original_scenario_id);
        const snapshots = await snapshotDao.getByScenarioId(batch.original_scenario_id);

        if (executions.length === 0 && snapshots.length > 0) {
          warnings.push({
            code: 'FWB_W001',
            message: '存在快照但无执行记录，可能存在数据不一致',
            type: 'warning'
          });
          forensicsLogger.warn(batch.batch_number, 'Snapshots without executions detected');
        }

        for (const snap of snapshots) {
          if (snap.execution_id) {
            const hasExecution = executions.some(e => e.id === snap.execution_id);
            if (!hasExecution) {
              errors.push({
                code: config.errorCodes.MISSING_SNAPSHOT,
                message: `快照 ${snap.id} 引用的执行记录不存在`,
                type: 'error'
              });
            }
          }
        }
      }
    }

    if (batch.conflict_decision === 'replace') {
      const existingBatch = await forensicsBatchDao.getAll(1, 0, {
        scenario_id: batch.original_scenario_id,
        state: 'completed'
      });

      if (existingBatch.length > 0) {
        warnings.push({
          code: config.errorCodes.DUPLICATE_IMPORT,
          message: '该场景已存在完成的替换批次',
          type: 'warning'
        });
        forensicsLogger.warn(batch.batch_number, 'Duplicate import detected', {
          existing_batch: existingBatch[0].batch_number
        });
      }
    }

    await this.recordTimelineEvent(batchId, 'pre_check_completed', {
      errors,
      warnings,
      passed: errors.length === 0
    });

    const newState = errors.length === 0 ? 'pre_check_passed' : 'pre_check_failed';
    await forensicsBatchDao.update(batchId, { state: newState });
    forensicsLogger.logStateChange(batch.batch_number, batch.state, newState, 
      errors.length === 0 ? 'Pre-check passed' : 'Pre-check failed');

    if (errors.length > 0) {
      await forensicsBatchDao.update(batchId, {
        error_code: config.errorCodes.PRE_CHECK_FAILED,
        error_message: errors.map(e => e.message).join('; ')
      });
      forensicsLogger.logError(batch.batch_number, config.errorCodes.PRE_CHECK_FAILED, 
        errors.map(e => e.message).join('; '));
    }

    return {
      batch_id: batchId,
      batch_number: batch.batch_number,
      passed: errors.length === 0,
      errors,
      warnings
    };
  }

  async executeReplaceImport(batchId, packageData, decisions) {
    const batch = await forensicsBatchDao.getById(batchId);
    if (!batch) {
      throw new Error(`批次 ${batchId} 不存在`);
    }

    if (batch.state !== 'pre_check_passed' && batch.state !== 'rollback_confirm') {
      throw new Error(`批次状态 ${batch.state} 不允许执行替换导入`);
    }

    forensicsLogger.info(batch.batch_number, 'Starting replace import', {
      decisions,
      has_package_data: !!packageData
    });

    if (batch.mode === 'simulate') {
      forensicsLogger.info(batch.batch_number, 'Simulate mode: skipping actual import');
      await this.recordTimelineEvent(batchId, 'replace_import_simulated', {
        package_data_summary: {
          scenario_name: packageData.scenario?.name,
          has_execution_history: !!packageData.execution_history_summary?.length
        },
        decisions
      });

      await forensicsBatchDao.update(batchId, {
        state: 'rollback_confirm',
        replacement_scenario_id: 'simulated_scenario_id',
        replacement_snapshot_id: 'simulated_snapshot_id'
      });
      forensicsLogger.logStateChange(batch.batch_number, batch.state, 'rollback_confirm', 'Simulated import');

      return {
        simulated: true,
        batch_id: batchId,
        message: '模拟模式：替换导入已跳过'
      };
    }

    const importResult = await scenarioPackageService.importScenario(packageData, {
      ...decisions,
      scenario_action: batch.conflict_decision || decisions.scenario_action
    });

    const operation = await forensicsOperationDao.create({
      batch_id: batchId,
      operation_type: config.operationTypes.REPLACE_IMPORT,
      operation_order: await forensicsOperationDao.getLatestOperationOrder(batchId) + 1,
      operator: batch.operator,
      previous_state: null,
      new_state: {
        scenario_id: importResult.new_scenario_id,
        scenario_name: importResult.new_scenario_name
      },
      details: {
        import_result: importResult.traceability,
        decisions
      }
    });

    forensicsLogger.logOperation(batch.batch_number, {
      id: operation.id,
      type: config.operationTypes.REPLACE_IMPORT,
      previous_state: null,
      new_state: {
        scenario_id: importResult.new_scenario_id,
        scenario_name: importResult.new_scenario_name
      }
    });

    await forensicsBatchDao.update(batchId, {
      state: 'rollback_confirm',
      scenario_id: importResult.new_scenario_id,
      scenario_name: importResult.new_scenario_name,
      replacement_scenario_id: importResult.new_scenario_id
    });
    forensicsLogger.logStateChange(batch.batch_number, batch.state, 'rollback_confirm', 'Import completed');

    if (batch.original_snapshot_id && importResult.traceability?.restored_snapshot_id) {
      await forensicsReplacedSnapshotDao.create({
        batch_id: batchId,
        operation_id: operation.id,
        original_snapshot_id: batch.original_snapshot_id,
        original_scenario_id: batch.original_scenario_id,
        original_execution_id: batch.original_execution_id,
        replaced_by_snapshot_id: importResult.traceability.restored_snapshot_id,
        replaced_by_scenario_id: importResult.new_scenario_id,
        replaced_reason: 'replaced_by_forensics_workbench',
        conflict_type: 'duplicate_name',
        conflict_decision: batch.conflict_decision,
        operator: batch.operator
      });
    }

    await this.recordTimelineEvent(batchId, 'replace_import_completed', {
      operation_id: operation.id,
      new_scenario_id: importResult.new_scenario_id,
      traceability: importResult.traceability
    });

    return {
      simulated: false,
      batch_id: batchId,
      scenario_id: importResult.new_scenario_id,
      scenario_name: importResult.new_scenario_name,
      traceability: importResult.traceability
    };
  }

  async executeRollback(batchId, confirm = false) {
    const batch = await forensicsBatchDao.getById(batchId);
    if (!batch) {
      throw new Error(`批次 ${batchId} 不存在`);
    }

    if (batch.state !== 'rollback_confirm') {
      throw new Error(`批次状态 ${batch.state} 不允许执行回滚`);
    }

    if (!confirm && config.forensicsWorkbench.requireConfirmation) {
      return {
        requires_confirmation: true,
        batch_id: batchId,
        message: '需要明确确认才能执行真实回滚'
      };
    }

    forensicsLogger.info(batch.batch_number, 'Starting rollback', { confirmed: confirm });

    if (batch.mode === 'simulate') {
      forensicsLogger.info(batch.batch_number, 'Simulate mode: skipping actual rollback');
      await this.recordTimelineEvent(batchId, 'rollback_simulated', {
        batch_state: batch.state
      });

      await forensicsBatchDao.update(batchId, { state: 'restart_review' });
      forensicsLogger.logStateChange(batch.batch_number, batch.state, 'restart_review', 'Simulated rollback');

      return {
        simulated: true,
        batch_id: batchId,
        message: '模拟模式：回滚已跳过'
      };
    }

    const rollbackResult = await scenarioPackageService.rollbackLastImport();

    const operation = await forensicsOperationDao.create({
      batch_id: batchId,
      operation_type: config.operationTypes.ROLLBACK,
      operation_order: await forensicsOperationDao.getLatestOperationOrder(batchId) + 1,
      operator: batch.operator,
      previous_state: {
        scenario_id: batch.replacement_scenario_id
      },
      new_state: {
        scenario_id: rollbackResult.restored_scenario_id,
        scenario_name: rollbackResult.restored_scenario_name
      },
      details: rollbackResult
    });

    forensicsLogger.logOperation(batch.batch_number, {
      id: operation.id,
      type: config.operationTypes.ROLLBACK,
      previous_state: { scenario_id: batch.replacement_scenario_id },
      new_state: {
        scenario_id: rollbackResult.restored_scenario_id,
        scenario_name: rollbackResult.restored_scenario_name
      }
    });

    await forensicsBatchDao.update(batchId, {
      state: 'rollback_executing',
      rollback_execution_id: operation.id
    });

    if (rollbackResult.restored_scenario_id) {
      await forensicsRecoveryRecordDao.create({
        batch_id: batchId,
        recovery_type: 'rollback_restore',
        original_resource_type: 'scenario',
        original_resource_id: rollbackResult.restored_scenario_id,
        original_resource_name: rollbackResult.restored_scenario_name,
        recovery_state: 'restored',
        recovery_data: {
          restored_from_archive: rollbackResult.restored_from_archive,
          execution_count: rollbackResult.cleaned_resources?.restored_execution_count,
          snapshot_count: rollbackResult.cleaned_resources?.restored_snapshot_count
        }
      });
      forensicsLogger.logRecovery(batch.batch_number, {
        id: 'recovery',
        recovery_type: 'rollback_restore',
        original_resource_type: 'scenario',
        original_resource_id: rollbackResult.restored_scenario_id,
        original_resource_name: rollbackResult.restored_scenario_name,
        recovery_state: 'restored'
      });
    }

    await forensicsBatchDao.update(batchId, {
      state: 'rollback_completed',
      scenario_id: rollbackResult.restored_scenario_id,
      scenario_name: rollbackResult.restored_scenario_name
    });
    forensicsLogger.logStateChange(batch.batch_number, 'rollback_executing', 'rollback_completed', 'Rollback completed');

    await this.recordTimelineEvent(batchId, 'rollback_completed', {
      operation_id: operation.id,
      rollback_result: {
        restored_scenario_id: rollbackResult.restored_scenario_id,
        restored_from_archive: rollbackResult.restored_from_archive
      }
    });

    return {
      simulated: false,
      batch_id: batchId,
      rollback_execution_id: operation.id,
      restored_scenario_id: rollbackResult.restored_scenario_id,
      restored_scenario_name: rollbackResult.restored_scenario_name,
      restored_from_archive: rollbackResult.restored_from_archive,
      traceability: rollbackResult.traceability
    };
  }

  async performRestartReview(batchId, options = {}) {
    const batch = await forensicsBatchDao.getById(batchId);
    if (!batch) {
      throw new Error(`批次 ${batchId} 不存在`);
    }

    const validStates = ['rollback_confirm', 'rollback_completed', 'restart_review'];
    if (!validStates.includes(batch.state)) {
      throw new Error(`批次状态 ${batch.state} 不允许执行重启复查`);
    }

    forensicsLogger.info(batch.batch_number, 'Starting restart review', { is_simulation: options.is_simulation });

    const isSimulation = options.is_simulation !== false;
    const scenarioId = batch.scenario_id || batch.original_scenario_id;

    const scenario = await scenarioDao.getById(scenarioId);
    const executions = await executionDao.getByScenarioId(scenarioId);
    const snapshots = await snapshotDao.getByScenarioId(scenarioId);

    const verificationResult = {
      scenario_exists: !!scenario,
      scenario_name: scenario?.name,
      scenario_status: scenario?.status,
      execution_count: executions.length,
      snapshot_count: snapshots.length,
      is_simulation: isSimulation,
      verified_at: new Date().toISOString()
    };

    const errors = [];
    const warnings = [];

    for (const snap of snapshots) {
      if (snap.execution_id) {
        const linkedExecution = executions.find(e => e.id === snap.execution_id);
        if (!linkedExecution) {
          errors.push({
            code: config.errorCodes.CROSS_RESTART_FAILED,
            message: `快照 ${snap.id} 的执行关联已失效`,
            type: 'error'
          });
        }
      }
    }

    for (const exec of executions) {
      if (exec.status === 'success' || exec.status === 'completed') {
        const linkedSnapshots = snapshots.filter(s => s.execution_id === exec.id);
        if (linkedSnapshots.length === 0) {
          warnings.push({
            code: 'FWB_W002',
            message: `执行 ${exec.id} 成功但无关联快照`,
            type: 'warning'
          });
        }
      }
    }

    const operation = await forensicsOperationDao.create({
      batch_id: batchId,
      operation_type: config.operationTypes.RESTART_CHECK,
      operation_order: await forensicsOperationDao.getLatestOperationOrder(batchId) + 1,
      operator: batch.operator,
      previous_state: { scenario_status: scenario?.status },
      new_state: {
        verification_result: verificationResult,
        consistency_check_passed: errors.length === 0
      },
      details: {
        is_simulation: isSimulation,
        errors: errors,
        warnings: warnings,
        executions: executions,
        snapshots: snapshots
      }
    });

    forensicsLogger.logOperation(batch.batch_number, {
      id: operation.id,
      type: config.operationTypes.RESTART_CHECK,
      previous_state: { scenario_status: scenario?.status },
      new_state: {
        verification_result: verificationResult,
        consistency_check_passed: errors.length === 0
      }
    });

    await forensicsBatchDao.update(batchId, {
      state: 'restart_review',
      restart_review_id: operation.id
    });

    await this.recordTimelineEvent(batchId, isSimulation ? 'restart_simulation_completed' : 'restart_verification_completed', {
      operation_id: operation.id,
      is_simulation: isSimulation,
      errors_count: errors.length,
      warnings_count: warnings.length,
      verification_result: verificationResult
    });

    if (!isSimulation) {
      await forensicsBatchDao.update(batchId, {
        state: 'restart_verified'
      });
      forensicsLogger.logStateChange(batch.batch_number, 'restart_review', 'restart_verified', 'Real restart verified');
    }

    return {
      batch_id: batchId,
      operation_id: operation.id,
      is_simulation: isSimulation,
      verification_result: verificationResult,
      consistency_check_passed: errors.length === 0,
      errors,
      warnings
    };
  }

  async resumeBatch(batchId) {
    const batch = await forensicsBatchDao.getById(batchId);
    if (!batch) {
      throw new Error(`批次 ${batchId} 不存在`);
    }

    forensicsLogger.info(batch.batch_number, 'Attempting to resume batch', { current_state: batch.state });

    const suggestions = {
      'pre_check_failed': {
        suggestion: '预检查失败，请检查错误信息后重新执行预检查或取消批次',
        can_resume: true,
        next_action: 'pre_check'
      },
      'failed': {
        suggestion: '批次执行失败，请检查错误信息后手动干预或取消批次',
        can_resume: false,
        next_action: null
      },
      'pending': {
        suggestion: '批次待处理，请执行预检查',
        can_resume: true,
        next_action: 'pre_check'
      },
      'pre_check': {
        suggestion: '批次正在预检查中，请执行预检查',
        can_resume: true,
        next_action: 'pre_check'
      }
    };

    const result = suggestions[batch.state] || {
      suggestion: `当前状态 ${batch.state} 无需恢复`,
      can_resume: false,
      next_action: null
    };

    await this.recordTimelineEvent(batchId, 'resume_attempt', {
      current_state: batch.state,
      suggestion: result.suggestion
    });

    forensicsLogger.info(batch.batch_number, 'Resume suggestion', result);

    return {
      batch_id: batchId,
      current_state: batch.state,
      ...result
    };
  }

  async reImportAfterRollback(batchId, packageData, decisions) {
    const batch = await forensicsBatchDao.getById(batchId);
    if (!batch) {
      throw new Error(`批次 ${batchId} 不存在`);
    }

    const validStates = ['restart_review', 'restart_verified', 'rollback_completed'];
    if (!validStates.includes(batch.state)) {
      throw new Error(`批次状态 ${batch.state} 不允许重新导入`);
    }

    forensicsLogger.info(batch.batch_number, 'Starting re-import after rollback');

    if (batch.mode === 'simulate') {
      forensicsLogger.info(batch.batch_number, 'Simulate mode: skipping re-import');

      await this.recordTimelineEvent(batchId, 're_import_simulated', {
        package_data_summary: {
          scenario_name: packageData.scenario?.name
        }
      });

      await forensicsBatchDao.update(batchId, {
        state: 'restart_review',
        replacement_scenario_id: 'simulated_scenario_id'
      });

      return {
        simulated: true,
        batch_id: batchId,
        message: '模拟模式：重新导入已跳过'
      };
    }

    const importResult = await scenarioPackageService.importScenario(packageData, {
      ...decisions,
      scenario_action: decisions.scenario_action || 'save_as'
    });

    const operation = await forensicsOperationDao.create({
      batch_id: batchId,
      operation_type: config.operationTypes.RE_IMPORT,
      operation_order: await forensicsOperationDao.getLatestOperationOrder(batchId) + 1,
      operator: batch.operator,
      previous_state: {
        scenario_id: batch.scenario_id
      },
      new_state: {
        scenario_id: importResult.new_scenario_id,
        scenario_name: importResult.new_scenario_name
      },
      details: importResult.traceability
    });

    forensicsLogger.logOperation(batch.batch_number, {
      id: operation.id,
      type: config.operationTypes.RE_IMPORT,
      previous_state: { scenario_id: batch.scenario_id },
      new_state: {
        scenario_id: importResult.new_scenario_id,
        scenario_name: importResult.new_scenario_name
      }
    });

    await forensicsBatchDao.update(batchId, {
      state: 'restart_review',
      scenario_id: importResult.new_scenario_id,
      scenario_name: importResult.new_scenario_name,
      replacement_scenario_id: importResult.new_scenario_id
    });

    await this.recordTimelineEvent(batchId, 're_import_completed', {
      operation_id: operation.id,
      new_scenario_id: importResult.new_scenario_id
    });

    return {
      simulated: false,
      batch_id: batchId,
      scenario_id: importResult.new_scenario_id,
      scenario_name: importResult.new_scenario_name,
      traceability: importResult.traceability
    };
  }

  async recordTimelineEvent(batchId, eventType, eventData) {
    const batch = await forensicsBatchDao.getById(batchId);
    const eventOrder = await forensicsTimelineDao.getLatestEventOrder(batchId) + 1;
    const isCritical = ['replace_import_completed', 'rollback_completed', 'restart_verification_completed'].includes(eventType);

    const event = await forensicsTimelineDao.create({
      batch_id: batchId,
      event_type: eventType,
      event_order: eventOrder,
      actor: 'system',
      source_module: 'forensics_workbench',
      event_data: eventData,
      is_critical: isCritical
    });

    if (batch) {
      forensicsLogger.logTimelineEvent(batch.batch_number, {
        id: event.id,
        event_type: eventType,
        is_critical: isCritical,
        event_data: eventData
      });
    }

    return event;
  }

  async getBatchDetails(batchId) {
    const batch = await forensicsBatchDao.getById(batchId);
    if (!batch) {
      return null;
    }

    const operations = await forensicsOperationDao.getByBatchId(batchId);
    const timeline = await forensicsTimelineDao.getByBatchId(batchId);
    const replacedSnapshots = await forensicsReplacedSnapshotDao.getByBatchId(batchId);
    const recoveryRecords = await forensicsRecoveryRecordDao.getByBatchId(batchId);
    const criticalEvents = await forensicsTimelineDao.getCriticalEvents(batchId);

    const logExists = forensicsLogger.checkLogExists(batch.batch_number);
    const logStats = logExists ? forensicsLogger.getLogStats(batch.batch_number) : null;

    return {
      ...batch,
      operations,
      timeline,
      replaced_snapshots: replacedSnapshots,
      recovery_records: recoveryRecords,
      critical_events: criticalEvents,
      log_info: {
        exists: logExists,
        stats: logStats
      },
      summary: {
        total_operations: operations.length,
        total_timeline_events: timeline.length,
        replaced_snapshots_count: replacedSnapshots.length,
        recovery_records_count: recoveryRecords.length,
        critical_events_count: criticalEvents.length
      }
    };
  }

  async getBatchTimeline(batchId) {
    const timeline = await forensicsTimelineDao.getByBatchId(batchId);
    return timeline.map(event => ({
      id: event.id,
      event_type: event.event_type,
      event_order: event.event_order,
      timestamp: event.timestamp,
      actor: event.actor,
      source_module: event.source_module,
      event_data: event.event_data,
      is_critical: event.is_critical
    }));
  }

  async getBatchLog(batchId) {
    const batch = await forensicsBatchDao.getById(batchId);
    if (!batch) {
      throw new Error(`批次 ${batchId} 不存在`);
    }

    const logContent = forensicsLogger.readBatchLog(batch.batch_number);
    
    if (!logContent) {
      return {
        batch_id: batchId,
        batch_number: batch.batch_number,
        log_content: null,
        message: '日志文件不存在或已被清理'
      };
    }

    return {
      batch_id: batchId,
      batch_number: batch.batch_number,
      log_content: logContent,
      log_path: forensicsLogger.getBatchLogPath(batch.batch_number)
    };
  }

  async getBatchesByBatchNumber(batchNumber) {
    const batch = await forensicsBatchDao.getByBatchNumber(batchNumber);
    if (!batch) {
      return null;
    }
    return await this.getBatchDetails(batch.id);
  }

  async listBatches(filters = {}) {
    const batches = await forensicsBatchDao.getAll(filters.limit || 100, filters.offset || 0, filters);
    const detailedBatches = [];

    for (const batch of batches) {
      const details = await this.getBatchDetails(batch.id);
      detailedBatches.push(details);
    }

    return detailedBatches;
  }

  async verifyRecovery(batchId, recoveryRecordId, verificationNotes, verifiedBy) {
    const record = await forensicsRecoveryRecordDao.getByBatchId(batchId);
    const targetRecord = record.find(r => r.id === recoveryRecordId);

    if (!targetRecord) {
      throw new Error(`恢复记录 ${recoveryRecordId} 不存在`);
    }

    const batch = await forensicsBatchDao.getById(batchId);
    
    await forensicsRecoveryRecordDao.update(recoveryRecordId, {
      verified: true,
      verified_by: verifiedBy,
      verified_at: new Date().toISOString(),
      verification_notes: verificationNotes
    });

    if (batch) {
      forensicsLogger.info(batch.batch_number, 'Recovery verified', {
        recovery_record_id: recoveryRecordId,
        verified_by: verifiedBy
      });
    }

    await this.recordTimelineEvent(batchId, 'recovery_verified', {
      recovery_record_id: recoveryRecordId,
      verified_by: verifiedBy
    });

    return {
      recovery_record_id: recoveryRecordId,
      verified: true,
      verified_by: verifiedBy,
      verified_at: new Date().toISOString()
    };
  }

  async completeBatch(batchId) {
    const batch = await forensicsBatchDao.getById(batchId);
    if (!batch) {
      throw new Error(`批次 ${batchId} 不存在`);
    }

    await forensicsBatchDao.update(batchId, {
      state: 'completed',
      completed_at: new Date().toISOString()
    });

    forensicsLogger.info(batch.batch_number, 'Batch completed', {
      completed_at: new Date().toISOString()
    });

    await this.recordTimelineEvent(batchId, 'batch_completed', {
      completed_at: new Date().toISOString()
    });

    return {
      batch_id: batchId,
      state: 'completed',
      completed_at: new Date().toISOString()
    };
  }

  async cancelBatch(batchId, reason) {
    const batch = await forensicsBatchDao.getById(batchId);
    if (!batch) {
      throw new Error(`批次 ${batchId} 不存在`);
    }

    await forensicsBatchDao.update(batchId, {
      state: 'cancelled',
      error_message: reason,
      completed_at: new Date().toISOString()
    });

    forensicsLogger.warn(batch.batch_number, 'Batch cancelled', { reason });

    await this.recordTimelineEvent(batchId, 'batch_cancelled', {
      reason
    });

    return {
      batch_id: batchId,
      state: 'cancelled',
      reason
    };
  }

  async handleMissingSnapshotScenario(batchId, options = {}) {
    const batch = await forensicsBatchDao.getById(batchId);
    if (!batch) {
      throw new Error(`批次 ${batchId} 不存在`);
    }

    await forensicsBatchDao.update(batchId, {
      error_code: config.errorCodes.MISSING_SNAPSHOT,
      error_message: `场景 ${batch.original_scenario_id} 缺少旧快照`,
      state: 'failed'
    });

    forensicsLogger.logError(batch.batch_number, config.errorCodes.MISSING_SNAPSHOT, 
      `场景 ${batch.original_scenario_id} 缺少旧快照`);

    await this.recordTimelineEvent(batchId, 'missing_snapshot_detected', {
      original_scenario_id: batch.original_scenario_id,
      options
    });

    return {
      batch_id: batchId,
      error_code: config.errorCodes.MISSING_SNAPSHOT,
      message: `场景 ${batch.original_scenario_id} 缺少旧快照`,
      action_required: 'manual_intervention'
    };
  }

  getConfig() {
    return {
      enabled: config.forensicsWorkbench.enabled,
      simulateMode: this.getEffectiveMode(),
      requireConfirmation: config.forensicsWorkbench.requireConfirmation,
      logLevel: config.forensicsWorkbench.logLevel,
      batchPrefix: config.forensicsWorkbench.batchPrefix
    };
  }

  isSimulateMode() {
    return this.getEffectiveMode() === 'simulate';
  }

  listLogFiles() {
    return forensicsLogger.listBatchLogs();
  }
}

module.exports = new ForensicsWorkbenchService();
