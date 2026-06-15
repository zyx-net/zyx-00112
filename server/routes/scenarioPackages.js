const express = require('express');
const router = express.Router();
const scenarioPackageService = require('../services/scenarioPackageService');
const validationService = require('../services/validationService');

router.post('/export/:scenarioId', async (req, res) => {
  try {
    const packageData = await scenarioPackageService.exportScenario(req.params.scenarioId);
    
    await scenarioPackageService.recordImport(
      req.params.scenarioId,
      'export',
      { scenario_id: req.params.scenarioId },
      'export',
      { package_version: packageData.version, exported_at: packageData.exported_at }
    );
    
    res.json({
      success: true,
      package: packageData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/check-conflicts', async (req, res) => {
  try {
    const { package_data, force_scenario_name } = req.body;
    const conflicts = await scenarioPackageService.checkConflicts(package_data, force_scenario_name);
    res.json(conflicts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/import', async (req, res) => {
  try {
    const { package_data, decisions = {} } = req.body;
    
    if (!package_data) {
      return res.status(400).json({ error: '缺少 package_data' });
    }

    const conflicts = await scenarioPackageService.checkConflicts(package_data);
    
    if (conflicts.has_conflicts) {
      const hasDuplicateName = conflicts.issues.some(i => i.type === 'duplicate_name');
      
      if (hasDuplicateName && (!decisions || !decisions.hasOwnProperty('duplicate_name'))) {
        return res.status(409).json({
          error: '存在同名场景冲突，需要决策',
          conflicts: conflicts,
          required_decisions: ['duplicate_name']
        });
      }
    }

    const importDecisions = {
      ...decisions,
      conflict_issues: conflicts.issues
    };

    const result = await scenarioPackageService.importScenario(package_data, importDecisions);
    
    const log = await scenarioPackageService.recordImport(
      result.new_scenario_id,
      package_data.scenario?.name || 'unknown',
      decisions || {},
      'success',
      result
    );

    await scenarioPackageService.savePackageForRollback(
      result.new_scenario_id,
      package_data
    );

    res.status(201).json({
      success: true,
      result: result,
      import_log_id: log.id
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      details: error.stack
    });
  }
});

router.post('/import/preview', async (req, res) => {
  try {
    const { package_data } = req.body;
    
    if (!package_data) {
      return res.status(400).json({ error: '缺少 package_data' });
    }

    const conflicts = await scenarioPackageService.checkConflicts(package_data);
    
    res.json({
      success: true,
      has_conflicts: conflicts.has_conflicts,
      conflicts: conflicts.issues,
      can_proceed: !conflicts.has_conflicts || conflicts.issues.every(i => 
        i.type !== 'schema_incompatible'
      )
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/import-logs', async (req, res) => {
  try {
    const logs = await scenarioPackageService.getImportLogs();
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/import-logs/latest', async (req, res) => {
  try {
    const log = await scenarioPackageService.getLatestImportLog();
    if (!log) {
      return res.status(404).json({ error: '没有导入记录' });
    }
    res.json(log);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/rollback', async (req, res) => {
  try {
    const result = await scenarioPackageService.rollbackLastImport();
    
    await scenarioPackageService.recordImport(
      'rollback',
      'system',
      { action: 'rollback' },
      'success',
      result
    );

    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/scenarios-with-history', async (req, res) => {
  try {
    const scenarios = await scenarioPackageService.getScenariosWithHistory();
    res.json(scenarios);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
