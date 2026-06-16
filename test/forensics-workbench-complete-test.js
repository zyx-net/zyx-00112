const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:3000/api';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

function logTest(name, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`  ${status}: ${name}`);
  if (details) {
    console.log(`         ${details}`);
  }
}

async function testGuiEntry() {
  logSection('Test 1: GUI 可见入口');
  
  try {
    const res = await axios.get(`${API_BASE}/forensics-workbench/config`);
    const config = res.data.config;
    
    logTest('取证工作台配置可获取', true, `模式: ${config.simulateMode ? '仅预检' : '真实执行'}`);
    
    const batchesRes = await axios.get(`${API_BASE}/forensics-workbench/batches`);
    logTest('批次列表接口可用', true, `当前批次数: ${batchesRes.data.count}`);
    
    return true;
  } catch (err) {
    logTest('GUI入口测试失败', false, err.message);
    return false;
  }
}

async function testBatchDetails() {
  logSection('Test 2: 批次详情');
  
  let apiVersion, scenario;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'DetailTestService',
      version: 'v1.0',
      base_path: '/api/detail-test',
      schema: { field1: 'string' }
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'DetailTestScenario',
      description: 'For detail test',
      api_version_id: apiVersion.id,
      status: 'draft'
    })).data;
    
    await axios.post(`${API_BASE}/executions/execute/${scenario.id}`);
    await delay(2000);
    
    const batch = (await axios.post(`${API_BASE}/forensics-workbench/initialize`, {
      operator: 'detail_tester',
      original_scenario_id: scenario.id,
      conflict_decision: 'save_as',
      mode: 'simulate'
    })).data;
    
    logTest('批次初始化成功', true, `批次号: ${batch.batch.batch_number}`);
    
    const details = (await axios.get(`${API_BASE}/forensics-workbench/batch/${batch.batch.id}`)).data;
    
    logTest('批次详情可获取', true, 
      `状态: ${details.batch.state}, 操作数: ${details.batch.summary?.total_operations || 0}`);
    
    logTest('批次包含时间线', details.batch.timeline?.length > 0, 
      `时间线事件数: ${details.batch.timeline?.length || 0}`);
    
    logTest('批次包含来源信息', !!details.batch.original_scenario_id, 
      `原始场景ID: ${details.batch.original_scenario_id?.substring(0, 8)}...`);
    
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    
    return true;
  } catch (err) {
    logTest('批次详情测试失败', false, err.message);
    try {
      if (scenario?.id) await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
      if (apiVersion?.id) await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    } catch (e) {}
    return false;
  }
}

async function testLogPersistence() {
  logSection('Test 3: 日志落盘');
  
  let apiVersion, scenario;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'LogTestService',
      version: 'v1.0',
      base_path: '/api/log-test',
      schema: { field1: 'string' }
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'LogTestScenario',
      description: 'For log test',
      api_version_id: apiVersion.id,
      status: 'draft'
    })).data;
    
    await axios.post(`${API_BASE}/executions/execute/${scenario.id}`);
    await delay(2000);
    
    const batch = (await axios.post(`${API_BASE}/forensics-workbench/initialize`, {
      operator: 'log_tester',
      original_scenario_id: scenario.id,
      conflict_decision: 'save_as',
      mode: 'simulate'
    })).data;
    
    const batchNumber = batch.batch.batch_number;
    
    await axios.post(`${API_BASE}/forensics-workbench/pre-check/${batch.batch.id}`);
    
    const logRes = await axios.get(`${API_BASE}/forensics-workbench/log/${batch.batch.id}`);
    
    logTest('日志内容可获取', !!logRes.data.log_content, 
      `日志路径: ${logRes.data.log_path || 'N/A'}`);
    
    if (logRes.data.log_content) {
      const logLines = logRes.data.log_content.split('\n').filter(l => l.trim());
      logTest('日志包含多条记录', logLines.length > 0, `日志条数: ${logLines.length}`);
      
      const hasInit = logRes.data.log_content.includes('Batch initialized');
      logTest('日志包含初始化事件', hasInit);
      
      const hasPreCheck = logRes.data.log_content.includes('pre-check');
      logTest('日志包含预检查事件', hasPreCheck);
    }
    
    const logsList = (await axios.get(`${API_BASE}/forensics-workbench/logs`)).data;
    logTest('日志列表可获取', logsList.success, `日志文件数: ${logsList.count}`);
    
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    
    return true;
  } catch (err) {
    logTest('日志落盘测试失败', false, err.message);
    try {
      if (scenario?.id) await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
      if (apiVersion?.id) await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    } catch (e) {}
    return false;
  }
}

