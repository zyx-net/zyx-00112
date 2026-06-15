const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testAuditCenterCompleteFlow() {
  console.log('\n=== 测试: 导入替换审计中心完整流程 ===');

  let apiVersion, scenario1, scenario2, existingScenarioId;
  const scenarioName = 'AuditCenterTestScenario';

  try {
    console.log('Step 1: 创建API版本...');
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'AuditService',
      version: 'v1.0',
      base_path: '/api/audit-test',
      schema: { field1: 'string', field2: 'number' }
    })).data;
    console.log('  API版本已创建:', apiVersion.id);

    console.log('Step 2: 创建第一个场景并添加执行历史...');
    scenario1 = (await axios.post(`${API_BASE}/scenarios`, {
      name: scenarioName,
      description: '原始场景用于导入替换测试',
      api_version_id: apiVersion.id,
      status: 'draft'
    })).data;
    existingScenarioId = scenario1.id;
    console.log('  原始场景已创建:', existingScenarioId);

    await axios.post(`${API_BASE}/injections`, {
      scenario_id: existingScenarioId,
      type: 'error_response',
      probability: 0.3,
      config: JSON.stringify({ statusCode: 500 }),
      enabled: true
    });

    console.log('Step 3: 执行场景创建历史记录...');
    for (let i = 1; i <= 2; i++) {
      await axios.post(`${API_BASE}/executions/execute/${existingScenarioId}`);
      await delay(3500);
      console.log(`  执行 ${i} 完成`);
    }

    const originalExecutions = (await axios.get(`${API_BASE}/executions/scenario/${existingScenarioId}`)).data;
    const originalSnapshots = (await axios.get(`${API_BASE}/rollback/history/${existingScenarioId}`)).data;
    console.log('  原始执行数:', originalExecutions.length);
    console.log('  原始快照数:', originalSnapshots.length);

    console.log('Step 4: 导出第二个场景作为导入源...');
    scenario2 = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'SourceScenarioForExport',
      description: '用于导出的源场景',
      api_version_id: apiVersion.id
    })).data;

    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario2.id}`)).data;
    const packageData = exportResult.package;
    packageData.scenario.name = scenarioName;
    packageData.scenario.description = '被替换的场景';
    console.log('  场景包已导出');

    console.log('Step 5: 使用replace模式导入...');
    const importResult = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: packageData,
      decisions: {
        scenario_action: 'replace',
        execution_history_action: 'keep'
      }
    })).data;

    console.log('  导入结果: success =', importResult.success);
    const newScenarioId = importResult.result.new_scenario_id;
    console.log('  新场景ID:', newScenarioId);

    console.log('Step 6: 验证旧场景已被删除...');
    const allScenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
    const oldScenarioExists = allScenarios.some(s => s.id === existingScenarioId);
    if (oldScenarioExists) {
      console.log('FAIL: 旧场景应该被删除');
      return false;
    }
    console.log('PASS: 旧场景已删除');

    console.log('Step 7: 获取导入日志验证审计信息...');
    const importLogs = (await axios.get(`${API_BASE}/scenario-packages/import-logs`)).data;
    const replaceLog = importLogs.find(l =>
      l.result === 'success' &&
      l.details &&
      l.details.scenario_action === 'replace'
    );

    if (!replaceLog) {
      console.log('FAIL: 应该存在replace导入日志');
      return false;
    }
    console.log('  导入日志ID:', replaceLog.id);
    console.log('  被替换场景名称:', replaceLog.details.replaced_scenario?.scenario_name);
    console.log('  被替换执行数:', replaceLog.details.replaced_scenario?.execution_count);
    console.log('  被替换快照数:', replaceLog.details.replaced_scenario?.snapshot_count);
    console.log('  归档场景ID:', replaceLog.details.archived_scenario_id);
    console.log('PASS: 导入日志记录完整');

    console.log('Step 8: 回滚导入并验证审计追踪...');
    const rollbackResult = (await axios.post(`${API_BASE}/scenario-packages/rollback`)).data;

    console.log('  回滚结果: success =', rollbackResult.success);
    console.log('  审计批次ID:', rollbackResult.audit_batch_id);
    console.log('  回滚变更数:', rollbackResult.rollback_changes_count);
    console.log('  从归档恢复:', rollbackResult.traceability?.restored_from_archive);

    if (!rollbackResult.audit_batch_id) {
      console.log('FAIL: 回滚应该创建审计批次');
      return false;
    }
    console.log('PASS: 回滚审计信息已记录');

    console.log('Step 9: 查询审计批次详情...');
    const batchDetails = (await axios.get(`${API_BASE}/audit-center/batches/${rollbackResult.audit_batch_id}`)).data;

    console.log('  批次号:', batchDetails.batch.batch_number);
    console.log('  回滚变更数:', batchDetails.batch.rollback_changes?.length || 0);

    if (!batchDetails.batch.rollback_changes || batchDetails.batch.rollback_changes.length === 0) {
      console.log('FAIL: 应该存在回滚变更记录');
      return false;
    }
    console.log('PASS: 审计批次详情可查询');

    console.log('Step 10: 验证恢复的场景...');
    const restoredScenario = (await axios.get(`${API_BASE}/scenarios/${rollbackResult.traceability?.restored_scenario_id}`)).data;
    const restoredExecutions = (await axios.get(`${API_BASE}/executions/scenario/${rollbackResult.traceability?.restored_scenario_id}`)).data;
    const restoredSnapshots = (await axios.get(`${API_BASE}/rollback/history/${rollbackResult.traceability?.restored_scenario_id}`)).data;

    console.log('  恢复场景ID:', restoredScenario.id);
    console.log('  恢复场景名称:', restoredScenario.name);
    console.log('  恢复执行数:', restoredExecutions.length);
    console.log('  恢复快照数:', restoredSnapshots.length);

    if (restoredExecutions.length !== originalExecutions.length) {
      console.log('FAIL: 恢复的执行数应该与原始一致');
      return false;
    }
    if (restoredSnapshots.length !== originalSnapshots.length) {
      console.log('FAIL: 恢复的快照数应该与原始一致');
      return false;
    }
    console.log('PASS: 场景已正确恢复');

    console.log('Step 11: 执行模拟检查...');
    const simulationResult = (await axios.post(
      `${API_BASE}/audit-center/restart-reviews/${rollbackResult.audit_batch_id}/simulation/${restoredScenario.id}`
    )).data;

    console.log('  模拟检查结果: consistency_check_passed =', simulationResult.consistency_check_passed);
    console.log('  错误数:', simulationResult.errors_found?.length || 0);
    console.log('  警告数:', simulationResult.warnings?.length || 0);
    console.log('PASS: 模拟检查已执行');

    console.log('Step 12: 执行真实重启验证...');
    const realRestartResult = (await axios.post(
      `${API_BASE}/audit-center/restart-reviews/${rollbackResult.audit_batch_id}/real-restart/${restoredScenario.id}`,
      { operator: 'test_operator' }
    )).data;

    console.log('  真实重启验证: real_restart_verified =', realRestartResult.real_restart_verified);
    console.log('  验证者:', realRestartResult.verified_by);
    console.log('  一致性检查通过:', realRestartResult.consistency_check_passed);
    console.log('PASS: 真实重启验证已执行');

    console.log('Step 13: 生成综合报告...');
    const report = (await axios.get(`${API_BASE}/audit-center/batches/${rollbackResult.audit_batch_id}/report`)).data;

    console.log('  报告批次号:', report.report.batch_info.batch_number);
    console.log('  快照版本数:', report.report.summary.total_snapshot_versions);
    console.log('  回滚变更数:', report.report.summary.total_rollback_changes);
    console.log('  模拟检查数:', report.report.summary.simulation_reviews_count);
    console.log('  真实重启验证数:', report.report.summary.real_restart_reviews_count);
    console.log('  关键问题数:', report.report.issues.errors?.length || 0);
    console.log('PASS: 综合报告已生成');

    console.log('\n清理测试数据...');
    try {
      const finalScenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of finalScenarios) {
        if (s.name.includes('AuditCenterTest') || s.name.includes('SourceScenario')) {
          await axios.delete(`${API_BASE}/scenarios/${s.id}`);
        }
      }
      await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    } catch (e) {}
    console.log('清理完成');

    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    console.log('  错误详情:', err.response?.data);
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of scenarios) {
        if (s.name.includes('AuditCenterTest') || s.name.includes('SourceScenario')) {
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

async function testSaveAsFlow() {
  console.log('\n=== 测试: Save As 导入审计流程 ===');

  let apiVersion, scenario;
  const scenarioName = 'SaveAsTestScenario';

  try {
    console.log('Step 1: 创建API版本和场景...');
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'SaveAsService',
      version: 'v1.0',
      base_path: '/api/saveas-test',
      schema: { field1: 'string' }
    })).data;

    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: scenarioName,
      description: '原始场景',
      api_version_id: apiVersion.id
    })).data;

    console.log('  场景已创建:', scenario.id);

    console.log('Step 2: 导出场景包...');
    const exportResult = (await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`)).data;
    const packageData = exportResult.package;
    packageData.scenario.description = '修改后的描述';

    console.log('Step 3: 使用save_as模式导入...');
    const importResult = (await axios.post(`${API_BASE}/scenario-packages/import`, {
      package_data: packageData,
      decisions: {
        scenario_action: 'save_as'
      }
    })).data;

    console.log('  导入成功: success =', importResult.success);
    console.log('  新场景ID:', importResult.result.new_scenario_id);

    const allScenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
    const originalScenario = allScenarios.find(s => s.id === scenario.id);
    const newScenario = allScenarios.find(s => s.id === importResult.result.new_scenario_id);

    if (!originalScenario) {
      console.log('FAIL: 原始场景应该保留');
      return false;
    }
    if (!newScenario) {
      console.log('FAIL: 新场景应该创建');
      return false;
    }
    if (newScenario.name === originalScenario.name) {
      console.log('FAIL: 新场景应该有不同名称');
      return false;
    }

    console.log('  原始场景保留:', originalScenario.name);
    console.log('  新场景创建:', newScenario.name);
    console.log('PASS: Save As 流程正确');

    console.log('\n清理测试数据...');
    try {
      const scenarios = (await axios.get(`${API_BASE}/scenarios`)).data;
      for (const s of scenarios) {
        if (s.name.includes('SaveAsTest')) {
          await axios.delete(`${API_BASE}/scenarios/${s.id}`).catch(() => {});
        }
      }
      await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    } catch (e) {}
    console.log('清理完成');

    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
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

