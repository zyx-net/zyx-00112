const express = require('express');
const compatibilityStrategyDao = require('../dao/compatibilityStrategyDao');

const VALID_STRATEGY_TYPES = ['version_compatible', 'field_optional', 'field_deprecated', 'response_transform', 'request_transform'];

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { api_version_id } = req.query;
    if (api_version_id) {
      const strategies = await compatibilityStrategyDao.getByApiVersionId(api_version_id);
      res.json(strategies);
    } else {
      const strategies = await compatibilityStrategyDao.getAll();
      res.json(strategies);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { api_version_id, strategy_type, config } = req.body;
    
    if (!api_version_id || !strategy_type) {
      return res.status(400).json({ error: '缺少必填字段: api_version_id, strategy_type' });
    }
    
    if (!VALID_STRATEGY_TYPES.includes(strategy_type)) {
      return res.status(400).json({ 
        error: `无效的策略类型: ${strategy_type}`,
        valid_types: VALID_STRATEGY_TYPES
      });
    }
    
    if (config !== undefined && config !== null) {
      if (typeof config === 'string') {
        try {
          JSON.parse(config);
        } catch (e) {
          return res.status(400).json({ error: 'config 必须是有效的 JSON 对象' });
        }
      } else if (typeof config !== 'object') {
        return res.status(400).json({ error: 'config 必须是 JSON 对象' });
      }
    }
    
    const result = await compatibilityStrategyDao.create({ 
      api_version_id, 
      strategy_type, 
      config: typeof config === 'string' ? config : JSON.stringify(config || {})
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { strategy_type, config } = req.body;
    
    if (strategy_type && !VALID_STRATEGY_TYPES.includes(strategy_type)) {
      return res.status(400).json({ 
        error: `无效的策略类型: ${strategy_type}`,
        valid_types: VALID_STRATEGY_TYPES
      });
    }
    
    if (config !== undefined && config !== null) {
      if (typeof config === 'string') {
        try {
          JSON.parse(config);
        } catch (e) {
          return res.status(400).json({ error: 'config 必须是有效的 JSON 对象' });
        }
      } else if (typeof config !== 'object') {
        return res.status(400).json({ error: 'config 必须是 JSON 对象' });
      }
    }
    
    const result = await compatibilityStrategyDao.update(req.params.id, { 
      strategy_type, 
      config: typeof config === 'string' ? config : JSON.stringify(config || {})
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await compatibilityStrategyDao.delete(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;