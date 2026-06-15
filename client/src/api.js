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