const express = require('express');
const auditExecutionService = require('../services/auditExecutionService');

const router = express.Router();

router.post('/batches', async (req, res) => {
  try {
    const { operator, scenarioId, mode = 'preview' } = req.body;
    const requestInfo = {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      inputSource: req.body.inputSource,
      inputSourceType: req.body.inputSourceType
    };
    
    const result = await auditExecutionService.createBatch(operator, scenarioId, mode, requestInfo);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/batches', async (req, res) => {
  try {
    const filter = {};
    if (req.query.mode) filter.mode = req.query.mode;
    if (req.query.state) filter.state = req.query.state;
    if (req.query.operator) filter.operator = req.query.operator;
    if (req.query.scenarioId) filter.scenario_id = req.query.scenarioId;
    
    const batches = await auditExecutionService.getBatchList(filter);
    res.json(batches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/batches/:batchId', async (req, res) => {
  try {
    const batch = await auditExecutionService.getBatchDetails(req.params.batchId);
    if (!batch) {
      res.status(404).json({ error: '批次不存在' });
    } else {
      res.json(batch);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/batches/by-number/:batchNumber', async (req, res) => {
  try {
    const batch = await auditExecutionService.getBatchDetailsByNumber(req.params.batchNumber);
    if (!batch) {
      res.status(404).json({ error: '批次不存在' });
    } else {
      res.json(batch);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/batches/:batchId/mode', async (req, res) => {
  try {
    const { mode } = req.body;
    const result = await auditExecutionService.updateMode(req.params.batchId, mode);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/batches/:batchId/pre-check', async (req, res) => {
  try {
    const result = await auditExecutionService.runPreCheck(req.params.batchId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/batches/:batchId/execute', async (req, res) => {
  try {
    const result = await auditExecutionService.execute(req.params.batchId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/batches/:batchId/complete', async (req, res) => {
  try {
    const result = await auditExecutionService.completeBatch(req.params.batchId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/batches/:batchId/cancel', async (req, res) => {
  try {
    const { operator } = req.body;
    const result = await auditExecutionService.cancelBatch(req.params.batchId, operator);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/batches/:batchId/conflict', async (req, res) => {
  try {
    const { conflictType, description, decision, operator } = req.body;
    const result = await auditExecutionService.handleConflict(
      req.params.batchId, conflictType, description, decision, operator
    );
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/batches/:batchId/recover', async (req, res) => {
  try {
    const { operator } = req.body;
    const result = await auditExecutionService.recoverFromFailure(req.params.batchId, operator);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/batches/:batchId/logs', async (req, res) => {
  try {
    const logs = await auditExecutionService.getLogs(req.params.batchId);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/batches/:batchId/timeline', async (req, res) => {
  try {
    const timeline = await auditExecutionService.getTimeline(req.params.batchId);
    res.json(timeline);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/batches/:batchId/recovery-suggestion', async (req, res) => {
  try {
    const suggestion = await auditExecutionService.getRecoverySuggestion(req.params.batchId);
    res.json(suggestion);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/check-duplicate', async (req, res) => {
  try {
    const { scenarioId } = req.body;
    const result = await auditExecutionService.checkDuplicateSubmission(scenarioId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/check-replay', async (req, res) => {
  try {
    const { batchNumber } = req.body;
    const result = await auditExecutionService.checkReplay(batchNumber);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/logs', async (req, res) => {
  try {
    const logs = await auditExecutionService.listLogFiles();
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/logs/:batchNumber', async (req, res) => {
  try {
    const result = await auditExecutionService.getLogFileContent(req.params.batchNumber);
    if (!result.exists) {
      res.status(404).json({ 
        error: result.error, 
        message: result.message,
        exists: false 
      });
    } else {
      res.json({ 
        ...result,
        exists: true 
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/batches/:batchId/regenerate-log', async (req, res) => {
  try {
    const result = await auditExecutionService.regenerateLogFile(req.params.batchId);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;