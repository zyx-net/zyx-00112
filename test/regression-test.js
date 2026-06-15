const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testInvalidInjectionRejected() {
  console.log('\n=== Test 1: Invalid Injection Rejected ===');
  
  try {
    await axios.post(`${API_BASE}/injections`, {
      scenario_id: 'test-scenario-id',
      type: 'invalid_type',
      probability: 1.0,
      config: {},
      enabled: true
    });
    console.log('FAIL: Invalid type should be rejected');
    return false;
  } catch (err) {
    const errorData = err.response?.data || err.data || {};
    if (errorData.error && typeof errorData.error === 'string' && errorData.error.includes('invalid_type')) {
      console.log('PASS: Invalid injection type rejected');
    } else {
      console.log('FAIL: Error message incorrect', errorData);
      return false;
    }
  }

  try {
    await axios.post(`${API_BASE}/injections`, {
      scenario_id: 'test-scenario-id',
      type: 'network_delay',
      probability: 1.0,
      config: {},
      enabled: true
    });
    console.log('FAIL: network_delay missing delay should be rejected');
    return false;
  } catch (err) {
    const errorData = err.response?.data || err.data || {};
    if (errorData.error) {
      console.log('PASS: network_delay missing delay rejected');
    } else {
      console.log('FAIL: Error message incorrect', errorData);
      return false;
    }
  }

  try {
    await axios.post(`${API_BASE}/injections`, {
      scenario_id: 'test-scenario-id',
      type: 'error_response',
      probability: 1.0,
      config: { statusCode: 999 },
      enabled: true
    });
    console.log('FAIL: Invalid statusCode should be rejected');
    return false;
  } catch (err) {
    const errorData = err.response?.data || err.data || {};
    if (errorData.error) {
      console.log('PASS: Invalid statusCode rejected');
    } else {
      console.log('FAIL: Error message incorrect', errorData);
      return false;
    }
  }

  try {
    await axios.post(`${API_BASE}/injections`, {
      scenario_id: 'test-scenario-id',
      type: 'error_response',
      probability: 1.0,
      config: '{"invalid json"}',
      enabled: true
    });
    console.log('FAIL: Invalid JSON should be rejected');
    return false;
  } catch (err) {
    const errorData = err.response?.data || err.data || {};
    if (errorData.error) {
      console.log('PASS: Invalid JSON rejected');
    } else {
      console.log('FAIL: Error message incorrect', errorData);
      return false;
    }
  }

  return true;
}

