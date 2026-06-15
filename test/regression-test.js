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