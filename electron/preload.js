const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  params: {
    get: () => ipcRenderer.invoke('params:get'),
    update: (k, v) => ipcRenderer.invoke('params:update', k, v),
    avgExpense: () => ipcRenderer.invoke('params:avgExpense'),
    recalcGoals: () => ipcRenderer.invoke('params:recalcGoals'),
  },
  timeline: {
    regenerate: (totalMonths, startMonth, startYear) => ipcRenderer.invoke('timeline:regenerate', totalMonths, startMonth, startYear),
  },
  assets: {
    get: () => ipcRenderer.invoke('assets:get'),
    add: (data) => ipcRenderer.invoke('assets:add', data),
    update: (id, data) => ipcRenderer.invoke('assets:update', id, data),
    updatePrice: (id, price) => ipcRenderer.invoke('assets:updatePrice', id, price),
    setTracked: (id, tracked) => ipcRenderer.invoke('assets:setTracked', id, tracked),
    delete: (id) => ipcRenderer.invoke('assets:delete', id),
  },
  categories: {
    get: () => ipcRenderer.invoke('categories:get'),
  },
  phases: {
    get: () => ipcRenderer.invoke('phases:get'),
    active: () => ipcRenderer.invoke('phases:active'),
    setActive: (id) => ipcRenderer.invoke('phases:setActive', id),
    allocations: (phaseId) => ipcRenderer.invoke('phases:allocations', phaseId),
    updateAllocations: (phaseId, allocs) => ipcRenderer.invoke('phases:updateAllocations', phaseId, allocs),
    checklist: () => ipcRenderer.invoke('phases:checklist'),
  },
  monthly: {
    getAll: () => ipcRenderer.invoke('monthly:getAll'),
    get: (idx) => ipcRenderer.invoke('monthly:get', idx),
    filled: () => ipcRenderer.invoke('monthly:filled'),
    next: () => ipcRenderer.invoke('monthly:next'),
    save: (data) => ipcRenderer.invoke('monthly:save', data),
    delete: (monthIndex) => ipcRenderer.invoke('monthly:delete', monthIndex),
  },
  allocations: {
    get: (entryId) => ipcRenderer.invoke('allocations:get', entryId),
    all: () => ipcRenderer.invoke('allocations:all'),
    save: (entryId, allocs) => ipcRenderer.invoke('allocations:save', entryId, allocs),
    adjust: (discrepancyAmount, categoryId, reason, date) => ipcRenderer.invoke('allocations:adjust', discrepancyAmount, categoryId, reason, date),
    discrepancies: () => ipcRenderer.invoke('allocations:discrepancies'),
  },
  transactions: {
    get: () => ipcRenderer.invoke('transactions:get'),
    add: (data) => ipcRenderer.invoke('transactions:add', data),
    delete: (id) => ipcRenderer.invoke('transactions:delete', id),
  },
  portfolio: {
    get: () => ipcRenderer.invoke('portfolio:get'),
    summary: () => ipcRenderer.invoke('portfolio:summary'),
  },
  activity: {
    get: (limit) => ipcRenderer.invoke('activity:get', limit),
    delete: (id) => ipcRenderer.invoke('activity:delete', id),
  },
  importExcel: (filePath) => ipcRenderer.invoke('import:excel', filePath),
  exportExcel: (filePath) => ipcRenderer.invoke('export:excel', filePath),
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: () => ipcRenderer.invoke('dialog:saveFile'),
  watchlist: {
    get: () => ipcRenderer.invoke('watchlist:get'),
    add: (data) => ipcRenderer.invoke('watchlist:add', data),
    update: (id, data) => ipcRenderer.invoke('watchlist:update', id, data),
    remove: (id) => ipcRenderer.invoke('watchlist:remove', id),
  },
  catalog: {
    get: (assetClass, search) => ipcRenderer.invoke('catalog:get', assetClass, search),
  },
  alerts: {
    get: (unreadOnly) => ipcRenderer.invoke('alerts:get', unreadOnly),
    count: () => ipcRenderer.invoke('alerts:count'),
    markRead: (id) => ipcRenderer.invoke('alerts:markRead', id),
    markAllRead: () => ipcRenderer.invoke('alerts:markAllRead'),
  },
  priceHistory: {
    get: (assetId, days) => ipcRenderer.invoke('priceHistory:get', assetId, days),
    fetch: (assetId, days) => ipcRenderer.invoke('priceHistory:fetch', assetId, days),
  },
  prices: {
    refresh: () => ipcRenderer.invoke('prices:refresh'),
  },
  data: {
    stats: () => ipcRenderer.invoke('data:stats'),
    clearTransactions: () => ipcRenderer.invoke('data:clearTransactions'),
    clearMonthly: () => ipcRenderer.invoke('data:clearMonthly'),
    clearAll: () => ipcRenderer.invoke('data:clearAll'),
    clearSavings: () => ipcRenderer.invoke('data:clearSavings'),
  },
  savings: {
    get: () => ipcRenderer.invoke('savings:get'),
    getById: (id) => ipcRenderer.invoke('savings:getById', id),
    add: (data) => ipcRenderer.invoke('savings:add', data),
    update: (id, data) => ipcRenderer.invoke('savings:update', id, data),
    delete: (id) => ipcRenderer.invoke('savings:delete', id),
    addTransaction: (accountId, type, amount, date, note) => ipcRenderer.invoke('savings:addTransaction', accountId, type, amount, date, note),
    deleteTransaction: (id) => ipcRenderer.invoke('savings:deleteTransaction', id),
    updateTransactionDate: (id, date) => ipcRenderer.invoke('savings:updateTransactionDate', id, date),
    summary: () => ipcRenderer.invoke('savings:summary'),
    overview: () => ipcRenderer.invoke('savings:overview'),
    maturities: (days) => ipcRenderer.invoke('savings:maturities', days),
    processMatured: () => ipcRenderer.invoke('savings:processMatured'),
  },
});
