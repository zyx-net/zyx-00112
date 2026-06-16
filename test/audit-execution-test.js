const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

let apiVersionId = null;
let scenarioId = null;
let batchId = null;
let batchNumber = null;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`✗ ${name}: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('=== 执行审计台验证测试 ===\n');

  let passed = 0;
  let total = 0;

  total++;
  if (await test('1. 创建API版本', async () => {
    const res = await axios.post(`${BASE_URL}/versions`, {
      name: '审计测试服务',
      version: 'v1.0',
      base_path: '/api/audit-test'
    });
    apiVersionId = res.data.id;
    console.log(`  API版本ID: ${apiVersionId}`);
  })) passed++;

  total++;
  if (await test('2. 创建场景', async () => {
    const res = await axios.post(`${BASE_URL}/scenarios`, {
      name: '审计测试场景',
      description: '用于执行审计台测试',
      api_version_id: apiVersionId
    });
    scenarioId = res.data.id;
    console.log(`  场景ID: ${scenarioId}`);
  })) passed++;

  total++;
  if (await test('3. 创建预检模式批次', async () => {
    const res = await axios.post(`${BASE_URL}/audit-execution/batches`, {
      operator: 'test_user',
      scenarioId: scenarioId,
      mode: 'preview'
    });
    batchId = res.data.id;
    batchNumber = res.data.batch_number;
    console.log(`  批次ID: ${batchId}`);
    console.log(`  批次号: ${batchNumber}`);
  })) passed++;

  total++;
  if (await test('4. 执行预检查', async () => {
    const res = await axios.post(`${BASE_URL}/audit-execution/batches/${batchId}/pre-check`);
    if (!res.data.all_passed) {
      throw new Error('预检查未通过');
    }
    console.log(`  检查项: ${JSON.stringify(res.data.checks)}`);
  })) passed++;

  total++;
  if (await test('5. 执行预检', async () => {
    const res = await axios.post(`${BASE_URL}/audit-execution/batches/${batchId}/execute`);
    if (!res.data.success) {
      throw new Error('预检执行失败');
    }
  })) passed++;

  total++;
  if (await test('6. 按批次号查询批次详情', async () => {
    const res = await axios.get(`${BASE_URL}/audit-execution/batches/by-number/${batchNumber}`);
    if (!res.data || res.data.batch_number !== batchNumber) {
      throw new Error('按批次号查询失败');
    }
    console.log(`  批次状态: ${res.data.state}`);
    console.log(`  日志数: ${res.data.logs?.length || 0}`);
  })) passed++;

  total++;
  if (await test('7. 查看批次详情', async () => {
    const res = await axios.get(`${BASE_URL}/audit-execution/batches/${batchId}`);
    if (!res.data || res.data.id !== batchId) {
      throw new Error('获取批次详情失败');
    }
    console.log(`  状态: ${res.data.state}`);
    console.log(`  模式: ${res.data.mode}`);
    console.log(`  日志数: ${res.data.logs?.length || 0}`);
    console.log(`  时间线数: ${res.data.timeline?.length || 0}`);
    console.log(`  日志文件存在: ${res.data.has_log_file}`);
  })) passed++;

  total++;
  if (await test('8. 查看批次列表', async () => {
    const res = await axios.get(`${BASE_URL}/audit-execution/batches`);
    if (!Array.isArray(res.data) || res.data.length === 0) {
      throw new Error('获取批次列表失败');
    }
    console.log(`  批次总数: ${res.data.length}`);
  })) passed++;

  total++;
  if (await test('9. 检查批次重放检测', async () => {
    const res = await axios.post(`${BASE_URL}/audit-execution/check-replay`, {
      batchNumber: batchNumber
    });
    if (!res.data.exists) {
      throw new Error('批次不存在');
    }
    if (res.data.can_replay) {
      throw new Error('已完成批次不应允许重放');
    }
  })) passed++;

  total++;
  if (await test('10. 获取恢复建议', async () => {
    const res = await axios.get(`${BASE_URL}/audit-execution/batches/${batchId}/recovery-suggestion`);
    if (!res.data.suggestions || res.data.suggestions.length === 0) {
      throw new Error('未获取到恢复建议');
    }
    console.log(`  建议: ${res.data.suggestions.join(', ')}`);
  })) passed++;

  total++;
  if (await test('11. 查看日志文件列表', async () => {
    const res = await axios.get(`${BASE_URL}/audit-execution/logs`);
    if (!Array.isArray(res.data)) {
      throw new Error('获取日志文件列表失败');
    }
    console.log(`  日志文件数: ${res.data.length}`);
  })) passed++;

  let newBatchId = null;
  total++;
  if (await test('12. 模式切换测试', async () => {
    const newBatch = await axios.post(`${BASE_URL}/audit-execution/batches`, {
      operator: 'test_user',
      scenarioId: scenarioId,
      mode: 'preview'
    });
    newBatchId = newBatch.data.id;
    
    const res = await axios.put(`${BASE_URL}/audit-execution/batches/${newBatchId}/mode`, {
      mode: 'execute'
    });
    if (res.data.mode !== 'execute') {
      throw new Error('模式切换失败');
    }
    console.log(`  新模式: ${res.data.mode}`);
  })) passed++;

  total++;
  if (await test('13. 检查重复提交检测', async () => {
    const res = await axios.post(`${BASE_URL}/audit-execution/check-duplicate`, {
      scenarioId: scenarioId
    });
    if (!res.data.has_duplicate) {
      throw new Error('重复提交检测未正确识别');
    }
    console.log(`  活跃批次: ${res.data.active_batch?.batch_number}`);
  })) passed++;

  total++;
  if (await test('14. 状态机验证 - 已完成批次不能取消', async () => {
    try {
      await axios.post(`${BASE_URL}/audit-execution/batches/${batchId}/cancel`, {
        operator: 'test_user'
      });
      throw new Error('已完成批次应该不能取消');
    } catch (error) {
      if (!error.response?.data?.error?.includes('非法状态转换')) {
        throw new Error(`预期状态转换错误，但收到: ${error.response?.data?.error || error.message}`);
      }
    }
  })) passed++;

  total++;
  if (await test('15. 取消活跃批次', async () => {
    if (!newBatchId) {
      throw new Error('没有活跃批次可取消');
    }
    await axios.post(`${BASE_URL}/audit-execution/batches/${newBatchId}/cancel`, {
      operator: 'test_user'
    });
  })) passed++;

  total++;
  if (await test('16. 创建真实执行模式批次', async () => {
    const res = await axios.post(`${BASE_URL}/audit-execution/batches`, {
      operator: 'test_user',
      scenarioId: scenarioId,
      mode: 'execute'
    });
    console.log(`  批次号: ${res.data.batch_number}`);
    console.log(`  模式: ${res.data.mode}`);
  })) passed++;

  total++;
  if (await test('17. 查看日志文件内容', async () => {
    const res = await axios.get(`${BASE_URL}/audit-execution/logs/${batchNumber}`);
    if (!res.data.exists) {
      throw new Error('日志文件不存在');
    }
    console.log(`  日志条目数: ${res.data.content?.length || 0}`);
  })) passed++;

  total++;
  if (await test('18. 日志文件缺失提示', async () => {
    const fakeBatchNumber = 'AUDIT-9999999999999-fake';
    try {
      await axios.get(`${BASE_URL}/audit-execution/logs/${fakeBatchNumber}`);
      throw new Error('应该返回404');
    } catch (error) {
      if (error.response?.status !== 404) {
        throw new Error(`应该返回404，但收到: ${error.response?.status || error.message}`);
      }
      if (!error.response?.data?.error || !error.response?.data?.message) {
        throw new Error('应该包含错误信息');
      }
      console.log(`  错误码: ${error.response.data.error}`);
      console.log(`  提示信息: ${error.response.data.message}`);
    }
  })) passed++;

  console.log('\n=== 测试结果 ===');
  console.log(`通过: ${passed}/${total}`);

  if (passed === total) {
    console.log('\n✓ 所有测试通过！');
    process.exit(0);
  } else {
    console.log('\n✗ 部分测试失败');
    process.exit(1);
  }
}

runTests();