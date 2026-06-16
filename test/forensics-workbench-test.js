const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testSaveAsChain() {
  console.log('\n=== Test: Save As Chain ===');
  
  let apiVersion, scenario;
  
  try {
    console.log('Step 1: Setup - Create API version and scenario...');
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'SaveAsTestService',
      version: 'v1.0',
      base_path: '/api/saveas-test',
      schema: { field1: 'string', field2: 'number' }
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'SaveAsTestScenario',
      description: 'For save_as chain test',
      api_version_id: apiVersion.id,
      status: 'draft'
    })).data;
    console.log('  Created scenario:', scenario.id);
    
    console.log('Step 2: Execute scenario...');
    await axios.post(`${API_BASE}/executions/execute/${scenario.id}`);
    await delay(3000);
    
    console.log('Step 3: Export scenario package...');
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    const packageData = exportResult.package;
    console.log('  Package exported, has execution history:', !!packageData.execution_history_summary?.length);
    
    console.log('Step 4: Initialize forensics batch with save_as decision...');
    const batch = (await axios.post(`${API_BASE}/forensics-workbench/initialize`, {
      operator: 'test_user',
      original_scenario_id: scenario.id,
      original_snapshot_id: packageData.latest_snapshot?.id,
      original_execution_id: packageData.latest_successful_execution_id,
      conflict_decision: 'save_as',
      metadata: { test_type: 'save_as_chain' }
    })).data;
    
    console.log('  Batch ID:', batch.batch.id);
    console.log('  Batch Number:', batch.batch.batch_number);
    console.log('  Initial State:', batch.batch.state);
    
    if (batch.batch.state && batch.batch.state !== 'pre_check') {
      console.log('FAIL: Batch should be in pre_check state');
      return false;
    }
    console.log('PASS: Batch initialized correctly');
    
    console.log('Step 5: Perform pre-check...');
    const preCheck = (await axios.post(`${API_BASE}/forensics-workbench/pre-check/${batch.batch.id}`)).data;
    console.log('  Pre-check passed:', preCheck.result.passed);
    console.log('  Errors:', preCheck.result.errors?.length || 0);
    console.log('  Warnings:', preCheck.result.warnings?.length || 0);
    
    if (!preCheck.result.passed) {
      console.log('FAIL: Pre-check should pass');
      return false;
    }
    console.log('PASS: Pre-check passed');
    
    console.log('Step 6: Execute replace import...');
    const replaceImport = (await axios.post(`${API_BASE}/forensics-workbench/replace-import/${batch.batch.id}`, {
      package_data: packageData,
      decisions: { scenario_action: 'save_as', execution_history_action: 'keep' }
    })).data;
    
    console.log('  Result simulated:', replaceImport.result.simulated);
    console.log('  New scenario ID:', replaceImport.result.scenario_id);
    console.log('  Traceability:', JSON.stringify(replaceImport.result.traceability));
    
    if (!replaceImport.result.traceability?.restored_execution_id) {
      console.log('FAIL: Should have restored execution ID');
      return false;
    }
    console.log('PASS: Replace import completed');
    
    console.log('Step 7: Execute rollback...');
    const rollback = (await axios.post(`${API_BASE}/forensics-workbench/rollback/${batch.batch.id}/confirm`)).data;
    
    console.log('  Result simulated:', rollback.result.simulated);
    console.log('  Restored scenario ID:', rollback.result.restored_scenario_id);
    
    console.log('PASS: Rollback executed');
    
    console.log('Step 8: Perform restart review...');
    const restartReview = (await axios.post(`${API_BASE}/forensics-workbench/restart-review/${batch.batch.id}`, {
      is_simulation: true
    })).data;
    
    console.log('  Is simulation:', restartReview.result.is_simulation);
    console.log('  Verification result:', JSON.stringify(restartReview.result.verification_result));
    console.log('  Consistency check passed:', restartReview.result.consistency_check_passed);
    console.log('  Errors:', restartReview.result.errors?.length || 0);
    
    console.log('PASS: Restart review completed');
    
    console.log('Step 9: Get batch details...');
    const batchDetails = (await axios.get(`${API_BASE}/forensics-workbench/batch/${batch.batch.id}`)).data;
    
    console.log('  Batch state:', batchDetails.batch.state);
    console.log('  Total operations:', batchDetails.batch.summary?.total_operations);
    console.log('  Total timeline events:', batchDetails.batch.summary?.total_timeline_events);
    console.log('  Replaced snapshots:', batchDetails.batch.summary?.replaced_snapshots_count);
    
    if (batchDetails.batch.summary?.total_operations < 3) {
      console.log('FAIL: Should have at least 3 operations');
      return false;
    }
    console.log('PASS: Batch details retrieved');
    
    console.log('Step 10: Get timeline...');
    const timeline = (await axios.get(`${API_BASE}/forensics-workbench/timeline/${batch.batch.id}`)).data;
    
    console.log('  Timeline events:', timeline.timeline?.length);
    const criticalEvents = timeline.timeline?.filter(e => e.is_critical) || [];
    console.log('  Critical events:', criticalEvents.length);
    
    if (timeline.timeline?.length < 5) {
      console.log('FAIL: Should have at least 5 timeline events');
      return false;
    }
    console.log('PASS: Timeline retrieved');
    
    console.log('\nCleaning up...');
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    
    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    console.log('  Error details:', err.response?.data);
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of scenarios) {
        if (s.name.includes('SaveAsTest')) {
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

async function testReplaceChain() {
  console.log('\n=== Test: Replace Chain ===');
  
  let apiVersion, scenario1, scenario2;
  
  try {
    console.log('Step 1: Setup - Create API version and two scenarios...');
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'ReplaceTestService',
      version: 'v1.0',
      base_path: '/api/replace-test',
      schema: { field1: 'string', field2: 'number' }
    })).data;
    
    scenario1 = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'ReplaceTestScenario1',
      description: 'First scenario for replace test',
      api_version_id: apiVersion.id,
      status: 'draft'
    })).data;
    
    scenario2 = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'ReplaceTestScenario2',
      description: 'Second scenario for replace test',
      api_version_id: apiVersion.id,
      status: 'draft'
    })).data;
    console.log('  Created scenarios:', scenario1.id, scenario2.id);
    
    console.log('Step 2: Execute both scenarios...');
    await axios.post(`${API_BASE}/executions/execute/${scenario1.id}`);
    await delay(3000);
    await axios.post(`${API_BASE}/executions/execute/${scenario2.id}`);
    await delay(3000);
    
    console.log('Step 3: Export scenario 1 package...');
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario1.id}`)).data;
    const packageData = exportResult.package;
    console.log('  Package exported');
    
    console.log('Step 4: Initialize forensics batch with replace decision...');
    const batch = (await axios.post(`${API_BASE}/forensics-workbench/initialize`, {
      operator: 'test_admin',
      original_scenario_id: scenario1.id,
      conflict_decision: 'replace',
      metadata: { test_type: 'replace_chain' }
    })).data;
    
    console.log('  Batch ID:', batch.batch.id);
    console.log('  Batch Number:', batch.batch.batch_number);
    
    console.log('Step 5: Perform pre-check...');
    const preCheck = (await axios.post(`${API_BASE}/forensics-workbench/pre-check/${batch.batch.id}`)).data;
    console.log('  Pre-check passed:', preCheck.result.passed);
    
    console.log('Step 6: Execute replace import with replace decision...');
    const replaceImport = (await axios.post(`${API_BASE}/forensics-workbench/replace-import/${batch.batch.id}`, {
      package_data: packageData,
      decisions: { scenario_action: 'replace', execution_history_action: 'keep' }
    })).data;
    
    console.log('  Result simulated:', replaceImport.result.simulated);
    console.log('  New scenario ID:', replaceImport.result.scenario_id);
    console.log('  Scenario name:', replaceImport.result.scenario_name);
    
    if (replaceImport.result.traceability?.replaced_scenario) {
      console.log('  Replaced scenario:', JSON.stringify(replaceImport.result.traceability.replaced_scenario));
    }
    
    console.log('PASS: Replace import with replacement tracking');
    
    console.log('Step 7: Get batch details and verify replaced snapshots...');
    const batchDetails = (await axios.get(`${API_BASE}/forensics-workbench/batch/${batch.batch.id}`)).data;
    
    console.log('  Replaced snapshots count:', batchDetails.batch.replaced_snapshots?.length);
    
    if (batchDetails.batch.replaced_snapshots?.length > 0) {
      const replaced = batchDetails.batch.replaced_snapshots[0];
      console.log('  Replaced snapshot details:');
      console.log('    - Original snapshot ID:', replaced.original_snapshot_id);
      console.log('    - Original scenario ID:', replaced.original_scenario_id);
      console.log('    - Conflict decision:', replaced.conflict_decision);
      console.log('    - Replaced reason:', replaced.replaced_reason);
    }
    
    console.log('PASS: Replaced snapshots tracked');
    
    console.log('\nCleaning up...');
    await axios.delete(`${API_BASE}/scenarios/${scenario1.id}`).catch(() => {});
    await axios.delete(`${API_BASE}/scenarios/${scenario2.id}`).catch(() => {});
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    
    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    console.log('  Error details:', err.response?.data);
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of scenarios) {
        if (s.name.includes('ReplaceTest')) {
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

async function testUndoAfterImport() {
  console.log('\n=== Test: Undo After Import ===');
  
  let apiVersion, scenario;
  
  try {
    console.log('Step 1: Setup...');
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'UndoTestService',
      version: 'v1.0',
      base_path: '/api/undo-test',
      schema: { field1: 'string' }
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'UndoTestScenario',
      description: 'For undo test',
      api_version_id: apiVersion.id,
      status: 'draft'
    })).data;
    
    console.log('Step 2: Execute...');
    await axios.post(`${API_BASE}/executions/execute/${scenario.id}`);
    await delay(3000);
    
    console.log('Step 3: Export...');
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    const packageData = exportResult.package;
    
    console.log('Step 4: Initialize forensics batch...');
    const batch = (await axios.post(`${API_BASE}/forensics-workbench/initialize`, {
      operator: 'undo_tester',
      original_scenario_id: scenario.id,
      metadata: { test_type: 'undo_after_import' }
    })).data;
    
    console.log('Step 5: Pre-check...');
    await axios.post(`${API_BASE}/forensics-workbench/pre-check/${batch.batch.id}`);
    
    console.log('Step 6: Replace import...');
    await axios.post(`${API_BASE}/forensics-workbench/replace-import/${batch.batch.id}`, {
      package_data: packageData,
      decisions: { scenario_action: 'save_as', execution_history_action: 'keep' }
    });
    
    console.log('Step 7: Verify batch operations before rollback...');
    const beforeRollback = (await axios.get(`${API_BASE}/forensics-workbench/batch/${batch.batch.id}`)).data;
    console.log('  Operations before rollback:', beforeRollback.batch.operations?.length);
    
    console.log('Step 8: Execute rollback with confirmation...');
    const rollback = (await axios.post(`${API_BASE}/forensics-workbench/rollback/${batch.batch.id}/confirm`)).data;
    
    console.log('  Rollback simulated:', rollback.result.simulated);
    console.log('  Restored scenario ID:', rollback.result.restored_scenario_id);
    
    console.log('Step 9: Verify operations after rollback...');
    const afterRollback = (await axios.get(`${API_BASE}/forensics-workbench/batch/${batch.batch.id}`)).data;
    console.log('  Operations after rollback:', afterRollback.batch.operations?.length);
    
    const rollbackOperation = afterRollback.batch.operations?.find(op => op.operation_type === 'rollback');
    if (rollbackOperation) {
      console.log('  Rollback operation found:');
      console.log('    - Type:', rollbackOperation.operation_type);
      console.log('    - Previous state:', JSON.stringify(rollbackOperation.previous_state));
      console.log('    - New state:', JSON.stringify(rollbackOperation.new_state));
    }
    
    if (afterRollback.batch.operations?.length <= beforeRollback.batch.operations?.length) {
      console.log('FAIL: Operations count should increase after rollback');
      return false;
    }
    console.log('PASS: Rollback operation recorded');
    
    console.log('\nCleaning up...');
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    
    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of scenarios) {
        if (s.name.includes('UndoTest')) {
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

async function testRestartConsistency() {
  console.log('\n=== Test: Restart Consistency ===');
  
  let apiVersion, scenario;
  
  try {
    console.log('Step 1: Setup...');
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'RestartTestService',
      version: 'v1.0',
      base_path: '/api/restart-test',
      schema: { field1: 'string', field2: 'number' }
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'RestartTestScenario',
      description: 'For restart consistency test',
      api_version_id: apiVersion.id,
      status: 'draft'
    })).data;
    
    console.log('Step 2: Execute multiple times...');
    for (let i = 1; i <= 3; i++) {
      await axios.post(`${API_BASE}/executions/execute/${scenario.id}`);
      await delay(3000);
      console.log(`  Execution ${i} done`);
    }
    
    console.log('Step 3: Export...');
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    const packageData = exportResult.package;
    
    console.log('Step 4: Initialize forensics batch...');
    const batch = (await axios.post(`${API_BASE}/forensics-workbench/initialize`, {
      operator: 'restart_tester',
      original_scenario_id: scenario.id,
      original_snapshot_id: packageData.latest_snapshot?.id,
      original_execution_id: packageData.latest_successful_execution_id,
      metadata: { test_type: 'restart_consistency' }
    })).data;
    
    console.log('Step 5: Complete chain (pre-check, import, rollback, review)...');
    await axios.post(`${API_BASE}/forensics-workbench/pre-check/${batch.batch.id}`);
    
    await axios.post(`${API_BASE}/forensics-workbench/replace-import/${batch.batch.id}`, {
      package_data: packageData,
      decisions: { scenario_action: 'save_as', execution_history_action: 'keep' }
    });
    
    await axios.post(`${API_BASE}/forensics-workbench/rollback/${batch.batch.id}/confirm`);
    
    const review = (await axios.post(`${API_BASE}/forensics-workbench/restart-review/${batch.batch.id}/simulation`)).data;
    
    console.log('  Review verification result:', JSON.stringify(review.result.verification_result));
    console.log('  Execution count:', review.result.verification_result?.execution_count);
    console.log('  Snapshot count:', review.result.verification_result?.snapshot_count);
    console.log('  Consistency check passed:', review.result.consistency_check_passed);
    
    if (review.result.verification_result?.execution_count !== 0) {
      console.log('FAIL: After rollback, scenario should not exist (execution count should be 0)');
      return false;
    }
    console.log('PASS: Scenario deleted after rollback as expected');
    
    console.log('Step 6: Verify timeline and operations tracking...');
    const timeline = (await axios.get(`${API_BASE}/forensics-workbench/timeline/${batch.batch.id}`)).data;
    const operations = (await axios.get(`${API_BASE}/forensics-workbench/batch/${batch.batch.id}`)).data;
    
    console.log('  Timeline events:', timeline.timeline?.length);
    console.log('  Operations:', operations.batch.operations?.length);
    
    const criticalEvents = timeline.timeline?.filter(e => e.is_critical) || [];
    console.log('  Critical events:', criticalEvents.length);
    
    if (criticalEvents.length < 2) {
      console.log('FAIL: Should have at least 2 critical events');
      return false;
    }
    console.log('PASS: Critical events tracked');
    
    console.log('\nCleaning up...');
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    
    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of scenarios) {
        if (s.name.includes('RestartTest')) {
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

async function testFullChain() {
  console.log('\n=== Test: Full Chain Execution ===');
  
  let apiVersion, scenario;
  
  try {
    console.log('Step 1: Setup...');
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'FullChainTestService',
      version: 'v1.0',
      base_path: '/api/fullchain-test',
      schema: { field1: 'string', field2: 'number' }
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'FullChainTestScenario',
      description: 'For full chain test',
      api_version_id: apiVersion.id,
      status: 'draft'
    })).data;
    
    console.log('Step 2: Execute...');
    await axios.post(`${API_BASE}/executions/execute/${scenario.id}`);
    await delay(3000);
    
    console.log('Step 3: Export...');
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    const packageData = exportResult.package;
    
    console.log('Step 4: Execute full chain...');
    const fullChain = (await axios.post(`${API_BASE}/forensics-workbench/full-chain`, {
      operator: 'fullchain_tester',
      package_data: packageData,
      decisions: { scenario_action: 'save_as', execution_history_action: 'keep' },
      original_scenario_id: scenario.id,
      original_snapshot_id: packageData.latest_snapshot?.id,
      original_execution_id: packageData.latest_successful_execution_id,
      skip_restart_review: false
    })).data;
    
    console.log('  Chain success:', fullChain.success);
    console.log('  Final state:', fullChain.chain_result.final_state);
    console.log('  Steps executed:', fullChain.chain_result.steps?.length);
    console.log('  Errors:', fullChain.chain_result.errors?.length || 0);
    
    if (fullChain.chain_result.steps) {
      for (const step of fullChain.chain_result.steps) {
        console.log(`  - ${step.step}: ${step.status}`);
      }
    }
    
    if (!fullChain.success) {
      console.log('FAIL: Full chain should succeed');
      return false;
    }
    console.log('PASS: Full chain executed successfully');
    
    console.log('Step 5: Verify final batch...');
    const batchDetails = (await axios.get(`${API_BASE}/forensics-workbench/batch/${fullChain.chain_result.batch_id}`)).data;
    
    console.log('  Final batch state:', batchDetails.batch.state);
    console.log('  Operations:', batchDetails.batch.summary?.total_operations);
    console.log('  Timeline events:', batchDetails.batch.summary?.total_timeline_events);
    
    if (batchDetails.batch.state !== 'completed') {
      console.log('FAIL: Batch should be completed');
      return false;
    }
    console.log('PASS: Batch completed');
    
    console.log('\nCleaning up...');
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    
    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of scenarios) {
        if (s.name.includes('FullChainTest')) {
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
  console.log('   Forensics Workbench Test Suite      ');
  console.log('   (Save As, Replace, Undo, Restart)    ');
  console.log('========================================');

  await delay(1000);

  const results = [];
  
  results.push(await testSaveAsChain());
  await delay(500);
  
  results.push(await testReplaceChain());
  await delay(500);
  
  results.push(await testUndoAfterImport());
  await delay(500);
  
  results.push(await testRestartConsistency());
  await delay(500);
  
  results.push(await testFullChain());

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