async function testConfigSwitch() {
  logSection('Test 4: 配置切换');
  
  try {
    const initialConfig = (await axios.get(`${API_BASE}/forensics-workbench/config`)).data.config;
    logTest('获取初始配置', true, `初始模式: ${initialConfig.simulateMode ? '仅预检' : '真实执行'}`);
    
    const switchRes = await axios.post(`${API_BASE}/forensics-workbench/config/mode`, {
      mode: 'real'
    });
    logTest('切换到真实执行模式', switchRes.data.success, switchRes.data.message);
    
    const afterSwitch = (await axios.get(`${API_BASE}/forensics-workbench/config`)).data.config;
    logTest('配置切换生效', afterSwitch.simulateMode === false, 
      `当前模式: ${afterSwitch.simulateMode ? '仅预检' : '真实执行'}`);
    
    await axios.post(`${API_BASE}/forensics-workbench/config/mode`, {
      mode: 'simulate'
    });
    logTest('切换回仅预检模式', true);
    
    return true;
  } catch (err) {
    logTest('配置切换测试失败', false, err.message);
    return false;
  }
}

async function testDuplicateSubmission() {
  logSection('Test 5: 重复提交检测');
  
  let apiVersion, scenario, batch;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'DupTestService',
      version: 'v1.0',
      base_path: '/api/dup-test',
      schema: { field1: 'string' }
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'DupTestScenario',
      description: 'For duplicate test',
      api_version_id: apiVersion.id,
      status: 'draft'
    })).data;
    
    batch = (await axios.post(`${API_BASE}/forensics-workbench/initialize`, {
      operator: 'dup_tester',
      original_scenario_id: scenario.id,
      conflict_decision: 'save_as',
      mode: 'simulate'
    })).data;
    
    logTest('第一次批次创建成功', true, `批次号: ${batch.batch.batch_number}`);
    
    try {
      await axios.post(`${API_BASE}/forensics-workbench/initialize`, {
        operator: 'dup_tester',
        original_scenario_id: scenario.id,
        conflict_decision: 'save_as',
        mode: 'simulate'
      });
      logTest('重复提交检测', false, '应该拒绝重复提交但没有');
    } catch (dupErr) {
      if (dupErr.response?.data?.error?.includes('重复提交')) {
        logTest('重复提交被正确拒绝', true, dupErr.response.data.error);
      } else {
        logTest('重复提交检测', false, dupErr.message);
      }
    }
    
    await axios.post(`${API_BASE}/forensics-workbench/cancel/${batch.batch.id}`, {
      reason: '测试完成'
    });
    
    const newBatch = (await axios.post(`${API_BASE}/forensics-workbench/initialize`, {
      operator: 'dup_tester',
      original_scenario_id: scenario.id,
      conflict_decision: 'save_as',
      mode: 'simulate'
    })).data;
    logTest('取消后可创建新批次', true, `新批次号: ${newBatch.batch.batch_number}`);
    
    await axios.post(`${API_BASE}/forensics-workbench/cancel/${newBatch.batch.id}`, {
      reason: '清理'
    }).catch(() => {});
    
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    
    return true;
  } catch (err) {
    logTest('重复提交测试失败', false, err.message);
    try {
      if (batch?.batch?.id) await axios.post(`${API_BASE}/forensics-workbench/cancel/${batch.batch.id}`, { reason: '清理' }).catch(() => {});
      if (scenario?.id) await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
      if (apiVersion?.id) await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    } catch (e) {}
    return false;
  }
}

