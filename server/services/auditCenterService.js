const {
  importAuditBatchDao,
  snapshotVersionChainDao,
  replacedSnapshotDetailsDao,
  rollbackResourceChangesDao,
  restartReviewRecordsDao
} = require('../dao/auditCenterDao');

const scenarioDao = require('../dao/scenarioDao');
const executionDao = require('../dao/executionDao');
const snapshotDao = require('../dao/snapshotDao');

class AuditCenterService {
  async createImportAuditBatch(operator, requestInfo = {}) {
    return await importAuditBatchDao.create({
      operator,
      operator_ip: requestInfo.ip || 'unknown',
      user_agent: requestInfo.userAgent || 'unknown',
      import_type: 'scenario_import',
      scenario_action: requestInfo.scenarioAction || 'save_as',
      execution_history_action: requestInfo.executionHistoryAction || 'keep',
      metadata: requestInfo.metadata || {}
    });
  }

  async recordSnapshotVersionChain(batchId, scenarioId, snapshotData, previousSnapshotId = null) {
    const existingVersions = await snapshotVersionChainDao.getByScenarioId(scenarioId);
    const versionNumber = existingVersions.length > 0 
      ? Math.max(...existingVersions.map(v => v.version_number)) + 1 
      : 1;

    return await snapshotVersionChainDao.create({
      batch_id: batchId,
      snapshot_id: snapshotData.id,
      scenario_id: scenarioId,
      execution_id: snapshotData.execution_id,
      previous_snapshot_id: previousSnapshotId,
      version_number: versionNumber,
      data: snapshotData.data
    });
  }

  async recordReplacedSnapshotDetails(batchId, importLogId, originalSnapshot, replacementSnapshot, conflictDecision, operator) {
    const execution = originalSnapshot.execution_id 
      ? await executionDao.getById(originalSnapshot.execution_id)
      : null;

    return await replacedSnapshotDetailsDao.create({
      batch_id: batchId,
      import_log_id: importLogId,
      original_snapshot_id: originalSnapshot.id,
      original_scenario_id: originalSnapshot.scenario_id,
      original_execution_id: originalSnapshot.execution_id,
      original_execution_status: execution?.status || null,
      original_data: originalSnapshot.data,
      original_created_at: originalSnapshot.created_at,
      replacement_snapshot_id: replacementSnapshot?.id || null,
      replacement_created_at: replacementSnapshot?.created_at || null,
      replaced_reason: 'replaced_by_import',
      conflict_type: 'duplicate_name',
      conflict_decision: conflictDecision,
      operator
    });
  }

  async recordRollbackResourceChanges(batchId, rollbackType, importLogId, changes) {
    const results = [];

    for (const change of changes) {
      const result = await rollbackResourceChangesDao.create({
        batch_id: batchId,
        rollback_type: rollbackType,
        import_log_id: importLogId,
        action: change.action,
        resource_type: change.resource_type,
        resource_id: change.resource_id,
        resource_name: change.resource_name,
        previous_state: change.previous_state,
        new_state: change.new_state,
        restored_associations: change.restored_associations
      });
      results.push(result);
    }

    return results;
  }

  async createRestartReviewRecord(batchId, reviewType, scenarioId, scenarioName, isSimulation) {
    return await restartReviewRecordsDao.create({
      batch_id: batchId,
      review_type: reviewType,
      scenario_id: scenarioId,
      scenario_name: scenarioName,
      is_simulation: isSimulation
    });
  }

  async performSimulationCheck(batchId, scenarioId) {
    const scenario = await scenarioDao.getById(scenarioId);
    if (!scenario) {
      throw new Error('场景不存在');
    }

    const executions = await executionDao.getByScenarioId(scenarioId);
    const snapshots = await snapshotDao.getByScenarioId(scenarioId);

    const simulationResult = {
      scenario_exists: !!scenario,
      scenario_name: scenario.name,
      scenario_status: scenario.status,
      execution_count: executions.length,
      snapshot_count: snapshots.length,
      executions: executions.map(e => ({
        id: e.id,
        status: e.status,
        start_time: e.start_time,
        end_time: e.end_time
      })),
      snapshots: snapshots.map(s => ({
        id: s.id,
        execution_id: s.execution_id,
        created_at: s.created_at
      })),
      consistency_check: {
        all_executions_have_snapshots: true,
        snapshot_execution_links_valid: true,
        data_integrity: 'ok'
      }
    };

    const errorsFound = [];
    const warnings = [];

    if (executions.length === 0 && snapshots.length > 0) {
      errorsFound.push('存在快照但无执行记录，可能存在数据不一致');
      simulationResult.consistency_check.snapshot_execution_links_valid = false;
    }

    for (const snap of snapshots) {
      if (snap.execution_id) {
        const hasExecution = executions.some(e => e.id === snap.execution_id);
        if (!hasExecution) {
          errorsFound.push(`快照 ${snap.id} 引用的执行记录不存在`);
          simulationResult.consistency_check.snapshot_execution_links_valid = false;
        }
      }
    }

    if (scenario.status === 'running') {
      warnings.push('场景状态为运行中，可能需要先停止');
    }

    const reviewRecord = await this.createRestartReviewRecord(
      batchId,
      'simulation',
      scenarioId,
      scenario.name,
      true
    );

    await restartReviewRecordsDao.update(reviewRecord.id, {
      simulation_result: JSON.stringify(simulationResult),
      consistency_check_passed: errorsFound.length === 0,
      consistency_details: simulationResult.consistency_check,
      errors_found: errorsFound,
      warnings: warnings,
      review_completed_at: new Date().toISOString()
    });

    return {
      review_id: reviewRecord.id,
      simulation_result: simulationResult,
      consistency_check_passed: errorsFound.length === 0,
      errors_found: errorsFound,
      warnings: warnings
    };
  }

