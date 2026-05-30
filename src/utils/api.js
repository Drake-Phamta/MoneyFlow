const BASE = '/api';

async function request(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + url, opts);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

const get = (url) => request('GET', url);
const post = (url, body) => request('POST', url, body);
const put = (url, body) => request('PUT', url, body);
const del = (url) => request('DELETE', url);

export const restApi = {
  params: {
    get: () => get('/params'),
    update: (key, value) => put(`/params/${key}`, { value }),
  },
  assets: {
    get: () => get('/assets'),
    add: (data) => post('/assets', data),
    updatePrice: (id, price) => put(`/assets/${id}/price`, { price }),
  },
  categories: { get: () => get('/categories') },
  phases: {
    get: () => get('/phases'),
    getActive: () => get('/phases/active'),
    setActive: (id) => put(`/phases/${id}/activate`),
    getAllocations: (phaseId) => get(`/phases/${phaseId}/allocations`),
    saveAllocations: (phaseId, allocs) => post(`/phases/${phaseId}/allocations`, allocs),
  },
  monthly: {
    get: () => get('/monthly'),
    save: (data) => post('/monthly', data),
    delete: (id) => del(`/monthly/${id}`),
  },
  allocations: {
    get: (entryId) => get(`/allocations/${entryId}`),
    getAll: () => get('/allocations/all'),
    save: (entryId, allocs) => post(`/allocations/${entryId}`, allocs),
    adjust: (amount) => post('/allocations/adjust', { discrepancyAmount: amount }),
  },
  transactions: {
    get: (limit) => get(`/transactions?limit=${limit || 100}`),
    add: (data) => post('/transactions', data),
  },
  portfolio: {
    summary: () => get('/portfolio/summary'),
    get: () => get('/portfolio'),
  },
  savings: {
    get: () => get('/savings'),
    add: (data) => post('/savings', data),
    update: (id, data) => put(`/savings/${id}`, data),
    delete: (id) => del(`/savings/${id}`),
    addTransaction: (id, type, amount, date, note) => post(`/savings/${id}/transactions`, { type, amount, date, note }),
  },
  watchlist: {
    get: () => get('/watchlist'),
    add: (data) => post('/watchlist', data),
    update: (id, data) => put(`/watchlist/${id}`, data),
  },
  alerts: {
    get: (unread) => get(`/alerts?unread=${unread || false}`),
    markRead: (id) => put(`/alerts/${id}/read`),
  },
  activity: { get: (limit) => get(`/activity?limit=${limit || 20}`) },
  timeline: { get: (months) => get(`/timeline?months=${months || 12}`) },
  prices: {
    refresh: () => post('/prices/refresh'),
    history: (id, days) => get(`/prices/history/${id}?days=${days || 30}`),
  },
  data: {
    importExcel: async (file) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(BASE + '/data/import', { method: 'POST', body: fd });
      return res.json();
    },
    exportExcel: () => BASE + '/data/export',
  },
};
