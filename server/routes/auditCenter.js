const express = require('express');
const router = express.Router();
const auditCenterService = require('../services/auditCenterService');

router.post('/batches', async (req, res) => {
  try {
    const operator = req.body.operator || req.headers['x-operator'] || 'anonymous';
    const requestInfo = {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      scenarioAction: req.body.scenario_action,
      executionHistoryAction: req.body.execution_history_action,
      metadata: req.body.metadata
    };

    const batch = await auditCenterService.createImportAuditBatch(operator, requestInfo);

    res.status(201).json({
      success: true,
      batch: batch
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/batches', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const batches = await auditCenterService.getImportAuditBatches(limit, offset);

    res.json({
      success: true,
      batches: batches,
      pagination: {
        limit: limit,
        offset: offset,
        count: batches.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/batches/:batchId', async (req, res) => {
  try {
    const batch = await auditCenterService.getImportAuditBatchById(req.params.batchId);

    if (!batch) {
      return res.status(404).json({ error: '批次不存在' });
    }

    res.json({
      success: true,
      batch: batch
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/batches/:batchId/report', async (req, res) => {
  try {
    const report = await auditCenterService.generateComprehensiveReport(req.params.batchId);

    res.json({
      success: true,
      report: report
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/snapshot-versions/:scenarioId', async (req, res) => {
  try {
    const versions = await auditCenterService.getSnapshotVersionChain(req.params.scenarioId);

    res.json({
      success: true,
      scenario_id: req.params.scenarioId,
      versions: versions,
      count: versions.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/replaced-snapshots/:batchId', async (req, res) => {
  try {
    const details = await auditCenterService.getReplacedSnapshotDetails(req.params.batchId);

    res.json({
      success: true,
      batch_id: req.params.batchId,
      details: details,
      count: details.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/rollback-changes/:batchId', async (req, res) => {
  try {
    const changes = await auditCenterService.getRollbackResourceChanges(req.params.batchId);

    res.json({
      success: true,
      batch_id: req.params.batchId,
      changes: changes,
      count: changes.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/restart-reviews/:batchId', async (req, res) => {
  try {
    const reviews = await auditCenterService.getRestartReviewRecords(req.params.batchId);

    const simulationReviews = reviews.filter(r => r.is_simulation);
    const realRestartReviews = reviews.filter(r => !r.is_simulation);

    res.json({
      success: true,
      batch_id: req.params.batchId,
      reviews: reviews,
      simulation_reviews: simulationReviews,
      real_restart_reviews: realRestartReviews,
      counts: {
        total: reviews.length,
        simulation: simulationReviews.length,
        real_restart: realRestartReviews.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/restart-reviews/:batchId/simulation/:scenarioId', async (req, res) => {
  try {
    const result = await auditCenterService.performSimulationCheck(
      req.params.batchId,
      req.params.scenarioId
    );

    res.json({
      success: true,
      review_id: result.review_id,
      simulation_result: result.simulation_result,
      consistency_check_passed: result.consistency_check_passed,
      errors_found: result.errors_found,
      warnings: result.warnings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/restart-reviews/:batchId/real-restart/:scenarioId', async (req, res) => {
  try {
    const operator = req.body.operator || req.headers['x-operator'] || 'anonymous';

    const result = await auditCenterService.performRealRestartVerification(
      req.params.batchId,
      req.params.scenarioId,
      operator
    );

    res.json({
      success: true,
      review_id: result.review_id,
      verification_result: result.verification_result,
      consistency_check_passed: result.consistency_check_passed,
      errors_found: result.errors_found,
      warnings: result.warnings,
      verified_by: result.verified_by,
      verified_at: result.verified_at
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/record-snapshot-version', async (req, res) => {
  try {
    const { batch_id, scenario_id, snapshot_data, previous_snapshot_id } = req.body;

    if (!batch_id || !scenario_id || !snapshot_data) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const record = await auditCenterService.recordSnapshotVersionChain(
      batch_id,
      scenario_id,
      snapshot_data,
      previous_snapshot_id
    );

    res.status(201).json({
      success: true,
      record: record
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/record-replaced-snapshot', async (req, res) => {
  try {
    const {
      batch_id,
      import_log_id,
      original_snapshot,
      replacement_snapshot,
      conflict_decision,
      operator
    } = req.body;

    if (!batch_id || !original_snapshot) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const record = await auditCenterService.recordReplacedSnapshotDetails(
      batch_id,
      import_log_id,
      original_snapshot,
      replacement_snapshot,
      conflict_decision,
      operator || 'anonymous'
    );

    res.status(201).json({
      success: true,
      record: record
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/record-rollback-changes', async (req, res) => {
  try {
    const {
      batch_id,
      rollback_type,
      import_log_id,
      changes
    } = req.body;

    if (!batch_id || !rollback_type || !changes || !Array.isArray(changes)) {
      return res.status(400).json({ error: '缺少必要参数或changes不是数组' });
    }

    const records = await auditCenterService.recordRollbackResourceChanges(
      batch_id,
      rollback_type,
      import_log_id,
      changes
    );

    res.status(201).json({
      success: true,
      records_created: records.length,
      records: records
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/complete-batch/:batchId', async (req, res) => {
  try {
    const success = req.body.success !== false;

    await auditCenterService.completeImportBatch(req.params.batchId, success);

    res.json({
      success: true,
      message: `批次 ${req.params.batchId} 已标记为完成`,
      success_flag: success
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
