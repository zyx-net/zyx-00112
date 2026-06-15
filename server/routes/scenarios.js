const express = require('express');
const scenarioDao = require('../dao/scenarioDao');
const validationService = require('../services/validationService');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const scenarios = await scenarioDao.getAll();
    res.json(scenarios);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const scenario = await scenarioDao.getById(req.params.id);
    if (!scenario) {
      res.status(404).json({ error: '场景不存在' });
    } else {
      res.json(scenario);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, description, api_version_id } = req.body;
    const result = await scenarioDao.create({ name, description, api_version_id });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    await validationService.validateScenarioUpdate(req.params.id);
    const { name, description, status } = req.body;
    const result = await scenarioDao.update(req.params.id, { name, description, status });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await validationService.validateScenarioUpdate(req.params.id);
    const result = await scenarioDao.delete(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;