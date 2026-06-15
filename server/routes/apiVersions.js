const express = require('express');
const apiVersionDao = require('../dao/apiVersionDao');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const versions = await apiVersionDao.getAll();
    res.json(versions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const version = await apiVersionDao.getById(req.params.id);
    if (!version) {
      res.status(404).json({ error: 'API版本不存在' });
    } else {
      res.json(version);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, version, base_path, schema } = req.body;
    const result = await apiVersionDao.create({ name, version, base_path, schema });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, version, base_path, schema } = req.body;
    const result = await apiVersionDao.update(req.params.id, { name, version, base_path, schema });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await apiVersionDao.delete(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;