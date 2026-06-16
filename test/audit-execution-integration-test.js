const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');

const BASE_URL = 'http://localhost:3000/api';
const DB_PATH = path.join(__dirname, '../data/sandbox.db');
const LOGS_DIR = path.join(__dirname, '../data/audit-logs');

let testContext = {
  apiVersionId: null,
  scenarioId: null,
  batchId: null,
  batchNumber: null,
  serverProcess: null
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureServerRunning() {
  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(async () => {
      try {
        await axios.get(`${BASE_URL}/versions`);
        clearInterval(checkInterval);
        resolve();
      } catch (err) {
        // Server not ready yet
      }
    }, 500);

    setTimeout(() => {
      clearInterval(checkInterval);
      reject(new Error('Server did not start within timeout'));
    }, 15000);
  });
}

async function startServer() {
  return new Promise((resolve, reject) => {
    testContext.serverProcess = exec('npm start', { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      }
    });

    testContext.serverProcess.stdout.on('data', (data) => {
      console.log(`[Server] ${data}`);
    });

    testContext.serverProcess.stderr.on('data', (data) => {
      console.error(`[Server Error] ${data}`);
    });

    ensureServerRunning().then(resolve).catch(reject);
  });
}

async function stopServer() {
  if (testContext.serverProcess) {
    testContext.serverProcess.kill();
    await delay(3000);
    testContext.serverProcess = null;
  }
}

async function killPortProcess() {
  return new Promise((resolve) => {
    exec('netstat -ano | findstr :3000', (err, stdout) => {
      if (!err && stdout) {
        const lines = stdout.trim().split('\n');
        const pids = new Set();
        lines.forEach(line => {
          const match = line.match(/\s+(\d+)$/);
          if (match) {
            pids.add(match[1]);
          }
        });
        if (pids.size > 0) {
          console.log(`  发现 ${pids.size} 个占用端口的进程`);
          pids.forEach(pid => {
            try {
              execSync(`taskkill /F /PID ${pid}`);
              console.log(`  已终止PID ${pid}`);
            } catch (killErr) {
              console.log(`  警告: 无法终止PID ${pid}: ${killErr.message}`);
            }
          });
        } else {
          console.log('  没有发现占用端口的进程');
        }
      } else {
        console.log('  端口检查命令失败或端口未被占用');
      }
      setTimeout(resolve, 3000);
    });
  });
}

async function cleanupTestData() {
  if (fs.existsSync(DB_PATH)) {
    try {
      fs.unlinkSync(DB_PATH);
    } catch (err) {
      console.log(`  警告: 数据库文件清理失败，可能被其他进程占用: ${err.message}`);
    }
  }
  if (fs.existsSync(LOGS_DIR)) {
    fs.readdirSync(LOGS_DIR).forEach(file => {
      if (file.endsWith('.log')) {
        try {
          fs.unlinkSync(path.join(LOGS_DIR, file));
        } catch (err) {
          console.log(`  警告: 日志文件清理失败: ${err.message}`);
        }
      }
    });
  }
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`✗ ${name}: ${error.message}`);
    console.error(error.stack);
    return false;
  }
}

async function assertHTTPStatus(response, expectedStatus) {
  if (response.status !== expectedStatus && !(expectedStatus === 200 && response.status === 201)) {
    throw new Error(`Expected HTTP ${expectedStatus}, got ${response.status}`);
  }
}

async function assertDatabaseHasBatch(batchNumber, expectedState) {
  const res = await axios.get(`${BASE_URL}/audit-execution/batches/by-number/${batchNumber}`);
  if (res.data.batch_number !== batchNumber) {
    throw new Error(`Database assertion failed: batch_number mismatch`);
  }
  if (expectedState && res.data.state !== expectedState) {
    throw new Error(`Database assertion failed: expected state ${expectedState}, got ${res.data.state}`);
  }
  return res.data;
}

async function assertLogFileExists(batchNumber, shouldExist = true) {
  const logPath = path.join(LOGS_DIR, `${batchNumber}.log`);
  const exists = fs.existsSync(logPath);
  if (shouldExist && !exists) {
    throw new Error(`Log file assertion failed: expected file to exist at ${logPath}`);
  }
  if (!shouldExist && exists) {
    throw new Error(`Log file assertion failed: expected file to NOT exist at ${logPath}`);
  }
  return exists;
}

async function assertLogContains(batchNumber, searchString) {
  const logPath = path.join(LOGS_DIR, `${batchNumber}.log`);
  if (!fs.existsSync(logPath)) {
    throw new Error(`Log file does not exist: ${logPath}`);
  }
  const content = fs.readFileSync(logPath, 'utf8');
  if (!content.includes(searchString)) {
    throw new Error(`Log assertion failed: expected to find "${searchString}" in log`);
  }
}

