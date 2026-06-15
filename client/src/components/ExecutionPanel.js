import { useState, useEffect } from 'react';
import { scenarioApi, executionApi } from '../api';

const ExecutionPanel = () => {
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState('');
  const [executions, setExecutions] = useState([]);
  const [logs, setLogs] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    loadScenarios();
  }, []);

  const loadScenarios = async () => {
    const res = await scenarioApi.getAll();
    setScenarios(res.data);
  };

  const loadExecutions = async (scenarioId) => {
    const res = await executionApi.getByScenarioId(scenarioId);
    setExecutions(res.data);
  };

  const handleExecute = async () => {
    if (!selectedScenario) return;
    setIsExecuting(true);
    setLogs('');
    setResult(null);
    
    try {
      const res = await executionApi.execute(selectedScenario);
      setResult(res.data);
      setLogs(res.data.logs || '');
      loadExecutions(selectedScenario);
      loadScenarios();
    } catch (err) {
      setResult({ status: 'error', error: err.response?.data?.error || err.message });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSelectScenario = (scenarioId) => {
    setSelectedScenario(scenarioId);
    loadExecutions(scenarioId);
    setLogs('');
    setResult(null);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success': return '#27ae60';
      case 'failed': return '#e74c3c';
      case 'pending': return '#f39c12';
      case 'queued': return '#9b59b6';
      default: return '#95a5a6';
    }
  };

  return (
    <div style={{ padding: '2rem', display: 'flex', gap: '2rem' }}>
      <div style={{ flex: 1 }}>
        <h2>演练执行</h2>
        
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
          onClick={handleExecute}
          disabled={isExecuting || !selectedScenario || scenarios.find(s => s.id === selectedScenario)?.status === 'running'}
          style={{ 
            backgroundColor: isExecuting ? '#95a5a6' : '#27ae60', 
            color: '#fff', 
            border: 'none', 
            padding: '0.75rem 1.5rem', 
            borderRadius: '4px', 
            cursor: isExecuting || !selectedScenario ? 'not-allowed' : 'pointer',
            fontSize: '1rem'
          }}
        >
          {isExecuting ? '执行中...' : '执行演练'}
        </button>

        {result && (
          <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
            <h3 style={{ marginBottom: '1rem' }}>执行结果</h3>
            {result.error ? (
              <div style={{ color: '#e74c3c' }}>
                <strong>错误:</strong> {result.error}
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <strong>状态:</strong> <span style={{ color: getStatusColor(result.status), fontWeight: '600' }}>
                    {result.status === 'success' ? '成功' : result.status === 'failed' ? '失败' : result.status === 'queued' ? '已排队' : '未知'}
                  </span>
                </div>
                {result.executionId && (
                  <div style={{ marginBottom: '1rem' }}>
                    <strong>执行ID:</strong> {result.executionId}
                  </div>
                )}
                {result.message && (
                  <div style={{ marginBottom: '1rem' }}>
                    <strong>消息:</strong> {result.message}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {logs && (
          <div style={{ marginTop: '2rem' }}>
            <h3>执行日志</h3>
            <pre style={{ 
              backgroundColor: '#2c3e50', 
              color: '#ecf0f1', 
              padding: '1rem', 
              borderRadius: '4px',
              overflowX: 'auto',
              maxHeight: '300px',
              overflowY: 'auto'
            }}>
              {logs}
            </pre>
          </div>
        )}
      </div>

      <div style={{ flex: 1 }}>
        <h2>执行历史</h2>
        {selectedScenario ? (
          <div style={{ marginTop: '1rem' }}>
            {executions.length === 0 ? (
              <p style={{ color: '#95a5a6' }}>暂无执行记录</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f5f5f5' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>ID</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>状态</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>开始时间</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>结束时间</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map(e => (
                    <tr key={e.id} style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>{e.id.substring(0, 8)}...</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ color: getStatusColor(e.status), fontWeight: '600' }}>
                          {e.status === 'success' ? '成功' : e.status === 'failed' ? '失败' : e.status === 'pending' ? '等待中' : e.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>{e.start_time || '-'}</td>
                      <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>{e.end_time || '-'}</td>
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
    </div>
  );
};

export default ExecutionPanel;