import axios from 'axios';

const API_BASE = '/api';

export const apiVersionApi = {
  getAll: () => axios.get(`${API_BASE}/versions`),
  getById: (id) => axios.get(`${API_BASE}/versions/${id}`),
  create: (data) => axios.post(`${API_BASE}/versions`, data),
  update: (id, data) => axios.put(`${API_BASE}/versions/${id}`, data),
  delete: (id) => axios.delete(`${API_BASE}/versions/${id}`)
};

export const scenarioApi = {
  getAll: () => axios.get(`${API_BASE}/scenarios`),
  getById: (id) => axios.get(`${API_BASE}/scenarios/${id}`),
  create: (data) => axios.post(`${API_BASE}/scenarios`, data),
  update: (id, data) => axios.put(`${API_BASE}/scenarios/${id}`, data),
  delete: (id) => axios.delete(`${API_BASE}/scenarios/${id}`)
};

export const executionApi = {
  getAll: () => axios.get(`${API_BASE}/executions`),
  getById: (id) => axios.get(`${API_BASE}/executions/${id}`),
  getByScenarioId: (scenarioId) => axios.get(`${API_BASE}/executions/scenario/${scenarioId}`),
  execute: (scenarioId) => axios.post(`${API_BASE}/executions/execute/${scenarioId}`),
  getStatus: (scenarioId) => axios.get(`${API_BASE}/executions/status/${scenarioId}`)
};

export const rollbackApi = {
  rollback: (scenarioId) => axios.post(`${API_BASE}/rollback/${scenarioId}`),
  getHistory: (scenarioId) => axios.get(`${API_BASE}/rollback/history/${scenarioId}`),
  export: (scenarioId) => axios.get(`${API_BASE}/rollback/export/${scenarioId}`)
};

export const injectionApi = {
  getAll: () => axios.get(`${API_BASE}/injections`),
  getByScenarioId: (scenarioId) => axios.get(`${API_BASE}/injections/scenario/${scenarioId}`),
  create: (data) => axios.post(`${API_BASE}/injections`, data),
  update: (id, data) => axios.put(`${API_BASE}/injections/${id}`, data),
  delete: (id) => axios.delete(`${API_BASE}/injections/${id}`)
};

export const scenarioPackageApi = {
  export: (scenarioId) => axios.post(`${API_BASE}/scenario-packages/export/${scenarioId}`),
  checkConflicts: (packageData, forceScenarioName) => 
    axios.post(`${API_BASE}/scenario-packages/check-conflicts`, { 
      package_data: packageData, 
      force_scenario_name: forceScenarioName 
    }),
  import: (packageData, decisions) => 
    axios.post(`${API_BASE}/scenario-packages/import`, { 
      package_data: packageData, 
      decisions 
    }),
  preview: (packageData) => 
    axios.post(`${API_BASE}/scenario-packages/import/preview`, { 
      package_data: packageData 
    }),
  getImportLogs: () => axios.get(`${API_BASE}/scenario-packages/import-logs`),
  getLatestImportLog: () => axios.get(`${API_BASE}/scenario-packages/import-logs/latest`),
  rollback: () => axios.post(`${API_BASE}/scenario-packages/rollback`),
  getScenariosWithHistory: () => axios.get(`${API_BASE}/scenario-packages/scenarios-with-history`)
};

export const auditCenterApi = {
  getBatches: (limit = 100, offset = 0) => 
    axios.get(`${API_BASE}/audit-center/batches`, { params: { limit, offset } }),
  getBatchById: (batchId) => axios.get(`${API_BASE}/audit-center/batches/${batchId}`),
  getBatchReport: (batchId) => axios.get(`${API_BASE}/audit-center/batches/${batchId}/report`),
  getSnapshotVersions: (scenarioId) => 
    axios.get(`${API_BASE}/audit-center/snapshot-versions/${scenarioId}`),
  getReplacedSnapshots: (batchId) => 
    axios.get(`${API_BASE}/audit-center/replaced-snapshots/${batchId}`),
  getRollbackChanges: (batchId) => 
    axios.get(`${API_BASE}/audit-center/rollback-changes/${batchId}`),
  getRestartReviews: (batchId) => 
    axios.get(`${API_BASE}/audit-center/restart-reviews/${batchId}`),
  performSimulation: (batchId, scenarioId) => 
    axios.post(`${API_BASE}/audit-center/restart-reviews/${batchId}/simulation/${scenarioId}`),
  performRealRestart: (batchId, scenarioId, operator) => 
    axios.post(`${API_BASE}/audit-center/restart-reviews/${batchId}/real-restart/${scenarioId}`, { operator }),
  createBatch: (operator, scenarioAction, executionHistoryAction, metadata) =>
    axios.post(`${API_BASE}/audit-center/batches`, {
      operator,
      scenario_action: scenarioAction,
      execution_history_action: executionHistoryAction,
      metadata
    }),
  completeBatch: (batchId, success = true) =>
    axios.post(`${API_BASE}/audit-center/complete-batch/${batchId}`, { success })
};