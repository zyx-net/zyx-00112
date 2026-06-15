import { useState, useEffect } from 'react';
import { scenarioApi, rollbackApi } from '../api';

const RollbackManager = () => {
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState('');
  const [history, setHistory] = useState([]);
  const [rollbackResult, setRollbackResult] = useState(null);
  const [summary, setSummary] = useState(null);
  const [isRollingBack, setIsRollingBack] = useState(false);

  useEffect(() => {
    loadScenarios();
  }, []);

  const loadScenarios = async () => {
    const res = await scenarioApi.getAll();
    setScenarios(res.data);
  };

  const loadHistory = async (scenarioId) => {
    const res = await rollbackApi.getHistory(scenarioId);
    setHistory(res.data);
  };

  const loadSummary = async (scenarioId) => {
    const res = await rollbackApi.export(scenarioId);
    setSummary(res.data);
  };

  const handleSelectScenario = (scenarioId) => {
    setSelectedScenario(scenarioId);
    loadHistory(scenarioId);
    loadSummary(scenarioId);
    setRollbackResult(null);
  };

  const handleRollback = async () => {
    if (!selectedScenario) return;
    setIsRollingBack(true);
    setRollbackResult(null);
    
    try {
      const res = await rollbackApi.rollback(selectedScenario);
      setRollbackResult({ success: true, data: res.data });
      loadScenarios();
      loadHistory(selectedScenario);
      loadSummary(selectedScenario);
    } catch (err) {
      setRollbackResult({ success: false, error: err.response?.data?.error || err.message });
    } finally {
      setIsRollingBack(false);
    }
  };

  const handleExport = () => {
    if (!summary) return;
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scenario-summary-${selectedScenario.substring(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '2rem', display: 'flex', gap: '2rem' }}>
      <div style={{ flex: 1 }}>
        <h2>回滚操作</h2>
        
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>选择场景</label>
          <select
            value={selectedScenario}
            onChange={(e) => handleSelectScenario(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
          >
            <option value="">请选择场景</option>
            {scenarios.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleRollback}
          disabled={isRollingBack || !selectedScenario}
          style={{ 
            backgroundColor: isRollingBack ? '#95a5a6' : '#e74c3c', 
            color: '#fff', 
            border: 'none', 
            padding: '0.75rem 1.5rem', 
            borderRadius: '4px', 
            cursor: isRollingBack || !selectedScenario ? 'not-allowed' : 'pointer',
            fontSize: '1rem'
          }}
        >
          {isRollingBack ? '回滚中...' : '执行回滚'}
        </button>

        {rollbackResult && (
          <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: rollbackResult.success ? '#d4edda' : '#f8d7da', borderRadius: '4px' }}>
            <h3 style={{ marginBottom: '1rem' }}>{rollbackResult.success ? '回滚成功' : '回滚失败'}</h3>
            {rollbackResult.success ? (
              <div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>场景ID:</strong> {rollbackResult.data.scenarioId}
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>快照ID:</strong> {rollbackResult.data.snapshotId}
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>时间:</strong> {rollbackResult.data.timestamp}
                </div>
                <div>
                  <strong>恢复数据预览:</strong>
                  <pre style={{ marginTop: '0.5rem', backgroundColor: '#fff', padding: '0.5rem', borderRadius: '4px', maxHeight: '200px', overflowY: 'auto' }}>
                    {JSON.stringify(rollbackResult.data.restoredData, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div style={{ color: '#721c24' }}>
                <strong>错误:</strong> {rollbackResult.error}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }}>
        <h2>快照历史</h2>
        {selectedScenario ? (
          <div style={{ marginTop: '1rem' }}>
            {history.length === 0 ? (
              <p style={{ color: '#95a5a6' }}>暂无快照记录</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f5f5f5' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>快照ID</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>执行ID</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>创建时间</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>数据预览</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id} style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>{h.id.substring(0, 8)}...</td>
                      <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>{h.executionId?.substring(0, 8)}...</td>
                      <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>{h.createdAt}</td>
                      <td style={{ padding: '0.75rem', fontSize: '0.875rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {h.dataPreview}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <p style={{ color: '#95a5a6', marginTop: '1rem' }}>请先选择一个场景</p>
        )}
      </div>

      <div style={{ flex: 1 }}>
        <h2>场景摘要</h2>
        {summary ? (
          <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
            <h3 style={{ marginBottom: '1rem' }}>{summary.scenario.name}</h3>
            
            <div style={{ marginBottom: '1rem' }}>
              <strong>状态:</strong> {summary.scenario.status}
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <strong>执行统计:</strong>
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem' }}>
                <span>总数: {summary.executionSummary.total}</span>
                <span style={{ color: '#27ae60' }}>成功: {summary.executionSummary.success}</span>
                <span style={{ color: '#e74c3c' }}>失败: {summary.executionSummary.failed}</span>
              </div>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <strong>快照数量:</strong> {summary.snapshotCount}
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <strong>最新快照:</strong> {summary.latestSnapshot ? summary.latestSnapshot.createdAt : '无'}
            </div>
            
            <button
              onClick={handleExport}
              style={{ backgroundColor: '#3498db', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}
            >
              导出摘要
            </button>
          </div>
        ) : (
          <p style={{ color: '#95a5a6', marginTop: '1rem' }}>请先选择一个场景</p>
        )}
      </div>
    </div>
  );
};

export default RollbackManager;