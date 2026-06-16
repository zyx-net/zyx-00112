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

export const forensicsWorkbenchApi = {
  initialize: (data) => 
    axios.post(`${API_BASE}/forensics-workbench/initialize`, data),
  preCheck: (batchId) => 
    axios.post(`${API_BASE}/forensics-workbench/pre-check/${batchId}`),
  replaceImport: (batchId, data) => 
    axios.post(`${API_BASE}/forensics-workbench/replace-import/${batchId}`, data),
  rollback: (batchId, confirm = false) => 
    axios.post(`${API_BASE}/forensics-workbench/rollback/${batchId}${confirm ? '/confirm' : ''}`),
  restartReview: (batchId, isSimulation = true) => 
    axios.post(`${API_BASE}/forensics-workbench/restart-review/${batchId}`, { is_simulation: isSimulation }),
  reImport: (batchId, data) => 
    axios.post(`${API_BASE}/forensics-workbench/re-import/${batchId}`, data),
  getBatchById: (batchId) => 
    axios.get(`${API_BASE}/forensics-workbench/batch/${batchId}`),
  getBatchByNumber: (batchNumber) => 
    axios.get(`${API_BASE}/forensics-workbench/batch/by-number/${batchNumber}`),
  getTimeline: (batchId) => 
    axios.get(`${API_BASE}/forensics-workbench/timeline/${batchId}`),
  getBatches: (filters = {}) => 
    axios.get(`${API_BASE}/forensics-workbench/batches`, { params: filters }),
  completeBatch: (batchId) => 
    axios.post(`${API_BASE}/forensics-workbench/complete/${batchId}`),
  cancelBatch: (batchId, reason) => 
    axios.post(`${API_BASE}/forensics-workbench/cancel/${batchId}`, { reason }),
  verifyRecovery: (batchId, recoveryRecordId, notes, operator) => 
    axios.post(`${API_BASE}/forensics-workbench/verify-recovery/${batchId}/${recoveryRecordId}`, { notes, operator }),
  getConfig: () => 
    axios.get(`${API_BASE}/forensics-workbench/config`),
  getPendingBatches: () => 
    axios.get(`${API_BASE}/forensics-workbench/pending`),
  fullChain: (data) => 
    axios.post(`${API_BASE}/forensics-workbench/full-chain`, data),
  resumeBatch: (batchId) => 
    axios.post(`${API_BASE}/forensics-workbench/resume/${batchId}`),
  getBatchLog: (batchId) => 
    axios.get(`${API_BASE}/forensics-workbench/log/${batchId}`),
  setMode: (mode) => 
    axios.post(`${API_BASE}/forensics-workbench/config/mode`, { mode }),
  checkDuplicate: (data) => 
    axios.post(`${API_BASE}/forensics-workbench/check-duplicate`, data)
};

export const auditExecutionApi = {
  createBatch: (operator, scenarioId, mode = 'preview', requestInfo = {}) =>
    axios.post(`${API_BASE}/audit-execution/batches`, {
      operator,
      scenarioId,
      mode,
      ...requestInfo
    }),
  getBatches: (filters = {}) =>
    axios.get(`${API_BASE}/audit-execution/batches`, { params: filters }),
  getBatchById: (batchId) =>
    axios.get(`${API_BASE}/audit-execution/batches/${batchId}`),
  getBatchByNumber: (batchNumber) =>
    axios.get(`${API_BASE}/audit-execution/batches/by-number/${batchNumber}`),
  updateMode: (batchId, mode) =>
    axios.put(`${API_BASE}/audit-execution/batches/${batchId}/mode`, { mode }),
  runPreCheck: (batchId) =>
    axios.post(`${API_BASE}/audit-execution/batches/${batchId}/pre-check`),
  execute: (batchId) =>
    axios.post(`${API_BASE}/audit-execution/batches/${batchId}/execute`),
  completeBatch: (batchId) =>
    axios.post(`${API_BASE}/audit-execution/batches/${batchId}/complete`),
  cancelBatch: (batchId, operator) =>
    axios.post(`${API_BASE}/audit-execution/batches/${batchId}/cancel`, { operator }),
  handleConflict: (batchId, conflictType, description, decision, operator) =>
    axios.post(`${API_BASE}/audit-execution/batches/${batchId}/conflict`, {
      conflictType,
      description,
      decision,
      operator
    }),
  recover: (batchId, operator) =>
    axios.post(`${API_BASE}/audit-execution/batches/${batchId}/recover`, { operator }),
  getLogs: (batchId) =>
    axios.get(`${API_BASE}/audit-execution/batches/${batchId}/logs`),
  getTimeline: (batchId) =>
    axios.get(`${API_BASE}/audit-execution/batches/${batchId}/timeline`),
  getRecoverySuggestion: (batchId) =>
    axios.get(`${API_BASE}/audit-execution/batches/${batchId}/recovery-suggestion`),
  checkDuplicate: (scenarioId) =>
    axios.post(`${API_BASE}/audit-execution/check-duplicate`, { scenarioId }),
  checkReplay: (batchNumber) =>
    axios.post(`${API_BASE}/audit-execution/check-replay`, { batchNumber }),
  listLogs: () =>
    axios.get(`${API_BASE}/audit-execution/logs`),
  getLogFile: (batchNumber) =>
    axios.get(`${API_BASE}/audit-execution/logs/${batchNumber}`)
};