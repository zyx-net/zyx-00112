const scenarioDao = require('../dao/scenarioDao');
const apiVersionDao = require('../dao/apiVersionDao');
const fieldMappingDao = require('../dao/fieldMappingDao');
const compatibilityStrategyDao = require('../dao/compatibilityStrategyDao');
const failureInjectionDao = require('../dao/failureInjectionDao');
const executionDao = require('../dao/executionDao');
const snapshotDao = require('../dao/snapshotDao');
const { scenarioPackageDao, importLogDao, archivedScenarioDao } = require('../dao/scenarioPackageDao');
const { v4: uuidv4 } = require('uuid');

class ScenarioPackageService {
  async exportScenario(scenarioId) {
    const scenario = await scenarioDao.getById(scenarioId);
    if (!scenario) {
      throw new Error('场景不存在');
    }

    const apiVersion = scenario.api_version_id 
      ? await apiVersionDao.getById(scenario.api_version_id) 
      : null;
    
    const fieldMappings = scenario.api_version_id 
      ? await fieldMappingDao.getByApiVersionId(scenario.api_version_id) 
      : [];
    
    const compatibilityStrategies = scenario.api_version_id 
      ? await compatibilityStrategyDao.getByApiVersionId(scenario.api_version_id) 
      : [];
    
    const failureInjections = await failureInjectionDao.getByScenarioId(scenarioId);
    const executions = await executionDao.getByScenarioId(scenarioId);
    const latestSnapshot = await snapshotDao.getLatestByScenarioId(scenarioId);

    const packageData = {
      version: '1.0.0',
      exported_at: new Date().toISOString(),
      scenario: {
        name: scenario.name,
        description: scenario.description,
        status: scenario.status,
        original_id: scenario.id
      },
      api_version: apiVersion ? {
        name: apiVersion.name,
        version: apiVersion.version,
        base_path: apiVersion.base_path,
        schema: apiVersion.schema
      } : null,
      field_mappings: fieldMappings,
      compatibility_strategies: compatibilityStrategies,
      failure_injections: failureInjections,
      execution_history_summary: executions.map(e => ({
        id: e.id,
        status: e.status,
        start_time: e.start_time,
        end_time: e.end_time
      })),
      latest_snapshot: latestSnapshot ? {
        id: latestSnapshot.id,
        execution_id: latestSnapshot.execution_id,
        data: latestSnapshot.data,
        created_at: latestSnapshot.created_at
      } : null
    };

    return packageData;
  }

  async checkConflicts(packageData, forceScenarioName = null) {
    const conflicts = {
      has_conflicts: false,
      issues: []
    };

    const scenarios = await scenarioDao.getAll();
    const scenarioName = forceScenarioName || packageData.scenario?.name;
    const apiVersionName = packageData.api_version?.name;
    const apiVersionVer = packageData.api_version?.version;

    const existingByName = scenarios.find(s => s.name === scenarioName);
    if (existingByName) {
      conflicts.has_conflicts = true;
      conflicts.issues.push({
        type: 'duplicate_name',
        message: `同名场景已存在: "${scenarioName}"`,
        existing_scenario: {
          id: existingByName.id,
          name: existingByName.name,
          status: existingByName.status
        }
      });
    }

    if (apiVersionName && apiVersionVer) {
      const apiVersions = await apiVersionDao.getAll();
      const existingApiVersion = apiVersions.find(v => 
        v.name === apiVersionName && v.version === apiVersionVer
      );
      
      if (existingApiVersion) {
        if (packageData.api_version?.schema) {
          const schemaKeys = Object.keys(packageData.api_version.schema).sort();
          const existingSchemaKeys = Object.keys(existingApiVersion.schema || {}).sort();
          
          if (JSON.stringify(schemaKeys) !== JSON.stringify(existingSchemaKeys)) {
            conflicts.has_conflicts = true;
            conflicts.issues.push({
              type: 'schema_incompatible',
              message: `API版本 "${apiVersionName} ${apiVersionVer}" 的 Schema 不兼容`,
              package_schema: packageData.api_version.schema,
              existing_schema: existingApiVersion.schema
            });
          }
        }

        const missingFields = packageData.field_mappings?.filter(m => {
          const sourceExists = existingApiVersion.schema && 
            Object.keys(existingApiVersion.schema).includes(m.source_field);
          return !sourceExists;
        });

        if (missingFields && missingFields.length > 0) {
          conflicts.has_conflicts = true;
          conflicts.issues.push({
            type: 'missing_fields',
            message: `字段映射中引用的源字段在目标API版本中不存在`,
            missing_fields: missingFields.map(f => f.source_field)
          });
        }
      }
    }

    if (existingByName) {
      const executions = await executionDao.getByScenarioId(existingByName.id);
      const hasCompleted = executions.some(e => e.status === 'completed');
      
      if (hasCompleted) {
        conflicts.has_conflicts = true;
        conflicts.issues.push({
          type: 'has_execution_history',
          message: `同名场景已有成功执行记录`,
          execution_count: executions.length,
          completed_count: executions.filter(e => e.status === 'completed').length
        });
      }
    }

    return conflicts;
  }

