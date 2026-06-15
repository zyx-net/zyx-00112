const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testExportWritesLog() {
  console.log('\n=== Test A: Export Writes Log ===');
  
  let apiVersion, scenario;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'ExportLogTestService',
      version: 'v1.0',
      base_path: '/api/export-log-test',
      schema: {}
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'ExportLogTestScenario',
      description: 'For export log test',
      api_version_id: apiVersion.id
    })).data;
    
    const beforeLogs = (await axios.get(`${API_BASE}/scenario-packages/import-logs`)).data;
    const beforeCount = beforeLogs.length;
    
    await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`);
    
    const afterLogs = (await axios.get(`${API_BASE}/scenario-packages/import-logs`)).data;
    const afterCount = afterLogs.length;
    
    if (afterCount !== beforeCount + 1) {
      console.log('FAIL: Export did not create log entry');
      console.log(`  Before: ${beforeCount}, After: ${afterCount}`);
      return false;
    }
    
    const latestLog = afterLogs[0];
    if (latestLog.source_package !== 'export' || latestLog.result !== 'export') {
      console.log('FAIL: Log entry does not have correct type');
      console.log('  Source:', latestLog.source_package, 'Result:', latestLog.result);
      return false;
    }
    
    console.log('PASS: Export writes log entry');
    console.log('  Log source:', latestLog.source_package);
    console.log('  Log result:', latestLog.result);
    
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`);
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    
    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    return false;
  }
}

async function testEmptyDecisionsRejected() {
  console.log('\n=== Test B: Empty Decisions Rejected ===');
  
  let apiVersion, scenario;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'EmptyDecisionsTestService',
      version: 'v1.0',
      base_path: '/api/empty-decisions-test',
      schema: {}
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'EmptyDecisionsTestScenario',
      description: 'For empty decisions test',
      api_version_id: apiVersion.id
    })).data;
    
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    const packageData = exportResult.package;
    
    try {
      await axios.post(`${API_BASE}/scenario-packages/import`, {
        package_data: packageData,
        decisions: {}
      });
      
      console.log('FAIL: Import with empty decisions should be rejected when conflicts exist');
      
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      const importedScenario = scenarios.find(s => s.name === 'EmptyDecisionsTestScenario');
      if (importedScenario) {
        await axios.delete(`${API_BASE}/scenarios/${importedScenario.id}`);
      }
      
      return false;
    } catch (err) {
      if (err.response?.status === 409) {
        console.log('PASS: Import with empty decisions correctly rejected');
        console.log('  Error:', err.response.data.error);
        return true;
      } else {
        console.log('FAIL: Wrong error status');
        console.log('  Status:', err.response?.status);
        console.log('  Data:', err.response?.data);
        return false;
      }
    }
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    return false;
  } finally {
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      const testScenario = scenarios.find(s => s.name === 'EmptyDecisionsTestScenario');
      if (testScenario) {
        await axios.delete(`${API_BASE}/scenarios/${testScenario.id}`);
      }
      await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    } catch (e) {
      console.log('Cleanup warning:', e.message);
    }
  }
}