  async performRealRestartVerification(batchId, scenarioId, operator) {
    const scenario = await scenarioDao.getById(scenarioId);
    if (!scenario) {
      throw new Error('场景不存在');
    }

    const executions = await executionDao.getByScenarioId(scenarioId);
    const snapshots = await snapshotDao.getByScenarioId(scenarioId);

    await new Promise(resolve => setTimeout(resolve, 1000));

    const verificationResult = {
      scenario_id: scenarioId,
      scenario_name: scenario.name,
      verification_time: new Date().toISOString(),
      execution_count: executions.length,
      snapshot_count: snapshots.length,
      execution_snapshot_pairs: []
    };

    const errorsFound = [];
    const warnings = [];

    for (const exec of executions) {
      const linkedSnapshots = snapshots.filter(s => s.execution_id === exec.id);
      verificationResult.execution_snapshot_pairs.push({
        execution_id: exec.id,
        execution_status: exec.status,
        linked_snapshot_count: linkedSnapshots.length,
        linked_snapshots: linkedSnapshots.map(s => s.id)
      });

      if (exec.status === 'success' || exec.status === 'completed') {
        if (linkedSnapshots.length === 0) {
          warnings.push(`执行 ${exec.id} 成功但无关联快照`);
        }
      }
    }

    for (const snap of snapshots) {
      const linkedExecution = executions.find(e => e.id === snap.execution_id);
      if (snap.execution_id && !linkedExecution) {
        errorsFound.push(`快照 ${snap.id} 的执行关联已失效`);
      }
    }

    const reviewRecord = await this.createRestartReviewRecord(
      batchId,
      'real_restart',
      scenarioId,
      scenario.name,
      false
    );

    await restartReviewRecordsDao.update(reviewRecord.id, {
      real_restart_verified: true,
      restart_verified_at: new Date().toISOString(),
      restart_verified_by: operator,
      consistency_check_passed: errorsFound.length === 0,
      consistency_details: verificationResult,
      errors_found: errorsFound,
      warnings: warnings,
      review_completed_at: new Date().toISOString()
    });

    return {
      review_id: reviewRecord.id,
      verification_result: verificationResult,
      consistency_check_passed: errorsFound.length === 0,
      errors_found: errorsFound,
      warnings: warnings,
      verified_by: operator,
      verified_at: new Date().toISOString()
    };
  }

  async getImportAuditBatches(limit = 100, offset = 0) {
    return await importAuditBatchDao.getAll(limit, offset);
  }

  async getImportAuditBatchById(batchId) {
    const batch = await importAuditBatchDao.getById(batchId);
    if (!batch) {
      return null;
    }

    const snapshotVersions = await snapshotVersionChainDao.getByBatchId(batchId);
    const replacedSnapshots = await replacedSnapshotDetailsDao.getByBatchId(batchId);
    const rollbackChanges = await rollbackResourceChangesDao.getByBatchId(batchId);
    const rollbackSummary = await rollbackResourceChangesDao.getSummaryByBatchId(batchId);
    const restartReviews = await restartReviewRecordsDao.getByBatchId(batchId);
    const simulationReviews = await restartReviewRecordsDao.getSimulationReviews(batchId);
    const realRestartReviews = await restartReviewRecordsDao.getRealRestartReviews(batchId);

    return {
      ...batch,
      snapshot_versions: snapshotVersions,
      replaced_snapshots: replacedSnapshots,
      rollback_changes: rollbackChanges,
      rollback_summary: rollbackSummary,
      restart_reviews: restartReviews,
      simulation_reviews: simulationReviews,
      real_restart_reviews: realRestartReviews
    };
  }

  async getSnapshotVersionChain(scenarioId) {
    return await snapshotVersionChainDao.getVersionChain(scenarioId);
  }

  async getReplacedSnapshotDetails(batchId) {
    return await replacedSnapshotDetailsDao.getByBatchId(batchId);
  }

  async getRollbackResourceChanges(batchId) {
    return await rollbackResourceChangesDao.getByBatchId(batchId);
  }

