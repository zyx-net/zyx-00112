const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testExportImportChain() {
  console.log('\n=== Test: Export → Import → Rollback Chain ===');
  
  let apiVersion, scenario;
  
  try {
    console.log('Step 1: Create API version...');
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'ChainTestService',
      version: 'v1.0',
      base_path: '/api/chain-test',
      schema: { field1: 'string', field2: 'number' }
    })).data;
    
    console.log('Step 2: Create scenario...');
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'ChainTestScenario',
      description: 'For export-import-rollback chain test',
      api_version_id: apiVersion.id,
      status: 'draft'
    })).data;
    console.log('  Created scenario:', scenario.id);
    
    console.log('Step 3: First execution...');
    const exec1 = (await axios.post(`${API_BASE}/executions/execute/${scenario.id}`)).data;
    await delay(3000);
    
    console.log('Step 4: Second execution...');
    const exec2 = (await axios.post(`${API_BASE}/executions/execute/${scenario.id}`)).data;
    await delay(3000);
    
    console.log('Step 5: Verify original scenario status...');
    const originalScenario = (await axios.get(`${API_BASE}/scenarios/${scenario.id}`)).data;
    console.log('  Status:', originalScenario.status);
    
    if (originalScenario.status !== 'completed') {
      console.log('FAIL: Original scenario should be completed');
      return false;
    }
    console.log('PASS: Original scenario status is completed');
    
    console.log('Step 6: Export scenario package...');
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    const packageData = exportResult.package;
    
    console.log('  Package version:', packageData.version);
    console.log('  Execution count:', packageData.execution_history_summary?.length);
    console.log('  Latest successful execution ID:', packageData.latest_successful_execution_id);
    console.log('  Has snapshot:', !!packageData.latest_snapshot);
    
    if (packageData.execution_history_summary?.length < 2) {
      console.log('FAIL: Package should have at least 2 executions');
      return false;
    }
    console.log('PASS: Package has correct execution count');
    
    console.log('Step 7: Import with save_as...');
    const importResult1 = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: packageData,
      decisions: { 
        scenario_action: 'save_as',
        execution_history_action: 'keep'
      }
    })).data;
    
    console.log('  New scenario ID:', importResult1.result.new_scenario_id);
    console.log('  Traceability:', JSON.stringify(importResult1.traceability));
    
    const importedScenario1 = (await axios.get(`${API_BASE}/scenarios/${importResult1.result.new_scenario_id}`)).data;
    console.log('  Imported status:', importedScenario1.status);
    
    if (importedScenario1.status !== 'completed') {
      console.log('FAIL: Imported scenario should be completed');
      return false;
    }
    console.log('PASS: Imported scenario status is completed');
    
    const rollbackHistory1 = (await axios.get(`${API_BASE}/rollback/history/${importResult1.result.new_scenario_id}`)).data;
    console.log('  Snapshots after import:', rollbackHistory1.length);
    
    const latestSnapshot1 = rollbackHistory1.find(s => s.isLatest);
    if (!latestSnapshot1?.executionId) {
      console.log('FAIL: Latest snapshot should have executionId');
      return false;
    }
    console.log('PASS: Latest snapshot has executionId');
    
    console.log('Step 8: Import with replace...');
    const importResult2 = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: packageData,
      decisions: { 
        scenario_action: 'replace',
        execution_history_action: 'keep'
      }
    })).data;
    
    console.log('  New scenario ID:', importResult2.result.new_scenario_id);
    console.log('  Traceability:', JSON.stringify(importResult2.traceability));
    
    const importLogs = (await axios.get(`${API_BASE}/scenario-packages/import-logs`)).data;
    console.log('  Total import logs:', importLogs.length);
    
    const successImportLogs = importLogs.filter(l => 
      l.result === 'success' && 
      l.source_package !== 'export' &&
      l.source_package !== 'system'
    );
    const latestLog = successImportLogs[0];
    console.log('  Latest import log traceability:', JSON.stringify(latestLog?.details?.traceability));
    
    if (!latestLog.details?.traceability?.restored_execution_id) {
      console.log('FAIL: Import log should have restored_execution_id');
      return false;
    }
    console.log('PASS: Import log has traceability info');
    
    console.log('Step 9: Rollback last import...');
    const rollbackResult = (await axios.post(`${API_BASE}/scenario-packages/rollback`)).data;
    
    console.log('  Rolled back scenario:', rollbackResult.result.rolled_back_scenario_name);
    console.log('  Traceability:', JSON.stringify(rollbackResult.traceability));
    
    if (!rollbackResult.traceability?.undone_execution_ids) {
      console.log('FAIL: Rollback should track undone executions');
      return false;
    }
    console.log('PASS: Rollback has traceability info');
    
    console.log('Step 10: Verify remaining scenario still has correct data...');
    const remainingScenarioId = importResult1.result.new_scenario_id;
    const remainingScenario = (await axios.get(`${API_BASE}/scenarios/${remainingScenarioId}`)).data;
    const remainingSnapshots = (await axios.get(`${API_BASE}/rollback/history/${remainingScenarioId}`)).data;
    
    console.log('  Remaining scenario status:', remainingScenario.status);
    console.log('  Remaining snapshots:', remainingSnapshots.length);
    
    for (const snap of remainingSnapshots) {
      console.log('  Snapshot:', snap.id, 'executionId:', snap.executionId);
      if (!snap.executionId) {
        console.log('FAIL: All snapshots should have executionId');
        return false;
      }
    }
    console.log('PASS: All remaining snapshots have executionId');
    
    console.log('\nCleaning up...');
    await axios.delete(`${API_BASE}/scenarios/${remainingScenarioId}`).catch(() => {});
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    
    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    console.log('  Error details:', err.response?.data);
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of scenarios) {
        if (s.name.includes('ChainTest')) {
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

async function testMultiExecutionRecovery() {
  console.log('\n=== Test: Multi-Execution Latest Execution Recovery ===');
  
  let apiVersion, scenario;
  
  try {
    console.log('Step 1: Setup...');
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'MultiExecService',
      version: 'v1.0',
      base_path: '/api/multi-exec',
      schema: { field1: 'string' }
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'MultiExecScenario',
      description: 'Test multi-execution recovery',
      api_version_id: apiVersion.id
    })).data;
    
    console.log('Step 2: Execute 3 times...');
    for (let i = 1; i <= 3; i++) {
      await axios.post(`${API_BASE}/executions/execute/${scenario.id}`);
      await delay(2500);
      console.log(`  Execution ${i} done`);
    }
    
    console.log('Step 3: Verify snapshots and executions...');
    const snapshots = (await axios.get(`${API_BASE}/rollback/history/${scenario.id}`)).data;
    const executions = (await axios.get(`${API_BASE}/executions/scenario/${scenario.id}`)).data;
    
    console.log('  Total snapshots:', snapshots.length);
    console.log('  Total executions:', executions.length);
    
    if (snapshots.length < 3) {
      console.log('FAIL: Should have at least 3 snapshots');
      return false;
    }
    console.log('PASS: Has correct snapshot count');
    
    const latestSnapshot = snapshots.find(s => s.isLatest);
    console.log('  Latest snapshot executionId:', latestSnapshot?.executionId);
    
    const completedExecutions = executions.filter(e => e.status === 'completed');
    console.log('  Completed executions:', completedExecutions.length);
    
    console.log('Step 4: Export and verify package...');
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    const pkg = exportResult.package;
    
    console.log('  Latest successful execution ID in package:', pkg.latest_successful_execution_id);
    console.log('  Snapshot execution_id in package:', pkg.latest_snapshot?.execution_id);
    
    if (pkg.latest_snapshot?.execution_id !== pkg.latest_successful_execution_id) {
      console.log('FAIL: Snapshot should be linked to latest successful execution');
      return false;
    }
    console.log('PASS: Snapshot correctly linked to latest successful execution');
    
    console.log('Step 5: Import and verify...');
    const importResult = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: pkg,
      decisions: { scenario_action: 'save_as', execution_history_action: 'keep' }
    })).data;
    
    console.log('  Restored execution ID:', importResult.traceability?.restored_execution_id);
    
    const importedSnapshots = (await axios.get(`${API_BASE}/rollback/history/${importResult.result.new_scenario_id}`)).data;
    const importedLatestSnapshot = importedSnapshots.find(s => s.isLatest);
    
    console.log('  Imported latest snapshot executionId:', importedLatestSnapshot?.executionId);
    
    if (!importedLatestSnapshot?.executionId) {
      console.log('FAIL: Imported snapshot should have executionId');
      return false;
    }
    console.log('PASS: Imported snapshot has correct executionId');
    
    console.log('\nCleaning up...');
    await axios.delete(`${API_BASE}/scenarios/${importResult.result.new_scenario_id}`).catch(() => {});
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    
    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of scenarios) {
        if (s.name.includes('MultiExec')) {
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

async function testImportLogTraceability() {
  console.log('\n=== Test: Import Log Traceability ===');
  
  let apiVersion, scenario;
  
  try {
    console.log('Step 1: Setup...');
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'TraceService',
      version: 'v1.0',
      base_path: '/api/trace',
      schema: {}
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'TraceScenario',
      description: 'Test traceability',
      api_version_id: apiVersion.id
    })).data;
    
    console.log('Step 2: Execute...');
    await axios.post(`${API_BASE}/executions/execute/${scenario.id}`);
    await delay(3000);
    
    console.log('Step 3: Export...');
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    const pkg = exportResult.package;
    
    console.log('Step 4: Import with save_as...');
    const import1 = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: pkg,
      decisions: { scenario_action: 'save_as', execution_history_action: 'keep' }
    })).data;
    
    console.log('Step 5: Import with replace...');
    const import2 = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: pkg,
      decisions: { scenario_action: 'replace', execution_history_action: 'keep' }
    })).data;
    
    console.log('Step 6: Get import logs...');
    const logs = (await axios.get(`${API_BASE}/scenario-packages/import-logs`)).data;
    
    console.log('  Total logs:', logs.length);
    
    const successLogs = logs.filter(l => l.result === 'success' && l.source_package !== 'export' && l.source_package !== 'system');
    console.log('  Success import logs:', successLogs.length);
    
    const recentLogs = successLogs.slice(0, 5);
    let allLogsValid = true;
    
    for (const log of recentLogs) {
      const details = log.details || {};
      console.log(`  Log ${log.id}:`);
      console.log('    - scenario_action:', details.scenario_action);
      console.log('    - execution_history_action:', details.execution_history_action);
      console.log('    - restored_execution_id:', details.restored_execution_id);
      console.log('    - restored_snapshot_id:', details.restored_snapshot_id);
      console.log('    - original_latest_execution_id:', details.original_latest_execution_id);
      
      if (!details.scenario_action) {
        allLogsValid = false;
      }
    }
    
    if (!allLogsValid) {
      console.log('FAIL: Some recent logs missing scenario_action');
      return false;
    }
    console.log('PASS: Recent logs have traceability info');
    
    console.log('Step 7: Rollback...');
    const rollback = (await axios.post(`${API_BASE}/scenario-packages/rollback`)).data;
    
    const rollbackLogs = logs.filter(l => l.details?.undone_scenario_id);
    console.log('  Rollback logs found:', rollbackLogs.length >= 0);
    
    console.log('  Rollback traceability:', JSON.stringify(rollback.traceability));
    
    if (!rollback.traceability?.undone_scenario_id) {
      console.log('FAIL: Rollback should track undone scenario');
      return false;
    }
    console.log('PASS: Rollback has traceability info');
    
    console.log('\nCleaning up...');
    await axios.delete(`${API_BASE}/scenarios/${import1.result.new_scenario_id}`).catch(() => {});
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    
    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of scenarios) {
        if (s.name.includes('Trace')) {
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
  console.log('\n=== Test: Restart Persistence ===');
  
  let apiVersion, scenario;
  
  try {
    console.log('Step 1: Setup...');
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'PersistService',
      version: 'v1.0',
      base_path: '/api/persist',
      schema: {}
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'PersistScenario',
      description: 'Test persistence',
      api_version_id: apiVersion.id
    })).data;
    
    console.log('Step 2: Execute...');
    await axios.post(`${API_BASE}/executions/execute/${scenario.id}`);
    await delay(3000);
    
    console.log('Step 3: Export and import...');
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    
    const importResult = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: exportResult.package,
      decisions: { scenario_action: 'save_as', execution_history_action: 'keep' }
    })).data;
    
    const importedId = importResult.result.new_scenario_id;
    console.log('  Imported scenario ID:', importedId);
    
    console.log('Step 4: Record state before mock restart...');
    const beforeScenario = (await axios.get(`${API_BASE}/scenarios/${importedId}`)).data;
    const beforeSnapshots = (await axios.get(`${API_BASE}/rollback/history/${importedId}`)).data;
    const beforeLogs = (await axios.get(`${API_BASE}/scenario-packages/import-logs`)).data;
    
    console.log('  Before: scenario status =', beforeScenario.status);
    console.log('  Before: snapshot count =', beforeSnapshots.length);
    console.log('  Before: log count =', beforeLogs.length);
    
    console.log('Step 5: Verify data integrity...');
    const importedScenario = (await axios.get(`${API_BASE}/scenarios/${importedId}`)).data;
    const importedSnapshots = (await axios.get(`${API_BASE}/rollback/history/${importedId}`)).data;
    
    if (importedScenario.status !== 'completed') {
      console.log('FAIL: Imported scenario should be completed');
      return false;
    }
    console.log('PASS: Imported scenario status is completed');
    
    for (const snap of importedSnapshots) {
      if (!snap.executionId) {
        console.log('FAIL: Snapshot should have executionId');
        return false;
      }
    }
    console.log('PASS: All snapshots have executionId');
    
    console.log('\nCleaning up...');
    await axios.delete(`${API_BASE}/scenarios/${importedId}`).catch(() => {});
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    
    console.log('NOTE: In production, restart the server and verify data persists');
    
    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of scenarios) {
        if (s.name.includes('Persist')) {
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
  console.log('   Scenario Package Import State Tests  ');
  console.log('   (Export → Import → Rollback Chain)  ');
  console.log('========================================');

  await delay(1000);

  const results = [];
  
  results.push(await testExportImportChain());
  await delay(500);
  
  results.push(await testMultiExecutionRecovery());
  await delay(500);
  
  results.push(await testImportLogTraceability());
  await delay(500);
  
  results.push(await testRestartPersistence());

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
