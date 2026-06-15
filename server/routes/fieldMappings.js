const express = require('express');
const fieldMappingDao = require('../dao/fieldMappingDao');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { api_version_id } = req.query;
    if (api_version_id) {
      const mappings = await fieldMappingDao.getByApiVersionId(api_version_id);
      res.json(mappings);
    } else {
      const mappings = await fieldMappingDao.getAll();
      res.json(mappings);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { api_version_id, source_field, target_field, transform_type, transform_expression } = req.body;
    
    if (!api_version_id || !source_field || !target_field) {
      return res.status(400).json({ error: '缺少必填字段: api_version_id, source_field, target_field' });
    }
    
    const result = await fieldMappingDao.create({ 
      api_version_id, 
      source_field, 
      target_field, 
      transform_type, 
      transform_expression 
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { source_field, target_field, transform_type, transform_expression } = req.body;
    const result = await fieldMappingDao.update(req.params.id, { 
      source_field, 
      target_field, 
      transform_type, 
      transform_expression 
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await fieldMappingDao.delete(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;