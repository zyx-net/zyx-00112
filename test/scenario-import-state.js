const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testImportRestoresScenarioStatus() {
  console.log('\n=== Test G: Import Restores Scenario Status ===');
  
  let apiVersion, scenario;
  
  try {
    console.log('Creating API version...');
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'StatusRestoreService',
      version: 'v1.0',
      base_path: '/api/status-restore',
      schema: {}
    })).data;
    
    console.log('Creating scenario...');
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'StatusRestoreScenario',
      description: 'For status restore test',
      api_version_id: apiVersion.id,
      status: 'draft'
    })).data;
    
    console.log('Executing...');
    const execResult = (await axios.post(`${API_BASE}/executions/execute/${scenario.id}`)).data;
    await delay(5000);
    
    console.log('Getting scenario...');
    const updatedScenario = (await axios.get(`${API_BASE}/scenarios/${scenario.id}`)).data;
    
    if (updatedScenario.status !== 'completed') {
      console.log('FAIL: Scenario should be completed after commit, got:', updatedScenario.status);
      return false;
    }
    
    console.log('PASS: Original scenario status is completed');
    
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    const packageData = exportResult.package;
    
    const importResult = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: packageData,
      decisions: { duplicate_name: 'save_as', execution_history_action: 'keep' }
    })).data;
    
    console.log('PASS: Import completed');
    
    const importedScenarioId = importResult.result.new_scenario_id;
    const importedScenario = (await axios.get(`${API_BASE}/scenarios/${importedScenarioId}`)).data;
    
    if (importedScenario.status !== 'completed') {
      console.log('FAIL: Imported scenario should have status completed, got:', importedScenario.status);
      return false;
    }
    
    console.log('PASS: Imported scenario status is completed');
    
    await axios.delete(`${API_BASE}/scenarios/${importedScenarioId}`);
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`);
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    
    return true;
  } catch (err) {
    console.log('FAIL:', err.message || err);
    console.log('  Error type:', err.constructor.name);
    console.log('  Error details:', err);
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of scenarios) {
        if (s.name.includes('StatusRestoreScenario')) {
          await axios.delete(`${API_BASE}/scenarios/${s.id}`);
        }
      }
      await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    } catch (e) {}
    return false;
  }
}

async function testImportSnapshotExecutionRelation() {
  console.log('\n=== Test H: Import Snapshot Execution Relation ===');
  
  let apiVersion, scenario;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'SnapshotRelationService',
      version: 'v1.0',
      base_path: '/api/snapshot-relation',
      schema: {}
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'SnapshotRelationScenario',
      description: 'For snapshot relation test',
      api_version_id: apiVersion.id
    })).data;
    
    console.log('Executing...');
    const execResult = (await axios.post(`${API_BASE}/executions/execute/${scenario.id}`)).data;
    
    console.log('  Execution result:', JSON.stringify(execResult));
    
    const executionId = execResult.executionId;
    
    await delay(5000);
    
    const snapshotsBefore = (await axios.get(`${API_BASE}/rollback/history/${scenario.id}`)).data;
    console.log('  Snapshots before:', JSON.stringify(snapshotsBefore));
    const snapshotBefore = snapshotsBefore.find(s => s.scenarioId === scenario.id);
    
    if (!snapshotBefore) {
      console.log('FAIL: No snapshot found before export');
      return false;
    }
    
    console.log('PASS: Snapshot exists');
    console.log('  - Snapshot execution_id:', snapshotBefore.executionId);
    
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    const packageData = exportResult.package;
    
    if (!packageData.latest_snapshot) {
      console.log('FAIL: No snapshot in package');
      return false;
    }
    
    console.log('PASS: Exported snapshot with execution_id:', packageData.latest_snapshot.execution_id);
    
    const importResult = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: packageData,
      decisions: { duplicate_name: 'save_as', execution_history_action: 'keep' }
    })).data;
    
    console.log('PASS: Import completed');
    
    const importedScenarioId = importResult.result.new_scenario_id;
    
    const rollbackHistory = (await axios.get(`${API_BASE}/rollback/history/${importedScenarioId}`)).data;
    const importedSnapshot = rollbackHistory.find(s => s.scenarioId === importedScenarioId);
    
    if (!importedSnapshot) {
      console.log('FAIL: No snapshot found after import');
      return false;
    }
    
    console.log('PASS: Imported snapshot found');
    console.log('  - Snapshot execution_id:', importedSnapshot.executionId);
    
    if (!importedSnapshot.executionId) {
      console.log('FAIL: Snapshot should have execution_id');
      return false;
    }
    
    console.log('PASS: Imported snapshot has correct execution_id');
    
    const importedScenario = (await axios.get(`${API_BASE}/scenarios/${importedScenarioId}`)).data;
    
    if (importedScenario.status !== 'completed') {
      console.log('FAIL: Imported scenario with execution history should be completed, got:', importedScenario.status);
      return false;
    }
    
    console.log('PASS: Imported scenario status is completed (restored with execution history)');
    
    await axios.delete(`${API_BASE}/scenarios/${importedScenarioId}`);
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`);
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    
    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    console.log('  Response status:', err.response?.status);
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of scenarios) {
        if (s.name.includes('SnapshotRelationScenario')) {
          await axios.delete(`${API_BASE}/scenarios/${s.id}`);
        }
      }
      await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    } catch (e) {}
    return false;
  }
}