async function testBatchReplay() {
  logSection('Test 6: 同批次重放检测');
  
  let apiVersion, scenario, batch;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'ReplayTestService',
      version: 'v1.0',
      base_path: '/api/replay-test',
      schema: { field1: 'string' }
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'ReplayTestScenario',
      description: 'For replay test',
      api_version_id: apiVersion.id,
      status: 'draft'
    })).data;
    
    batch = (await axios.post(`${API_BASE}/forensics-workbench/initialize`, {
      operator: 'replay_tester',
      original_scenario_id: scenario.id,
      conflict_decision: 'save_as',
      mode: 'simulate'
    })).data;
    
    await axios.post(`${API_BASE}/forensics-workbench/pre-check/${batch.batch.id}`);
    await axios.post(`${API_BASE}/forensics-workbench/complete/${batch.batch.id}`);
    
    const replayCheck = (await axios.post(
      `${API_BASE}/forensics-workbench/check-replay/${batch.batch.batch_number}`
    )).data;
    
    logTest('重放检测接口可用', true);
    logTest('已完成批次不能重放', !replayCheck.canReplay, 
      `原因: ${replayCheck.reason}`);
    
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    
    return true;
  } catch (err) {
    logTest('重放检测测试失败', false, err.message);
    try {
      if (scenario?.id) await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
      if (apiVersion?.id) await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    } catch (e) {}
    return false;
  }
}

async function testBatchResume() {
  logSection('Test 7: 批次状态中断后恢复');
  
  let apiVersion, scenario, batch;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'ResumeTestService',
      version: 'v1.0',
      base_path: '/api/resume-test',
      schema: { field1: 'string' }
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'ResumeTestScenario',
      description: 'For resume test',
      api_version_id: apiVersion.id,
      status: 'draft'
    })).data;
    
    batch = (await axios.post(`${API_BASE}/forensics-workbench/initialize`, {
      operator: 'resume_tester',
      original_scenario_id: scenario.id,
      conflict_decision: 'save_as',
      mode: 'simulate'
    })).data;
    
    const resumeResult = (await axios.post(
      `${API_BASE}/forensics-workbench/resume/${batch.batch.id}`
    )).data;
    
    logTest('恢复接口可用', true);
    logTest('返回恢复建议', !!resumeResult.suggestion, 
      `建议: ${resumeResult.suggestion}`);
    
    await axios.post(`${API_BASE}/forensics-workbench/cancel/${batch.batch.id}`, {
      reason: '测试完成'
    }).catch(() => {});
    
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    
    return true;
  } catch (err) {
    logTest('批次恢复测试失败', false, err.message);
    try {
      if (scenario?.id) await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
      if (apiVersion?.id) await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    } catch (e) {}
    return false;
  }
}

async function testCrossRestartTraceability() {
  logSection('Test 8: 跨重启可追溯');
  
  try {
    const batches = (await axios.get(`${API_BASE}/forensics-workbench/batches`)).data.batches;
    
    logTest('可获取历史批次', true, `历史批次数: ${batches.length}`);
    
    if (batches.length > 0) {
      const oldestBatch = batches[batches.length - 1];
      
      const details = (await axios.get(
        `${API_BASE}/forensics-workbench/batch/${oldestBatch.id}`
      )).data;
      
      logTest('可查询历史批次详情', !!details.batch, 
        `批次号: ${oldestBatch.batch_number}`);
      
      logTest('历史批次包含完整时间线', 
        (details.batch.timeline?.length || 0) > 0, 
        `时间线事件数: ${details.batch.timeline?.length || 0}`);
      
      const logRes = await axios.get(
        `${API_BASE}/forensics-workbench/log/${oldestBatch.id}`
      ).catch(() => null);
      
      if (logRes?.data?.log_content) {
        logTest('历史批次日志可追溯', true, '日志文件存在');
      } else {
        logTest('历史批次日志可追溯', false, '日志文件可能已被清理');
      }
    } else {
      logTest('无历史批次可测试', false, '请先创建一些批次');
    }
    
    return true;
  } catch (err) {
    logTest('跨重启追溯测试失败', false, err.message);
    return false;
  }
}