  async importScenario(packageData, decisions = {}) {
    const { 
      scenario_action = 'save_as',
      api_version_action = 'create',
      execution_history_action = 'skip',
      conflict_issues = []
    } = decisions;

    const importedItems = {
      scenarios: [],
      api_versions: [],
      field_mappings: [],
      compatibility_strategies: [],
      failure_injections: [],
      snapshots: [],
      skipped: []
    };

    let newScenarioName = packageData.scenario?.name;
    
    if (conflict_issues.some(i => i.type === 'duplicate_name') && scenario_action === 'save_as') {
      newScenarioName = `${packageData.scenario.name}_imported_${Date.now()}`;
    } else if (conflict_issues.some(i => i.type === 'duplicate_name') && scenario_action === 'overwrite') {
      const existingScenario = await scenarioDao.getAll();
      const toOverwrite = existingScenario.find(s => s.name === packageData.scenario?.name);
      if (toOverwrite) {
        const archived = await archivedScenarioDao.archive(toOverwrite.id, toOverwrite);
        await scenarioDao.delete(toOverwrite.id);
        importedItems.skipped.push({
          type: 'scenario_overwritten',
          original_id: toOverwrite.id,
          archived_id: archived.id
        });
      }
    }

    let apiVersion = null;
    if (packageData.api_version && api_version_action !== 'skip') {
      const existingVersions = await apiVersionDao.getAll();
      const existingApiVersion = existingVersions.find(v => 
        v.name === packageData.api_version.name && v.version === packageData.api_version.version
      );

      if (existingApiVersion && api_version_action === 'reuse') {
        apiVersion = existingApiVersion;
        importedItems.api_versions.push({ action: 'reused', id: existingApiVersion.id });
      } else if (api_version_action === 'create' || !existingApiVersion) {
        apiVersion = await apiVersionDao.create({
          name: packageData.api_version.name,
          version: packageData.api_version.version,
          base_path: packageData.api_version.base_path,
          schema: packageData.api_version.schema || {}
        });
        importedItems.api_versions.push({ action: 'created', id: apiVersion.id });

        if (packageData.field_mappings?.length > 0) {
          for (const mapping of packageData.field_mappings) {
            const createdMapping = await fieldMappingDao.create({
              api_version_id: apiVersion.id,
              source_field: mapping.source_field,
              target_field: mapping.target_field,
              transform_type: mapping.transform_type,
              transform_expression: mapping.transform_expression
            });
            importedItems.field_mappings.push({ action: 'created', id: createdMapping.id });
          }
        }

        if (packageData.compatibility_strategies?.length > 0) {
          for (const strategy of packageData.compatibility_strategies) {
            const createdStrategy = await compatibilityStrategyDao.create({
              api_version_id: apiVersion.id,
              strategy_type: strategy.strategy_type,
              config: strategy.config
            });
            importedItems.compatibility_strategies.push({ action: 'created', id: createdStrategy.id });
          }
        }
      }
    }

    const scenario = await scenarioDao.create({
      name: newScenarioName,
      description: packageData.scenario?.description || '',
      api_version_id: apiVersion?.id || null,
      status: packageData.scenario?.status || 'draft'
    });
    importedItems.scenarios.push({ action: scenario_action === 'overwrite' ? 'overwritten' : 'created', id: scenario.id });

    if (packageData.failure_injections?.length > 0) {
      for (const injection of packageData.failure_injections) {
        const createdInjection = await failureInjectionDao.create({
          scenario_id: scenario.id,
          type: injection.type,
          probability: injection.probability,
          config: injection.config,
          enabled: injection.enabled
        });
        importedItems.failure_injections.push({ action: 'created', id: createdInjection.id });
      }
    }

    if (packageData.execution_history_summary && execution_history_action === 'keep') {
      let lastExecutionId = null;
      for (const exec of packageData.execution_history_summary) {
        const createdExecution = await executionDao.create(scenario.id);
        await executionDao.update(createdExecution.id, {
          status: exec.status,
          start_time: exec.start_time,
          end_time: exec.end_time,
          logs: null
        });
        importedItems.executions = importedItems.executions || [];
        importedItems.executions.push({ action: 'restored', id: createdExecution.id });
        lastExecutionId = createdExecution.id;
      }
      
      if (packageData.latest_snapshot && execution_history_action !== 'skip' && lastExecutionId) {
        const snapshot = await snapshotDao.create(scenario.id, lastExecutionId, packageData.latest_snapshot.data);
        importedItems.snapshots.push({ action: 'created', id: snapshot.id });
      }
    } else if (packageData.latest_snapshot && execution_history_action !== 'skip') {
      const snapshot = await snapshotDao.create(scenario.id, null, packageData.latest_snapshot.data);
      importedItems.snapshots.push({ action: 'created', id: snapshot.id });
    }

    return {
      success: true,
      imported_items: importedItems,
      new_scenario_id: scenario.id,
      new_scenario_name: newScenarioName
    };
  }

