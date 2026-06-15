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
      const hasSchemaIncompatible = conflicts.issues.some(i => i.type === 'schema_incompatible');
      
      if (hasDuplicateName) {
        const scenarioAction = decisions.scenario_action || decisions.duplicate_name;
        if (!scenarioAction || (scenarioAction !== 'save_as' && scenarioAction !== 'replace')) {
          return res.status(409).json({
            error: '存在同名场景冲突，需要决策',
            conflicts: conflicts,
            required_decisions: ['scenario_action'],
            supported_actions: {
              save_as: '另存为新场景（推荐）',
              replace: '覆盖现有场景'
            }
          });
        }
      }
      
      if (hasSchemaIncompatible && (!decisions || decisions.schema_incompatible !== 'force_create')) {
        return res.status(409).json({
          error: '存在Schema不兼容冲突，需要明确决策',
          conflicts: conflicts,
          required_decisions: ['schema_incompatible']
        });
      }
    }

    const importDecisions = {
      scenario_action: decisions.scenario_action || decisions.duplicate_name || 'save_as',
      api_version_action: decisions.api_version_action || 'create',
      execution_history_action: decisions.execution_history_action || 'keep',
      conflict_issues: conflicts.issues
    };

    const result = await scenarioPackageService.importScenario(package_data, importDecisions);
    
    const logDetails = {
      new_scenario_id: result.new_scenario_id,
      new_scenario_name: result.new_scenario_name,
      restored_status: result.restored_status,
      scenario_action: importDecisions.scenario_action,
      execution_history_action: importDecisions.execution_history_action,
      traceability: result.traceability,
      restored_execution_id: result.traceability?.restored_execution_id || null,
      restored_snapshot_id: result.traceability?.restored_snapshot_id || null,
      original_scenario_id: result.traceability?.original_scenario_id || null,
      original_scenario_name: result.traceability?.original_scenario_name || null,
      original_latest_execution_id: result.traceability?.original_latest_execution_id || null,
      restored_execution_count: result.traceability?.restored_execution_count || 0,
      original_execution_count: result.traceability?.execution_count || 0,
      replaced_scenario: result.traceability?.replaced_scenario || null,
      archived_scenario_id: result.traceability?.archived_scenario_id || null,
      imported_items_summary: {
        scenarios: result.imported_items.scenarios?.length || 0,
        api_versions: result.imported_items.api_versions?.length || 0,
        field_mappings: result.imported_items.field_mappings?.length || 0,
        compatibility_strategies: result.imported_items.compatibility_strategies?.length || 0,
        failure_injections: result.imported_items.failure_injections?.length || 0,
        snapshots: result.imported_items.snapshots?.length || 0,
        executions: result.imported_items.executions?.length || 0
      }
    };
    
    const log = await scenarioPackageService.recordImport(
      result.new_scenario_id,
      package_data.scenario?.name || 'unknown',
      decisions || {},
      'success',
      logDetails
    );

    await scenarioPackageService.savePackageForRollback(
      result.new_scenario_id,
      package_data,
      result.imported_items
    );

    res.status(201).json({
      success: true,
      result: result,
      import_log_id: log.id,
      traceability: result.traceability
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
    
    const rollbackDetails = {
      rolled_back_scenario_id: result.rolled_back_scenario_id,
      rolled_back_scenario_name: result.rolled_back_scenario_name,
      had_package_record: result.had_package_record,
      had_scenario: result.had_scenario,
      undone_execution_ids: result.cleaned_resources?.executions || [],
      undone_snapshot_ids: result.cleaned_resources?.snapshots || [],
      undone_failure_injection_ids: result.cleaned_resources?.failure_injections || [],
      undone_field_mapping_ids: result.cleaned_resources?.field_mappings || [],
      undone_compatibility_strategy_ids: result.cleaned_resources?.compatibility_strategies || [],
      undone_api_version_id: result.cleaned_resources?.api_version_id,
      cleaned_resources_summary: {
        total_executions: (result.cleaned_resources?.executions || []).length,
        total_snapshots: (result.cleaned_resources?.snapshots || []).length,
        total_failure_injections: (result.cleaned_resources?.failure_injections || []).length,
        total_field_mappings: (result.cleaned_resources?.field_mappings || []).length,
        total_compatibility_strategies: (result.cleaned_resources?.compatibility_strategies || []).length,
        api_version_cleaned: !!result.cleaned_resources?.api_version_id
      }
    };
    
    await scenarioPackageService.recordImport(
      'rollback',
      'system',
      { action: 'rollback' },
      'success',
      rollbackDetails
    );

    res.json({
      success: true,
      result: result,
      traceability: {
        undone_execution_ids: result.cleaned_resources?.executions || [],
        undone_snapshot_ids: result.cleaned_resources?.snapshots || [],
        undone_scenario_id: result.rolled_back_scenario_id,
        undone_scenario_name: result.rolled_back_scenario_name,
        rollback_details: rollbackDetails
      }
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
