import { useState, useEffect } from 'react';
import { apiVersionApi } from '../api';

const ApiVersionManager = () => {
  const [versions, setVersions] = useState([]);
  const [formData, setFormData] = useState({ name: '', version: '', base_path: '', schema: '{}' });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    loadVersions();
  }, []);

  const loadVersions = async () => {
    const res = await apiVersionApi.getAll();
    setVersions(res.data);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      JSON.parse(formData.schema);
      if (editingId) {
        await apiVersionApi.update(editingId, formData);
      } else {
        await apiVersionApi.create(formData);
      }
      setFormData({ name: '', version: '', base_path: '', schema: '{}' });
      setEditingId(null);
      loadVersions();
    } catch (err) {
      alert('Schema JSON格式错误');
    }
  };

  const handleEdit = (version) => {
    setFormData({ ...version, schema: JSON.stringify(version.schema || {}) });
    setEditingId(version.id);
  };

  const handleDelete = async (id) => {
    if (window.confirm('确定删除此API版本吗？')) {
      await apiVersionApi.delete(id);
      loadVersions();
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ maxWidth: '600px', marginBottom: '2rem' }}>
        <h2>{editingId ? '编辑API版本' : '创建API版本'}</h2>
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
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>版本号</label>
            <input
              type="text"
              value={formData.version}
              onChange={(e) => setFormData({ ...formData, version: e.target.value })}
              required
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>基础路径</label>
            <input
              type="text"
              value={formData.base_path}
              onChange={(e) => setFormData({ ...formData, base_path: e.target.value })}
              required
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Schema (JSON)</label>
            <textarea
              value={formData.schema}
              onChange={(e) => setFormData({ ...formData, schema: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd', height: '100px' }}
            />
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
        <h2>API版本列表</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>名称</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>版本</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>路径</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {versions.map(version => (
              <tr key={version.id} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '0.75rem' }}>{version.name}</td>
                <td style={{ padding: '0.75rem' }}>{version.version}</td>
                <td style={{ padding: '0.75rem' }}>{version.base_path}</td>
                <td style={{ padding: '0.75rem' }}>
                  <button
                    onClick={() => handleEdit(version)}
                    style={{ marginRight: '0.5rem', padding: '0.25rem 0.5rem', backgroundColor: '#3498db', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(version.id)}
                    style={{ padding: '0.25rem 0.5rem', backgroundColor: '#e74c3c', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ApiVersionManager;