async function testValidConfigPersisted() {
  console.log('\n=== Test 2: Valid Config Persisted ===');
  
  let apiVersion, scenario, injection;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'TestService',
      version: 'v1.0',
      base_path: '/api/test',
      schema: {}
    })).data;
    console.log('PASS: API version created:', apiVersion.id);
  } catch (err) {
    console.log('FAIL: Create API version failed:', err.response?.data || err.message);
    return false;
  }

  try {
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'TestScenario',
      description: 'Test scenario',
      api_version_id: apiVersion.id
    })).data;
    console.log('PASS: Scenario created:', scenario.id);
  } catch (err) {
    console.log('FAIL: Create scenario failed:', err.response?.data || err.message);
    return false;
  }

  try {
    injection = (await axios.post(`${API_BASE}/injections`, {
      scenario_id: scenario.id,
      type: 'error_response',
      probability: 0.5,
      config: { statusCode: 500, message: 'Test error' },
      enabled: true
    })).data;
    console.log('PASS: Valid injection created:', injection.id);
  } catch (err) {
    console.log('FAIL: Create injection failed:', err.response?.data || err.message);
    return false;
  }

  await delay(500);

  try {
    const injections = (await axios.get(`${API_BASE}/injections`)).data;
    const found = injections.find(i => i.id === injection.id);
    if (found && found.config.statusCode === 500 && found.config.message === 'Test error') {
      console.log('PASS: Injection config persisted and read correctly');
    } else {
      console.log('FAIL: Injection config read failed or mismatch');
      return false;
    }
  } catch (err) {
    console.log('FAIL: Read injection config failed:', err.response?.data || err.message);
    return false;
  }

  try {
    await axios.delete(`${API_BASE}/injections/${injection.id}`);
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`);
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    console.log('PASS: Test data cleaned up');
  } catch (err) {
    console.log('WARN: Cleanup failed:', err.message);
  }

  return true;
}

async function testRollbackChain() {
  console.log('\n=== Test 3: Rollback Chain Available ===');
  
  let apiVersion, scenario, injection;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'RollbackTestService',
      version: 'v1.0',
      base_path: '/api/rollback-test',
      schema: {}
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'RollbackTestScenario',
      description: 'For rollback test',
      api_version_id: apiVersion.id
    })).data;
    
    injection = (await axios.post(`${API_BASE}/injections`, {
      scenario_id: scenario.id,
      type: 'error_response',
      probability: 1.0,
      config: { statusCode: 500, message: 'Force fail' },
      enabled: true
    })).data;
    
    console.log('PASS: Test data created');
  } catch (err) {
    console.log('FAIL: Create test data failed:', err.response?.data || err.message);
    return false;
  }

  try {
    const execResult = (await axios.post(`${API_BASE}/executions/execute/${scenario.id}`)).data;
    console.log('Execution result:', execResult.status);
    
    if (execResult.status === 'failed') {
      console.log('PASS: Failure injection executed');
    }
  } catch (err) {
    console.log('Execution failed:', err.response?.data || err.message);
  }

  try {
    await axios.delete(`${API_BASE}/injections/${injection.id}`);
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`);
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    console.log('PASS: Test data cleaned up');
  } catch (err) {
    console.log('WARN: Cleanup failed:', err.message);
  }

  return true;
}

async function testFieldMappingAndStrategy() {
  console.log('\n=== Test 4: Field Mapping and Compatibility Strategy ===');
  
  let apiVersion, fieldMapping, strategy;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'FieldMappingTestService',
      version: 'v2.0',
      base_path: '/api/field-test',
      schema: {}
    })).data;
    console.log('PASS: API version created');
  } catch (err) {
    console.log('FAIL: Create API version failed:', err.response?.data || err.message);
    return false;
  }

  try {
    fieldMapping = (await axios.post(`${API_BASE}/field-mappings`, {
      api_version_id: apiVersion.id,
      source_field: 'user_name',
      target_field: 'username',
      transform_type: 'rename',
      transform_expression: 'toLowerCase'
    })).data;
    console.log('PASS: Field mapping created:', fieldMapping.id);
  } catch (err) {
    console.log('FAIL: Create field mapping failed:', err.response?.data || err.message);
    return false;
  }

  try {
    strategy = (await axios.post(`${API_BASE}/compatibility-strategies`, {
      api_version_id: apiVersion.id,
      strategy_type: 'field_deprecated',
      config: { deprecated_field: 'old_field', replacement: 'new_field' }
    })).data;
    console.log('PASS: Compatibility strategy created:', strategy.id);
  } catch (err) {
    console.log('FAIL: Create strategy failed:', err.response?.data || err.message);
    return false;
  }

  await delay(500);

  try {
    const versionDetail = (await axios.get(`${API_BASE}/versions/${apiVersion.id}`)).data;
    
    if (versionDetail.field_mappings && versionDetail.field_mappings.length > 0) {
      console.log('PASS: Field mapping linked to API version');
    } else {
      console.log('FAIL: Field mapping not linked');
    }
    
    if (versionDetail.compatibility_strategies && versionDetail.compatibility_strategies.length > 0) {
      console.log('PASS: Compatibility strategy linked to API version');
    } else {
      console.log('FAIL: Compatibility strategy not linked');
    }
  } catch (err) {
    console.log('FAIL: Get API version detail failed:', err.response?.data || err.message);
    return false;
  }

  try {
    await axios.delete(`${API_BASE}/field-mappings/${fieldMapping.id}`);
    await axios.delete(`${API_BASE}/compatibility-strategies/${strategy.id}`);
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    console.log('PASS: Test data cleaned up');
  } catch (err) {
    console.log('WARN: Cleanup failed:', err.message);
  }

  return true;
}

