const BASE = '/api';

async function request(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

const get = (path) => request('GET', path);
const post = (path, body) => request('POST', path, body);
const put = (path, body) => request('PUT', path, body);
const del = (path) => request('DELETE', path);

export const api = {
  snapshot: {
    get: () => get('/snapshot'),
  },
  params: {
    get: () => get('/params'),
    update: (key, value) => put('/params', { key, value }),
    avgExpense: () => get('/params/avg-expense'),
    recalcGoals: () => post('/params/recalc-goals'),
  },
  timeline: {
    regenerate: (totalMonths, startMonth, startYear) =>
      post('/timeline/regenerate', { totalMonths, startMonth, startYear }),
  },
  assets: {
    get: () => get('/assets'),
    add: (data) => post('/assets', data),
    update: (id, data) => put(`/assets/${id}`, data),
    updatePrice: (id, price) => put(`/assets/${id}/price`, { price }),
    setTracked: (id, tracked) => put(`/assets/${id}/tracked`, { tracked }),
    delete: (id) => del(`/assets/${id}`),
  },
  catalog: {
    get: (assetClass, search) => get(`/catalog?class=${assetClass || ''}&search=${search || ''}`),
  },
  categories: { get: () => get('/categories') },
  phases: {
    get: () => get('/phases'),
    active: () => get('/phases/active'),
    setActive: (id) => post(`/phases/${id}/active`),
    allocations: (phaseId) => get(`/phases/${phaseId}/allocations`),
    updateAllocations: (phaseId, allocs) => post(`/phases/${phaseId}/allocations`, { allocations: allocs }),
    checklist: () => get('/phases/checklist'),
  },
  monthly: {
    getAll: () => get('/monthly'),
    get: (idx) => get(`/monthly/${idx}`),
    filled: () => get('/monthly/filled'),
    next: () => get('/monthly/next'),
    save: (data) => post('/monthly', data),
    delete: (monthIndex) => del(`/monthly/${monthIndex}`),
  },
  allocations: {
    get: (entryId) => get(`/allocations/${entryId}`),
    all: () => get('/allocations/all'),
    save: (entryId, allocs) => post(`/allocations/${entryId}`, { allocations: allocs }),
    adjust: (discrepancyAmount, categoryId, reason, date) => post('/allocations/adjust', { discrepancyAmount, categoryId, reason, date }),
    discrepancies: () => get('/allocations/discrepancies'),
  },
  transactions: {
    get: () => get('/transactions'),
    add: (data) => post('/transactions', data),
    delete: (id) => del(`/transactions/${id}`),
  },
  portfolio: {
    get: () => get('/portfolio'),
    summary: () => get('/portfolio/summary'),
  },
  activity: {
    get: (limit) => get(`/activity?limit=${limit || 20}`),
    delete: (id) => del(`/activity/${id}`),
  },
  watchlist: {
    get: () => get('/watchlist'),
    add: (data) => post('/watchlist', data),
    update: (id, data) => put(`/watchlist/${id}`, data),
    remove: (id) => del(`/watchlist/${id}`),
  },
  alerts: {
    get: (unreadOnly) => get(`/alerts${unreadOnly ? '?unread=true' : ''}`),
    count: () => get('/alerts/count'),
    markRead: (id) => put(`/alerts/${id}/read`),
    markAllRead: () => put('/alerts/read-all'),
  },
  priceHistory: {
    get: (assetId, days) => get(`/price-history/${assetId}?days=${days || 30}`),
    fetch: (assetId, days) => post(`/price-history/${assetId}/fetch?days=${days || 365}`),
  },
  prices: {
    refresh: () => post('/prices/refresh'),
  },
  data: {
    stats: () => get('/data/stats'),
    clearTransactions: () => del('/data/transactions'),
    clearMonthly: () => del('/data/monthly'),
    clearAll: () => del('/data/all'),
    clearSavings: () => del('/data/savings'),
  },
  savings: {
    get: () => get('/savings'),
    getById: (id) => get(`/savings/${id}`),
    add: (data) => post('/savings', data),
    update: (id, data) => put(`/savings/${id}`, data),
    delete: (id) => del(`/savings/${id}`),
    addTransaction: (accountId, type, amount, date, note) =>
      post(`/savings/${accountId}/transactions`, { type, amount, date, note }),
    deleteTransaction: (id) => del(`/savings/transactions/${id}`),
    updateTransactionDate: (id, date) => put(`/savings/transactions/${id}/date`, { date }),
    summary: () => get('/savings/summary'),
    overview: () => get('/savings/overview'),
    maturities: (days) => get(`/savings/maturities?days=${days || 30}`),
    processMatured: () => post('/savings/process-matured'),
  },
  importExcel: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE}/import/excel`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error('Import failed');
    return res.json();
  },
  exportExcel: async () => {
    const res = await fetch(`${BASE}/export/excel`);
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'MoneyFlow_Data.xlsx';
    a.click();
    URL.revokeObjectURL(url);
    return true;
  },
};
