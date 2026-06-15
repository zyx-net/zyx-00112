const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testSchemaIncompatibleRejected() {
  console.log('\n=== Test E: Schema Incompatible Rejected ===');
  
  let apiVersion1, scenario1;
  
  try {
    apiVersion1 = (await axios.post(`${API_BASE}/versions`, {
      name: 'SchemaConflictService',
      version: 'v1.0',
      base_path: '/api/schema-conflict',
      schema: { user_name: 'string', age: 'number' }
    })).data;
    
    scenario1 = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'SchemaConflictScenario1',
      description: 'First scenario with schema',
      api_version_id: apiVersion1.id
    })).data;
    
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario1.id}`)).data;
    const packageData = exportResult.package;
    
    console.log('PASS: Created scenario with schema and exported');
    
    const beforeScenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
    const beforeVersions = (await axios.get(`${API_BASE}/versions`)).data;
    const beforeScenarioCount = beforeScenarios.length;
    const beforeVersionCount = beforeVersions.filter(v => v.name === 'SchemaConflictService').length;
    
    packageData.api_version.schema = { email: 'string', phone: 'string' };
    
    try {
      await axios.post(`${API_BASE}/scenario-packages/import`, {
        package_data: packageData,
        decisions: {}
      });
      
      console.log('FAIL: Import with schema incompatible should be rejected');
      
      const afterScenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      const afterVersions = (await axios.get(`${API_BASE}/versions`)).data;
      
      for (const s of afterScenarios) {
        if (s.name.includes('SchemaConflictScenario1_imported_')) {
          await axios.delete(`${API_BASE}/scenarios/${s.id}`);
        }
      }
      for (const v of afterVersions) {
        if (v.name === 'SchemaConflictService' && v.id !== apiVersion1.id) {
          await axios.delete(`${API_BASE}/versions/${v.id}`);
        }
      }
      
      return false;
    } catch (err) {
      if (err.response?.status === 409) {
        const conflicts = err.response.data.conflicts;
        const hasSchemaConflict = conflicts?.issues?.some(i => i.type === 'schema_incompatible');
        
        if (!hasSchemaConflict) {
          console.log('FAIL: Should detect schema_incompatible conflict');
          console.log('  Conflicts:', JSON.stringify(conflicts?.issues, null, 2));
          return false;
        }
        
        const afterScenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
        const afterVersions = (await axios.get(`${API_BASE}/versions`)).data;
        const afterScenarioCount = afterScenarios.length;
        const afterVersionCount = afterVersions.filter(v => v.name === 'SchemaConflictService').length;
        
        if (afterScenarioCount !== beforeScenarioCount) {
          console.log('FAIL: Import should not create new scenario when rejected');
          console.log(`  Before: ${beforeScenarioCount}, After: ${afterScenarioCount}`);
          return false;
        }
        
        if (afterVersionCount !== beforeVersionCount) {
          console.log('FAIL: Import should not create duplicate API version when rejected');
          console.log(`  Before: ${beforeVersionCount}, After: ${afterVersionCount}`);
          return false;
        }
        
        console.log('PASS: Schema incompatible import correctly rejected');
        console.log('  - No new scenario created');
        console.log('  - No duplicate API version created');
        
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
      for (const s of scenarios) {
        if (s.name.includes('SchemaConflictScenario')) {
          await axios.delete(`${API_BASE}/scenarios/${s.id}`);
        }
      }
      const versions = (await axios.get(`${API_BASE}/versions`)).data;
      for (const v of versions) {
        if (v.name === 'SchemaConflictService') {
          await axios.delete(`${API_BASE}/versions/${v.id}`);
        }
      }
    } catch (e) {
      console.log('Cleanup warning:', e.message);
    }
  }
}

async function testConsecutiveImportsRollback() {
  console.log('\n=== Test F: Consecutive Imports Rollback ===');
  
  let apiVersion, scenario;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'ConsecutiveImportService',
      version: 'v1.0',
      base_path: '/api/consecutive-import',
      schema: { user_name: 'string' }
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'ConsecutiveImportScenario',
      description: 'For consecutive import test',
      api_version_id: apiVersion.id
    })).data;
    
    await axios.post(`${API_BASE}/injections`, {
      scenario_id: scenario.id,
      type: 'error_response',
      probability: 0.5,
      config: { statusCode: 500, message: 'Test error' },
      enabled: true
    });
    
    const execResult = (await axios.post(`${API_BASE}/executions/execute/${scenario.id}`)).data;
    
    console.log('PASS: Created scenario with execution history');
    
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    const packageData = exportResult.package;
    
    const import1 = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: packageData,
      decisions: { duplicate_name: 'save_as', execution_history_action: 'keep' }
    })).data;
    
    const scenario1Id = import1.result.new_scenario_id;
    const scenario1Name = import1.result.new_scenario_name;
    
    console.log('PASS: First import completed');
    console.log('  - Scenario ID:', scenario1Id);
    console.log('  - Scenario name:', scenario1Name);
    
    const import2 = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: packageData,
      decisions: { duplicate_name: 'save_as', execution_history_action: 'keep' }
    })).data;
    
    const scenario2Id = import2.result.new_scenario_id;
    const scenario2Name = import2.result.new_scenario_name;
    
    console.log('PASS: Second import completed');
    console.log('  - Scenario ID:', scenario2Id);
    console.log('  - Scenario name:', scenario2Name);
    
    const beforeScenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
    const beforeScenario1 = beforeScenarios.find(s => s.id === scenario1Id);
    const beforeScenario2 = beforeScenarios.find(s => s.id === scenario2Id);
    
    if (!beforeScenario1 || !beforeScenario2) {
      console.log('FAIL: Both imported scenarios should exist before rollback');
      return false;
    }
    
    const beforeHistory1 = (await axios.get(`${API_BASE}/executions/scenario/${scenario1Id}`)).data;
    const beforeHistory2 = (await axios.get(`${API_BASE}/executions/scenario/${scenario2Id}`)).data;
    
    console.log('  Before rollback:');
    console.log('    - Scenario 1 history:', beforeHistory1.length);
    console.log('    - Scenario 2 history:', beforeHistory2.length);
    
    const rollbackResult = (await axios.post(`${API_BASE}/scenario-packages/rollback`)).data;
    
    console.log('PASS: Rollback completed');
    console.log('  - Rolled back scenario ID:', rollbackResult.result.rolled_back_scenario_id);
    console.log('  - Rolled back scenario name:', rollbackResult.result.rolled_back_scenario_name);
    console.log('  - Cleaned resources:', JSON.stringify(rollbackResult.result.cleaned_resources, null, 2));
    console.log('  - Expected scenario 2 ID:', scenario2Id);
    
    const afterScenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
    const afterScenario1 = afterScenarios.find(s => s.id === scenario1Id);
    const afterScenario2 = afterScenarios.find(s => s.id === scenario2Id);
    
    if (afterScenario2) {
      console.log('FAIL: Second imported scenario should be deleted after rollback');
      return false;
    }
    
    if (!afterScenario1) {
      console.log('FAIL: First imported scenario should still exist after rollback');
      return false;
    }
    
    const afterHistory1 = (await axios.get(`${API_BASE}/executions/scenario/${scenario1Id}`)).data;
    
    if (afterHistory1.length === 0) {
      console.log('FAIL: First imported scenario should still have execution history');
      return false;
    }
    
    console.log('PASS: Rollback correctly cleaned only latest import');
    console.log('  - Scenario 1 still exists:', afterScenario1.name);
    console.log('  - Scenario 1 history preserved:', afterHistory1.length);
    console.log('  - Scenario 2 deleted:', !afterScenario2);
    
    const rollbackResult2 = (await axios.post(`${API_BASE}/scenario-packages/rollback`)).data;
    
    const afterScenarios2 = (await axios.get(`${API_BASE}/scenarios`)).data;
    const afterScenario1_v2 = afterScenarios2.find(s => s.id === scenario1Id);
    
    if (afterScenario1_v2) {
      console.log('FAIL: First imported scenario should be deleted after second rollback');
      return false;
    }
    
    console.log('PASS: Second rollback correctly cleaned first import');
    
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`);
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    
    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of scenarios) {
        if (s.name.includes('ConsecutiveImportScenario')) {
          await axios.delete(`${API_BASE}/scenarios/${s.id}`);
        }
      }
      const versions = (await axios.get(`${API_BASE}/versions`)).data;
      for (const v of versions) {
        if (v.name === 'ConsecutiveImportService') {
          await axios.delete(`${API_BASE}/versions/${v.id}`);
        }
      }
    } catch (e) {}
    return false;
  }
}

async function runTests() {
  console.log('========================================');
  console.log('   Scenario Package Import Tests');
  console.log('========================================');

  await delay(1000);

  const results = [];
  
  results.push(await testSchemaIncompatibleRejected());
  await delay(500);
  
  results.push(await testConsecutiveImportsRollback());
  
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