async function runIntegrationTests() {
  console.log('=== 执行审计台批次链路集成测试 ===\n');

  let passed = 0;
  let total = 0;

  total++;
  if (await test('0. 确保端口可用', async () => {
    await killPortProcess();
  })) passed++;

  total++;
  if (await test('1. 清理测试数据', async () => {
    await cleanupTestData();
  })) passed++;

  total++;
  if (await test('2. 启动服务', async () => {
    await startServer();
  })) passed++;

  total++;
  if (await test('3. 创建API版本', async () => {
    const res = await axios.post(`${BASE_URL}/versions`, {
      name: '审计测试服务',
      version: 'v1.0',
      base_path: '/api/audit-test'
    });
    assertHTTPStatus(res, 200);
    testContext.apiVersionId = res.data.id;
    console.log(`  API版本ID: ${testContext.apiVersionId}`);
  })) passed++;

  total++;
  if (await test('4. 创建场景', async () => {
    const res = await axios.post(`${BASE_URL}/scenarios`, {
      name: '审计测试场景',
      description: '用于执行审计台集成测试',
      api_version_id: testContext.apiVersionId
    });
    assertHTTPStatus(res, 200);
    testContext.scenarioId = res.data.id;
    console.log(`  场景ID: ${testContext.scenarioId}`);
  })) passed++;

  total++;
  if (await test('5. 创建预检模式批次', async () => {
    const res = await axios.post(`${BASE_URL}/audit-execution/batches`, {
      operator: 'test_user',
      scenarioId: testContext.scenarioId,
      mode: 'preview'
    });
    assertHTTPStatus(res, 200);
    testContext.batchId = res.data.id;
    testContext.batchNumber = res.data.batch_number;
    console.log(`  批次ID: ${testContext.batchId}`);
    console.log(`  批次号: ${testContext.batchNumber}`);
  })) passed++;

  total++;
  if (await test('6. 数据库断言：批次已创建且状态为pending', async () => {
    const batch = await assertDatabaseHasBatch(testContext.batchNumber, 'pending');
    if (batch.operator !== 'test_user') throw new Error('Operator mismatch');
    if (batch.mode !== 'preview') throw new Error('Mode mismatch');
    if (batch.scenario_id !== testContext.scenarioId) throw new Error('Scenario ID mismatch');
  })) passed++;

  total++;
  if (await test('7. 执行预检查', async () => {
    const res = await axios.post(`${BASE_URL}/audit-execution/batches/${testContext.batchId}/pre-check`);
    assertHTTPStatus(res, 200);
    if (!res.data.all_passed) {
      throw new Error('预检查未通过');
    }
    console.log(`  检查项: ${JSON.stringify(res.data.checks.map(c => c.name))}`);
    console.log(`  命中项数: ${res.data.hit_items.length}`);
  })) passed++;

  total++;
  if (await test('8. 数据库断言：批次状态为pre_check_passed', async () => {
    await assertDatabaseHasBatch(testContext.batchNumber, 'pre_check_passed');
  })) passed++;

  total++;
  if (await test('9. 重复创建检测 - 活跃批次存在时不应允许创建', async () => {
    try {
      const res = await axios.post(`${BASE_URL}/audit-execution/batches`, {
        operator: 'test_user',
        scenarioId: testContext.scenarioId,
        mode: 'preview'
      });
      console.log(`  意外成功创建了批次: ${res.data.batch_number}`);
      throw new Error('应该返回错误：存在活跃批次');
    } catch (error) {
      if (!error.response) {
        throw new Error(`请求失败: ${error.message}`);
      }
      assertHTTPStatus(error.response, 400);
      if (!error.response.data.error.includes('存在活跃批次')) {
        throw new Error(`预期活跃批次错误，但收到: ${error.response.data.error}`);
      }
    }
  })) passed++;

  total++;
  if (await test('10. 重复提交检测API', async () => {
    const res = await axios.post(`${BASE_URL}/audit-execution/check-duplicate`, {
      scenarioId: testContext.scenarioId
    });
    assertHTTPStatus(res, 200);
    console.log(`  has_duplicate: ${res.data.has_duplicate}`);
    console.log(`  active_batch: ${JSON.stringify(res.data.active_batch)}`);
    console.log(`  expected batchNumber: ${testContext.batchNumber}`);
    if (!res.data.has_duplicate) {
      throw new Error('重复提交检测未正确识别活跃批次');
    }
    if (!res.data.active_batch || res.data.active_batch.batch_number !== testContext.batchNumber) {
      throw new Error(`活跃批次信息不匹配: 期望 ${testContext.batchNumber}, 实际 ${res.data.active_batch?.batch_number || 'undefined'}`);
    }
    console.log(`  活跃批次: ${res.data.active_batch.batch_number}`);
  })) passed++;

  total++;
  if (await test('11. 按批次号查询批次详情', async () => {
    const res = await axios.get(`${BASE_URL}/audit-execution/batches/by-number/${testContext.batchNumber}`);
    assertHTTPStatus(res, 200);
    if (!res.data || res.data.batch_number !== testContext.batchNumber) {
      throw new Error('按批次号查询失败');
    }
    console.log(`  批次状态: ${res.data.state}`);
    console.log(`  日志数: ${res.data.logs?.length || 0}`);
  })) passed++;

  total++;
  if (await test('12. 查看批次详情', async () => {
    const res = await axios.get(`${BASE_URL}/audit-execution/batches/${testContext.batchId}`);
    assertHTTPStatus(res, 200);
    if (!res.data || res.data.id !== testContext.batchId) {
      throw new Error('获取批次详情失败');
    }
    console.log(`  状态: ${res.data.state}`);
    console.log(`  模式: ${res.data.mode}`);
    console.log(`  时间线数: ${res.data.timeline?.length || 0}`);
  })) passed++;

  total++;
  if (await test('13. 查看批次列表', async () => {
    const res = await axios.get(`${BASE_URL}/audit-execution/batches`);
    assertHTTPStatus(res, 200);
    if (!Array.isArray(res.data) || res.data.length === 0) {
      throw new Error('获取批次列表失败');
    }
    const testBatch = res.data.find(b => b.id === testContext.batchId);
    if (!testBatch) {
      throw new Error('测试批次不在列表中');
    }
    console.log(`  批次总数: ${res.data.length}`);
  })) passed++;

  total++;
  if (await test('14. 模式切换测试 - preview -> execute', async () => {
    const res = await axios.put(`${BASE_URL}/audit-execution/batches/${testContext.batchId}/mode`, {
      mode: 'execute'
    });
    assertHTTPStatus(res, 200);
    if (res.data.mode !== 'execute') {
      throw new Error('模式切换失败');
    }
    console.log(`  新模式: ${res.data.mode}`);
  })) passed++;

  total++;
  if (await test('15. 数据库断言：模式已切换为execute', async () => {
    const batch = await assertDatabaseHasBatch(testContext.batchNumber);
    if (batch.mode !== 'execute') {
      throw new Error(`数据库中模式未更新: ${batch.mode}`);
    }
  })) passed++;

  total++;
  if (await test('16. 执行批次', async () => {
    const res = await axios.post(`${BASE_URL}/audit-execution/batches/${testContext.batchId}/execute`);
    assertHTTPStatus(res, 200);
    if (!res.data.success) {
      throw new Error(`执行失败: ${res.data.failure_reason}`);
    }
  })) passed++;

  total++;
  if (await test('17. 数据库断言：批次状态为completed', async () => {
    await assertDatabaseHasBatch(testContext.batchNumber, 'completed');
  })) passed++;

  total++;
  if (await test('18. 日志文件断言：日志文件已生成', async () => {
    await delay(500);
    await assertLogFileExists(testContext.batchNumber, true);
    await assertLogContains(testContext.batchNumber, 'execution_completed');
  })) passed++;

  total++;
  if (await test('19. 日志文件内容验证', async () => {
    const res = await axios.get(`${BASE_URL}/audit-execution/logs/${testContext.batchNumber}`);
    assertHTTPStatus(res, 200);
    if (!res.data.exists) {
      throw new Error('日志文件不存在');
    }
    if (!Array.isArray(res.data.content) || res.data.content.length === 0) {
      throw new Error('日志内容为空');
    }
    const completionLog = res.data.content.find(log => log.log_type === 'execution_completed');
    if (!completionLog) {
      throw new Error('未找到执行完成日志');
    }
    console.log(`  日志条目数: ${res.data.content.length}`);
  })) passed++;

  total++;
  if (await test('20. 创建第二个批次用于取消测试', async () => {
    const res = await axios.post(`${BASE_URL}/audit-execution/batches`, {
      operator: 'test_user',
      scenarioId: testContext.scenarioId,
      mode: 'preview'
    });
    assertHTTPStatus(res, 200);
    testContext.secondBatchId = res.data.id;
    testContext.secondBatchNumber = res.data.batch_number;
    console.log(`  批次ID: ${testContext.secondBatchId}`);
    console.log(`  批次号: ${testContext.secondBatchNumber}`);
  })) passed++;

  total++;
  if (await test('21. 取消活跃批次', async () => {
    const res = await axios.post(`${BASE_URL}/audit-execution/batches/${testContext.secondBatchId}/cancel`, {
      operator: 'test_user'
    });
    assertHTTPStatus(res, 200);
  })) passed++;

  total++;
  if (await test('22. 数据库断言：批次状态为cancelled', async () => {
    await assertDatabaseHasBatch(testContext.secondBatchNumber, 'cancelled');
  })) passed++;

  total++;
  if (await test('23. 状态机验证 - 已完成批次不能取消', async () => {
    try {
      await axios.post(`${BASE_URL}/audit-execution/batches/${testContext.batchId}/cancel`, {
        operator: 'test_user'
      });
      throw new Error('已完成批次应该不能取消');
    } catch (error) {
      if (!error.response) {
        throw new Error(`请求失败: ${error.message}`);
      }
      assertHTTPStatus(error.response, 400);
      if (!error.response.data.error.includes('非法状态转换')) {
        throw new Error(`预期状态转换错误，但收到: ${error.response.data.error}`);
      }
    }
  })) passed++;

  total++;
  if (await test('24. 删除日志文件', async () => {
    const logPath = path.join(LOGS_DIR, `${testContext.batchNumber}.log`);
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
      console.log(`  已删除日志文件: ${logPath}`);
    }
    await assertLogFileExists(testContext.batchNumber, false);
  })) passed++;

  total++;
  if (await test('25. 日志文件缺失提示', async () => {
    try {
      const res = await axios.get(`${BASE_URL}/audit-execution/logs/${testContext.batchNumber}`);
      console.log(`  意外收到响应: ${res.status} - ${JSON.stringify(res.data)}`);
      throw new Error('应该返回404');
    } catch (error) {
      if (!error.response) {
        throw new Error(`请求失败: ${error.message}`);
      }
      assertHTTPStatus(error.response, 404);
      if (error.response.data.error !== 'LOG_FILE_MISSING') {
        throw new Error(`预期LOG_FILE_MISSING错误，但收到: ${error.response.data.error}`);
      }
      console.log(`  错误码: ${error.response.data.error}`);
      console.log(`  提示信息: ${error.response.data.message}`);
    }
  })) passed++;

  total++;
  if (await test('26. 从数据库恢复日志文件', async () => {
    const res = await axios.post(`${BASE_URL}/audit-execution/batches/${testContext.batchId}/regenerate-log`);
    assertHTTPStatus(res, 200);
    if (!res.data.success) {
      throw new Error(`日志恢复失败: ${res.data.message}`);
    }
    console.log(`  恢复日志数: ${res.data.log_count}`);
  })) passed++;

  total++;
  if (await test('27. 验证日志文件已恢复', async () => {
    await assertLogFileExists(testContext.batchNumber, true);
    await assertLogContains(testContext.batchNumber, 'execution_completed');
  })) passed++;

  total++;
  if (await test('28. 重放检测 - 已完成批次不应允许重放', async () => {
    const res = await axios.post(`${BASE_URL}/audit-execution/check-replay`, {
      batchNumber: testContext.batchNumber
    });
    assertHTTPStatus(res, 200);
    if (!res.data.exists) {
      throw new Error('批次不存在');
    }
    if (res.data.can_replay) {
      throw new Error('已完成批次不应允许重放');
    }
    console.log(`  重放检测结果: ${res.data.message}`);
  })) passed++;

  total++;
  if (await test('29. 获取恢复建议', async () => {
    const res = await axios.get(`${BASE_URL}/audit-execution/batches/${testContext.batchId}/recovery-suggestion`);
    assertHTTPStatus(res, 200);
    if (!res.data.suggestions || res.data.suggestions.length === 0) {
      throw new Error('未获取到恢复建议');
    }
    console.log(`  建议: ${res.data.suggestions.join(', ')}`);
  })) passed++;

  total++;
  if (await test('30. 查看日志文件列表', async () => {
    const res = await axios.get(`${BASE_URL}/audit-execution/logs`);
    assertHTTPStatus(res, 200);
    if (!Array.isArray(res.data)) {
      throw new Error('获取日志文件列表失败');
    }
    console.log(`  日志文件数: ${res.data.length}`);
  })) passed++;

  console.log('\n=== 测试结果 ===');
  console.log(`通过: ${passed}/${total}`);

  await stopServer();

  if (passed === total) {
    console.log('\n✓ 所有测试通过！');
    process.exit(0);
  } else {
    console.log('\n✗ 部分测试失败');
    process.exit(1);
  }
}

runIntegrationTests().catch(async (error) => {
  console.error('测试执行失败:', error.message);
  console.error(error.stack);
  await stopServer();
  process.exit(1);
});