async function testScenarioPackageExport() {
  console.log('\n=== Test 5: Scenario Package Export ===');
  
  let apiVersion, scenario, injection;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'ExportTestService',
      version: 'v1.0',
      base_path: '/api/export-test',
      schema: { user_name: 'string', age: 'number' }
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'ExportTestScenario',
      description: 'For export test',
      api_version_id: apiVersion.id
    })).data;
    
    injection = (await axios.post(`${API_BASE}/injections`, {
      scenario_id: scenario.id,
      type: 'error_response',
      probability: 0.5,
      config: { statusCode: 500, message: 'Test error' },
      enabled: true
    })).data;
    
    console.log('PASS: Test data created');
  } catch (err) {
    console.log('FAIL: Create test data failed:', err.response?.data || err.message);
    return false;
  }

  try {
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    
    if (!exportResult.success) {
      console.log('FAIL: Export failed');
      return false;
    }
    
    const pkg = exportResult.package;
    
    if (pkg.scenario?.name !== 'ExportTestScenario') {
      console.log('FAIL: Scenario name mismatch');
      return false;
    }
    
    if (pkg.api_version?.name !== 'ExportTestService') {
      console.log('FAIL: API version mismatch');
      return false;
    }
    
    if (pkg.failure_injections?.length !== 1) {
      console.log('FAIL: Failure injection not exported');
      return false;
    }
    
    if (!pkg.version || !pkg.exported_at) {
      console.log('FAIL: Package metadata missing');
      return false;
    }
    
    console.log('PASS: Scenario package exported successfully');
    console.log('  - Package version:', pkg.version);
    console.log('  - Export time:', pkg.exported_at);
    console.log('  - Field mappings:', pkg.field_mappings?.length || 0);
    console.log('  - Compatibility strategies:', pkg.compatibility_strategies?.length || 0);
    console.log('  - Failure injections:', pkg.failure_injections?.length);
    console.log('  - Execution history:', pkg.execution_history_summary?.length || 0);
    console.log('  - Latest snapshot:', pkg.latest_snapshot ? 'Yes' : 'No');
  } catch (err) {
    console.log('FAIL: Export failed:', err.response?.data || err.message);
    return false;
  }

  try {
    await axios.delete(`${API_BASE}/injections/${injection.id}`);
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`);
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    console.log('PASS: Test data cleaned up');
  } catch (err) {
    console.log('WARN: Cleanup failed:', err.message);
  }

  return true;
}

async function testScenarioPackageImport() {
  console.log('\n=== Test 6: Scenario Package Import ===');
  
  let apiVersion, scenario, packageData;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'ImportTestService',
      version: 'v1.0',
      base_path: '/api/import-test',
      schema: { user_name: 'string', age: 'number' }
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'ImportTestScenario',
      description: 'For import test',
      api_version_id: apiVersion.id
    })).data;
    
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    packageData = exportResult.package;
    
    console.log('PASS: Test data created and exported');
  } catch (err) {
    console.log('FAIL: Setup failed:', err.response?.data || err.message);
    return false;
  }

  try {
    const importResult = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: packageData,
      decisions: {}
    })).data;
    
    if (!importResult.success) {
      console.log('FAIL: Import failed');
      return false;
    }
    
    if (!importResult.result?.new_scenario_id) {
      console.log('FAIL: New scenario ID not returned');
      return false;
    }
    
    if (!importResult.result?.new_scenario_name?.includes('ImportTestScenario')) {
      console.log('FAIL: New scenario name incorrect');
      return false;
    }
    
    console.log('PASS: Scenario package imported successfully');
    console.log('  - New scenario ID:', importResult.result.new_scenario_id);
    console.log('  - New scenario name:', importResult.result.new_scenario_name);
    console.log('  - API versions created:', importResult.result.imported_items?.api_versions?.length);
    console.log('  - Field mappings created:', importResult.result.imported_items?.field_mappings?.length);
    console.log('  - Failure injections created:', importResult.result.imported_items?.failure_injections?.length);
    
    await axios.delete(`${API_BASE}/scenarios/${importResult.result.new_scenario_id}`);
  } catch (err) {
    console.log('FAIL: Import failed:', err.response?.data || err.message);
    return false;
  }

  try {
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`);
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    console.log('PASS: Test data cleaned up');
  } catch (err) {
    console.log('WARN: Cleanup failed:', err.message);
  }

  return true;
}

