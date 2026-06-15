const express = require('express');
const failureInjectionDao = require('../dao/failureInjectionDao');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const injections = await failureInjectionDao.getAll();
    res.json(injections);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/scenario/:scenarioId', async (req, res) => {
  try {
    const injections = await failureInjectionDao.getByScenarioId(req.params.scenarioId);
    res.json(injections);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { scenario_id, type, probability, config, enabled } = req.body;
    const result = await failureInjectionDao.create({ scenario_id, type, probability, config, enabled });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { type, probability, config, enabled } = req.body;
    const result = await failureInjectionDao.update(req.params.id, { type, probability, config, enabled });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await failureInjectionDao.delete(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;