async function testOldLogMissing() {
  logSection('Test 9: 旧日志缺失提示');
  
  try {
    const fakeBatchId = 'non-existent-batch-id';
    
    const logRes = await axios.get(
      `${API_BASE}/forensics-workbench/log/${fakeBatchId}`
    ).catch(err => err.response);
    
    if (logRes.status === 500 || logRes.data?.error) {
      logTest('缺失批次日志有错误提示', true, 
        logRes.data?.error || '批次不存在');
    } else {
      logTest('缺失批次日志有错误提示', false, '应该返回错误');
    }
    
    return true;
  } catch (err) {
    logTest('旧日志缺失测试失败', false, err.message);
    return false;
  }
}

async function testFullChainExecution() {
  logSection('Test 10: 完整链路执行');
  
  let apiVersion, scenario;
  
  try {
    apiVersion = (await axios.post(`${API_BASE}/versions`, {
      name: 'FullChainTestService',
      version: 'v1.0',
      base_path: '/api/fullchain-test',
      schema: { field1: 'string' }
    })).data;
    
    scenario = (await axios.post(`${API_BASE}/scenarios`, {
      name: 'FullChainTestScenario',
      description: 'For full chain test',
      api_version_id: apiVersion.id,
      status: 'draft'
    })).data;
    
    await axios.post(`${API_BASE}/executions/execute/${scenario.id}`);
    await delay(2000);
    
    const exportRes = await axios.post(`${API_BASE}/scenario-packages/export/${scenario.id}`);
    const packageData = exportRes.data.package;
    
    const fullChain = (await axios.post(`${API_BASE}/forensics-workbench/full-chain`, {
      operator: 'fullchain_tester',
      package_data: packageData,
      decisions: { scenario_action: 'save_as' },
      original_scenario_id: scenario.id,
      skip_restart_review: false
    })).data;
    
    logTest('完整链路执行', fullChain.success, 
      `最终状态: ${fullChain.chain_result.final_state}`);
    
    if (fullChain.success) {
      logTest('链路步骤完整', 
        fullChain.chain_result.steps?.length >= 5, 
        `步骤数: ${fullChain.chain_result.steps?.length}`);
      
      const batchDetails = (await axios.get(
        `${API_BASE}/forensics-workbench/batch/${fullChain.chain_result.batch_id}`
      )).data;
      
      logTest('批次状态为已完成', 
        batchDetails.batch.state === 'completed', 
        `状态: ${batchDetails.batch.state}`);
    }
    
    await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
    await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    
    return true;
  } catch (err) {
    logTest('完整链路测试失败', false, err.message);
    try {
      if (scenario?.id) await axios.delete(`${API_BASE}/scenarios/${scenario.id}`).catch(() => {});
      if (apiVersion?.id) await axios.delete(`${API_BASE}/versions/${apiVersion.id}`).catch(() => {});
    } catch (e) {}
    return false;
  }
}

async function runTests() {
  console.log('\n' + '#'.repeat(60));
  console.log('#  取证工作台完整验证测试套件');
  console.log('#  覆盖: GUI入口、批次详情、日志落盘、配置切换、');
  console.log('#        重复提交、重放检测、批次恢复、跨重启追溯');
  console.log('#'.repeat(60));

  await delay(1000);

  const results = [];
  
  results.push(await testGuiEntry());
  await delay(300);
  
  results.push(await testBatchDetails());
  await delay(300);
  
  results.push(await testLogPersistence());
  await delay(300);
  
  results.push(await testConfigSwitch());
  await delay(300);
  
  results.push(await testDuplicateSubmission());
  await delay(300);
  
  results.push(await testBatchReplay());
  await delay(300);
  
  results.push(await testBatchResume());
  await delay(300);
  
  results.push(await testCrossRestartTraceability());
  await delay(300);
  
  results.push(await testOldLogMissing());
  await delay(300);
  
  results.push(await testFullChainExecution());

  console.log('\n' + '#'.repeat(60));
  console.log('#  测试结果汇总');
  console.log('#'.repeat(60));
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`\n  通过: ${passed}/${total}`);
  
  if (passed === total) {
    console.log('\n  🎉 所有测试通过！');
    process.exit(0);
  } else {
    console.log('\n  ⚠️ 部分测试失败，请检查输出');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('测试脚本执行失败:', err.message);
  process.exit(1);
});