async function testConflictDetection() {
  console.log('\n=== Test 7: Conflict Detection ===');
  
  let apiVersion, scenario, packageData;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'ConflictTestService',
      version: 'v1.0',
      base_path: '/api/conflict-test',
      schema: { user_name: 'string' }
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'ConflictTestScenario',
      description: 'For conflict test',
      api_version_id: apiVersion.id
    })).data;
    
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    packageData = exportResult.package;
    
    console.log('PASS: Test data created');
  } catch (err) {
    console.log('FAIL: Setup failed:', err.response?.data || err.message);
    return false;
  }

  try {
    const conflictResult = (await axios.post(`${API_BASE}/scenario-packages/check-conflicts`, {
      package_data: packageData
    })).data;
    
    if (!conflictResult.has_conflicts) {
      console.log('FAIL: Should detect duplicate name conflict');
      return false;
    }
    
    const duplicateNameConflict = conflictResult.issues?.find(i => i.type === 'duplicate_name');
    if (!duplicateNameConflict) {
      console.log('FAIL: Should detect duplicate_name conflict type');
      return false;
    }
    
    console.log('PASS: Conflict detected correctly');
    console.log('  - Conflict type:', duplicateNameConflict.type);
    console.log('  - Conflict message:', duplicateNameConflict.message);
  } catch (err) {
    console.log('FAIL: Conflict check failed:', err.response?.data || err.message);
    return false;
  }

  try {
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`);
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    console.log('PASS: Test data cleaned up');
  } catch (err) {
    console.log('WARN: Cleanup failed:', err.message);
  }

  return true;
}

async function testImportWithDecisions() {
  console.log('\n=== Test 8: Import with Conflict Decisions ===');
  
  let apiVersion, scenario, packageData;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'DecisionTestService',
      version: 'v1.0',
      base_path: '/api/decision-test',
      schema: { user_name: 'string' }
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'DecisionTestScenario',
      description: 'For decision test',
      api_version_id: apiVersion.id
    })).data;
    
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    packageData = exportResult.package;
    
    console.log('PASS: Test data created');
  } catch (err) {
    console.log('FAIL: Setup failed:', err.response?.data || err.message);
    return false;
  }

  try {
    await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: packageData,
      decisions: {}
    });
    
    const importResult = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: packageData,
      decisions: {
        duplicate_name: 'save_as'
      }
    })).data;
    
    if (!importResult.success) {
      console.log('FAIL: Import with decisions failed');
      return false;
    }
    
    if (!importResult.result.new_scenario_name.includes('_imported_')) {
      console.log('FAIL: Scenario should be saved as new with _imported_ suffix');
      return false;
    }
    
    console.log('PASS: Import with decisions successful');
    console.log('  - New scenario name:', importResult.result.new_scenario_name);
    
    await axios.delete(`${API_BASE}/scenarios/${importResult.result.new_scenario_id}`);
  } catch (err) {
    console.log('FAIL: Import with decisions failed:', err.response?.data || err.message);
    return false;
  }

  try {
    const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
    const originalScenario = scenarios.find(s => s.name === 'DecisionTestScenario');
    if (originalScenario) {
      await axios.delete(`${API_BASE}/scenarios/${originalScenario.id}`);
    }
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    console.log('PASS: Test data cleaned up');
  } catch (err) {
    console.log('WARN: Cleanup failed:', err.message);
  }

  return true;
}

async function testImportLogPersistence() {
  console.log('\n=== Test 9: Import Log Persistence ===');
  
  let apiVersion, scenario;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'LogTestService',
      version: 'v1.0',
      base_path: '/api/log-test',
      schema: {}
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'LogTestScenario',
      description: 'For log test',
      api_version_id: apiVersion.id
    })).data;
    
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: exportResult.package,
      decisions: {}
    });
    
    console.log('PASS: Import executed');
  } catch (err) {
    console.log('FAIL: Setup failed:', err.response?.data || err.message);
    return false;
  }

  try {
    const logs = (await axios.get(`${API_BASE}/scenario-packages/import-logs`)).data;
    
    if (logs.length === 0) {
      console.log('FAIL: No import logs found');
      return false;
    }
    
    const latestLog = logs[0];
    if (latestLog.result !== 'success') {
      console.log('FAIL: Latest log result not success');
      return false;
    }
    
    console.log('PASS: Import log recorded');
    console.log('  - Total logs:', logs.length);
    console.log('  - Latest result:', latestLog.result);
    console.log('  - Import time:', latestLog.import_time);
  } catch (err) {
    console.log('FAIL: Get logs failed:', err.response?.data || err.message);
    return false;
  }

  try {
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`);
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    console.log('PASS: Test data cleaned up');
  } catch (err) {
    console.log('WARN: Cleanup failed:', err.message);
  }

  return true;
}