async function testRollbackPreservesCorrectSnapshots() {
  console.log('\n=== Test I: Rollback Preserves Correct Snapshots ===');
  
  let apiVersion, scenario;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'RollbackSnapshotService',
      version: 'v1.0',
      base_path: '/api/rollback-snapshot',
      schema: {}
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'RollbackSnapshotScenario',
      description: 'For rollback snapshot test',
      api_version_id: apiVersion.id
    })).data;
    
    const execResult1 = (await axios.post(`${API_BASE}/executions/execute/${scenario.id}`)).data;
    await delay(2000);
    
    console.log('PASS: First execution');
    
    const execResult2 = (await axios.post(`${API_BASE}/executions/execute/${scenario.id}`)).data;
    await delay(5000);
    
    console.log('PASS: Second execution');
    
    const snapshots = (await axios.get(`${API_BASE}/rollback/history/${scenario.id}`)).data;
    console.log('  All snapshots:', JSON.stringify(snapshots));
    const scenarioSnapshots = snapshots.filter(s => s.scenarioId === scenario.id);
    
    if (scenarioSnapshots.length < 2) {
      console.log('FAIL: Should have at least 2 snapshots');
      return false;
    }
    
    console.log('PASS: Original scenario has', scenarioSnapshots.length, 'snapshots');
    
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    const packageData = exportResult.package;
    
    const importResult1 = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: packageData,
      decisions: { duplicate_name: 'save_as', execution_history_action: 'keep' }
    })).data;
    
    console.log('PASS: First import completed');
    
    const importResult2 = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: packageData,
      decisions: { duplicate_name: 'save_as', execution_history_action: 'keep' }
    })).data;
    
    console.log('PASS: Second import completed');
    
    const rollbackResult = (await axios.post(`${API_BASE}/scenario-packages/rollback`)).data;
    
    console.log('PASS: Rollback completed');
    console.log('  - Rolled back scenario ID:', rollbackResult.result.rolled_back_scenario_id);
    
    const remainingScenarioId = importResult1.result.new_scenario_id;
    const remainingSnapshots = (await axios.get(`${API_BASE}/rollback/history/${remainingScenarioId}`)).data;
    const remainingScenarioSnapshots = remainingSnapshots.filter(s => s.scenarioId === remainingScenarioId);
    
    if (remainingScenarioSnapshots.length === 0) {
      console.log('FAIL: Remaining scenario should have at least 1 snapshot');
      return false;
    }
    
    console.log('PASS: Remaining scenario has', remainingScenarioSnapshots.length, 'snapshots');
    
    for (const snap of remainingScenarioSnapshots) {
      if (!snap.executionId) {
        console.log('FAIL: All snapshots should have execution_id');
        return false;
      }
    }
    
    console.log('PASS: All remaining snapshots have execution_id');
    
    await axios.delete(`${API_BASE}/scenarios/${remainingScenarioId}`);
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`);
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    
    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of scenarios) {
        if (s.name.includes('RollbackSnapshotScenario')) {
          await axios.delete(`${API_BASE}/scenarios/${s.id}`);
        }
      }
      await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    } catch (e) {}
    return false;
  }
}

async function runTests() {
  console.log('========================================');
  console.log('   Scenario Package Import State Tests');
  console.log('========================================');

  await delay(1000);

  const results = [];
  
  results.push(await testImportRestoresScenarioStatus());
  await delay(500);
  
  results.push(await testImportSnapshotExecutionRelation());
  await delay(500);
  
  results.push(await testRollbackPreservesCorrectSnapshots());
  
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
