const express = require('express');
const executionDao = require('../dao/executionDao');
const executionEngine = require('../services/executionEngine');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const executions = await executionDao.getAll();
    res.json(executions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const execution = await executionDao.getById(req.params.id);
    if (!execution) {
      res.status(404).json({ error: '执行记录不存在' });
    } else {
      res.json(execution);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/scenario/:scenarioId', async (req, res) => {
  try {
    const executions = await executionDao.getByScenarioId(req.params.scenarioId);
    res.json(executions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/execute/:scenarioId', async (req, res) => {
  try {
    const result = await executionEngine.execute(req.params.scenarioId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/status/:scenarioId', async (req, res) => {
  try {
    const isRunning = executionEngine.isRunning(req.params.scenarioId);
    const runningCount = executionEngine.getRunningCount();
    res.json({ isRunning, runningCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;