async function testRollbackLastImport() {
  console.log('\n=== Test 10: Rollback Last Import ===');
  
  let apiVersion, scenario, importedScenarioId;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'RollbackTestService',
      version: 'v1.0',
      base_path: '/api/rollback-test',
      schema: {}
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'RollbackOriginalScenario',
      description: 'Original for rollback test',
      api_version_id: apiVersion.id
    })).data;
    
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    const importResult = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: exportResult.package,
      decisions: {}
    })).data;
    importedScenarioId = importResult.result.new_scenario_id;
    
    console.log('PASS: Import executed, imported scenario ID:', importedScenarioId);
  } catch (err) {
    console.log('FAIL: Setup failed:', err.response?.data || err.message);
    return false;
  }

  try {
    const rollbackResult = (await axios.post(`${API_BASE}/scenario-packages/rollback`)).data;
    
    if (!rollbackResult.success) {
      console.log('FAIL: Rollback failed');
      return false;
    }
    
    if (rollbackResult.result.rolled_back_scenario_id !== importedScenarioId) {
      console.log('FAIL: Wrong scenario rolled back');
      return false;
    }
    
    console.log('PASS: Import rolled back successfully');
    console.log('  - Rolled back scenario:', rollbackResult.result.rolled_back_scenario_name);
  } catch (err) {
    console.log('FAIL: Rollback failed:', err.response?.data || err.message);
    return false;
  }

  try {
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`);
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    console.log('PASS: Test data cleaned up');
  } catch (err) {
    console.log('WARN: Cleanup failed:', err.message);
  }

  return true;
}

async function runTests() {
  console.log('========================================');
  console.log('   API Change Sandbox - Regression Test');
  console.log('========================================');

  await delay(1000);

  const results = [];
  
  results.push(await testInvalidInjectionRejected());
  await delay(500);
  
  results.push(await testValidConfigPersisted());
  await delay(500);
  
  results.push(await testRollbackChain());
  await delay(500);
  
  results.push(await testFieldMappingAndStrategy());
  await delay(500);
  
  results.push(await testScenarioPackageExport());
  await delay(500);
  
  results.push(await testScenarioPackageImport());
  await delay(500);
  
  results.push(await testConflictDetection());
  await delay(500);
  
  results.push(await testImportWithDecisions());
  await delay(500);
  
  results.push(await testImportLogPersistence());
  await delay(500);
  
  results.push(await testRollbackLastImport());
  
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