async function testImportRestoresHistoryAndSnapshot() {
  console.log('\n=== Test C: Import Restores History and Snapshot ===');
  
  let apiVersion, scenario, execution, snapshot;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'HistoryRestoreTestService',
      version: 'v1.0',
      base_path: '/api/history-restore-test',
      schema: {}
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'HistoryRestoreTestScenario',
      description: 'For history restore test',
      api_version_id: apiVersion.id
    })).data;
    
    execution = (await axios.post(`${API_BASE}/executions/execute/${scenario.id}`)).data;
    
    const snapshots = (await axios.get(`${API_BASE}/rollback/history/${scenario.id}`)).data;
    snapshot = snapshots.find(s => s.scenario_id === scenario.id);
    
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    const packageData = exportResult.package;
    
    if (!packageData.execution_history_summary || packageData.execution_history_summary.length === 0) {
      console.log('FAIL: Export should include execution history');
      return false;
    }
    
    if (!packageData.latest_snapshot) {
      console.log('FAIL: Export should include latest snapshot');
      return false;
    }
    
    console.log('PASS: Export includes history and snapshot');
    console.log('  Execution history count:', packageData.execution_history_summary.length);
    console.log('  Has snapshot:', !!packageData.latest_snapshot);
    
    await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: packageData,
      decisions: {
        duplicate_name: 'save_as',
        execution_history_action: 'keep'
      }
    });
    
    const scenariosWithHistory = (await axios.get(`${API_BASE}/scenario-packages/scenarios-with-history`)).data;
    const importedScenario = scenariosWithHistory.find(s => 
      s.name.includes('HistoryRestoreTestScenario_imported_')
    );
    
    if (!importedScenario) {
      console.log('FAIL: Imported scenario not found');
      return false;
    }
    
    if (importedScenario.execution_count === 0) {
      console.log('FAIL: Imported scenario should have execution history');
      return false;
    }
    
    if (importedScenario.snapshot_count === 0) {
      console.log('FAIL: Imported scenario should have snapshot');
      return false;
    }
    
    console.log('PASS: Import restored history and snapshot');
    console.log('  Execution count:', importedScenario.execution_count);
    console.log('  Snapshot count:', importedScenario.snapshot_count);
    
    await axios.delete(`${API_BASE}/scenarios/${importedScenario.id}`);
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`);
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    
    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of scenarios) {
        if (s.name.includes('HistoryRestoreTestScenario')) {
          await axios.delete(`${API_BASE}/scenarios/${s.id}`);
        }
      }
      await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    } catch (e) {}
    return false;
  }
}

async function testRollbackCleansRelatedResources() {
  console.log('\n=== Test D: Rollback Cleans Related Resources ===');
  
  let apiVersion, scenario;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'RollbackCleanupTestService',
      version: 'v1.0',
      base_path: '/api/rollback-cleanup-test',
      schema: { user_name: 'string' }
    })).data;
    
    await axios.post(`${API_BASE}/field-mappings`, {
      api_version_id: apiVersion.id,
      source_field: 'user_name',
      target_field: 'username',
      transform_type: 'direct'
    });
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'RollbackCleanupTestScenario',
      description: 'For rollback cleanup test',
      api_version_id: apiVersion.id
    })).data;
    
    await axios.post(`${API_BASE}/injections`, {
      scenario_id: scenario.id,
      type: 'network_delay',
      probability: 0.5,
      config: { delay: 100 },
      enabled: true
    });
    
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    const packageData = exportResult.package;
    
    await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: packageData,
      decisions: {
        duplicate_name: 'save_as'
      }
    });
    
    const beforeVersions = (await axios.get(`${API_BASE}/versions`)).data;
    const beforeMappings = (await axios.get(`${API_BASE}/field-mappings`)).data;
    const beforeScenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
    
    const beforeVersionCount = beforeVersions.filter(v => v.name === 'RollbackCleanupTestService').length;
    const beforeMappingCount = beforeMappings.filter(m => m.source_field === 'user_name').length;
    const beforeScenarioCount = beforeScenarios.filter(s => s.name.includes('RollbackCleanupTestScenario')).length;
    
    console.log('  Before rollback:');
    console.log('    API versions:', beforeVersionCount);
    console.log('    Field mappings:', beforeMappingCount);
    console.log('    Scenarios:', beforeScenarioCount);
    
    const rollbackResult = (await axios.post(`${API_BASE}/scenario-packages/rollback`)).data;
    
    if (!rollbackResult.success) {
      console.log('FAIL: Rollback failed');
      return false;
    }
    
    if (!rollbackResult.result.had_scenario) {
      console.log('FAIL: Rollback did not find scenario to delete');
      return false;
    }
    
    const afterVersions = (await axios.get(`${API_BASE}/versions`)).data;
    const afterMappings = (await axios.get(`${API_BASE}/field-mappings`)).data;
    const afterScenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
    
    const afterVersionCount = afterVersions.filter(v => v.name === 'RollbackCleanupTestService').length;
    const afterMappingCount = afterMappings.filter(m => m.source_field === 'user_name').length;
    const afterScenarioCount = afterScenarios.filter(s => s.name.includes('RollbackCleanupTestScenario')).length;
    
    console.log('  After rollback:');
    console.log('    API versions:', afterVersionCount);
    console.log('    Field mappings:', afterMappingCount);
    console.log('    Scenarios:', afterScenarioCount);
    
    if (afterScenarioCount !== beforeScenarioCount - 1) {
      console.log('FAIL: Scenario count should decrease by 1');
      console.log(`  Expected: ${beforeScenarioCount - 1}, Got: ${afterScenarioCount}`);
      return false;
    }
    
    if (!rollbackResult.result.had_scenario) {
      console.log('FAIL: Rollback did not find scenario to delete');
      return false;
    }
    
    if (afterVersionCount !== beforeVersionCount - 1) {
      console.log('FAIL: API version count should decrease by 1');
      console.log(`  Expected: ${beforeVersionCount - 1}, Got: ${afterVersionCount}`);
      return false;
    }
    
    if (afterMappingCount !== beforeMappingCount - 1) {
      console.log('FAIL: Field mapping count should decrease by 1');
      console.log(`  Expected: ${beforeMappingCount - 1}, Got: ${afterMappingCount}`);
      return false;
    }
    
    console.log('PASS: Rollback cleaned related resources');
    
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`);
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    
    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of scenarios) {
        if (s.name.includes('RollbackCleanupTestScenario')) {
          await axios.delete(`${API_BASE}/scenarios/${s.id}`);
        }
      }
      const versions = (await axios.get(`${API_BASE}/versions`)).data;
      for (const v of versions) {
        if (v.name === 'RollbackCleanupTestService') {
          await axios.delete(`${API_BASE}/versions/${v.id}`);
        }
      }
    } catch (e) {}
    return false;
  }
}

async function runTests() {
  console.log('========================================');
  console.log('   Scenario Package Regression Tests');
  console.log('========================================');

  await delay(1000);

  const results = [];
  
  results.push(await testExportWritesLog());
  await delay(500);
  
  results.push(await testEmptyDecisionsRejected());
  await delay(500);
  
  results.push(await testImportRestoresHistoryAndSnapshot());
  await delay(500);
  
  results.push(await testRollbackCleansRelatedResources());
  
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
