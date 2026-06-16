import { useState, useEffect } from 'react';
import { forensicsWorkbenchApi, scenarioPackageApi, scenarioApi } from '../api';

const ForensicsWorkbench = () => {
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchDetails, setBatchDetails] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState('success');
  const [config, setConfig] = useState(null);
  const [showInitModal, setShowInitModal] = useState(false);
  const [initForm, setInitForm] = useState({
    operator: 'admin',
    original_scenario_id: '',
    conflict_decision: 'save_as',
    mode: 'simulate'
  });
  const [filters, setFilters] = useState({
    state: '',
    mode: '',
    operator: ''
  });
  const [logContent, setLogContent] = useState(null);

  useEffect(() => {
    loadBatches();
    loadScenarios();
    loadConfig();
  }, []);

  const loadBatches = async () => {
    try {
      const res = await forensicsWorkbenchApi.getBatches(filters);
      setBatches(res.data.batches || []);
    } catch (err) {
      showMessage('加载批次列表失败: ' + (err.response?.data?.error || err.message), 'error');
    }
  };

  const loadScenarios = async () => {
    try {
      const res = await scenarioApi.getAll();
      setScenarios(res.data || []);
    } catch (err) {
      console.error('加载场景列表失败', err);
    }
  };

  const loadConfig = async () => {
    try {
      const res = await forensicsWorkbenchApi.getConfig();
      setConfig(res.data.config);
    } catch (err) {
      console.error('加载配置失败', err);
    }
  };

  const showMessage = (text, type = 'success') => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(null), 5000);
  };

  const handleSelectBatch = async (batchId) => {
    setSelectedBatch(batchId);
    setLoading(true);
    try {
      const res = await forensicsWorkbenchApi.getBatchById(batchId);
      setBatchDetails(res.data.batch);
    } catch (err) {
      showMessage('加载批次详情失败: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleInitBatch = async () => {
    if (!initForm.original_scenario_id) {
      showMessage('请选择原始场景', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await forensicsWorkbenchApi.initialize(initForm);
      showMessage(`批次创建成功: ${res.data.batch.batch_number}`);
      setShowInitModal(false);
      setInitForm({
        operator: 'admin',
        original_scenario_id: '',
        conflict_decision: 'save_as',
        mode: 'simulate'
      });
      await loadBatches();
      if (res.data.batch?.id) {
        handleSelectBatch(res.data.batch.id);
      }
    } catch (err) {
      showMessage('创建批次失败: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePreCheck = async () => {
    if (!selectedBatch) return;
    setLoading(true);
    try {
      const res = await forensicsWorkbenchApi.preCheck(selectedBatch);
      if (res.data.result.passed) {
        showMessage('预检查通过');
      } else {
        showMessage('预检查失败: ' + res.data.result.errors?.map(e => e.message).join('; '), 'error');
      }
      await handleSelectBatch(selectedBatch);
    } catch (err) {
      showMessage('预检查失败: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReplaceImport = async () => {
    if (!selectedBatch || !batchDetails) return;
    
    const scenario = scenarios.find(s => s.id === batchDetails.original_scenario_id);
    if (!scenario) {
      showMessage('未找到原始场景', 'error');
      return;
    }

    setLoading(true);
    try {
      const exportRes = await scenarioPackageApi.export(scenario.id);
      const packageData = exportRes.data.package;

      const res = await forensicsWorkbenchApi.replaceImport(selectedBatch, {
        package_data: packageData,
        decisions: { scenario_action: batchDetails.conflict_decision || 'save_as' }
      });
      showMessage(`替换导入完成: ${res.data.result.simulated ? '模拟模式' : '真实执行'}`);
      await handleSelectBatch(selectedBatch);
    } catch (err) {
      showMessage('替换导入失败: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async () => {
    if (!selectedBatch) return;
    
    if (!window.confirm('确定要执行回滚操作吗？')) {
      return;
    }

    setLoading(true);
    try {
      const res = await forensicsWorkbenchApi.rollback(selectedBatch, true);
      showMessage(`回滚完成: ${res.data.result.simulated ? '模拟模式' : '真实执行'}`);
      await handleSelectBatch(selectedBatch);
    } catch (err) {
      showMessage('回滚失败: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRestartReview = async (isSimulation = true) => {
    if (!selectedBatch) return;

    setLoading(true);
    try {
      const res = await forensicsWorkbenchApi.restartReview(selectedBatch, isSimulation);
      showMessage(`重启复查完成: ${isSimulation ? '模拟模式' : '真实验证'}`);
      await handleSelectBatch(selectedBatch);
    } catch (err) {
      showMessage('重启复查失败: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteBatch = async () => {
    if (!selectedBatch) return;

    setLoading(true);
    try {
      const res = await forensicsWorkbenchApi.completeBatch(selectedBatch);
      showMessage('批次已完成');
      await handleSelectBatch(selectedBatch);
      await loadBatches();
    } catch (err) {
      showMessage('完成批次失败: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelBatch = async () => {
    if (!selectedBatch) return;
    
    const reason = prompt('请输入取消原因:');
    if (!reason) return;

    setLoading(true);
    try {
      const res = await forensicsWorkbenchApi.cancelBatch(selectedBatch, reason);
      showMessage('批次已取消');
      await handleSelectBatch(selectedBatch);
      await loadBatches();
    } catch (err) {
      showMessage('取消批次失败: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResumeBatch = async () => {
    if (!selectedBatch || !batchDetails) return;

    setLoading(true);
    try {
      const res = await forensicsWorkbenchApi.resumeBatch(selectedBatch);
      showMessage(`批次恢复建议: ${res.data.suggestion}`);
      await handleSelectBatch(selectedBatch);
    } catch (err) {
      showMessage('恢复批次失败: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleViewLog = async () => {
    if (!selectedBatch || !batchDetails) return;

    setLoading(true);
    try {
      const res = await forensicsWorkbenchApi.getBatchLog(selectedBatch);
      setLogContent(res.data.log_content);
    } catch (err) {
      showMessage('获取日志失败: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFullChain = async () => {
    if (!initForm.original_scenario_id) {
      showMessage('请选择原始场景', 'error');
      return;
    }

    setLoading(true);
    try {
      const scenario = scenarios.find(s => s.id === initForm.original_scenario_id);
      const exportRes = await scenarioPackageApi.export(scenario.id);
      const packageData = exportRes.data.package;

      const res = await forensicsWorkbenchApi.fullChain({
        operator: initForm.operator,
        package_data: packageData,
        decisions: { scenario_action: initForm.conflict_decision },
        original_scenario_id: initForm.original_scenario_id,
        skip_restart_review: false
      });

      if (res.data.success) {
        showMessage(`完整链路执行成功: ${res.data.chain_result.batch_number}`);
        await loadBatches();
      } else {
        showMessage('完整链路执行失败: ' + res.data.chain_result.errors?.map(e => e.message).join('; '), 'error');
      }
    } catch (err) {
      showMessage('执行完整链路失败: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    loadBatches();
  };

  const getStateColor = (state) => {
    switch (state) {
      case 'completed': return '#27ae60';
      case 'failed': return '#e74c3c';
      case 'cancelled': return '#95a5a6';
      case 'pre_check_passed': return '#3498db';
      case 'rollback_confirm': return '#f39c12';
      case 'rollback_completed': return '#9b59b6';
      default: return '#7f8c8d';
    }
  };

  const getStateLabel = (state) => {
    const labels = {
      pending: '待处理',
      pre_check: '预检查中',
      pre_check_passed: '预检查通过',
      pre_check_failed: '预检查失败',
      replace_import: '替换导入中',
      rollback_confirm: '等待回滚确认',
      rollback_executing: '回滚执行中',
      rollback_completed: '回滚完成',
      restart_review: '重启复查中',
      restart_verified: '重启验证通过',
      completed: '已完成',
      failed: '失败',
      cancelled: '已取消'
    };
    return labels[state] || state;
  };

  const getModeLabel = (mode) => {
    return mode === 'simulate' ? '仅预检' : '真实执行';
  };

  const getModeColor = (mode) => {
    return mode === 'simulate' ? '#3498db' : '#e74c3c';
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString();
  };

  const canPerformAction = (action) => {
    if (!batchDetails) return false;
    const state = batchDetails.state;
    
    switch (action) {
      case 'pre_check': return state === 'pending' || state === 'pre_check';
      case 'replace_import': return state === 'pre_check_passed';
      case 'rollback': return state === 'rollback_confirm';
      case 'restart_review': return ['rollback_confirm', 'rollback_completed', 'restart_review'].includes(state);
      case 'complete': return state === 'restart_review' || state === 'restart_verified';
      case 'cancel': return !['completed', 'cancelled', 'failed'].includes(state);
      case 'resume': return ['failed', 'pre_check_failed'].includes(state);
      default: return false;
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>取证工作台</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {config && (
            <div style={{ 
              padding: '0.5rem 1rem', 
              backgroundColor: getModeColor(config.simulateMode ? 'simulate' : 'real'),
              color: '#fff',
              borderRadius: '4px',
              fontSize: '0.875rem'
            }}>
              当前模式: {config.simulateMode ? '仅预检' : '真实执行'}
            </div>
          )}
          <button
            onClick={() => setShowInitModal(true)}
            style={{
              backgroundColor: '#27ae60',
              color: '#fff',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            + 新建批次
          </button>
        </div>
      </div>

      {message && (
        <div style={{
          padding: '1rem',
          marginBottom: '1rem',
          borderRadius: '4px',
          backgroundColor: messageType === 'success' ? '#d4edda' : '#f8d7da',
          color: messageType === 'success' ? '#155724' : '#721c24',
          border: `1px solid ${messageType === 'success' ? '#c3e6cb' : '#f5c6cb'}`
        }}>
          {message}
        </div>
      )}

      <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <label style={{ marginRight: '0.5rem', fontSize: '0.875rem' }}>状态:</label>
            <select
              value={filters.state}
              onChange={(e) => handleFilterChange('state', e.target.value)}
              style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value="">全部</option>
              <option value="pending">待处理</option>
              <option value="pre_check_passed">预检查通过</option>
              <option value="rollback_confirm">等待回滚</option>
              <option value="completed">已完成</option>
              <option value="failed">失败</option>
              <option value="cancelled">已取消</option>
            </select>
          </div>
          <div>
            <label style={{ marginRight: '0.5rem', fontSize: '0.875rem' }}>模式:</label>
            <select
              value={filters.mode}
              onChange={(e) => handleFilterChange('mode', e.target.value)}
              style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value="">全部</option>
              <option value="simulate">仅预检</option>
              <option value="real">真实执行</option>
            </select>
          </div>
          <div>
            <label style={{ marginRight: '0.5rem', fontSize: '0.875rem' }}>操作者:</label>
            <input
              type="text"
              value={filters.operator}
              onChange={(e) => handleFilterChange('operator', e.target.value)}
              placeholder="输入操作者"
              style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd', width: '150px' }}
            />
          </div>
          <button
            onClick={applyFilters}
            style={{
              backgroundColor: '#3498db',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            应用过滤
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
        <div>
          <h3>批次列表 ({batches.length})</h3>
          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {batches.length === 0 ? (
              <p style={{ color: '#95a5a6', textAlign: 'center', padding: '2rem' }}>
                暂无批次记录
              </p>
            ) : (
              batches.map(batch => (
                <div
                  key={batch.id}
                  onClick={() => handleSelectBatch(batch.id)}
                  style={{
                    padding: '1rem',
                    marginBottom: '0.5rem',
                    backgroundColor: selectedBatch === batch.id ? '#e3f2fd' : '#f5f5f5',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    borderLeft: `4px solid ${getStateColor(batch.state)}`
                  }}
                >
                  <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                    {batch.batch_number}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#666' }}>
                    <div>操作者: {batch.operator}</div>
                    <div>决策: {batch.conflict_decision || 'N/A'}</div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <span style={{ 
                        backgroundColor: getStateColor(batch.state),
                        color: '#fff',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '2px',
                        fontSize: '0.75rem'
                      }}>
                        {getStateLabel(batch.state)}
                      </span>
                      <span style={{ 
                        backgroundColor: getModeColor(batch.mode),
                        color: '#fff',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '2px',
                        fontSize: '0.75rem'
                      }}>
                        {getModeLabel(batch.mode)}
                      </span>
                    </div>
                    <div style={{ marginTop: '0.25rem' }}>
                      {formatDate(batch.started_at)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          {selectedBatch && batchDetails ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3>批次详情: {batchDetails.batch_number}</h3>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {canPerformAction('pre_check') && (
                    <button onClick={handlePreCheck} disabled={loading} style={actionBtnStyle('#3498db')}>
                      预检查
                    </button>
                  )}
                  {canPerformAction('replace_import') && (
                    <button onClick={handleReplaceImport} disabled={loading} style={actionBtnStyle('#f39c12')}>
                      替换导入
                    </button>
                  )}
                  {canPerformAction('rollback') && (
                    <button onClick={handleRollback} disabled={loading} style={actionBtnStyle('#e74c3c')}>
                      执行回滚
                    </button>
                  )}
                  {canPerformAction('restart_review') && (
                    <button onClick={() => handleRestartReview(true)} disabled={loading} style={actionBtnStyle('#9b59b6')}>
                      重启复查
                    </button>
                  )}
                  {canPerformAction('complete') && (
                    <button onClick={handleCompleteBatch} disabled={loading} style={actionBtnStyle('#27ae60')}>
                      完成批次
                    </button>
                  )}
                  {canPerformAction('resume') && (
                    <button onClick={handleResumeBatch} disabled={loading} style={actionBtnStyle('#17a2b8')}>
                      恢复批次
                    </button>
                  )}
                  {canPerformAction('cancel') && (
                    <button onClick={handleCancelBatch} disabled={loading} style={actionBtnStyle('#95a5a6')}>
                      取消
                    </button>
                  )}
                  <button onClick={handleViewLog} disabled={loading} style={actionBtnStyle('#607d8b')}>
                    查看日志
                  </button>
                </div>
              </div>

              {batchDetails.error_code && (
                <div style={{ 
                  padding: '1rem', 
                  marginBottom: '1rem', 
                  backgroundColor: '#ffebee', 
                  borderRadius: '4px',
                  borderLeft: '4px solid #e74c3c'
                }}>
                  <div style={{ fontWeight: '600', color: '#e74c3c' }}>
                    错误码: {batchDetails.error_code}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem' }}>
                    {batchDetails.error_message}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>操作者</div>
                    <div style={{ fontWeight: '600' }}>{batchDetails.operator}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>运行模式</div>
                    <div style={{ fontWeight: '600', color: getModeColor(batchDetails.mode) }}>
                      {getModeLabel(batchDetails.mode)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>冲突决策</div>
                    <div style={{ fontWeight: '600' }}>{batchDetails.conflict_decision || 'N/A'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>状态</div>
                    <div style={{ fontWeight: '600', color: getStateColor(batchDetails.state) }}>
                      {getStateLabel(batchDetails.state)}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>开始时间</div>
                    <div>{formatDate(batchDetails.started_at)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>完成时间</div>
                    <div>{formatDate(batchDetails.completed_at)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>原始场景</div>
                    <div>{batchDetails.scenario_name || batchDetails.original_scenario_id?.substring(0, 8) || 'N/A'}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ padding: '1rem', backgroundColor: '#e8f5e9', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>{batchDetails.summary?.total_operations || 0}</div>
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>操作数</div>
                </div>
                <div style={{ padding: '1rem', backgroundColor: '#e3f2fd', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>{batchDetails.summary?.total_timeline_events || 0}</div>
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>时间线事件</div>
                </div>
                <div style={{ padding: '1rem', backgroundColor: '#fff3e0', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>{batchDetails.summary?.replaced_snapshots_count || 0}</div>
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>替换快照</div>
                </div>
                <div style={{ padding: '1rem', backgroundColor: '#f3e5f5', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>{batchDetails.summary?.recovery_records_count || 0}</div>
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>恢复记录</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #ddd' }}>
                {['overview', 'operations', 'timeline', 'recovery'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: activeTab === tab ? '#3498db' : 'transparent',
                      color: activeTab === tab ? '#fff' : '#333',
                      border: 'none',
                      borderBottom: activeTab === tab ? '2px solid #3498db' : '2px solid transparent',
                      cursor: 'pointer'
                    }}
                  >
                    {tab === 'overview' && '概览'}
                    {tab === 'operations' && '操作记录'}
                    {tab === 'timeline' && '时间线'}
                    {tab === 'recovery' && '恢复结果'}
                  </button>
                ))}
              </div>

              {activeTab === 'overview' && (
                <div>
                  <h4 style={{ marginTop: 0 }}>来源文件信息</h4>
                  <div style={{ padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px', marginBottom: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#666' }}>原始场景ID</div>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                          {batchDetails.original_scenario_id || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#666' }}>原始快照ID</div>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                          {batchDetails.original_snapshot_id || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#666' }}>原始执行ID</div>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                          {batchDetails.original_execution_id || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#666' }}>替换场景ID</div>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                          {batchDetails.replacement_scenario_id || 'N/A'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {batchDetails.replaced_snapshots && batchDetails.replaced_snapshots.length > 0 && (
                    <>
                      <h4>被替换的快照</h4>
                      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {batchDetails.replaced_snapshots.map((snap, idx) => (
                          <div key={snap.id || idx} style={{
                            padding: '1rem',
                            marginBottom: '0.5rem',
                            backgroundColor: '#fff3e0',
                            borderRadius: '4px',
                            borderLeft: '4px solid #e74c3c'
                          }}>
                            <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
                              快照 {snap.original_snapshot_id?.substring(0, 8)}...
                            </div>
                            <div style={{ fontSize: '0.875rem' }}>
                              <div>场景: {snap.original_scenario_name || snap.original_scenario_id?.substring(0, 8)}</div>
                              <div>冲突决策: {snap.conflict_decision}</div>
                              <div>替换原因: {snap.replaced_reason}</div>
                              <div>替换时间: {formatDate(snap.replaced_at)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'operations' && (
                <div>
                  <h4 style={{ marginTop: 0 }}>操作记录</h4>
                  {(!batchDetails.operations || batchDetails.operations.length === 0) ? (
                    <p style={{ color: '#95a5a6' }}>暂无操作记录</p>
                  ) : (
                    <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                      {batchDetails.operations.map((op, idx) => (
                        <div key={op.id || idx} style={{
                          padding: '1rem',
                          marginBottom: '0.5rem',
                          backgroundColor: '#f5f5f5',
                          borderRadius: '4px',
                          borderLeft: '4px solid #3498db'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <div style={{ fontWeight: '600' }}>
                              {op.operation_order}. {op.operation_type}
                            </div>
                            <div style={{ fontSize: '0.875rem', color: '#666' }}>
                              {formatDate(op.timestamp)}
                            </div>
                          </div>
                          {op.details && (
                            <details style={{ fontSize: '0.875rem' }}>
                              <summary style={{ cursor: 'pointer', color: '#3498db' }}>查看详情</summary>
                              <pre style={{
                                marginTop: '0.5rem',
                                padding: '0.5rem',
                                backgroundColor: '#e8e8e8',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                maxHeight: '200px',
                                overflow: 'auto'
                              }}>
                                {JSON.stringify(op.details, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'timeline' && (
                <div>
                  <h4 style={{ marginTop: 0 }}>时间线</h4>
                  {(!batchDetails.timeline || batchDetails.timeline.length === 0) ? (
                    <p style={{ color: '#95a5a6' }}>暂无时间线事件</p>
                  ) : (
                    <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                      {batchDetails.timeline.map((event, idx) => (
                        <div key={event.id || idx} style={{
                          padding: '1rem',
                          marginBottom: '0.5rem',
                          backgroundColor: event.is_critical ? '#fff3e0' : '#f5f5f5',
                          borderRadius: '4px',
                          borderLeft: `4px solid ${event.is_critical ? '#e74c3c' : '#3498db'}`
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <div style={{ fontWeight: '600' }}>
                              {event.event_order}. {event.event_type}
                              {event.is_critical && <span style={{ color: '#e74c3c', marginLeft: '0.5rem' }}>(关键)</span>}
                            </div>
                            <div style={{ fontSize: '0.875rem', color: '#666' }}>
                              {formatDate(event.timestamp)}
                            </div>
                          </div>
                          <div style={{ fontSize: '0.875rem', color: '#666' }}>
                            来源: {event.source_module} | 操作者: {event.actor}
                          </div>
                          {event.event_data && (
                            <details style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                              <summary style={{ cursor: 'pointer', color: '#3498db' }}>查看数据</summary>
                              <pre style={{
                                marginTop: '0.5rem',
                                padding: '0.5rem',
                                backgroundColor: '#e8e8e8',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                maxHeight: '150px',
                                overflow: 'auto'
                              }}>
                                {JSON.stringify(event.event_data, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'recovery' && (
                <div>
                  <h4 style={{ marginTop: 0 }}>恢复结果</h4>
                  {(!batchDetails.recovery_records || batchDetails.recovery_records.length === 0) ? (
                    <p style={{ color: '#95a5a6' }}>暂无恢复记录</p>
                  ) : (
                    <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                      {batchDetails.recovery_records.map((record, idx) => (
                        <div key={record.id || idx} style={{
                          padding: '1rem',
                          marginBottom: '0.5rem',
                          backgroundColor: record.verified ? '#e8f5e9' : '#fff3e0',
                          borderRadius: '4px',
                          borderLeft: `4px solid ${record.verified ? '#27ae60' : '#f39c12'}`
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <div style={{ fontWeight: '600' }}>
                              {record.recovery_type}
                              {record.verified && <span style={{ color: '#27ae60', marginLeft: '0.5rem' }}>(已验证)</span>}
                            </div>
                            <div style={{ fontSize: '0.875rem', color: '#666' }}>
                              {formatDate(record.recovery_timestamp)}
                            </div>
                          </div>
                          <div style={{ fontSize: '0.875rem' }}>
                            <div>资源类型: {record.original_resource_type}</div>
                            <div>资源名称: {record.original_resource_name || 'N/A'}</div>
                            <div>恢复状态: {record.recovery_state}</div>
                            {record.verified_by && (
                              <div>验证者: {record.verified_by} ({formatDate(record.verified_at)})</div>
                            )}
                          </div>
                          {record.recovery_data && (
                            <details style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                              <summary style={{ cursor: 'pointer', color: '#3498db' }}>查看恢复数据</summary>
                              <pre style={{
                                marginTop: '0.5rem',
                                padding: '0.5rem',
                                backgroundColor: '#e8e8e8',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                maxHeight: '150px',
                                overflow: 'auto'
                              }}>
                                {JSON.stringify(record.recovery_data, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#95a5a6' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
              <p>请选择一个批次查看详情</p>
            </div>
          )}
        </div>
      </div>

      {showInitModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#fff',
            padding: '2rem',
            borderRadius: '8px',
            width: '500px',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            <h3 style={{ marginTop: 0 }}>新建取证批次</h3>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                操作者
              </label>
              <input
                type="text"
                value={initForm.operator}
                onChange={(e) => setInitForm({ ...initForm, operator: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                原始场景 *
              </label>
              <select
                value={initForm.original_scenario_id}
                onChange={(e) => setInitForm({ ...initForm, original_scenario_id: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
              >
                <option value="">请选择场景</option>
                {scenarios.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                冲突决策
              </label>
              <select
                value={initForm.conflict_decision}
                onChange={(e) => setInitForm({ ...initForm, conflict_decision: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
              >
                <option value="save_as">另存为 (save_as)</option>
                <option value="replace">替换 (replace)</option>
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                运行模式
              </label>
              <select
                value={initForm.mode}
                onChange={(e) => setInitForm({ ...initForm, mode: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
              >
                <option value="simulate">仅预检 (simulate)</option>
                <option value="real">真实执行 (real)</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button
                onClick={handleInitBatch}
                disabled={loading}
                style={{
                  flex: 1,
                  backgroundColor: '#27ae60',
                  color: '#fff',
                  border: 'none',
                  padding: '0.75rem',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                创建批次
              </button>
              <button
                onClick={handleFullChain}
                disabled={loading}
                style={{
                  flex: 1,
                  backgroundColor: '#3498db',
                  color: '#fff',
                  border: 'none',
                  padding: '0.75rem',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                执行完整链路
              </button>
              <button
                onClick={() => setShowInitModal(false)}
                style={{
                  flex: 1,
                  backgroundColor: '#95a5a6',
                  color: '#fff',
                  border: 'none',
                  padding: '0.75rem',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {logContent && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#fff',
            padding: '2rem',
            borderRadius: '8px',
            width: '80%',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>批次日志</h3>
              <button
                onClick={() => setLogContent(null)}
                style={{
                  backgroundColor: '#95a5a6',
                  color: '#fff',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                关闭
              </button>
            </div>
            <pre style={{
              backgroundColor: '#1e1e1e',
              color: '#d4d4d4',
              padding: '1rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              maxHeight: '60vh',
              overflow: 'auto',
              whiteSpace: 'pre-wrap'
            }}>
              {logContent}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

const actionBtnStyle = (bgColor) => ({
  backgroundColor: bgColor,
  color: '#fff',
  border: 'none',
  padding: '0.5rem 1rem',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.875rem'
});

export default ForensicsWorkbench;
