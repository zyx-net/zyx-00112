import { useState, useEffect } from 'react';
import { scenarioApi, apiVersionApi } from '../api';

const ScenarioManager = () => {
  const [scenarios, setScenarios] = useState([]);
  const [versions, setVersions] = useState([]);
  const [formData, setFormData] = useState({ name: '', description: '', api_version_id: '' });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    loadScenarios();
    loadVersions();
  }, []);

  const loadScenarios = async () => {
    const res = await scenarioApi.getAll();
    setScenarios(res.data);
  };

  const loadVersions = async () => {
    const res = await apiVersionApi.getAll();
    setVersions(res.data);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingId) {
      await scenarioApi.update(editingId, formData);
    } else {
      await scenarioApi.create(formData);
    }
    setFormData({ name: '', description: '', api_version_id: '' });
    setEditingId(null);
    loadScenarios();
  };

  const handleEdit = (scenario) => {
    setFormData(scenario);
    setEditingId(scenario.id);
  };

  const handleDelete = async (id) => {
    try {
      await scenarioApi.delete(id);
      loadScenarios();
    } catch (err) {
      alert(err.response?.data?.error || '删除失败');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return '#e67e22';
      case 'completed': return '#27ae60';
      case 'failed': return '#e74c3c';
      case 'rolled_back': return '#9b59b6';
      default: return '#95a5a6';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'running': return '运行中';
      case 'completed': return '已完成';
      case 'failed': return '失败';
      case 'rolled_back': return '已回滚';
      default: return '草稿';
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ maxWidth: '600px', marginBottom: '2rem' }}>
        <h2>{editingId ? '编辑场景' : '创建场景'}</h2>
        <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>名称</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>描述</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd', height: '80px' }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>关联API版本</label>
            <select
              value={formData.api_version_id}
              onChange={(e) => setFormData({ ...formData, api_version_id: e.target.value })}
              required
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value="">请选择</option>
              {versions.map(v => (
                <option key={v.id} value={v.id}>{v.name} v{v.version}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            style={{ backgroundColor: '#3498db', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}
          >
            {editingId ? '保存修改' : '创建'}
          </button>
        </form>
      </div>

      <div>
        <h2>场景列表</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>名称</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>描述</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>API版本</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>状态</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map(scenario => {
              const version = versions.find(v => v.id === scenario.api_version_id);
              return (
                <tr key={scenario.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '0.75rem' }}>{scenario.name}</td>
                  <td style={{ padding: '0.75rem' }}>{scenario.description}</td>
                  <td style={{ padding: '0.75rem' }}>{version ? `${version.name} v${version.version}` : '-'}</td>
                  <td style={{ padding: '0.75rem' }}>
                    <span style={{ color: getStatusColor(scenario.status), fontWeight: '600' }}>
                      {getStatusText(scenario.status)}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    <button
                      onClick={() => handleEdit(scenario)}
                      style={{ marginRight: '0.5rem', padding: '0.25rem 0.5rem', backgroundColor: '#3498db', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(scenario.id)}
                      style={{ padding: '0.25rem 0.5rem', backgroundColor: '#e74c3c', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ScenarioManager;