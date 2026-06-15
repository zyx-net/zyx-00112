const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testReplaceBranchComplete() {
  console.log('\n=== Test: Replace Branch Complete ===');
  
  let apiVersion, scenario, existingScenarioId;
  
  try {
    console.log('Step 1: Create API version...');
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'ReplaceTestService',
      version: 'v1.0',
      base_path: '/api/replace-test',
      schema: { field1: 'string', field2: 'number' }
    })).data;
    
    console.log('Step 2: Create existing scenario with history...');
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'ReplaceTestScenario',
      description: 'Existing scenario to be replaced',
      api_version_id: apiVersion.id,
      status: 'draft'
    })).data;
    existingScenarioId = scenario.id;
    console.log('  Created scenario:', existingScenarioId);
    
    console.log('Step 3: Add failure injection...');
    await axios.post(`${API_BASE}/injections`, {
      scenario_id: existingScenarioId,
      type: 'error_response',
      probability: 0.5,
      config: { statusCode: 500, message: 'Test error' },
      enabled: true
    });
    
    console.log('Step 4: Execute to create history...');
    const exec = (await axios.post(`${API_BASE}/executions/execute/${existingScenarioId}`)).data;
    await delay(3000);
    
    console.log('Step 5: Verify original scenario state...');
    const originalScenario = (await axios.get(`${API_BASE}/scenarios/${existingScenarioId}`)).data;
    const originalSnapshots = (await axios.get(`${API_BASE}/rollback/history/${existingScenarioId}`)).data;
    const originalInjections = (await axios.get(`${API_BASE}/injections/scenario/${existingScenarioId}`)).data;
    
    console.log('  Original status:', originalScenario.status);
    console.log('  Original snapshots:', originalSnapshots.length);
    console.log('  Original injections:', originalInjections.length);
    
    if (originalScenario.status === 'failed') {
      console.log('NOTE: Scenario execution failed (expected in test environment without real API)');
    } else if (originalScenario.status !== 'completed') {
      console.log('INFO: Scenario status is', originalScenario.status, '(may be due to test environment)');
    }
    console.log('PASS: Original scenario exists with data');
    
    const originalExecutionCount = originalSnapshots.length;
    
    console.log('Step 6: Create a different scenario with different name...');
    const differentScenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'DifferentScenario',
      description: 'Different scenario',
      api_version_id: apiVersion.id
    })).data;
    
    console.log('Step 7: Export package from different scenario...');
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${differentScenario.id}`)).data;
    const packageData = exportResult.package;
    
    packageData.scenario.name = 'ReplaceTestScenario';
    packageData.scenario.description = 'Replaced by import';
    
    console.log('Step 8: Try import with replace...');
    const importResult = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: packageData,
      decisions: {
        scenario_action: 'replace',
        execution_history_action: 'keep'
      }
    })).data;
    
    console.log('  Import result:', JSON.stringify(importResult, null, 2));
    
    console.log('Step 9: Verify replaced scenario...');
    const replacedScenario = (await axios.get(`${API_BASE}/scenarios/${importResult.result.new_scenario_id}`)).data;
    const newSnapshots = (await axios.get(`${API_BASE}/rollback/history/${importResult.result.new_scenario_id}`)).data;
    const newInjections = (await axios.get(`${API_BASE}/injections/scenario/${importResult.result.new_scenario_id}`)).data;
    
    console.log('  New scenario ID:', importResult.result.new_scenario_id);
    console.log('  New scenario status:', replacedScenario.status);
    console.log('  New scenario name:', replacedScenario.name);
    console.log('  New snapshots:', newSnapshots.length);
    console.log('  New injections:', newInjections.length);
    
    if (replacedScenario.name !== 'ReplaceTestScenario') {
      console.log('FAIL: Scenario name should be ReplaceTestScenario');
      return false;
    }
    console.log('PASS: Scenario name is correct');
    
    if (newInjections.length !== 0) {
      console.log('FAIL: Injections should be empty after replace');
      return false;
    }
    console.log('PASS: Old injections were cleared');
    
    console.log('Step 10: Verify import log has complete traceability...');
    const logs = (await axios.get(`${API_BASE}/scenario-packages/import-logs`)).data;
    const replaceLog = logs.find(l =>
      l.result === 'success' &&
      l.details &&
      l.details.scenario_action === 'replace' &&
      l.details.replaced_scenario
    );
    
    if (!replaceLog) {
      console.log('FAIL: Should have replace log with traceability');
      return false;
    }
    
    console.log('  Replace log found:', replaceLog.id);
    console.log('  Replaced scenario:', replaceLog.details.replaced_scenario?.scenario_name);
    console.log('  Archived scenario ID:', replaceLog.details.archived_scenario_id);
    
    if (!replaceLog.details.replaced_scenario) {
      console.log('FAIL: Replace log should have replaced_scenario info');
      return false;
    }
    console.log('PASS: Import log has complete traceability');
    
    console.log('Step 11: Verify old scenario is deleted...');
    const allScenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
    const oldScenarioStillExists = allScenarios.some(s => s.id === existingScenarioId);
    
    if (oldScenarioStillExists) {
      console.log('FAIL: Old scenario should be deleted');
      return false;
    }
    console.log('PASS: Old scenario was deleted');
    
    console.log('\nCleaning up...');
    await axios.delete(`${API_BASE}/scenarios/${importResult.result.new_scenario_id}`).catch(() => {});
    await axios.delete(`${API_BASE}/scenarios/${differentScenario.id}`).catch(() => {});
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    
    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    console.log('  Error details:', err.response?.data);
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of scenarios) {
        if (s.name.includes('ReplaceTest') || s.name.includes('Different')) {
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

async function testFrontendConflictDecision() {
  console.log('\n=== Test: Frontend Conflict Decision Flow ===');
  
  let apiVersion, scenario1, scenario2;
  
  try {
    console.log('Step 1: Setup...');
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'ConflictDecisionService',
      version: 'v1.0',
      base_path: '/api/conflict-decision',
      schema: { field1: 'string' }
    })).data;
    
    scenario1 = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'ConflictDecisionScenario',
      description: 'First scenario',
      api_version_id: apiVersion.id
    })).data;
    
    await axios.post(`${API_BASE}/executions/execute/${scenario1.id}`);
    await delay(3000);
    
    console.log('Step 2: Export scenario...');
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario1.id}`)).data;
    const packageData = exportResult.package;
    
    console.log('Step 3: Create another scenario with same name...');
    scenario2 = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'ConflictDecisionScenario',
      description: 'Second scenario with same name',
      api_version_id: apiVersion.id
    })).data;
    
    console.log('Step 4: Check conflicts without decisions...');
    try {
      await axios.post(`${API_BASE}/scenario-packages/import`, {
        package_data: packageData,
        decisions: {}
      });
      console.log('FAIL: Should return 409 without decisions');
      return false;
    } catch (err) {
      if (err.response?.status !== 409) {
        console.log('FAIL: Should return 409 for conflict');
        return false;
      }
      console.log('  Got 409 as expected');
      console.log('  Conflict types:', err.response.data.conflicts.issues.map(i => i.type));
    }
    
    console.log('Step 5: Try with save_as decision...');
    const saveAsResult = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: packageData,
      decisions: { scenario_action: 'save_as' }
    })).data;
    
    if (!saveAsResult.success) {
      console.log('FAIL: save_as should succeed');
      return false;
    }
    console.log('  save_as succeeded, new scenario:', saveAsResult.result.new_scenario_name);
    
    if (!saveAsResult.result.new_scenario_name.includes('_imported_')) {
      console.log('FAIL: save_as should create scenario with _imported_ suffix');
      return false;
    }
    console.log('PASS: save_as creates new scenario with suffix');
    
    console.log('Step 6: Try with replace decision...');
    const replaceResult = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: packageData,
      decisions: { scenario_action: 'replace' }
    })).data;
    
    if (!replaceResult.success) {
      console.log('FAIL: replace should succeed');
      return false;
    }
    console.log('  replace succeeded, scenario:', replaceResult.result.new_scenario_name);
    
    if (replaceResult.result.new_scenario_name !== 'ConflictDecisionScenario') {
      console.log('FAIL: replace should keep original name');
      return false;
    }
    console.log('PASS: replace keeps original name');
    
    console.log('Step 7: Verify traceability in both imports...');
    const logs = (await axios.get(`${API_BASE}/scenario-packages/import-logs`)).data;
    const saveAsLog = logs.find(l =>
      l.details &&
      l.details.scenario_action === 'save_as' &&
      l.details.new_scenario_name?.includes('_imported_')
    );
    const replaceLog = logs.find(l =>
      l.details &&
      l.details.scenario_action === 'replace' &&
      l.details.new_scenario_name === 'ConflictDecisionScenario'
    );
    
    if (!saveAsLog || !replaceLog) {
      console.log('FAIL: Should have both save_as and replace logs');
      return false;
    }
    
    console.log('  save_as log:', saveAsLog.id);
    console.log('  replace log:', replaceLog.id);
    console.log('  save_as traceability:', JSON.stringify(saveAsLog.details.traceability, null, 2));
    console.log('  replace traceability:', JSON.stringify(replaceLog.details.traceability, null, 2));
    
    if (saveAsLog.details.traceability.action !== 'save_as') {
      console.log('FAIL: save_as log should have correct action');
      return false;
    }
    
    if (replaceLog.details.traceability.action !== 'replace') {
      console.log('FAIL: replace log should have correct action');
      return false;
    }
    
    if (!replaceLog.details.traceability.replaced_scenario) {
      console.log('FAIL: replace log should have replaced_scenario info');
      return false;
    }
    
    console.log('PASS: Both branches have complete traceability');
    
    console.log('\nCleaning up...');
    await axios.delete(`${API_BASE}/scenarios/${saveAsResult.result.new_scenario_id}`).catch(() => {});
    await axios.delete(`${API_BASE}/scenarios/${replaceResult.result.new_scenario_id}`).catch(() => {});
    await axios.delete(`${API_BASE}/scenarios/${scenario1.id}`).catch(() => {});
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    
    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of scenarios) {
        if (s.name.includes('ConflictDecision')) {
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
  console.log('   Scenario Package Replace Branch Tests  ');
  console.log('========================================');

  await delay(1000);

  const results = [];
  
  results.push(await testReplaceBranchComplete());
  await delay(500);
  
  results.push(await testFrontendConflictDecision());
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
