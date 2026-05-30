const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const cron = require('node-cron');
const Database = require('./database');
const PriceService = require('./priceService');

let mainWindow;
let db;
let server;
let priceService;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1000, minHeight: 700,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    title: 'Money_Flow',
  });
  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    startExpressServer().then(port => {
      mainWindow.loadURL(`http://localhost:${port}`);
    });
  }
}

function startExpressServer() {
  return new Promise((resolve) => {
    const app2 = express();
    const upload = multer({ storage: multer.memoryStorage() });
    app2.use(cors());
    app2.use(express.json());
    app2.use(express.static(path.join(__dirname, '../dist')));

    // Parameters
    app2.get('/api/params', (req, res) => { try { res.json(db.getParameters()); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.put('/api/params', (req, res) => { try { db.updateParameter(req.body.key, req.body.value); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.get('/api/params/avg-expense', (req, res) => { try { res.json(db.getAverageExpense()); } catch (e) { res.status(500).json({ error: e.message }); } });

    // Timeline
    app2.post('/api/timeline/regenerate', (req, res) => { try { db.regenerateTimeline(req.body.totalMonths, req.body.startMonth, req.body.startYear); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });

    // Assets
    app2.get('/api/assets', (req, res) => { try { res.json(db.getAssetTypes()); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.post('/api/assets', (req, res) => { try { res.json(db.addAssetType(req.body)); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.put('/api/assets/:id/price', (req, res) => { try { db.updateAssetPrice(parseInt(req.params.id), req.body.price); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });

    // Categories
    app2.get('/api/categories', (req, res) => { try { res.json(db.getCategories()); } catch (e) { res.status(500).json({ error: e.message }); } });

    // Phases
    app2.get('/api/phases', (req, res) => { try { res.json(db.getPhases()); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.get('/api/phases/active', (req, res) => { try { res.json(db.getActivePhase()); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.get('/api/phases/:id/allocations', (req, res) => { try { res.json(db.getPhaseAllocations(parseInt(req.params.id))); } catch (e) { res.status(500).json({ error: e.message }); } });

    // Monthly
    app2.get('/api/monthly', (req, res) => { try { res.json(db.getMonthlyEntries()); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.get('/api/monthly/filled', (req, res) => { try { res.json(db.getFilledMonths()); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.get('/api/monthly/next', (req, res) => { try { res.json(db.getNextUnfilledMonth()); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.get('/api/monthly/:index', (req, res) => { try { res.json(db.getMonthlyEntry(parseInt(req.params.index))); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.post('/api/monthly', (req, res) => { try { db.saveMonthlyEntry(req.body); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.delete('/api/monthly/:index', (req, res) => { try { db.deleteMonthlyEntry(parseInt(req.params.index)); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });

    // Allocations
    app2.get('/api/allocations/:entryId', (req, res) => { try { res.json(db.getAllocations(parseInt(req.params.entryId))); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.post('/api/allocations/adjust', (req, res) => { try { db.adjustInvestmentAllocation(req.body.discrepancyAmount); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.post('/api/allocations/:entryId', (req, res) => { try { db.saveAllocations(parseInt(req.params.entryId), req.body.allocations); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });

    // Transactions
    app2.get('/api/transactions', (req, res) => { try { res.json(db.getTransactions()); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.post('/api/transactions', (req, res) => { try { res.json(db.addTransaction(req.body)); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.delete('/api/transactions/:id', (req, res) => { try { db.deleteTransaction(parseInt(req.params.id)); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });

    // Portfolio
    app2.get('/api/portfolio', (req, res) => { try { res.json(db.getPortfolio()); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.get('/api/portfolio/summary', (req, res) => { try { res.json(db.getPortfolioSummary()); } catch (e) { res.status(500).json({ error: e.message }); } });

    // Activity
    app2.get('/api/activity', (req, res) => { try { res.json(db.getActivityLog(parseInt(req.query.limit) || 20)); } catch (e) { res.status(500).json({ error: e.message }); } });

    // Data management
    app2.get('/api/data/stats', (req, res) => { try { res.json(db.getStats()); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.delete('/api/data/transactions', (req, res) => { try { db.clearTransactions(); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.delete('/api/data/monthly', (req, res) => { try { db.clearMonthlyEntries(); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.delete('/api/data/all', (req, res) => { try { db.clearAll(); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });

    // Import/Export
    app2.post('/api/import/excel', upload.single('file'), (req, res) => { try { if (!req.file) return res.status(400).json({ error: 'No file' }); res.json(db.importExcelBuffer(req.file.buffer)); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.get('/api/export/excel', (req, res) => { try { const buf = db.exportExcelBuffer(); res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', 'attachment; filename="MoneyFlow_Data.xlsx"'); res.send(Buffer.from(buf)); } catch (e) { res.status(500).json({ error: e.message }); } });

    // Watchlist
    app2.get('/api/watchlist', (req, res) => { try { res.json(db.getWatchlist()); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.post('/api/watchlist', (req, res) => { try { res.json(db.addWatchlistItem(req.body)); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.put('/api/watchlist/:id', (req, res) => { try { db.updateWatchlistItem(parseInt(req.params.id), req.body); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.delete('/api/watchlist/:id', (req, res) => { try { db.removeWatchlistItem(parseInt(req.params.id)); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });

    // Alerts
    app2.get('/api/alerts', (req, res) => { try { const unread = req.query.unread === 'true'; res.json(db.getAlerts(unread)); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.get('/api/alerts/count', (req, res) => { try { res.json({ count: db.getUnreadAlertCount() }); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.put('/api/alerts/:id/read', (req, res) => { try { db.markAlertRead(parseInt(req.params.id)); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.put('/api/alerts/read-all', (req, res) => { try { db.markAllAlertsRead(); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });

    // Price history & refresh
    app2.get('/api/price-history/:assetId', (req, res) => { try { res.json(db.getPriceHistory(parseInt(req.params.assetId), parseInt(req.query.days) || 30)); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.post('/api/prices/refresh', async (req, res) => { try { const results = await priceService.fetchAllWatchlistPrices(); const alerts = priceService.generateAlerts(); res.json({ fetched: results.length, alerts: alerts.length, results }); } catch (e) { res.status(500).json({ error: e.message }); } });

    // Catalog
    app2.get('/api/catalog', (req, res) => { try { res.json(db.getAssetCatalog(req.query.class || null, req.query.search || null)); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.put('/api/assets/:id/tracked', (req, res) => { try { db.setTracked(parseInt(req.params.id), req.body.tracked); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });

    // Savings
    app2.get('/api/savings', (req, res) => { try { res.json(db.getSavingsAccounts()); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.get('/api/savings/summary', (req, res) => { try { res.json(db.getSavingsSummary()); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.get('/api/savings/maturities', (req, res) => { try { res.json(db.getUpcomingMaturities(parseInt(req.query.days) || 30)); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.get('/api/savings/:id', (req, res) => { try { res.json(db.getSavingsAccount(parseInt(req.params.id))); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.post('/api/savings', (req, res) => { try { res.json(db.addSavingsAccount(req.body)); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.put('/api/savings/:id', (req, res) => { try { db.updateSavingsAccount(parseInt(req.params.id), req.body); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.delete('/api/savings/:id', (req, res) => { try { db.deleteSavingsAccount(parseInt(req.params.id)); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.post('/api/savings/:id/transactions', (req, res) => { try { res.json(db.addSavingsTransaction(parseInt(req.params.id), req.body.type, req.body.amount, req.body.date, req.body.note)); } catch (e) { res.status(500).json({ error: e.message }); } });
    app2.post('/api/savings/process-matured', (req, res) => { try { res.json(db.processMaturedAccounts()); } catch (e) { res.status(500).json({ error: e.message }); } });

    // SPA fallback
    app2.get('*', (req, res) => { res.sendFile(path.join(__dirname, '../dist', 'index.html')); });

    server = app2.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

app.whenReady().then(async () => {
  db = new Database();
  await db.ready;
  priceService = new PriceService(db);

  // Auto-fetch prices every 30 min during VN trading hours (Mon-Fri, 9:00-15:00)
  cron.schedule('*/30 9-14 * * 1-5', async () => {
    try {
      console.log('[Cron] Fetching watchlist prices...');
      await priceService.fetchAllWatchlistPrices();
      priceService.generateAlerts();
    } catch (err) {
      console.error('[Cron] Price fetch error:', err.message);
    }
  }, { timezone: 'Asia/Ho_Chi_Minh' });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (db) db.close(); if (process.platform !== 'darwin') app.quit(); });

async function ready() { if (db?.ready) await db.ready; }

// Parameters
ipcMain.handle('params:get', async () => { await ready(); return db.getParameters(); });
ipcMain.handle('params:update', async (_, k, v) => { await ready(); db.updateParameter(k, v); return true; });
ipcMain.handle('params:avgExpense', async () => { await ready(); return db.getAverageExpense(); });
ipcMain.handle('params:recalcGoals', async () => { await ready(); db.recalculateAllPhaseGoals(); return true; });

// Asset Types
ipcMain.handle('assets:get', async () => { await ready(); return db.getAssetTypes(); });
ipcMain.handle('assets:add', async (_, data) => { await ready(); return db.addAssetType(data); });
ipcMain.handle('assets:updatePrice', async (_, id, price) => { await ready(); db.updateAssetPrice(id, price); return true; });

// Timeline
ipcMain.handle('timeline:regenerate', async (_, totalMonths, startMonth, startYear) => { await ready(); db.regenerateTimeline(totalMonths, startMonth, startYear); return true; });

// Categories
ipcMain.handle('categories:get', async () => { await ready(); return db.getCategories(); });

// Phases
ipcMain.handle('phases:get', async () => { await ready(); return db.getPhases(); });
ipcMain.handle('phases:active', async () => { await ready(); return db.getActivePhase(); });
ipcMain.handle('phases:setActive', async (_, id) => { await ready(); db.setActivePhase(id); return true; });
ipcMain.handle('phases:allocations', async (_, phaseId) => { await ready(); return db.getPhaseAllocations(phaseId); });
ipcMain.handle('phases:updateAllocations', async (_, phaseId, allocs) => { await ready(); db.updatePhaseAllocations(phaseId, allocs); return true; });

// Monthly Entries
ipcMain.handle('monthly:getAll', async () => { await ready(); return db.getMonthlyEntries(); });
ipcMain.handle('monthly:get', async (_, idx) => { await ready(); return db.getMonthlyEntry(idx); });
ipcMain.handle('monthly:filled', async () => { await ready(); return db.getFilledMonths(); });
ipcMain.handle('monthly:next', async () => { await ready(); return db.getNextUnfilledMonth(); });
ipcMain.handle('monthly:save', async (_, data) => { await ready(); db.saveMonthlyEntry(data); return true; });
ipcMain.handle('monthly:delete', async (_, monthIndex) => { await ready(); db.deleteMonthlyEntry(monthIndex); return true; });

// Allocations
ipcMain.handle('allocations:get', async (_, entryId) => { await ready(); return db.getAllocations(entryId); });
ipcMain.handle('allocations:save', async (_, entryId, allocs) => { await ready(); db.saveAllocations(entryId, allocs); return true; });
ipcMain.handle('allocations:adjust', async (_, discrepancyAmount) => { await ready(); db.adjustInvestmentAllocation(discrepancyAmount); return true; });

// Transactions
ipcMain.handle('transactions:get', async () => { await ready(); return db.getTransactions(); });
ipcMain.handle('transactions:add', async (_, data) => { await ready(); return db.addTransaction(data); });
ipcMain.handle('transactions:delete', async (_, id) => { await ready(); db.deleteTransaction(id); return true; });

// Portfolio
ipcMain.handle('portfolio:get', async () => { await ready(); return db.getPortfolio(); });
ipcMain.handle('portfolio:summary', async () => { await ready(); return db.getPortfolioSummary(); });

// Activity
ipcMain.handle('activity:get', async (_, limit) => { await ready(); return db.getActivityLog(limit); });

// Import/Export
ipcMain.handle('import:excel', async (_, filePath) => { await ready(); return db.importExcel(filePath); });
ipcMain.handle('export:excel', async (_, filePath) => { await ready(); return db.exportExcel(filePath); });
// Data management
ipcMain.handle('data:stats', async () => { await ready(); return db.getStats(); });
ipcMain.handle('data:clearTransactions', async () => { await ready(); db.clearTransactions(); return true; });
ipcMain.handle('data:clearMonthly', async () => { await ready(); db.clearMonthlyEntries(); return true; });
ipcMain.handle('data:clearAll', async () => { await ready(); db.clearAll(); return true; });
ipcMain.handle('data:clearSavings', async () => { await ready(); db.clearSavings(); return true; });

ipcMain.handle('dialog:openFile', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }],
  });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog:saveFile', async () => {
  const r = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'MoneyFlow_Data.xlsx',
    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
  });
  return r.canceled ? null : r.filePath;
});

// Watchlist
ipcMain.handle('watchlist:get', async () => { await ready(); return db.getWatchlist(); });
ipcMain.handle('watchlist:add', async (_, data) => { await ready(); return db.addWatchlistItem(data); });
ipcMain.handle('watchlist:update', async (_, id, data) => { await ready(); db.updateWatchlistItem(id, data); return true; });
ipcMain.handle('watchlist:remove', async (_, id) => { await ready(); db.removeWatchlistItem(id); return true; });

// Alerts
ipcMain.handle('alerts:get', async (_, unreadOnly) => { await ready(); return db.getAlerts(unreadOnly); });
ipcMain.handle('alerts:count', async () => { await ready(); return { count: db.getUnreadAlertCount() }; });
ipcMain.handle('alerts:markRead', async (_, id) => { await ready(); db.markAlertRead(id); return true; });
ipcMain.handle('alerts:markAllRead', async () => { await ready(); db.markAllAlertsRead(); return true; });

// Price history & refresh
ipcMain.handle('priceHistory:get', async (_, assetId, days) => { await ready(); return db.getPriceHistory(assetId, days || 30); });
ipcMain.handle('prices:refresh', async () => {
  await ready();
  const results = await priceService.fetchAllWatchlistPrices();
  const alerts = priceService.generateAlerts();
  return { fetched: results.length, alerts: alerts.length, results };
});

// Catalog
ipcMain.handle('catalog:get', async (_, assetClass, search) => { await ready(); return db.getAssetCatalog(assetClass, search); });
ipcMain.handle('assets:setTracked', async (_, id, tracked) => { await ready(); db.setTracked(id, tracked); return true; });
ipcMain.handle('assets:delete', async (_, id) => { await ready(); db.deleteAsset(id); return true; });

// Savings
ipcMain.handle('savings:get', async () => { await ready(); return db.getSavingsAccounts(); });
ipcMain.handle('savings:getById', async (_, id) => { await ready(); return db.getSavingsAccount(id); });
ipcMain.handle('savings:add', async (_, data) => { await ready(); return db.addSavingsAccount(data); });
ipcMain.handle('savings:update', async (_, id, data) => { await ready(); db.updateSavingsAccount(id, data); return true; });
ipcMain.handle('savings:delete', async (_, id) => { await ready(); db.deleteSavingsAccount(id); return true; });
ipcMain.handle('savings:addTransaction', async (_, accountId, type, amount, date, note) => { await ready(); return db.addSavingsTransaction(accountId, type, amount, date, note); });
ipcMain.handle('savings:summary', async () => { await ready(); return db.getSavingsSummary(); });
ipcMain.handle('savings:overview', async () => { await ready(); return db.getSavingsOverview(); });
ipcMain.handle('savings:maturities', async (_, days) => { await ready(); return db.getUpcomingMaturities(days || 30); });
ipcMain.handle('savings:processMatured', async () => { await ready(); return db.processMaturedAccounts(); });
