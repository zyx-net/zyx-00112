const express = require('express');
const rollbackService = require('../services/rollbackService');

const router = express.Router();

router.post('/:scenarioId', async (req, res) => {
  try {
    const result = await rollbackService.rollback(req.params.scenarioId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/history/:scenarioId', async (req, res) => {
  try {
    const history = await rollbackService.getRollbackHistory(req.params.scenarioId);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/export/:scenarioId', async (req, res) => {
  try {
    const summary = await rollbackService.exportSummary(req.params.scenarioId);
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;