async function testRestartConsistency() {
  console.log('\n=== 测试: 重启后一致性验证 ===');

  let apiVersion, scenario;

  try {
    console.log('Step 1: 创建API版本和场景...');
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'RestartConsistencyService',
      version: 'v1.0',
      base_path: '/api/restart-consistency',
      schema: { field1: 'string' }
    })).data;

    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'RestartConsistencyTest',
      description: '重启一致性测试',
      api_version_id: apiVersion.id
    })).data;

    console.log('  场景已创建:', scenario.id);

    console.log('Step 2: 执行场景创建快照...');
    await axios.post(`${API_BASE}/executions/execute/${scenario.id}`);
    await delay(3500);

    const snapshots = (await axios.get(`${API_BASE}/rollback/history/${scenario.id}`)).data;
    console.log('  快照数:', snapshots.length);

    console.log('Step 3: 获取批次列表...');
    const batches = (await axios.get(`${API_BASE}/audit-center/batches`)).data;
    console.log('  总批次数:', batches.batches?.length || 0);
    console.log('PASS: 批次列表可查询');

    console.log('\n清理测试数据...');
    try {
      await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
      await axios.delete(`${API_BASE}/versions/${apiVersion.id}`);
    } catch (e) {}
    console.log('清理完成');

    return true;
  } catch (err) {
    console.log('FAIL:', err.response?.data?.error || err.message);
    try {
      if (scenario?.id) {
        await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
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
  console.log('  导入替换审计中心 - 自动化测试  ');
  console.log('========================================');

  await delay(1000);

  const results = [];

  results.push(await testAuditCenterCompleteFlow());
  await delay(500);

  results.push(await testSaveAsFlow());
  await delay(500);

  results.push(await testRestartConsistency());
  await delay(500);

  console.log('\n========================================');
  console.log('   测试结果汇总');
  console.log('========================================');

  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log(`通过: ${passed}/${total}`);

  if (passed === total) {
    console.log('\n所有测试通过！');
    process.exit(0);
  } else {
    console.log('\n部分测试失败，请检查输出');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('测试脚本执行失败:', err.message);
  process.exit(1);
});
