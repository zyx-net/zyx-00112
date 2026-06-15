import { useState, useEffect } from 'react';
import { injectionApi, scenarioApi } from '../api';

const FailureInjectionManager = () => {
  const [injections, setInjections] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [formData, setFormData] = useState({ scenario_id: '', type: 'network_delay', probability: 0.5, config: '{}', enabled: false });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    loadInjections();
    loadScenarios();
  }, []);

  const loadInjections = async () => {
    const res = await injectionApi.getAll();
    setInjections(res.data);
  };

  const loadScenarios = async () => {
    const res = await scenarioApi.getAll();
    setScenarios(res.data);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      JSON.parse(formData.config);
      if (editingId) {
        await injectionApi.update(editingId, formData);
      } else {
        await injectionApi.create(formData);
      }
      setFormData({ scenario_id: '', type: 'network_delay', probability: 0.5, config: '{}', enabled: false });
      setEditingId(null);
      loadInjections();
    } catch (err) {
      alert('Config JSON格式错误');
    }
  };

  const handleEdit = (injection) => {
    setFormData({ ...injection, config: JSON.stringify(injection.config) });
    setEditingId(injection.id);
  };

  const handleDelete = async (id) => {
    await injectionApi.delete(id);
    loadInjections();
  };

  const injectionTypes = [
    { value: 'network_delay', label: '网络延迟' },
    { value: 'error_response', label: '错误响应' },
    { value: 'timeout', label: '超时' },
    { value: 'data_corruption', label: '数据损坏' }
  ];

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ maxWidth: '600px', marginBottom: '2rem' }}>
        <h2>{editingId ? '编辑失败注入' : '创建失败注入'}</h2>
        <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>关联场景</label>
            <select
              value={formData.scenario_id}
              onChange={(e) => setFormData({ ...formData, scenario_id: e.target.value })}
              required
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <option value="">请选择场景</option>
              {scenarios.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>注入类型</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              {injectionTypes.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>触发概率 (0-1)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={formData.probability}
              onChange={(e) => setFormData({ ...formData, probability: parseFloat(e.target.value) })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>配置 (JSON)</label>
            <textarea
              value={formData.config}
              onChange={(e) => setFormData({ ...formData, config: e.target.value })}
              placeholder='{"delay": 1000} 或 {"statusCode": 500, "message": "模拟错误"}'
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd', height: '100px' }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                style={{ marginRight: '0.5rem' }}
              />
              启用
            </label>
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
        <h2>失败注入列表</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>场景</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>类型</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>概率</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>启用</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {injections.map(injection => {
              const scenario = scenarios.find(s => s.id === injection.scenario_id);
              const typeLabel = injectionTypes.find(t => t.value === injection.type)?.label || injection.type;
              return (
                <tr key={injection.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '0.75rem' }}>{scenario?.name || '-'}</td>
                  <td style={{ padding: '0.75rem' }}>{typeLabel}</td>
                  <td style={{ padding: '0.75rem' }}>{(injection.probability * 100).toFixed(0)}%</td>
                  <td style={{ padding: '0.75rem' }}>
                    <span style={{ color: injection.enabled ? '#27ae60' : '#95a5a6', fontWeight: '600' }}>
                      {injection.enabled ? '是' : '否'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    <button
                      onClick={() => handleEdit(injection)}
                      style={{ marginRight: '0.5rem', padding: '0.25rem 0.5rem', backgroundColor: '#3498db', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(injection.id)}
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

export default FailureInjectionManager;