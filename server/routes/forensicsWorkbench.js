const express = require('express');
const router = express.Router();
const forensicsWorkbenchService = require('../services/forensicsWorkbenchService');

router.post('/initialize', async (req, res) => {
  try {
    const operator = req.body.operator || req.headers['x-operator'] || 'anonymous';
    const requestInfo = {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent']
    };

    const options = {
      mode: req.body.mode,
      scenario_id: req.body.scenario_id,
      scenario_name: req.body.scenario_name,
      original_scenario_id: req.body.original_scenario_id,
      original_snapshot_id: req.body.original_snapshot_id,
      original_execution_id: req.body.original_execution_id,
      conflict_decision: req.body.conflict_decision,
      metadata: req.body.metadata || {}
    };

    const batch = await forensicsWorkbenchService.initializeBatch(operator, requestInfo, options);

    res.status(201).json({
      success: true,
      batch: batch
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/pre-check/:batchId', async (req, res) => {
  try {
    const result = await forensicsWorkbenchService.performPreCheck(req.params.batchId);

    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/replace-import/:batchId', async (req, res) => {
  try {
    const { package_data, decisions } = req.body;

    if (!package_data) {
      return res.status(400).json({ error: '缺少 package_data' });
    }

    const result = await forensicsWorkbenchService.executeReplaceImport(
      req.params.batchId,
      package_data,
      decisions || {}
    );

    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/rollback/:batchId', async (req, res) => {
  try {
    const confirm = req.body.confirm === true;

    const result = await forensicsWorkbenchService.executeRollback(req.params.batchId, confirm);

    if (result.requires_confirmation) {
      return res.status(403).json({
        error: '需要明确确认才能执行真实回滚',
        requires_confirmation: true,
        result: result
      });
    }

    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/rollback/:batchId/confirm', async (req, res) => {
  try {
    const result = await forensicsWorkbenchService.executeRollback(req.params.batchId, true);

    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/restart-review/:batchId/simulation', async (req, res) => {
  try {
    const result = await forensicsWorkbenchService.performRestartReview(req.params.batchId, {
      is_simulation: true
    });

    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/restart-review/:batchId', async (req, res) => {
  try {
    const options = {
      is_simulation: req.body.is_simulation !== false
    };

    const result = await forensicsWorkbenchService.performRestartReview(req.params.batchId, options);

    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/re-import/:batchId', async (req, res) => {
  try {
    const { package_data, decisions } = req.body;

    if (!package_data) {
      return res.status(400).json({ error: '缺少 package_data' });
    }

    const result = await forensicsWorkbenchService.reImportAfterRollback(
      req.params.batchId,
      package_data,
      decisions || {}
    );

    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/batch/:batchId', async (req, res) => {
  try {
    const details = await forensicsWorkbenchService.getBatchDetails(req.params.batchId);

    if (!details) {
      return res.status(404).json({ error: '批次不存在' });
    }

    res.json({
      success: true,
      batch: details
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/batch/by-number/:batchNumber', async (req, res) => {
  try {
    const details = await forensicsWorkbenchService.getBatchesByBatchNumber(req.params.batchNumber);

    if (!details) {
      return res.status(404).json({ error: '批次不存在' });
    }

    res.json({
      success: true,
      batch: details
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/timeline/:batchId', async (req, res) => {
  try {
    const timeline = await forensicsWorkbenchService.getBatchTimeline(req.params.batchId);

    res.json({
      success: true,
      batch_id: req.params.batchId,
      timeline: timeline,
      count: timeline.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/batches', async (req, res) => {
  try {
    const filters = {
      state: req.query.state,
      mode: req.query.mode,
      scenario_id: req.query.scenario_id,
      operator: req.query.operator,
      limit: parseInt(req.query.limit) || 100,
      offset: parseInt(req.query.offset) || 0
    };

    const batches = await forensicsWorkbenchService.listBatches(filters);

    res.json({
      success: true,
      batches: batches,
      count: batches.length,
      filters: filters
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/complete/:batchId', async (req, res) => {
  try {
    const result = await forensicsWorkbenchService.completeBatch(req.params.batchId);

    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/cancel/:batchId', async (req, res) => {
  try {
    const reason = req.body.reason || '用户取消';

    const result = await forensicsWorkbenchService.cancelBatch(req.params.batchId, reason);

    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/verify-recovery/:batchId/:recoveryRecordId', async (req, res) => {
  try {
    const operator = req.body.operator || req.headers['x-operator'] || 'anonymous';
    const verificationNotes = req.body.notes || '';

    const result = await forensicsWorkbenchService.verifyRecovery(
      req.params.batchId,
      req.params.recoveryRecordId,
      verificationNotes,
      operator
    );

    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/handle-missing-snapshot/:batchId', async (req, res) => {
  try {
    const options = req.body.options || {};

    const result = await forensicsWorkbenchService.handleMissingSnapshotScenario(
      req.params.batchId,
      options
    );

    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/config', async (req, res) => {
  try {
    const config = forensicsWorkbenchService.getConfig();

    res.json({
      success: true,
      config: config
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/pending', async (req, res) => {
  try {
    const { forensicsBatchDao } = require('../dao/forensicsWorkbenchDao');
    const batches = await forensicsBatchDao.getPendingBatches();

    res.json({
      success: true,
      batches: batches,
      count: batches.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/full-chain', async (req, res) => {
  try {
    const operator = req.body.operator || req.headers['x-operator'] || 'anonymous';
    const requestInfo = {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent']
    };

    const {
      package_data,
      decisions,
      original_scenario_id,
      original_snapshot_id,
      original_execution_id,
      skip_restart_review
    } = req.body;

    if (!package_data) {
      return res.status(400).json({ error: '缺少 package_data' });
    }

    const chainResult = {
      steps: [],
      final_state: null,
      errors: []
    };

    try {
      console.log('[Full Chain] Step 1: Initialize batch...');
      const batch = await forensicsWorkbenchService.initializeBatch(operator, requestInfo, {
        scenario_id: original_scenario_id,
        original_scenario_id: original_scenario_id,
        original_snapshot_id: original_snapshot_id,
        original_execution_id: original_execution_id,
        conflict_decision: decisions?.scenario_action || 'save_as',
        metadata: { full_chain_execution: true }
      });
      chainResult.steps.push({
        step: 'initialize',
        batch_id: batch.id,
        batch_number: batch.batch_number,
        status: 'success'
      });

      console.log('[Full Chain] Step 2: Pre-check...');
      const preCheck = await forensicsWorkbenchService.performPreCheck(batch.id);
      chainResult.steps.push({
        step: 'pre_check',
        result: preCheck,
        status: preCheck.passed ? 'success' : 'failed'
      });

      if (!preCheck.passed) {
        throw new Error('Pre-check failed: ' + preCheck.errors.map(e => e.message).join('; '));
      }

      console.log('[Full Chain] Step 3: Replace import...');
      const replaceImport = await forensicsWorkbenchService.executeReplaceImport(
        batch.id,
        package_data,
        decisions || {}
      );
      chainResult.steps.push({
        step: 'replace_import',
        result: replaceImport,
        status: 'success'
      });

      console.log('[Full Chain] Step 4: Rollback...');
      const rollback = await forensicsWorkbenchService.executeRollback(batch.id, true);
      chainResult.steps.push({
        step: 'rollback',
        result: rollback,
        status: 'success'
      });

      if (!skip_restart_review) {
        console.log('[Full Chain] Step 5: Restart review...');
        const restartReview = await forensicsWorkbenchService.performRestartReview(batch.id, {
          is_simulation: true
        });
        chainResult.steps.push({
          step: 'restart_review',
          result: restartReview,
          status: 'success'
        });
      }

      console.log('[Full Chain] Step 6: Complete batch...');
      const complete = await forensicsWorkbenchService.completeBatch(batch.id);
      chainResult.steps.push({
        step: 'complete',
        result: complete,
        status: 'success'
      });

      chainResult.final_state = 'completed';
      chainResult.batch_id = batch.id;
      chainResult.batch_number = batch.batch_number;

    } catch (error) {
      chainResult.errors.push({
        message: error.message,
        timestamp: new Date().toISOString()
      });
      chainResult.final_state = 'failed';
    }

    res.json({
      success: chainResult.final_state === 'completed',
      chain_result: chainResult
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