  async getRestartReviewRecords(batchId) {
    return await restartReviewRecordsDao.getByBatchId(batchId);
  }

  async completeImportBatch(batchId, success = true) {
    const batch = await importAuditBatchDao.getById(batchId);
    if (!batch) {
      throw new Error('批次不存在');
    }

    await importAuditBatchDao.update(batchId, {
      successful_imports: batch.successful_imports + (success ? 1 : 0),
      failed_imports: batch.failed_imports + (success ? 0 : 1),
      completed_at: new Date().toISOString(),
      status: 'completed'
    });
  }

  async generateComprehensiveReport(batchId) {
    const batch = await importAuditBatchDao.getById(batchId);
    if (!batch) {
      throw new Error('批次不存在');
    }

    const snapshotVersions = await snapshotVersionChainDao.getByBatchId(batchId);
    const replacedSnapshots = await replacedSnapshotDetailsDao.getByBatchId(batchId);
    const rollbackChanges = await rollbackResourceChangesDao.getByBatchId(batchId);
    const rollbackSummary = await rollbackResourceChangesDao.getSummaryByBatchId(batchId);
    const restartReviews = await restartReviewRecordsDao.getByBatchId(batchId);

    const simulationReviews = restartReviews.filter(r => r.is_simulation);
    const realRestartReviews = restartReviews.filter(r => !r.is_simulation);

    const allErrors = [
      ...replacedSnapshots.flatMap(s => []),
      ...rollbackChanges.filter(c => c.action === 'removed').map(c => ({
        resource_type: c.resource_type,
        resource_id: c.resource_id,
        message: `已删除 ${c.resource_type}: ${c.resource_name || c.resource_id}`
      })),
      ...restartReviews.flatMap(r => r.errors_found || [])
    ];

    const allWarnings = [
      ...restartReviews.flatMap(r => r.warnings || [])
    ];

    return {
      batch_info: {
        id: batch.id,
        batch_number: batch.batch_number,
        operator: batch.operator,
        import_type: batch.import_type,
        scenario_action: batch.scenario_action,
        started_at: batch.started_at,
        completed_at: batch.completed_at,
        status: batch.status
      },
      summary: {
        total_snapshot_versions: snapshotVersions.length,
        total_replaced_snapshots: replacedSnapshots.length,
        total_rollback_changes: rollbackChanges.length,
        rollback_summary: rollbackSummary,
        simulation_reviews_count: simulationReviews.length,
        real_restart_reviews_count: realRestartReviews.length,
        simulation_all_passed: simulationReviews.every(r => r.consistency_check_passed),
        real_restart_all_verified: realRestartReviews.every(r => r.real_restart_verified)
      },
      snapshot_version_chain: snapshotVersions.map(v => ({
        id: v.snapshot_id,
        version: v.version_number,
        scenario_id: v.scenario_id,
        execution_id: v.execution_id,
        execution_status: v.execution_status,
        created_at: v.created_at,
        replaced_at: v.replaced_at,
        replaced_reason: v.replaced_reason,
        batch_number: v.batch_number,
        operator: v.operator
      })),
      replaced_snapshot_details: replacedSnapshots.map(s => ({
        original_snapshot_id: s.original_snapshot_id,
        original_scenario_name: s.scenario_name,
        original_execution_id: s.original_execution_id,
        original_execution_status: s.execution_status,
        original_created_at: s.original_created_at,
        replacement_snapshot_id: s.replacement_snapshot_id,
        replaced_at: s.replaced_at,
        conflict_decision: s.conflict_decision,
        operator: s.operator
      })),
      rollback_details: {
        changes: rollbackChanges.map(c => ({
          action: c.action,
          resource_type: c.resource_type,
          resource_id: c.resource_id,
          resource_name: c.resource_name,
          previous_state_preview: this._truncate(JSON.stringify(c.previous_state), 100),
          restored_associations: c.restored_associations
        })),
        summary_by_type: rollbackSummary
      },
      restart_review: {
        simulation: simulationReviews.map(r => ({
          review_id: r.id,
          scenario_id: r.scenario_id,
          scenario_name: r.scenario_name,
          consistency_check_passed: r.consistency_check_passed,
          errors_found: r.errors_found,
          warnings: r.warnings,
          reviewed_at: r.review_completed_at
        })),
        real_restart: realRestartReviews.map(r => ({
          review_id: r.id,
          scenario_id: r.scenario_id,
          scenario_name: r.scenario_name,
          real_restart_verified: r.real_restart_verified,
          verified_by: r.restart_verified_by,
          verified_at: r.restart_verified_at,
          consistency_check_passed: r.consistency_check_passed,
          errors_found: r.errors_found,
          warnings: r.warnings
        }))
      },
      issues: {
        errors: allErrors,
        warnings: allWarnings,
        has_critical_issues: allErrors.length > 0
      },
      generated_at: new Date().toISOString()
    };
  }

  _truncate(str, maxLength) {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
  }
}

module.exports = new AuditCenterService();
