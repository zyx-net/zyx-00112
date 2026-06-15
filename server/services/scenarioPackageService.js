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
    
    const sortedExecutions = [...executions].sort((a, b) => {
      const timeA = new Date(a.start_time || a.created_at).getTime();
      const timeB = new Date(b.start_time || b.created_at).getTime();
      return timeB - timeA;
    });
    
    const latestSuccessfulExecution = sortedExecutions.find(e => e.status === 'success' || e.status === 'completed');
    
    const latestSnapshot = await snapshotDao.getLatestByScenarioId(scenarioId);
    
    const correctSnapshot = latestSnapshot && latestSuccessfulExecution 
      ? await snapshotDao.getByExecutionId(latestSuccessfulExecution.id)
      : latestSnapshot;

    const packageData = {
      version: '1.1.0',
      exported_at: new Date().toISOString(),
      original_scenario_id: scenario.id,
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
      execution_history_summary: sortedExecutions.map(e => ({
        id: e.id,
        status: e.status,
        start_time: e.start_time,
        end_time: e.end_time,
        created_at: e.created_at
      })),
      latest_successful_execution_id: latestSuccessfulExecution?.id || null,
      latest_snapshot: correctSnapshot ? {
        id: correctSnapshot.id,
        execution_id: correctSnapshot.execution_id,
        data: correctSnapshot.data,
        created_at: correctSnapshot.created_at
      } : null,
      metadata: {
        total_executions: executions.length,
        completed_executions: executions.filter(e => e.status === 'success' || e.status === 'completed').length,
        snapshot_count: (await snapshotDao.getByScenarioId(scenarioId)).length,
        exported_by: 'scenario-package-service'
      }
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
        },
        can_save_as: true,
        can_replace: true
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
      const hasCompleted = executions.some(e => e.status === 'success' || e.status === 'completed');
      
      if (hasCompleted) {
        conflicts.has_conflicts = true;
        conflicts.issues.push({
          type: 'has_execution_history',
          message: `同名场景已有成功执行记录`,
          execution_count: executions.length,
          completed_count: executions.filter(e => e.status === 'success' || e.status === 'completed').length,
          latest_execution: executions[0] ? {
            id: executions[0].id,
            status: executions[0].status,
            start_time: executions[0].start_time
          } : null
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
      executions: [],
      meta: {
        restored_execution_id: null,
        restored_snapshot_id: null,
        original_scenario_id: packageData.original_scenario_id || null,
        original_latest_execution_id: packageData.latest_successful_execution_id || null,
        original_execution_ids: [],
        original_snapshot_ids: []
      },
      replaced: null
    };

    let newScenarioName = packageData.scenario?.name;
    let originalScenarioStatus = packageData.scenario?.status;
    let hasCompletedExecution = false;
    let scenarioAction = decisions.scenario_action || 'save_as';
    let replacedScenarioId = null;
    let replacedScenarioArchivedId = null;
    let replacedScenarioData = null;
    let replacedScenarioFullBackup = null;

    if (conflict_issues.some(i => i.type === 'duplicate_name')) {
      if (scenarioAction === 'save_as') {
        newScenarioName = `${packageData.scenario.name}_imported_${Date.now()}`;
      } else if (scenarioAction === 'replace') {
        const existingScenario = await scenarioDao.getAll();
        const toOverwrite = existingScenario.find(s => s.name === packageData.scenario?.name);
        if (toOverwrite) {
          replacedScenarioId = toOverwrite.id;
          replacedScenarioData = { ...toOverwrite };

          const existingExecutions = await executionDao.getByScenarioId(toOverwrite.id);
          importedItems.meta.original_execution_ids = existingExecutions.map(e => e.id);

          const existingSnapshots = await snapshotDao.getByScenarioId(toOverwrite.id);
          importedItems.meta.original_snapshot_ids = existingSnapshots.map(s => s.id);

          const existingInjections = await failureInjectionDao.getByScenarioId(toOverwrite.id);

          replacedScenarioFullBackup = {
            scenario: { ...toOverwrite },
            executions: existingExecutions.map(e => ({ ...e })),
            snapshots: existingSnapshots.map(s => ({ ...s })),
            failureInjections: existingInjections.map(i => ({ ...i })),
            archived_at: new Date().toISOString(),
            reason: 'replaced_by_import'
          };

          importedItems.replaced = {
            scenario_id: toOverwrite.id,
            scenario_name: toOverwrite.name,
            execution_count: existingExecutions.length,
            snapshot_count: existingSnapshots.length,
            injection_count: existingInjections.length,
            archived_at: new Date().toISOString()
          };

          for (const exec of existingExecutions) {
            await executionDao.delete(exec.id);
          }

          for (const snap of existingSnapshots) {
            await snapshotDao.delete(snap.id);
          }

          for (const inj of existingInjections) {
            await failureInjectionDao.delete(inj.id);
          }

          const archived = await archivedScenarioDao.archiveComplete(toOverwrite.id, replacedScenarioFullBackup);
          replacedScenarioArchivedId = archived.id;
          importedItems.replaced.archived_scenario_id = replacedScenarioArchivedId;
          importedItems.replaced.full_backup_stored = true;

          await scenarioDao.delete(toOverwrite.id);
        }
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

    if (packageData.execution_history_summary && packageData.execution_history_summary.length > 0) {
      const sortedExecutions = [...packageData.execution_history_summary].sort((a, b) => {
        const timeA = new Date(a.start_time || a.created_at).getTime();
        const timeB = new Date(b.start_time || b.created_at).getTime();
        return timeA - timeB;
      });
      
      hasCompletedExecution = sortedExecutions.some(e => e.status === 'success' || e.status === 'completed');
    }

    let finalScenarioStatus = 'draft';
    if (hasCompletedExecution) {
      finalScenarioStatus = 'completed';
    } else if (execution_history_action !== 'skip' && packageData.execution_history_summary?.length > 0) {
      const hasAnyExecution = packageData.execution_history_summary.some(e => e.status);
      if (hasAnyExecution) {
        finalScenarioStatus = packageData.execution_history_summary[packageData.execution_history_summary.length - 1]?.status || 'draft';
      }
    } else if (originalScenarioStatus) {
      finalScenarioStatus = originalScenarioStatus;
    }

    const scenario = await scenarioDao.create({
      name: newScenarioName,
      description: packageData.scenario?.description || '',
      api_version_id: apiVersion?.id || null,
      status: finalScenarioStatus
    });
    importedItems.scenarios.push({ action: scenarioAction === 'replace' ? 'replaced' : 'created', id: scenario.id });

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

    if (packageData.execution_history_summary?.length > 0) {
      const sortedExecutions = [...packageData.execution_history_summary].sort((a, b) => {
        const timeA = new Date(a.start_time || a.created_at).getTime();
        const timeB = new Date(b.start_time || b.created_at).getTime();
        return timeA - timeB;
      });
      
      const latestSuccessfulOriginalId = [...sortedExecutions].reverse().find(e => e.status === 'success' || e.status === 'completed')?.id 
        || sortedExecutions[sortedExecutions.length - 1]?.id;
      
      let lastExecutionId = null;
      for (const exec of sortedExecutions) {
        const createdExecution = await executionDao.create(scenario.id);
        await executionDao.update(createdExecution.id, {
          status: exec.status,
          start_time: exec.start_time,
          end_time: exec.end_time,
          logs: null
        });
        importedItems.executions.push({ 
          action: 'restored', 
          id: createdExecution.id,
          original_id: exec.id,
          status: exec.status,
          is_latest_successful: exec.id === latestSuccessfulOriginalId
        });
        lastExecutionId = createdExecution.id;
        
        if (exec.id === latestSuccessfulOriginalId) {
          importedItems.meta.restored_execution_id = createdExecution.id;
        }
      }
      
      if (packageData.latest_snapshot && execution_history_action !== 'skip' && lastExecutionId) {
        let snapshotExecutionId = lastExecutionId;
        
        if (packageData.latest_successful_execution_id && importedItems.meta.restored_execution_id) {
          snapshotExecutionId = importedItems.meta.restored_execution_id;
        }
        
        const snapshot = await snapshotDao.create(scenario.id, snapshotExecutionId, packageData.latest_snapshot.data);
        importedItems.snapshots = [{
          action: 'created', 
          id: snapshot.id,
          execution_id: snapshotExecutionId,
          original_execution_id: packageData.latest_snapshot.execution_id
        }];
        importedItems.meta.restored_snapshot_id = snapshot.id;
      }
    } else if (packageData.latest_snapshot && execution_history_action !== 'skip') {
      const snapshot = await snapshotDao.create(scenario.id, null, packageData.latest_snapshot.data);
      importedItems.snapshots.push({ action: 'created', id: snapshot.id, execution_id: null });
      importedItems.meta.restored_snapshot_id = snapshot.id;
    }

    return {
      success: true,
      imported_items: importedItems,
      new_scenario_id: scenario.id,
      new_scenario_name: newScenarioName,
      restored_status: finalScenarioStatus,
      traceability: {
        action: scenarioAction,
        original_scenario_id: packageData.original_scenario_id || null,
        original_scenario_name: packageData.scenario?.name || null,
        original_latest_execution_id: packageData.latest_successful_execution_id || null,
        restored_execution_id: importedItems.meta.restored_execution_id || null,
        restored_snapshot_id: importedItems.meta.restored_snapshot_id || null,
        restored_execution_count: importedItems.executions.length || 0,
        execution_count: packageData.execution_history_summary?.length || 0,
        replaced_scenario: importedItems.replaced,
        archived_scenario_id: replacedScenarioArchivedId,
        metadata: packageData.metadata || {}
      }
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

  async savePackageForRollback(scenarioId, packageData, importedItems, archivedScenarioId = null) {
    return await scenarioPackageDao.savePackage({
      scenario_id: scenarioId,
      action_type: 'import',
      package_data: packageData,
      imported_items: importedItems,
      archived_scenario_id: archivedScenarioId
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
    const archivedScenarioId = latestPackage.archived_scenario_id;

    let scenarioId = latestPackage.scenario_id;
    let cleanedResources = {
      scenario_id: null,
      api_version_id: null,
      field_mappings: [],
      compatibility_strategies: [],
      failure_injections: [],
      snapshots: [],
      executions: [],
      archived_scenario_id: archivedScenarioId
    };

    let restoredFromArchive = false;
    let restoredArchiveId = null;

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

    if (importedItems.replaced && archivedScenarioId) {
      const archivedData = await archivedScenarioDao.getLatestByScenarioId(importedItems.replaced.scenario_id);
      if (archivedData && archivedData.data) {
        const backup = archivedData.data;
        if (backup.scenario) {
          try {
            const restoredScenario = await scenarioDao.create({
              name: backup.scenario.name,
              description: backup.scenario.description,
              api_version_id: backup.scenario.api_version_id,
              status: backup.scenario.status
            });
            restoredArchiveId = restoredScenario.id;

            for (const injection of backup.failureInjections || []) {
              try {
                await failureInjectionDao.create({
                  scenario_id: restoredScenario.id,
                  type: injection.type,
                  probability: injection.probability,
                  config: injection.config,
                  enabled: injection.enabled
                });
              } catch (e) {}
            }

            const executionIdMap = {};
            for (const exec of backup.executions || []) {
              try {
                const newExec = await executionDao.create(restoredScenario.id);
                await executionDao.update(newExec.id, {
                  status: exec.status,
                  start_time: exec.start_time,
                  end_time: exec.end_time,
                  logs: exec.logs
                });
                executionIdMap[exec.id] = newExec.id;
              } catch (e) {}
            }

            for (const snap of backup.snapshots || []) {
              try {
                const mappedExecutionId = executionIdMap[snap.execution_id] || null;
                await snapshotDao.create(restoredScenario.id, mappedExecutionId, snap.data);
              } catch (e) {}
            }

            restoredFromArchive = true;
            cleanedResources.restored_from_archive = true;
            cleanedResources.restored_scenario_id = restoredScenario.id;
            cleanedResources.restored_scenario_name = backup.scenario.name;
            cleanedResources.restored_execution_count = backup.executions?.length || 0;
            cleanedResources.restored_snapshot_count = backup.snapshots?.length || 0;
            cleanedResources.restored_injection_count = backup.failureInjections?.length || 0;
          } catch (e) {
            console.error('Failed to restore from archive:', e);
          }
        }
      }

      await archivedScenarioDao.deleteByScenarioId(importedItems.replaced.scenario_id);
    }

    await scenarioPackageDao.delete(latestPackageId);

    return {
      success: true,
      rolled_back_scenario_id: scenarioId,
      rolled_back_scenario_name: originalScenarioName,
      had_package_record: true,
      had_scenario: !!scenarioId,
      restored_from_archive: restoredFromArchive,
      restored_scenario_id: restoredArchiveId,
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
        completed_count: executions.filter(e => e.status === 'success' || e.status === 'completed').length,
        snapshot_count: snapshots.length,
        latest_execution: executions[0] || null,
        latest_snapshot: snapshots[0] || null
      });
    }

    return result;
  }
}

module.exports = new ScenarioPackageService();
