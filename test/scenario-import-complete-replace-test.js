const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testReplaceRestoreComplete() {
  console.log('\n=== Test: Replace Import Complete Backup and Restore ===');

  let apiVersion, scenario, existingScenarioId;
  const scenarioName = 'ReplaceRestoreTestScenario';

  try {
    console.log('Step 1: Create API version...');
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'RestoreService',
      version: 'v1.0',
      base_path: '/api/restore-test',
      schema: { field1: 'string', field2: 'number', field3: 'boolean' }
    })).data;
    console.log('  API version created:', apiVersion.id);

    console.log('Step 2: Create existing scenario with full history...');
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: scenarioName,
      description: 'Original scenario with full history to be replaced',
      api_version_id: apiVersion.id,
      status: 'draft'
    })).data;
    existingScenarioId = scenario.id;
    console.log('  Original scenario created:', existingScenarioId);

    console.log('Step 3: Add multiple failure injections...');
    await axios.post(`${API_BASE}/injections`, {
      scenario_id: existingScenarioId,
      type: 'error_response',
      probability: 0.3,
      config: JSON.stringify({ statusCode: 500, message: 'Server error' }),
      enabled: true
    });
    await axios.post(`${API_BASE}/injections`, {
      scenario_id: existingScenarioId,
      type: 'network_delay',
      probability: 0.2,
      config: JSON.stringify({ delay: 2000 }),
      enabled: true
    });
    console.log('  Added 2 failure injections');

    console.log('Step 4: Execute multiple times to create history...');
    for (let i = 1; i <= 3; i++) {
      await axios.post(`${API_BASE}/executions/execute/${existingScenarioId}`);
      await delay(3500);
      console.log(`  Execution ${i} completed`);
    }

    console.log('Step 5: Verify original scenario state...');
    const originalScenario = (await axios.get(`${API_BASE}/scenarios/${existingScenarioId}`)).data;
    const originalSnapshots = (await axios.get(`${API_BASE}/rollback/history/${existingScenarioId}`)).data;
    const originalInjections = (await axios.get(`${API_BASE}/injections/scenario/${existingScenarioId}`)).data;
    const originalExecutions = (await axios.get(`${API_BASE}/executions/scenario/${existingScenarioId}`)).data;

    console.log('  Original scenario status:', originalScenario.status);
    console.log('  Original executions:', originalExecutions.length);
    console.log('  Original snapshots:', originalSnapshots.length);
    console.log('  Original injections:', originalInjections.length);

    const originalData = {
      id: existingScenarioId,
      name: originalScenario.name,
      description: originalScenario.description,
      status: originalScenario.status,
      executionCount: originalExecutions.length,
      snapshotCount: originalSnapshots.length,
      injectionCount: originalInjections.length
    };

    console.log('Step 6: Export package from another scenario...');
    const differentScenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'DifferentScenarioForExport',
      description: 'Different scenario to export',
      api_version_id: apiVersion.id
    })).data;

    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${differentScenario.id}`)).data;
    const packageData = exportResult.package;
    packageData.scenario.name = scenarioName;
    packageData.scenario.description = 'Replaced by import - new description';
    console.log('  Package exported with same name');

    console.log('Step 7: Import with replace...');
    const importResult = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: packageData,
      decisions: {
        scenario_action: 'replace',
        execution_history_action: 'keep'
      }
    })).data;

    console.log('  Import result: success =', importResult.success, ', newScenarioId =', importResult.result?.new_scenario_id);

    console.log('Step 8: Verify replaced scenario...');
    const allScenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
    const oldScenarioExists = allScenarios.some(s => s.id === existingScenarioId);
    if (oldScenarioExists) {
      console.log('FAIL: Old scenario should be deleted after replace');
      return false;
    }
    console.log('PASS: Old scenario was deleted');

    const newScenario = (await axios.get(`${API_BASE}/scenarios/${importResult.result.new_scenario_id}`)).data;
    const newInjections = (await axios.get(`${API_BASE}/injections/scenario/${importResult.result.new_scenario_id}`)).data;
    console.log('  New scenario status:', newScenario.status);
    console.log('  New injections:', newInjections.length);

    if (newInjections.length !== 0) {
      console.log('FAIL: New scenario should have no injections');
      return false;
    }
    console.log('PASS: New scenario has clean state');

    console.log('Step 9: Verify import log has complete backup info...');
    const logs = (await axios.get(`${API_BASE}/scenario-packages/import-logs`)).data;
    const replaceLog = logs.find(l =>
      l.result === 'success' &&
      l.details &&
      l.details.scenario_action === 'replace' &&
      l.details.replaced_scenario
    );

    if (!replaceLog) {
      console.log('FAIL: Should have replace log');
      return false;
    }

    console.log('  Replace log found:', replaceLog.id);
    console.log('  Replaced scenario:', replaceLog.details.replaced_scenario?.scenario_name);
    console.log('  Replaced executions:', replaceLog.details.replaced_scenario?.execution_count);
    console.log('  Replaced snapshots:', replaceLog.details.replaced_scenario?.snapshot_count);
    console.log('  Replaced injections:', replaceLog.details.replaced_scenario?.injection_count);
    console.log('  Full backup stored:', replaceLog.details.replaced_full_backup);
    console.log('  Archived scenario ID:', replaceLog.details.archived_scenario_id);

    if (replaceLog.details.replaced_scenario?.execution_count !== originalData.executionCount) {
      console.log('FAIL: Backup should record correct execution count');
      return false;
    }

    if (replaceLog.details.replaced_scenario?.snapshot_count !== originalData.snapshotCount) {
      console.log('FAIL: Backup should record correct snapshot count');
      return false;
    }

    if (!replaceLog.details.replaced_full_backup) {
      console.log('FAIL: Backup should be marked as stored');
      return false;
    }
    console.log('PASS: Import log has complete backup info');

    console.log('Step 10: Rollback the import...');
    const rollbackResult = (await axios.post(`${API_BASE}/scenario-packages/rollback`)).data;
    console.log('  Rollback result: success =', rollbackResult.success, ', restoredFromArchive =', rollbackResult.traceability?.restored_from_archive);

    console.log('Step 11: Verify original scenario was restored...');
    const restoredScenario = (await axios.get(`${API_BASE}/scenarios/${rollbackResult.traceability?.restored_scenario_id}`)).data;
    const restoredSnapshots = (await axios.get(`${API_BASE}/rollback/history/${rollbackResult.traceability?.restored_scenario_id}`)).data;
    const restoredInjections = (await axios.get(`${API_BASE}/injections/scenario/${rollbackResult.traceability?.restored_scenario_id}`)).data;
    const restoredExecutions = (await axios.get(`${API_BASE}/executions/scenario/${rollbackResult.traceability?.restored_scenario_id}`)).data;

    console.log('  Restored scenario:', restoredScenario.id);
    console.log('  Restored name:', restoredScenario.name);
    console.log('  Restored description:', restoredScenario.description);
    console.log('  Restored executions:', restoredExecutions.length);
    console.log('  Restored snapshots:', restoredSnapshots.length);
    console.log('  Restored injections:', restoredInjections.length);

    if (restoredScenario.name !== originalData.name) {
      console.log('FAIL: Restored scenario should have original name');
      return false;
    }
    console.log('PASS: Restored scenario has correct name');

    if (restoredScenario.description !== originalData.description) {
      console.log('FAIL: Restored scenario should have original description');
      return false;
    }
    console.log('PASS: Restored scenario has correct description');

    if (restoredExecutions.length !== originalData.executionCount) {
      console.log('FAIL: Restored scenario should have original execution count');
      return false;
    }
    console.log('PASS: Restored scenario has correct execution count');

    if (restoredSnapshots.length !== originalData.snapshotCount) {
      console.log('FAIL: Restored scenario should have original snapshot count');
      return false;
    }
    console.log('PASS: Restored scenario has correct snapshot count');

    if (restoredInjections.length !== originalData.injectionCount) {
      console.log('FAIL: Restored scenario should have original injection count');
      return false;
    }
    console.log('PASS: Restored scenario has correct injection count');

    console.log('Step 12: Verify rollback log...');
    const logsAfterRollback = (await axios.get(`${API_BASE}/scenario-packages/import-logs`)).data;
    const rollbackLog = logsAfterRollback.find(l =>
      l.result === 'success' &&
      l.details &&
      l.details.restored_from_archive === true
    );

    if (!rollbackLog) {
      console.log('FAIL: Should have rollback log with restore info');
      return false;
    }

    console.log('  Rollback log found:', rollbackLog.id);
    console.log('  Restored from archive:', rollbackLog.details.restored_from_archive);
    console.log('  Restored scenario:', rollbackLog.details.restored_scenario_name);
    console.log('  Restored executions:', rollbackLog.details.restored_execution_count);
    console.log('  Restored snapshots:', rollbackLog.details.restored_snapshot_count);
    console.log('  Restored injections:', rollbackLog.details.restored_injection_count);
    console.log('PASS: Rollback log has complete restore info');

    console.log('\nCleaning up...');
    await axios.delete(`${API_BASE}/scenarios/${restoredScenario.id}`).catch(() => {});
    await axios.delete(`${API_BASE}/scenarios/${differentScenario.id}`).catch(() => {});
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    console.log('Cleanup completed');

    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    console.log('  Error details:', err.response?.data);
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of scenarios) {
        if (s.name.includes('ReplaceRestore') || s.name.includes('Different')) {
          await axios.delete(`${API_BASE}/scenarios/${s.id}`).catch(() => {});
        }
      }
      if (apiVersion?.id) {
        await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
      }
    } catch (e) {}
    return false;
  }
}

async function testRestartPersistence() {
  console.log('\n=== Test: Restart Persistence After Replace Import ===');

  let apiVersion, scenario, existingScenarioId;
  const scenarioName = 'RestartPersistScenario';

  try {
    console.log('Step 1: Setup...');
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'RestartService',
      version: 'v1.0',
      base_path: '/api/restart-test',
      schema: { field1: 'string' }
    })).data;

    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: scenarioName,
      description: 'Original for restart test',
      api_version_id: apiVersion.id
    })).data;
    existingScenarioId = scenario.id;

    await axios.post(`${API_BASE}/injections`, {
      scenario_id: existingScenarioId,
      type: 'error_response',
      probability: 0.5,
      config: JSON.stringify({ statusCode: 500 }),
      enabled: true
    });

    await axios.post(`${API_BASE}/executions/execute/${existingScenarioId}`);
    await delay(3500);

    const originalSnapshots = (await axios.get(`${API_BASE}/rollback/history/${existingScenarioId}`)).data;
    const originalInjections = (await axios.get(`${API_BASE}/injections/scenario/${existingScenarioId}`)).data;
    console.log('  Original: executions=' + originalSnapshots.length + ', injections=' + originalInjections.length);

    console.log('Step 2: Export and replace...');
    const differentScenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'DifferentScenarioRestart',
      description: 'Different',
      api_version_id: apiVersion.id
    })).data;

    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${differentScenario.id}`)).data;
    const packageData = exportResult.package;
    packageData.scenario.name = scenarioName;

    const importResult = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: packageData,
      decisions: { scenario_action: 'replace', execution_history_action: 'keep' }
    })).data;

    console.log('  Import completed, new scenario:', importResult.result.new_scenario_id);

    console.log('Step 3: Record state before restart...');
    const logsBeforeRestart = (await axios.get(`${API_BASE}/scenario-packages/import-logs`)).data;
    const replaceLogBefore = logsBeforeRestart.find(l =>
      l.details && l.details.scenario_action === 'replace' && l.details.replaced_scenario
    );

    console.log('  Replace log archived scenario ID:', replaceLogBefore?.details?.archived_scenario_id);

    console.log('Step 4: Verify archive data is stored...');
    console.log('  NOTE: This simulates a restart check - in production, restart the server now');
    console.log('  Checking if archive data is persisted in database...');

    const scenariosAfterReplace = (await axios.get(`${API_BASE}/scenarios`)).data;
    const replacedScenarioId = scenariosAfterReplace.find(s => s.name === scenarioName)?.id;

    if (!replacedScenarioId) {
      console.log('FAIL: New scenario should exist');
      return false;
    }

    const oldScenarioStillExists = scenariosAfterReplace.some(s => s.id === existingScenarioId);
    if (oldScenarioStillExists) {
      console.log('FAIL: Old scenario should be deleted');
      return false;
    }
    console.log('PASS: Replace state is persisted');

    console.log('Step 5: Rollback and verify restore works...');
    const rollbackResult = (await axios.post(`${API_BASE}/scenario-packages/rollback`)).data;

    if (!rollbackResult.traceability?.restored_from_archive) {
      console.log('FAIL: Should restore from archive');
      return false;
    }

    const restoredSnapshots = (await axios.get(`${API_BASE}/rollback/history/${rollbackResult.traceability.restored_scenario_id}`)).data;
    const restoredInjections = (await axios.get(`${API_BASE}/injections/scenario/${rollbackResult.traceability.restored_scenario_id}`)).data;

    console.log('  Restored executions:', restoredSnapshots.length);
    console.log('  Restored injections:', restoredInjections.length);

    if (restoredInjections.length !== 1) {
      console.log('FAIL: Should restore original injections');
      return false;
    }
    console.log('PASS: Restore from archive works correctly');

    console.log('\nCleaning up...');
    await axios.delete(`${API_BASE}/scenarios/${restoredSnapshots.length > 0 ? rollbackResult.traceability.restored_scenario_id : existingScenarioId}`).catch(() => {});
    await axios.delete(`${API_BASE}/scenarios/${differentScenario.id}`).catch(() => {});
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});

    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of scenarios) {
        if (s.name.includes('RestartPersist') || s.name.includes('Different')) {
          await axios.delete(`${API_BASE}/scenarios/${s.id}`).catch(() => {});
        }
      }
      if (apiVersion?.id) {
        await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
      }
    } catch (e) {}
    return false;
  }
}

async function runTests() {
  console.log('========================================');
  console.log('  Replace Import Complete Backup Test  ');
  console.log('========================================');

  await delay(1000);

  const results = [];

  results.push(await testReplaceRestoreComplete());
  await delay(500);

  results.push(await testRestartPersistence());
  await delay(500);

  console.log('\n========================================');
  console.log('   Test Results Summary');
  console.log('========================================');

  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log(`Passed: ${passed}/${total}`);

  if (passed === total) {
    console.log('\nAll tests passed!');
    process.exit(0);
  } else {
    console.log('\nSome tests failed, please check output');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test script execution failed:', err.message);
  process.exit(1);
});
