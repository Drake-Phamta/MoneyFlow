const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  params: {
    get: () => ipcRenderer.invoke('params:get'),
    update: (key, value) => ipcRenderer.invoke('params:update', key, value),
  },
  assets: {
    get: () => ipcRenderer.invoke('assets:get'),
    add: (data) => ipcRenderer.invoke('assets:add', data),
    updatePrice: (id, price) => ipcRenderer.invoke('assets:updatePrice', id, price),
  },
  categories: {
    get: () => ipcRenderer.invoke('categories:get'),
  },
  phases: {
    get: () => ipcRenderer.invoke('phases:get'),
    getActive: () => ipcRenderer.invoke('phases:getActive'),
    setActive: (id) => ipcRenderer.invoke('phases:setActive', id),
    getAllocations: (phaseId) => ipcRenderer.invoke('phases:getAllocations', phaseId),
    saveAllocations: (phaseId, allocs) => ipcRenderer.invoke('phases:saveAllocations', phaseId, allocs),
  },
  monthly: {
    get: () => ipcRenderer.invoke('monthly:get'),
    save: (data) => ipcRenderer.invoke('monthly:save', data),
    delete: (id) => ipcRenderer.invoke('monthly:delete', id),
  },
  allocations: {
    get: (entryId) => ipcRenderer.invoke('allocations:get', entryId),
    getAll: () => ipcRenderer.invoke('allocations:getAll'),
    save: (entryId, allocs) => ipcRenderer.invoke('allocations:save', entryId, allocs),
    adjust: (amount) => ipcRenderer.invoke('allocations:adjust', amount),
  },
  transactions: {
    get: (limit) => ipcRenderer.invoke('transactions:get', limit),
    add: (data) => ipcRenderer.invoke('transactions:add', data),
  },
  portfolio: {
    summary: () => ipcRenderer.invoke('portfolio:summary'),
    get: () => ipcRenderer.invoke('portfolio:get'),
  },
  savings: {
    get: () => ipcRenderer.invoke('savings:get'),
    add: (data) => ipcRenderer.invoke('savings:add', data),
    update: (id, data) => ipcRenderer.invoke('savings:update', id, data),
    delete: (id) => ipcRenderer.invoke('savings:delete', id),
    addTransaction: (accountId, type, amount, date, note) =>
      ipcRenderer.invoke('savings:addTransaction', accountId, type, amount, date, note),
  },
  watchlist: {
    get: () => ipcRenderer.invoke('watchlist:get'),
    add: (data) => ipcRenderer.invoke('watchlist:add', data),
    update: (id, data) => ipcRenderer.invoke('watchlist:update', id, data),
  },
  alerts: {
    get: (unreadOnly) => ipcRenderer.invoke('alerts:get', unreadOnly),
    markRead: (id) => ipcRenderer.invoke('alerts:markRead', id),
  },
  activity: {
    get: (limit) => ipcRenderer.invoke('activity:get', limit),
  },
  timeline: {
    get: (months) => ipcRenderer.invoke('timeline:get', months),
  },
  prices: {
    refresh: () => ipcRenderer.invoke('prices:refresh'),
    history: (id, days) => ipcRenderer.invoke('prices:history', id, days),
  },
  data: {
    import: () => ipcRenderer.invoke('data:import'),
    export: () => ipcRenderer.invoke('data:export'),
  },
});
