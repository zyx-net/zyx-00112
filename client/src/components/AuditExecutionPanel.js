import { useState, useEffect } from 'react';
import { auditExecutionApi, scenarioApi } from '../api';

const AuditExecutionPanel = () => {
  const [batches, setBatches] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedScenario, setSelectedScenario] = useState('');
  const [currentMode, setCurrentMode] = useState('preview');
  const [operator, setOperator] = useState('admin');
  const [showDetails, setShowDetails] = useState(false);
  const [activeTab, setActiveTab] = useState('logs');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadBatches();
    loadScenarios();
  }, []);

  const loadBatches = async () => {
    try {
      const res = await auditExecutionApi.getBatches();
      setBatches(res.data);
    } catch (err) {
      console.error('加载批次列表失败:', err);
    }
  };

  const loadScenarios = async () => {
    try {
      const res = await scenarioApi.getAll();
      setScenarios(res.data);
    } catch (err) {
      console.error('加载场景列表失败:', err);
    }
  };

  const handleCreateBatch = async () => {
    if (!selectedScenario) {
      setMessage('请先选择场景');
      return;
    }

    setLoading(true);
    try {
      await auditExecutionApi.createBatch(operator, selectedScenario, currentMode);
      setMessage(`批次创建成功，模式: ${currentMode === 'preview' ? '仅预检' : '真实执行'}`);
      loadBatches();
    } catch (err) {
      setMessage('创建失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBatch = async (batch) => {
    try {
      const res = await auditExecutionApi.getBatchById(batch.id);
      setSelectedBatch(res.data);
      setShowDetails(true);
    } catch (err) {
      console.error('加载批次详情失败:', err);
    }
  };

  const handleModeChange = async () => {
    if (!selectedBatch) {
      setMessage('请先选择批次');
      return;
    }

    const newMode = selectedBatch.mode === 'preview' ? 'execute' : 'preview';
    setLoading(true);
    try {
      await auditExecutionApi.updateMode(selectedBatch.id, newMode);
      setSelectedBatch({ ...selectedBatch, mode: newMode });
      setMessage(`模式已切换为: ${newMode === 'preview' ? '仅预检' : '真实执行'}`);
    } catch (err) {
      setMessage('切换失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handlePreCheck = async () => {
    if (!selectedBatch) return;
    setLoading(true);
    try {
      const res = await auditExecutionApi.runPreCheck(selectedBatch.id);
      setMessage(`预检查完成，通过: ${res.data.all_passed}`);
      loadBatches();
      handleSelectBatch({ id: selectedBatch.id });
    } catch (err) {
      setMessage('预检查失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!selectedBatch) return;
    setLoading(true);
    try {
      const res = await auditExecutionApi.execute(selectedBatch.id);
      setMessage(`执行${res.data.success ? '成功' : '失败'}: ${res.data.failure_reason || ''}`);
      loadBatches();
      handleSelectBatch({ id: selectedBatch.id });
    } catch (err) {
      setMessage('执行失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedBatch) return;
    setLoading(true);
    try {
      await auditExecutionApi.cancelBatch(selectedBatch.id, operator);
      setMessage('批次已取消');
      loadBatches();
      handleSelectBatch({ id: selectedBatch.id });
    } catch (err) {
      setMessage('取消失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleRecover = async () => {
    if (!selectedBatch) return;
    setLoading(true);
    try {
      const res = await auditExecutionApi.recover(selectedBatch.id, operator);
      setMessage(`恢复${res.data.success ? '成功' : '失败'}: ${res.data.error || ''}`);
      loadBatches();
      handleSelectBatch({ id: selectedBatch.id });
    } catch (err) {
      setMessage('恢复失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const getModeColor = (mode) => {
    return mode === 'preview' ? '#3498db' : '#e74c3c';
  };

  const getModeText = (mode) => {
    return mode === 'preview' ? '仅预检' : '真实执行';
  };

  const getStateColor = (state) => {
    switch (state) {
      case 'completed': return '#27ae60';
      case 'failed': return '#e74c3c';
      case 'pre_check': return '#f39c12';
      case 'pre_check_passed': return '#3498db';
      case 'in_progress': return '#9b59b6';
      case 'cancelled': return '#95a5a6';
      case 'recovered': return '#27ae60';
      case 'recovering': return '#f39c12';
      case 'recovery_failed': return '#e74c3c';
      default: return '#95a5a6';
    }
  };

  const getStateText = (state) => {
    switch (state) {
      case 'pending': return '等待中';
      case 'pre_check': return '预检查中';
      case 'pre_check_passed': return '预检查通过';
      case 'pre_check_failed': return '预检查失败';
      case 'in_progress': return '执行中';
      case 'completed': return '已完成';
      case 'failed': return '失败';
      case 'cancelled': return '已取消';
      case 'recovering': return '恢复中';
      case 'recovered': return '已恢复';
      case 'recovery_failed': return '恢复失败';
      default: return state;
    }
  };

  const getLogLevelColor = (level) => {
    switch (level) {
      case 'error': return '#e74c3c';
      case 'warn': return '#f39c12';
      case 'info': return '#3498db';
      case 'debug': return '#95a5a6';
      default: return '#95a5a6';
    }
  };

  const getLogLevelText = (level) => {
    switch (level) {
      case 'error': return '错误';
      case 'warn': return '警告';
      case 'info': return '信息';
      case 'debug': return '调试';
      default: return level;
    }
  };

  return (
    <div style={{ padding: '2rem', display: 'flex', gap: '2rem' }}>
      <div style={{ flex: 1 }}>
        <h2>执行审计台</h2>

        {message && (
          <div style={{ 
            padding: '1rem', 
            marginBottom: '1rem',
            backgroundColor: message.includes('成功') ? '#d4edda' : '#f8d7da',
            color: message.includes('成功') ? '#155724' : '#721c24',
            borderRadius: '4px'
          }}>
            {message}
          </div>
        )}

        <div style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h3 style={{ marginBottom: '1rem' }}>创建新批次</h3>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>操作者</label>
            <input
              type="text"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>选择场景</label>
            <select
              value={selectedScenario}
              onChange={(e) => setSelectedScenario(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value="">请选择场景</option>
              {scenarios.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>执行模式</label>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="radio"
                  name="mode"
                  value="preview"
                  checked={currentMode === 'preview'}
                  onChange={(e) => setCurrentMode(e.target.value)}
                />
                <span style={{ color: '#3498db', fontWeight: '500' }}>仅预检</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="radio"
                  name="mode"
                  value="execute"
                  checked={currentMode === 'execute'}
                  onChange={(e) => setCurrentMode(e.target.value)}
                />
                <span style={{ color: '#e74c3c', fontWeight: '500' }}>真实执行</span>
              </label>
            </div>
            <p style={{ fontSize: '0.875rem', color: '#95a5a6', marginTop: '0.5rem' }}>
              {currentMode === 'preview' ? '预检模式：仅检查，不实际执行变更' : '真实执行：将实际执行变更并落盘'}
            </p>
          </div>

          <button
            onClick={handleCreateBatch}
            disabled={loading || !selectedScenario}
            style={{ 
              backgroundColor: loading ? '#95a5a6' : '#27ae60', 
              color: '#fff', 
              border: 'none', 
              padding: '0.75rem 1.5rem', 
              borderRadius: '4px', 
              cursor: loading || !selectedScenario ? 'not-allowed' : 'pointer',
              fontSize: '1rem'
            }}
          >
            {loading ? '创建中...' : '创建批次'}
          </button>
        </div>

        <div>
          <h3>批次列表</h3>
          {batches.length === 0 ? (
            <p style={{ color: '#95a5a6', marginTop: '1rem' }}>暂无批次记录</p>
          ) : (
            <div style={{ marginTop: '1rem', maxHeight: '400px', overflowY: 'auto' }}>
              {batches.map(batch => (
                <div 
                  key={batch.id}
                  onClick={() => handleSelectBatch(batch)}
                  style={{ 
                    padding: '1rem', 
                    marginBottom: '0.5rem',
                    backgroundColor: selectedBatch?.id === batch.id ? '#e8f4f8' : '#fff',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    border: selectedBatch?.id === batch.id ? '1px solid #3498db' : '1px solid #ddd'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{batch.batch_number}</strong>
                      <span style={{ marginLeft: '0.5rem' }}>-</span>
                      <span>{batch.scenario_name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <span style={{ 
                        color: getModeColor(batch.mode), 
                        fontSize: '0.875rem',
                        padding: '0.25rem 0.5rem',
                        backgroundColor: `${getModeColor(batch.mode)}20`,
                        borderRadius: '4px'
                      }}>
                        {getModeText(batch.mode)}
                      </span>
                      <span style={{ 
                        color: getStateColor(batch.state), 
                        fontSize: '0.875rem',
                        fontWeight: '600'
                      }}>
                        {getStateText(batch.state)}
                      </span>
                    </div>
                  </div>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#95a5a6' }}>
                    操作者: {batch.operator} | 开始时间: {new Date(batch.started_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showDetails && selectedBatch && (
        <div style={{ flex: 1.5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2>批次详情</h2>
            <button
              onClick={() => { setShowDetails(false); setSelectedBatch(null); }}
              style={{ 
                backgroundColor: '#fff', 
                color: '#7f8c8d', 
                border: '1px solid #ddd', 
                padding: '0.5rem 1rem', 
                borderRadius: '4px', 
                cursor: 'pointer'
              }}
            >
              返回列表
            </button>
          </div>

          <div style={{ padding: '1.5rem', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginBottom: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <span style={{ color: '#95a5a6', fontSize: '0.875rem' }}>批次号</span>
                <p style={{ fontWeight: '600' }}>{selectedBatch.batch_number}</p>
              </div>
              <div>
                <span style={{ color: '#95a5a6', fontSize: '0.875rem' }}>场景</span>
                <p>{selectedBatch.scenario_name}</p>
              </div>
              <div>
                <span style={{ color: '#95a5a6', fontSize: '0.875rem' }}>操作者</span>
                <p>{selectedBatch.operator}</p>
              </div>
              <div>
                <span style={{ color: '#95a5a6', fontSize: '0.875rem' }}>状态</span>
                <p style={{ color: getStateColor(selectedBatch.state), fontWeight: '600' }}>
                  {getStateText(selectedBatch.state)}
                </p>
              </div>
              <div>
                <span style={{ color: '#95a5a6', fontSize: '0.875rem' }}>模式</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ 
                    color: getModeColor(selectedBatch.mode), 
                    padding: '0.25rem 0.5rem',
                    backgroundColor: `${getModeColor(selectedBatch.mode)}20`,
                    borderRadius: '4px'
                  }}>
                    {getModeText(selectedBatch.mode)}
                  </span>
                  <button
                    onClick={handleModeChange}
                    disabled={loading || ['completed', 'cancelled'].includes(selectedBatch.state)}
                    style={{ 
                      fontSize: '0.75rem',
                      padding: '0.25rem 0.5rem',
                      backgroundColor: '#fff',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      cursor: loading || ['completed', 'cancelled'].includes(selectedBatch.state) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    切换模式
                  </button>
                </div>
              </div>
              <div>
                <span style={{ color: '#95a5a6', fontSize: '0.875rem' }}>开始时间</span>
                <p>{new Date(selectedBatch.started_at).toLocaleString()}</p>
              </div>
            </div>

            {selectedBatch.failure_reason && (
              <div style={{ padding: '1rem', backgroundColor: '#fef5f5', borderRadius: '4px', marginBottom: '1rem' }}>
                <span style={{ color: '#e74c3c', fontWeight: '600' }}>失败原因:</span>
                <p style={{ color: '#e74c3c' }}>{selectedBatch.failure_reason}</p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem' }}>
              {selectedBatch.state === 'pending' && (
                <button
                  onClick={handlePreCheck}
                  disabled={loading}
                  style={{ 
                    backgroundColor: '#3498db', 
                    color: '#fff', 
                    border: 'none', 
                    padding: '0.5rem 1rem', 
                    borderRadius: '4px', 
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? '处理中...' : '执行预检查'}
                </button>
              )}
              {(selectedBatch.state === 'pending' || selectedBatch.state === 'pre_check_passed') && (
                <button
                  onClick={handleExecute}
                  disabled={loading}
                  style={{ 
                    backgroundColor: selectedBatch.mode === 'execute' ? '#e74c3c' : '#27ae60', 
                    color: '#fff', 
                    border: 'none', 
                    padding: '0.5rem 1rem', 
                    borderRadius: '4px', 
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? '处理中...' : (selectedBatch.mode === 'execute' ? '确认执行（将变更落盘）' : '执行预检')}
                </button>
              )}
              {selectedBatch.state === 'failed' && (
                <button
                  onClick={handleRecover}
                  disabled={loading}
                  style={{ 
                    backgroundColor: '#f39c12', 
                    color: '#fff', 
                    border: 'none', 
                    padding: '0.5rem 1rem', 
                    borderRadius: '4px', 
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? '处理中...' : '执行恢复'}
                </button>
              )}
              {selectedBatch.state !== 'completed' && selectedBatch.state !== 'cancelled' && (
                <button
                  onClick={handleCancel}
                  disabled={loading}
                  style={{ 
                    backgroundColor: '#fff', 
                    color: '#7f8c8d', 
                    border: '1px solid #ddd', 
                    padding: '0.5rem 1rem', 
                    borderRadius: '4px', 
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? '处理中...' : '取消批次'}
                </button>
              )}
            </div>
          </div>

          <div style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid #ddd' }}>
              <button
                onClick={() => setActiveTab('logs')}
                style={{ 
                  padding: '1rem 1.5rem',
                  backgroundColor: activeTab === 'logs' ? '#f5f5f5' : '#fff',
                  border: 'none',
                  borderBottom: activeTab === 'logs' ? '2px solid #3498db' : 'none',
                  cursor: 'pointer',
                  fontWeight: activeTab === 'logs' ? '600' : '400'
                }}
              >
                日志 ({selectedBatch.logs?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('timeline')}
                style={{ 
                  padding: '1rem 1.5rem',
                  backgroundColor: activeTab === 'timeline' ? '#f5f5f5' : '#fff',
                  border: 'none',
                  borderBottom: activeTab === 'timeline' ? '2px solid #3498db' : 'none',
                  cursor: 'pointer',
                  fontWeight: activeTab === 'timeline' ? '600' : '400'
                }}
              >
                时间线 ({selectedBatch.timeline?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('conflicts')}
                style={{ 
                  padding: '1rem 1.5rem',
                  backgroundColor: activeTab === 'conflicts' ? '#f5f5f5' : '#fff',
                  border: 'none',
                  borderBottom: activeTab === 'conflicts' ? '2px solid #3498db' : 'none',
                  cursor: 'pointer',
                  fontWeight: activeTab === 'conflicts' ? '600' : '400'
                }}
              >
                冲突决策 ({selectedBatch.conflict_decisions?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('recovery')}
                style={{ 
                  padding: '1rem 1.5rem',
                  backgroundColor: activeTab === 'recovery' ? '#f5f5f5' : '#fff',
                  border: 'none',
                  borderBottom: activeTab === 'recovery' ? '2px solid #3498db' : 'none',
                  cursor: 'pointer',
                  fontWeight: activeTab === 'recovery' ? '600' : '400'
                }}
              >
                恢复记录 ({selectedBatch.recovery_records?.length || 0})
              </button>
            </div>

            <div style={{ padding: '1.5rem' }}>
              {activeTab === 'logs' && (
                selectedBatch.logs && selectedBatch.logs.length > 0 ? (
                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {selectedBatch.logs.map((log, index) => (
                      <div 
                        key={index}
                        style={{ 
                          padding: '0.75rem',
                          marginBottom: '0.5rem',
                          backgroundColor: log.log_level === 'error' ? '#fef5f5' : log.log_level === 'warn' ? '#fffef0' : '#f8f9fa',
                          borderRadius: '4px',
                          borderLeft: `3px solid ${getLogLevelColor(log.log_level)}`
                        }}
                      >
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.25rem' }}>
                          <span style={{ color: '#95a5a6', fontSize: '0.875rem' }}>
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                          <span style={{ 
                            color: getLogLevelColor(log.log_level),
                            fontSize: '0.875rem',
                            fontWeight: '600'
                          }}>
                            [{getLogLevelText(log.log_level)}]
                          </span>
                          <span style={{ color: '#95a5a6', fontSize: '0.875rem' }}>
                            {log.log_type}
                          </span>
                        </div>
                        <p>{log.message}</p>
                        {log.error_code && (
                          <p style={{ color: '#e74c3c', fontSize: '0.875rem' }}>
                            错误码: {log.error_code}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#95a5a6' }}>暂无日志记录</p>
                )
              )}

              {activeTab === 'timeline' && (
                selectedBatch.timeline && selectedBatch.timeline.length > 0 ? (
                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {selectedBatch.timeline.map((event, index) => (
                      <div 
                        key={index}
                        style={{ 
                          display: 'flex',
                          gap: '1rem',
                          padding: '0.75rem',
                          marginBottom: '0.5rem',
                          backgroundColor: '#f8f9fa',
                          borderRadius: '4px'
                        }}
                      >
                        <div style={{ 
                          width: '20px', 
                          height: '20px', 
                          borderRadius: '50%',
                          backgroundColor: '#3498db',
                          flexShrink: 0,
                          marginTop: '0.25rem'
                        }} />
                        <div>
                          <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.25rem' }}>
                            <span style={{ fontWeight: '600' }}>{event.action}</span>
                            <span style={{ color: '#95a5a6', fontSize: '0.875rem' }}>
                              {new Date(event.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p style={{ fontSize: '0.875rem', color: '#7f8c8d' }}>
                            执行者: {event.actor} | 事件类型: {event.event_type}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#95a5a6' }}>暂无时间线记录</p>
                )
              )}

              {activeTab === 'conflicts' && (
                selectedBatch.conflict_decisions && selectedBatch.conflict_decisions.length > 0 ? (
                  <div>
                    {selectedBatch.conflict_decisions.map((decision, index) => (
                      <div 
                        key={index}
                        style={{ 
                          padding: '1rem',
                          marginBottom: '0.5rem',
                          backgroundColor: '#f8f9fa',
                          borderRadius: '4px'
                        }}
                      >
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
                          <span style={{ fontWeight: '600', color: '#3498db' }}>{decision.conflict_type}</span>
                          <span style={{ color: '#27ae60', fontWeight: '600' }}>→ {decision.decision}</span>
                        </div>
                        <p>{decision.conflict_description}</p>
                        <p style={{ fontSize: '0.875rem', color: '#95a5a6' }}>
                          决策人: {decision.decision_made_by} | {new Date(decision.decision_made_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#95a5a6' }}>暂无冲突决策记录</p>
                )
              )}

              {activeTab === 'recovery' && (
                selectedBatch.recovery_records && selectedBatch.recovery_records.length > 0 ? (
                  <div>
                    {selectedBatch.recovery_records.map((record, index) => (
                      <div 
                        key={index}
                        style={{ 
                          padding: '1rem',
                          marginBottom: '0.5rem',
                          backgroundColor: record.recovery_status === 'completed' ? '#f0fdf4' : '#fffef0',
                          borderRadius: '4px'
                        }}
                      >
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
                          <span style={{ fontWeight: '600' }}>{record.resource_name}</span>
                          <span style={{ 
                            color: record.recovery_status === 'completed' ? '#27ae60' : '#f39c12',
                            fontWeight: '600'
                          }}>
                            {record.recovery_status}
                          </span>
                          {record.verified && (
                            <span style={{ color: '#3498db', fontSize: '0.875rem' }}>✓ 已验证</span>
                          )}
                        </div>
                        <p style={{ fontSize: '0.875rem', color: '#7f8c8d' }}>
                          资源类型: {record.resource_type} | 资源ID: {record.resource_id}
                        </p>
                        <p style={{ fontSize: '0.875rem', color: '#95a5a6' }}>
                          恢复时间: {new Date(record.recovery_timestamp).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#95a5a6' }}>暂无恢复记录</p>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditExecutionPanel;