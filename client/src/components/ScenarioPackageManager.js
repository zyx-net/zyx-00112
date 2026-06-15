import { useState, useEffect } from 'react';
import { scenarioPackageApi, scenarioApi } from '../api';

const ScenarioPackageManager = () => {
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [exportPackage, setExportPackage] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [conflicts, setConflicts] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [importLogs, setImportLogs] = useState([]);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState('success');
  const [loading, setLoading] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);

  useEffect(() => {
    loadScenarios();
    loadImportLogs();
  }, []);

  const loadScenarios = async () => {
    try {
      const res = await scenarioPackageApi.getScenariosWithHistory();
      setScenarios(res.data);
    } catch (err) {
      showMessage('加载场景失败', 'error');
    }
  };

  const loadImportLogs = async () => {
    try {
      const res = await scenarioPackageApi.getImportLogs();
      setImportLogs(res.data);
    } catch (err) {
      console.error('加载导入日志失败', err);
    }
  };

  const showMessage = (text, type = 'success') => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => setMessage(null), 5000);
  };

  const handleExport = async () => {
    if (!selectedScenario) {
      showMessage('请先选择要导出的场景', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await scenarioPackageApi.export(selectedScenario);
      const packageData = res.data.package;
      setExportPackage(packageData);
      
      const blob = new Blob([JSON.stringify(packageData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scenario_package_${selectedScenario}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showMessage('场景包导出成功');
      await scenarioPackageApi.import(null, { source: 'export' }).catch(() => {});
      loadImportLogs();
    } catch (err) {
      showMessage('导出失败: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const packageData = JSON.parse(text);
      setImportFile(packageData);
      
      const previewRes = await scenarioPackageApi.preview(packageData);
      setImportPreview(previewRes.data);
      
      if (previewRes.data.has_conflicts) {
        setConflicts(previewRes.data.conflicts);
        setShowConflictModal(true);
      }
    } catch (err) {
      showMessage('读取文件失败: ' + err.message, 'error');
    }
  };

  const handleDecide = (type, action) => {
    setDecisions({ ...decisions, [type]: action });
  };

  const handleImport = async () => {
    if (!importFile) {
      showMessage('请先选择要导入的文件', 'error');
      return;
    }

    const importDecisions = { ...decisions };
    if (importDecisions.duplicate_name) {
      importDecisions.scenario_action = importDecisions.duplicate_name;
      delete importDecisions.duplicate_name;
    }

    setLoading(true);
    try {
      const res = await scenarioPackageApi.import(importFile, importDecisions);
      showMessage('导入成功！场景 "' + res.data.result.new_scenario_name + '" 已创建');
      setImportFile(null);
      setImportPreview(null);
      setConflicts(null);
      setDecisions({});
      setShowConflictModal(false);
      loadScenarios();
      loadImportLogs();
    } catch (err) {
      if (err.response?.status === 409) {
        setConflicts(err.response.data.conflicts.issues);
        setShowConflictModal(true);
      } else {
        showMessage('导入失败: ' + (err.response?.data?.error || err.message), 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async () => {
    if (!window.confirm('确定要撤销最近一次导入吗？这将删除最近导入的场景。')) {
      return;
    }

    setLoading(true);
    try {
      const res = await scenarioPackageApi.rollback();
      showMessage('撤销成功！已删除场景 "' + res.data.result.rolled_back_scenario_name + '"');
      loadScenarios();
      loadImportLogs();
    } catch (err) {
      showMessage('撤销失败: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const getConflictIcon = (type) => {
    switch (type) {
      case 'duplicate_name': return '⚠️';
      case 'schema_incompatible': return '🔴';
      case 'missing_fields': return '📋';
      case 'has_execution_history': return '📊';
      default: return '❓';
    }
  };

  const getDecisionOptions = (type) => {
    switch (type) {
      case 'duplicate_name':
        return [
          { value: 'save_as', label: '另存为新场景' },
          { value: 'replace', label: '覆盖现有场景' },
          { value: 'skip', label: '跳过此场景' }
        ];
      case 'schema_incompatible':
        return [
          { value: 'skip', label: '跳过API版本' },
          { value: 'create', label: '强制创建' }
        ];
      case 'has_execution_history':
        return [
          { value: 'skip', label: '跳过执行历史' },
          { value: 'keep', label: '保留执行历史' }
        ];
      default:
        return [{ value: 'skip', label: '跳过' }];
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h2>场景包管理</h2>
      
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '1rem' }}>
        <div>
          <h3>导出场景包</h3>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>选择场景</label>
            <select
              value={selectedScenario || ''}
              onChange={(e) => setSelectedScenario(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value="">请选择场景</option>
              {scenarios.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} (执行{s.execution_count}次, 快照{s.snapshot_count}个)
                </option>
              ))}
            </select>
          </div>
          
          <button
            onClick={handleExport}
            disabled={!selectedScenario || loading}
            style={{
              backgroundColor: '#3498db',
              color: '#fff',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '4px',
              cursor: selectedScenario && !loading ? 'pointer' : 'not-allowed',
              opacity: selectedScenario && !loading ? 1 : 0.5
            }}
          >
            {loading ? '导出中...' : '导出场景包'}
          </button>

          {exportPackage && (
            <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
              <h4>导出内容预览</h4>
              <pre style={{ fontSize: '0.75rem', overflow: 'auto', maxHeight: '300px' }}>
                {JSON.stringify({
                  scenario: exportPackage.scenario,
                  api_version: exportPackage.api_version?.name + ' v' + exportPackage.api_version?.version,
                  field_mappings: exportPackage.field_mappings?.length + ' 条',
                  compatibility_strategies: exportPackage.compatibility_strategies?.length + ' 条',
                  failure_injections: exportPackage.failure_injections?.length + ' 条',
                  execution_history: exportPackage.execution_history_summary?.length + ' 条',
                  has_snapshot: !!exportPackage.latest_snapshot
                }, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div>
          <h3>导入场景包</h3>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>选择JSON文件</label>
            <input
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            />
          </div>

          {importPreview && !conflicts && (
            <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#d4edda', borderRadius: '4px' }}>
              <h4>导入预览</h4>
              <p>场景: {importFile.scenario?.name}</p>
              <p>API版本: {importFile.api_version?.name} v{importFile.api_version?.version}</p>
              <p>字段映射: {importFile.field_mappings?.length || 0} 条</p>
              <p>兼容策略: {importFile.compatibility_strategies?.length || 0} 条</p>
              <p>失败注入: {importFile.failure_injections?.length || 0} 条</p>
              <p>执行历史: {importFile.execution_history_summary?.length || 0} 条</p>
              <p>包含快照: {importFile.latest_snapshot ? '是' : '否'}</p>
              <button
                onClick={handleImport}
                disabled={loading}
                style={{
                  marginTop: '1rem',
                  backgroundColor: '#28a745',
                  color: '#fff',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? '导入中...' : '确认导入'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h3>撤销最近导入</h3>
        <button
          onClick={handleRollback}
          disabled={loading}
          style={{
            backgroundColor: '#e74c3c',
            color: '#fff',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          撤销最近一次导入
        </button>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h3>导入日志</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>时间</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>来源</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>结果</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>追溯信息</th>
            </tr>
          </thead>
          <tbody>
            {importLogs.slice(0, 10).map(log => (
              <tr key={log.id} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '0.75rem' }}>{new Date(log.import_time).toLocaleString()}</td>
                <td style={{ padding: '0.75rem' }}>{log.source_package}</td>
                <td style={{ padding: '0.75rem' }}>
                  <span style={{ 
                    color: log.result === 'success' ? '#27ae60' : '#e74c3c',
                    fontWeight: '600'
                  }}>
                    {log.result === 'success' ? '成功' : '失败'}
                  </span>
                </td>
                <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                  {log.details && (
                    <div style={{ color: '#666' }}>
                      {log.details.scenario_action && (
                        <div>操作: {log.details.scenario_action === 'replace' ? '🔄 覆盖' : log.details.scenario_action === 'save_as' ? '📋 另存' : log.details.scenario_action}</div>
                      )}
                      {log.details.original_scenario_name && (
                        <div>原始场景: {log.details.original_scenario_name}</div>
                      )}
                      {log.details.restored_execution_id && (
                        <div>恢复执行ID: {log.details.restored_execution_id}</div>
                      )}
                      {log.details.restored_snapshot_id && (
                        <div>恢复快照ID: {log.details.restored_snapshot_id}</div>
                      )}
                      {log.details.replaced_scenario && (
                        <div style={{ color: '#e74c3c', marginTop: '0.25rem', padding: '0.25rem', backgroundColor: '#ffe6e6', borderRadius: '3px' }}>
                          <strong>⚠️ 被替换场景:</strong> {log.details.replaced_scenario.scenario_name}
                          <div style={{ fontSize: '0.75rem' }}>
                            执行{log.details.replaced_scenario.execution_count}次, 
                            快照{log.details.replaced_scenario.snapshot_count}个, 
                            注入{log.details.replaced_scenario.injection_count}条
                          </div>
                          {log.details.replaced_scenario.full_backup_stored && (
                            <div style={{ fontSize: '0.7rem', color: '#27ae60' }}>✓ 完整备份已归档</div>
                          )}
                        </div>
                      )}
                      {log.details.archived_scenario_id && log.details.scenario_action === 'replace' && (
                        <div style={{ fontSize: '0.75rem', color: '#666' }}>
                          归档ID: {log.details.archived_scenario_id}
                        </div>
                      )}
                      {log.details.undone_scenario_id && (
                        <div style={{ color: '#e74c3c', marginTop: '0.25rem', padding: '0.25rem', backgroundColor: '#ffe6e6', borderRadius: '3px' }}>
                          <strong>↩️ 撤销导入:</strong> {log.details.rolled_back_scenario_name}
                          {log.details.cleaned_resources_summary && (
                            <div style={{ fontSize: '0.75rem' }}>
                              清理: 执行{log.details.cleaned_resources_summary.total_executions}次, 
                              快照{log.details.cleaned_resources_summary.total_snapshots}个
                            </div>
                          )}
                        </div>
                      )}
                      {log.details.restored_from_archive && (
                        <div style={{ color: '#27ae60', marginTop: '0.25rem', padding: '0.25rem', backgroundColor: '#e6ffe6', borderRadius: '3px' }}>
                          <strong>🔄 从归档恢复:</strong> {log.details.restored_scenario_name}
                          <div style={{ fontSize: '0.75rem' }}>
                            恢复执行{log.details.restored_execution_count}次, 
                            快照{log.details.restored_snapshot_count}个
                          </div>
                        </div>
                      )}
                      {log.conflict_decisions && Object.keys(log.conflict_decisions).length > 0 && (
                        <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>
                          决策: {Object.entries(log.conflict_decisions).map(([k, v]) => `${k}=${v}`).join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showConflictModal && conflicts && (
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
            maxWidth: '600px',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <h3 style={{ marginTop: 0, color: '#e74c3c' }}>⚠️ 检测到冲突</h3>
            
            {conflicts.map((conflict, idx) => (
              <div key={idx} style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
                <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
                  {getConflictIcon(conflict.type)} {conflict.message}
                </div>
                
                {conflict.details && (
                  <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>
                    {Object.entries(conflict.details).map(([k, v]) => (
                      <div key={k}>{k}: {typeof v === 'object' ? JSON.stringify(v) : v}</div>
                    ))}
                  </div>
                )}
                
                {conflict.type === 'duplicate_name' && conflict.existing_scenario && (
                  <div style={{ fontSize: '0.875rem', color: '#856404', marginBottom: '0.5rem', padding: '0.5rem', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
                    <strong>将被替换的现有场景信息:</strong>
                    <div>ID: {conflict.existing_scenario.id}</div>
                    <div>状态: {conflict.existing_scenario.status}</div>
                    <div style={{ color: '#e74c3c' }}>⚠️ 选择"覆盖"将删除此场景及其所有关联数据</div>
                  </div>
                )}

                {conflict.type === 'has_execution_history' && conflict.details && (
                  <div style={{ fontSize: '0.875rem', color: '#856404', marginBottom: '0.5rem', padding: '0.5rem', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
                    <div>执行次数: {conflict.details.execution_count}</div>
                    <div>成功次数: {conflict.details.completed_count}</div>
                  </div>
                )}

                <div style={{ marginTop: '0.5rem' }}>
                  <label style={{ fontSize: '0.875rem', marginBottom: '0.25rem', display: 'block' }}>
                    选择处理方式:
                  </label>
                  <select
                    value={decisions[conflict.type] || ''}
                    onChange={(e) => handleDecide(conflict.type, e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
                  >
                    <option value="">请选择</option>
                    {getDecisionOptions(conflict.type).map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                onClick={() => {
                  setShowConflictModal(false);
                  setConflicts(null);
                  setDecisions({});
                }}
                style={{
                  backgroundColor: '#6c757d',
                  color: '#fff',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={handleImport}
                disabled={Object.keys(decisions).length !== conflicts.length || loading}
                style={{
                  backgroundColor: '#28a745',
                  color: '#fff',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  cursor: Object.keys(decisions).length === conflicts.length && !loading ? 'pointer' : 'not-allowed',
                  opacity: Object.keys(decisions).length === conflicts.length && !loading ? 1 : 0.5
                }}
              >
                {loading ? '处理中...' : '应用决策并继续'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScenarioPackageManager;