  async recordImport(packageId, sourcePackage, decisions, result, details = {}) {
    return await importLogDao.create({
      package_id: packageId,
      source_package: sourcePackage,
      conflict_decisions: decisions,
      result: result,
      details: details
    });
  }

  async getImportLogs() {
    return await importLogDao.getAll();
  }

  async getLatestImportLog() {
    return await importLogDao.getLatest();
  }

  async savePackageForRollback(scenarioId, packageData, importedItems) {
    return await scenarioPackageDao.savePackage({
      scenario_id: scenarioId,
      action_type: 'import',
      package_data: packageData,
      imported_items: importedItems
    });
  }

  async getLatestImportPackage() {
    return await scenarioPackageDao.getLatestImport();
  }

  async rollbackLastImport() {
    const latestPackage = await scenarioPackageDao.getLatestImport();
    
    if (!latestPackage) {
      throw new Error('没有可撤销的导入');
    }

    const packageData = latestPackage.package_data;
    const importedItems = latestPackage.imported_items || {};
    const originalScenarioName = packageData.scenario?.name;
    const latestPackageId = latestPackage.id;
    
    let scenarioId = latestPackage.scenario_id;
    let cleanedResources = {
      scenario_id: null,
      api_version_id: null,
      field_mappings: [],
      compatibility_strategies: [],
      failure_injections: [],
      snapshots: [],
      executions: []
    };
    
    if (scenarioId) {
      const importedScenario = await scenarioDao.getById(scenarioId);
      
      if (importedScenario) {
        if (importedItems.failure_injections) {
          for (const injection of importedItems.failure_injections) {
            try {
              await failureInjectionDao.delete(injection.id);
              cleanedResources.failure_injections.push(injection.id);
            } catch (e) {}
          }
        }
        
        if (importedItems.snapshots) {
          for (const snapshot of importedItems.snapshots) {
            try {
              await snapshotDao.delete(snapshot.id);
              cleanedResources.snapshots.push(snapshot.id);
            } catch (e) {}
          }
        }
        
        if (importedItems.executions) {
          for (const execution of importedItems.executions) {
            try {
              await executionDao.delete(execution.id);
              cleanedResources.executions.push(execution.id);
            } catch (e) {}
          }
        }
        
        await scenarioDao.delete(scenarioId);
        cleanedResources.scenario_id = scenarioId;
      } else {
        scenarioId = null;
      }
    }

    if (importedItems.api_versions && importedItems.api_versions.length > 0) {
      for (const apiVersion of importedItems.api_versions) {
        if (apiVersion.action === 'created') {
          try {
            const fieldMappings = importedItems.field_mappings || [];
            for (const mapping of fieldMappings) {
              try {
                await fieldMappingDao.delete(mapping.id);
                cleanedResources.field_mappings.push(mapping.id);
              } catch (e) {}
            }
            
            const strategies = importedItems.compatibility_strategies || [];
            for (const strategy of strategies) {
              try {
                await compatibilityStrategyDao.delete(strategy.id);
                cleanedResources.compatibility_strategies.push(strategy.id);
              } catch (e) {}
            }
            
            await apiVersionDao.delete(apiVersion.id);
            cleanedResources.api_version_id = apiVersion.id;
          } catch (e) {}
        }
      }
    }

    await scenarioPackageDao.delete(latestPackageId);

    return {
      success: true,
      rolled_back_scenario_id: scenarioId,
      rolled_back_scenario_name: originalScenarioName,
      had_package_record: true,
      had_scenario: !!scenarioId,
      cleaned_resources: cleanedResources
    };
  }

  async getScenariosWithHistory() {
    const scenarios = await scenarioDao.getAll();
    const result = [];

    for (const scenario of scenarios) {
      const executions = await executionDao.getByScenarioId(scenario.id);
      const snapshots = await snapshotDao.getByScenarioId(scenario.id);
      
      result.push({
        ...scenario,
        execution_count: executions.length,
        completed_count: executions.filter(e => e.status === 'completed').length,
        snapshot_count: snapshots.length,
        latest_execution: executions[0] || null,
        latest_snapshot: snapshots[0] || null
      });
    }

    return result;
  }
}

module.exports = new ScenarioPackageService();
