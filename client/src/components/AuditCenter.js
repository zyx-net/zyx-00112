import { useState, useEffect } from 'react';
import { auditCenterApi, scenarioApi } from '../api';

const AuditCenter = () => {
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchDetails, setBatchDetails] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState('success');

  useEffect(() => {
    loadBatches();
    loadScenarios();
  }, []);

  const loadBatches = async () => {
    try {
      const res = await auditCenterApi.getBatches(100, 0);
      setBatches(res.data.batches || []);
    } catch (err) {
      showMessage('加载批次列表失败', 'error');
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

  const showMessage = (text, type = 'success') => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(null), 5000);
  };

  const handleSelectBatch = async (batchId) => {
    setSelectedBatch(batchId);
    setLoading(true);
    try {
      const res = await auditCenterApi.getBatchById(batchId);
      setBatchDetails(res.data.batch);
    } catch (err) {
      showMessage('加载批次详情失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulation = async () => {
    if (!selectedBatch || !batchDetails) return;

    const scenarioId = batchDetails.snapshot_versions?.[0]?.scenario_id;
    if (!scenarioId) {
      showMessage('未找到关联的场景', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await auditCenterApi.performSimulation(selectedBatch, scenarioId);
      showMessage('模拟检查完成');
      await handleSelectBatch(selectedBatch);
    } catch (err) {
      showMessage('模拟检查失败: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRealRestart = async () => {
    if (!selectedBatch || !batchDetails) return;

    const scenarioId = batchDetails.snapshot_versions?.[0]?.scenario_id;
    if (!scenarioId) {
      showMessage('未找到关联的场景', 'error');
      return;
    }

    if (!window.confirm('确定要执行真实重启验证吗？这将进行实际的数据一致性检查。')) {
      return;
    }

    setLoading(true);
    try {
      const res = await auditCenterApi.performRealRestart(selectedBatch, scenarioId, 'operator');
      showMessage('真实重启验证完成');
      await handleSelectBatch(selectedBatch);
    } catch (err) {
      showMessage('真实重启验证失败: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!selectedBatch) return;

    setLoading(true);
    try {
      const res = await auditCenterApi.getBatchReport(selectedBatch);
      const report = res.data.report;

      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_report_${selectedBatch}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showMessage('审计报告已生成并下载');
    } catch (err) {
      showMessage('生成报告失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#27ae60';
      case 'in_progress': return '#f39c12';
      case 'failed': return '#e74c3c';
      default: return '#95a5a6';
    }
  };

  const getActionIcon = (action) => {
    switch (action) {
      case 'removed': return '🗑️';
      case 'restored': return '♻️';
      case 'restored_associations': return '🔗';
      default: return '❓';
    }
  };

  const getResourceIcon = (type) => {
    switch (type) {
      case 'scenario': return '📋';
      case 'snapshot': return '📸';
      case 'execution': return '▶️';
      case 'failure_injection': return '💉';
      case 'api_version': return '🔌';
      case 'field_mapping': return '🗺️';
      case 'compatibility_strategy': return '🔄';
      default: return '📦';
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h2>导入替换审计中心</h2>

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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem', marginTop: '1rem' }}>
        <div>
          <h3>导入批次列表</h3>
          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {batches.length === 0 ? (
              <p style={{ color: '#95a5a6' }}>暂无导入批次</p>
            ) : (
              <div>
                {batches.map(batch => (
                  <div
                    key={batch.id}
                    onClick={() => handleSelectBatch(batch.id)}
                    style={{
                      padding: '1rem',
                      marginBottom: '0.5rem',
                      backgroundColor: selectedBatch === batch.id ? '#e3f2fd' : '#f5f5f5',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      borderLeft: `4px solid ${getStatusColor(batch.status)}`
                    }}
                  >
                    <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                      {getActionIcon(batch.import_type === 'rollback' ? 'restored' : 'removed')} {batch.batch_number}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#666' }}>
                      <div>操作者: {batch.operator}</div>
                      <div>类型: {batch.import_type}</div>
                      <div>操作: {batch.scenario_action || 'N/A'}</div>
                      <div>时间: {new Date(batch.started_at).toLocaleString()}</div>
                      <div>状态: <span style={{ color: getStatusColor(batch.status) }}>{batch.status}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          {selectedBatch && batchDetails ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3>批次详情: {batchDetails.batch_number}</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={handleSimulation}
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
                    🔍 模拟检查
                  </button>
                  <button
                    onClick={handleRealRestart}
                    disabled={loading}
                    style={{
                      backgroundColor: '#27ae60',
                      color: '#fff',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: '4px',
                      cursor: loading ? 'not-allowed' : 'pointer'
                    }}
                  >
                    ▶️ 真实重启验证
                  </button>
                  <button
                    onClick={handleGenerateReport}
                    disabled={loading}
                    style={{
                      backgroundColor: '#9b59b6',
                      color: '#fff',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: '4px',
                      cursor: loading ? 'not-allowed' : 'pointer'
                    }}
                  >
                    📄 生成报告
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>操作者</div>
                    <div style={{ fontWeight: '600' }}>{batchDetails.operator}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>导入类型</div>
                    <div style={{ fontWeight: '600' }}>{batchDetails.import_type}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>场景操作</div>
                    <div style={{ fontWeight: '600' }}>{batchDetails.scenario_action || 'N/A'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>状态</div>
                    <div style={{ fontWeight: '600', color: getStatusColor(batchDetails.status) }}>
                      {batchDetails.status}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>开始时间</div>
                    <div>{new Date(batchDetails.started_at).toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>完成时间</div>
                    <div>{batchDetails.completed_at ? new Date(batchDetails.completed_at).toLocaleString() : 'N/A'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>成功/失败</div>
                    <div>{batchDetails.successful_imports || 0} / {batchDetails.failed_imports || 0}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #ddd' }}>
                {['overview', 'snapshots', 'rollback', 'restart'].map(tab => (
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
                    {tab === 'overview' && '📊 概览'}
                    {tab === 'snapshots' && '📸 快照链'}
                    {tab === 'rollback' && '↩️ 回滚详情'}
                    {tab === 'restart' && '🔄 重启复查'}
                  </button>
                ))}
              </div>

              {activeTab === 'overview' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{ padding: '1rem', backgroundColor: '#e8f5e9', borderRadius: '4px' }}>
                      <div style={{ fontSize: '0.875rem', color: '#666' }}>快照版本数</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>
                        {batchDetails.snapshot_versions?.length || 0}
                      </div>
                    </div>
                    <div style={{ padding: '1rem', backgroundColor: '#fff3e0', borderRadius: '4px' }}>
                      <div style={{ fontSize: '0.875rem', color: '#666' }}>替换快照数</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>
                        {batchDetails.replaced_snapshots?.length || 0}
                      </div>
                    </div>
                    <div style={{ padding: '1rem', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
                      <div style={{ fontSize: '0.875rem', color: '#666' }}>回滚变更数</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>
                        {batchDetails.rollback_changes?.length || 0}
                      </div>
                    </div>
                  </div>

                  {batchDetails.rollback_summary && batchDetails.rollback_summary.length > 0 && (
                    <div style={{ padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px', marginBottom: '1rem' }}>
                      <h4 style={{ marginTop: 0 }}>回滚汇总</h4>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#e0e0e0' }}>
                            <th style={{ padding: '0.5rem', textAlign: 'left' }}>资源类型</th>
                            <th style={{ padding: '0.5rem', textAlign: 'left' }}>操作</th>
                            <th style={{ padding: '0.5rem', textAlign: 'right' }}>数量</th>
                          </tr>
                        </thead>
                        <tbody>
                          {batchDetails.rollback_summary.map((item, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #ddd' }}>
                              <td style={{ padding: '0.5rem' }}>
                                {getResourceIcon(item.resource_type)} {item.resource_type}
                              </td>
                              <td style={{ padding: '0.5rem' }}>
                                {getActionIcon(item.action)} {item.action}
                              </td>
                              <td style={{ padding: '0.5rem', textAlign: 'right' }}>{item.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'snapshots' && (
                <div>
                  <h4 style={{ marginTop: 0 }}>快照版本链</h4>
                  {(!batchDetails.snapshot_versions || batchDetails.snapshot_versions.length === 0) ? (
                    <p style={{ color: '#95a5a6' }}>暂无快照版本记录</p>
                  ) : (
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      {batchDetails.snapshot_versions.map((version, idx) => (
                        <div
                          key={version.id}
                          style={{
                            padding: '1rem',
                            marginBottom: '0.5rem',
                            backgroundColor: version.replaced_at ? '#ffebee' : '#e8f5e9',
                            borderRadius: '4px',
                            borderLeft: `4px solid ${version.replaced_at ? '#e74c3c' : '#27ae60'}`
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <div style={{ fontWeight: '600' }}>
                              📸 版本 {version.version_number}
                              {version.replaced_at && <span style={{ color: '#e74c3c', marginLeft: '0.5rem' }}>⚠️ 已替换</span>}
                            </div>
                            <div style={{ fontSize: '0.875rem', color: '#666' }}>
                              {new Date(version.created_at).toLocaleString()}
                            </div>
                          </div>
                          <div style={{ fontSize: '0.875rem' }}>
                            <div>快照ID: {version.snapshot_id?.substring(0, 8)}...</div>
                            <div>场景ID: {version.scenario_id?.substring(0, 8)}...</div>
                            <div>执行ID: {version.execution_id?.substring(0, 8)}... ({version.execution_status})</div>
                            {version.replaced_at && (
                              <>
                                <div style={{ color: '#e74c3c' }}>
                                  替换时间: {new Date(version.replaced_at).toLocaleString()}
                                </div>
                                <div>替换原因: {version.replaced_reason}</div>
                                <div>批次号: {version.batch_number}</div>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {batchDetails.replaced_snapshots && batchDetails.replaced_snapshots.length > 0 && (
                    <>
                      <h4 style={{ marginTop: '2rem' }}>被替换的快照详情</h4>
                      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        {batchDetails.replaced_snapshots.map((snap, idx) => (
                          <div
                            key={snap.id}
                            style={{
                              padding: '1rem',
                              marginBottom: '0.5rem',
                              backgroundColor: '#fff3e0',
                              borderRadius: '4px',
                              borderLeft: '4px solid #e74c3c'
                            }}
                          >
                            <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
                              ⚠️ 快照被替换
                            </div>
                            <div style={{ fontSize: '0.875rem' }}>
                              <div><strong>原始快照ID:</strong> {snap.original_snapshot_id?.substring(0, 8)}...</div>
                              <div><strong>场景名称:</strong> {snap.scenario_name || 'N/A'}</div>
                              <div><strong>原始执行ID:</strong> {snap.original_execution_id?.substring(0, 8)}... ({snap.original_execution_status})</div>
                              <div><strong>原始执行时间:</strong> {snap.execution_start_time ? new Date(snap.execution_start_time).toLocaleString() : 'N/A'}</div>
                              <div><strong>原始创建时间:</strong> {snap.original_created_at ? new Date(snap.original_created_at).toLocaleString() : 'N/A'}</div>
                              <div><strong>替换时间:</strong> {snap.replaced_at ? new Date(snap.replaced_at).toLocaleString() : 'N/A'}</div>
                              <div><strong>冲突决策:</strong> {snap.conflict_decision}</div>
                              <div><strong>操作者:</strong> {snap.operator}</div>
                              {snap.original_data && (
                                <details style={{ marginTop: '0.5rem' }}>
                                  <summary style={{ cursor: 'pointer', color: '#3498db' }}>查看原始数据</summary>
                                  <pre style={{
                                    marginTop: '0.5rem',
                                    padding: '0.5rem',
                                    backgroundColor: '#f5f5f5',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem',
                                    maxHeight: '200px',
                                    overflow: 'auto'
                                  }}>
                                    {JSON.stringify(snap.original_data, null, 2)}
                                  </pre>
                                </details>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'rollback' && (
                <div>
                  <h4 style={{ marginTop: 0 }}>回滚资源变更详情</h4>
                  {(!batchDetails.rollback_changes || batchDetails.rollback_changes.length === 0) ? (
                    <p style={{ color: '#95a5a6' }}>暂无回滚变更记录</p>
                  ) : (
                    <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                      {batchDetails.rollback_changes.map((change, idx) => (
                        <div
                          key={change.id}
                          style={{
                            padding: '1rem',
                            marginBottom: '0.5rem',
                            backgroundColor: change.action === 'restored' ? '#e8f5e9' : '#ffebee',
                            borderRadius: '4px',
                            borderLeft: `4px solid ${change.action === 'restored' ? '#27ae60' : '#e74c3c'}`
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <div style={{ fontWeight: '600' }}>
                              {getResourceIcon(change.resource_type)} {change.resource_type}
                              <span style={{ marginLeft: '0.5rem' }}>
                                {getActionIcon(change.action)} {change.action}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.875rem', color: '#666' }}>
                              {new Date(change.timestamp).toLocaleString()}
                            </div>
                          </div>
                          <div style={{ fontSize: '0.875rem' }}>
                            <div><strong>资源ID:</strong> {change.resource_id?.substring(0, 8)}...</div>
                            <div><strong>资源名称:</strong> {change.resource_name}</div>
                            {change.previous_state && (
                              <details style={{ marginTop: '0.5rem' }}>
                                <summary style={{ cursor: 'pointer', color: '#e74c3c' }}>
                                  变更前状态
                                </summary>
                                <pre style={{
                                  marginTop: '0.5rem',
                                  padding: '0.5rem',
                                  backgroundColor: '#ffebee',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  maxHeight: '150px',
                                  overflow: 'auto'
                                }}>
                                  {JSON.stringify(change.previous_state, null, 2)}
                                </pre>
                              </details>
                            )}
                            {change.new_state && (
                              <details style={{ marginTop: '0.5rem' }}>
                                <summary style={{ cursor: 'pointer', color: '#27ae60' }}>
                                  变更后状态
                                </summary>
                                <pre style={{
                                  marginTop: '0.5rem',
                                  padding: '0.5rem',
                                  backgroundColor: '#e8f5e9',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  maxHeight: '150px',
                                  overflow: 'auto'
                                }}>
                                  {JSON.stringify(change.new_state, null, 2)}
                                </pre>
                              </details>
                            )}
                            {change.restored_associations && Object.keys(change.restored_associations).length > 0 && (
                              <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
                                <strong>🔗 恢复的关联:</strong>
                                <pre style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}>
                                  {JSON.stringify(change.restored_associations, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'restart' && (
                <div>
                  <h4 style={{ marginTop: 0 }}>重启复查记录</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{ padding: '1rem', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
                      <div style={{ fontSize: '0.875rem', color: '#666' }}>模拟检查次数</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>
                        {batchDetails.simulation_reviews?.length || 0}
                      </div>
                    </div>
                    <div style={{ padding: '1rem', backgroundColor: '#e8f5e9', borderRadius: '4px' }}>
                      <div style={{ fontSize: '0.875rem', color: '#666' }}>真实重启验证次数</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>
                        {batchDetails.real_restart_reviews?.length || 0}
                      </div>
                    </div>
                  </div>

                  {batchDetails.simulation_reviews && batchDetails.simulation_reviews.length > 0 && (
                    <>
                      <h5>🔍 模拟检查记录</h5>
                      {batchDetails.simulation_reviews.map((review, idx) => (
                        <div
                          key={review.id}
                          style={{
                            padding: '1rem',
                            marginBottom: '0.5rem',
                            backgroundColor: review.consistency_check_passed ? '#e8f5e9' : '#ffebee',
                            borderRadius: '4px'
                          }}
                        >
                          <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
                            {review.consistency_check_passed ? '✅' : '❌'} 
                            场景: {review.scenario_name}
                          </div>
                          <div style={{ fontSize: '0.875rem' }}>
                            <div>检查时间: {review.review_completed_at ? new Date(review.review_completed_at).toLocaleString() : '进行中'}</div>
                            {review.errors_found && review.errors_found.length > 0 && (
                              <div style={{ color: '#e74c3c', marginTop: '0.5rem' }}>
                                <strong>错误:</strong>
                                <ul style={{ margin: '0.25rem 0 0 1.5rem' }}>
                                  {review.errors_found.map((err, i) => <li key={i}>{err}</li>)}
                                </ul>
                              </div>
                            )}
                            {review.warnings && review.warnings.length > 0 && (
                              <div style={{ color: '#f39c12', marginTop: '0.5rem' }}>
                                <strong>警告:</strong>
                                <ul style={{ margin: '0.25rem 0 0 1.5rem' }}>
                                  {review.warnings.map((warn, i) => <li key={i}>{warn}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {batchDetails.real_restart_reviews && batchDetails.real_restart_reviews.length > 0 && (
                    <>
                      <h5 style={{ marginTop: '1rem' }}>▶️ 真实重启验证记录</h5>
                      {batchDetails.real_restart_reviews.map((review, idx) => (
                        <div
                          key={review.id}
                          style={{
                            padding: '1rem',
                            marginBottom: '0.5rem',
                            backgroundColor: review.real_restart_verified ? '#e8f5e9' : '#fff3e0',
                            borderRadius: '4px',
                            borderLeft: `4px solid ${review.real_restart_verified ? '#27ae60' : '#f39c12'}`
                          }}
                        >
                          <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
                            {review.real_restart_verified ? '✅' : '⏳'} 
                            场景: {review.scenario_name}
                          </div>
                          <div style={{ fontSize: '0.875rem' }}>
                            <div>验证者: {review.restart_verified_by}</div>
                            <div>验证时间: {review.restart_verified_at ? new Date(review.restart_verified_at).toLocaleString() : 'N/A'}</div>
                            <div>一致性检查: {review.consistency_check_passed ? '✅ 通过' : '❌ 失败'}</div>
                            {review.errors_found && review.errors_found.length > 0 && (
                              <div style={{ color: '#e74c3c', marginTop: '0.5rem' }}>
                                <strong>错误:</strong>
                                <ul style={{ margin: '0.25rem 0 0 1.5rem' }}>
                                  {review.errors_found.map((err, i) => <li key={i}>{err}</li>)}
                                </ul>
                              </div>
                            )}
                            {review.warnings && review.warnings.length > 0 && (
                              <div style={{ color: '#f39c12', marginTop: '0.5rem' }}>
                                <strong>警告:</strong>
                                <ul style={{ margin: '0.25rem 0 0 1.5rem' }}>
                                  {review.warnings.map((warn, i) => <li key={i}>{warn}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#95a5a6' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
              <p>请选择一个批次查看详情</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditCenter;
