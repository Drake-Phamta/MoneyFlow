const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const cron = require('node-cron');
const Database = require('./database');
const PriceService = require('./priceService');
const setupRoutes = require('./routes');
const { ensureShortcuts } = require('../scripts/ensure-shortcuts');

let mainWindow;
let db;
let server;
let priceService;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1000, minHeight: 700,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: 'rgba(0,0,0,0)',
      symbolColor: '#475569',
      height: 36
    },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    title: 'Money Flow',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
  });
  // MF_ELECTRON_TEST: chạy trên bản đã dựng thay vì máy chủ Vite, để thử được
  // đường IPC mà không cần dựng thêm một tiến trình nữa.
  const useBuilt = app.isPackaged || process.env.MF_ELECTRON_TEST;
  if (!useBuilt) {
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
    // MF_DIST_DIR cho phép trỏ sang một thư mục dist khác — bộ test dùng bản
    // dựng riêng của nó, không đụng vào dist của người dùng.
    const distDir = process.env.MF_DIST_DIR || path.join(__dirname, '../dist');
    app2.use(express.static(distDir));

    // Setup all API routes (shared with server.js)
    setupRoutes(app2, db, priceService, upload, { fallbackDir: distDir });

    server = app2.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

app.whenReady().then(async () => {
  db = new Database();
  await db.ready;
  priceService = new PriceService(db);

  // Auto-repair desktop shortcuts (Windows only, non-blocking)
  ensureShortcuts().catch(() => {});

  // Auto-fetch prices every 30 min during VN trading hours (Mon-Fri, 9:00-15:00)
  cron.schedule('*/30 9-14 * * 1-5', async () => {
    try {
      console.log('[Cron] Fetching watchlist prices...');
      const result = await priceService.fetchAllWatchlistPrices();
      const alerts = priceService.generateAlerts();
      if (alerts.length) console.log(`[Cron] Generated ${alerts.length} alert(s)`);
      console.log(`[Cron] Price sync: ${result.success}/${result.total} succeeded`);
    } catch (err) {
      console.error('[Cron] Price fetch error:', err.message);
    }
  }, { timezone: 'Asia/Ho_Chi_Minh' });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (db) db.close(); if (process.platform !== 'darwin') app.quit(); });

async function ready() { if (db?.ready) await db.ready; }

// ===== IPC Handlers (Electron-specific, not REST) =====

// Snapshot
ipcMain.handle('snapshot:get', async () => { await ready(); return db.getFinancialSnapshot(); });

// Parameters
ipcMain.handle('params:get', async () => { await ready(); return db.getParameters(); });
ipcMain.handle('params:update', async (_, k, v) => { await ready(); db.updateParameter(k, v); return true; });
ipcMain.handle('params:avgExpense', async () => { await ready(); return db.getAverageExpense(); });
ipcMain.handle('params:recalcGoals', async () => { await ready(); db.recalculateAllPhaseGoals(); return true; });

// Asset Types
ipcMain.handle('assets:get', async () => { await ready(); return db.getAssetTypes(); });
ipcMain.handle('assets:add', async (_, data) => { await ready(); return db.addAssetType(data); });
ipcMain.handle('assets:update', async (_, id, data) => { await ready(); db.updateAssetType(id, data); return true; });
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
ipcMain.handle('phases:checklist', async () => { await ready(); return db.getChecklistStatus(); });

// Monthly Entries
ipcMain.handle('monthly:getAll', async () => { await ready(); return db.getMonthlyEntries(); });
ipcMain.handle('monthly:get', async (_, idx) => { await ready(); return db.getMonthlyEntry(idx); });
ipcMain.handle('monthly:filled', async () => { await ready(); return db.getFilledMonths(); });
ipcMain.handle('monthly:next', async () => { await ready(); return db.getNextUnfilledMonth(); });
ipcMain.handle('monthly:save', async (_, data) => { await ready(); db.saveMonthlyEntry(data); return true; });
ipcMain.handle('monthly:delete', async (_, monthIndex) => { await ready(); db.deleteMonthlyEntry(monthIndex); return true; });

// Allocations
ipcMain.handle('cash:ledger', async () => { await ready(); return db.getCashLedger(); });
ipcMain.handle('cash:spend', async (_, amount, date, note) => { await ready(); return db.spendCash(amount, date, note); });
ipcMain.handle('cash:deleteMovement', async (_, id) => { await ready(); return db.deleteCashMovement(id); });
ipcMain.handle('allocations:get', async (_, entryId) => { await ready(); return db.getAllocations(entryId); });
ipcMain.handle('networth:history', async () => { await ready(); return db.getNetWorthHistory(); });
ipcMain.handle('portfolio:history', async () => { await ready(); return db.getPortfolioHistory(); });
ipcMain.handle('allocations:all', async () => { await ready(); return db.getAllAllocations(); });
ipcMain.handle('allocations:save', async (_, entryId, allocs) => { await ready(); db.saveAllocations(entryId, allocs); return true; });
ipcMain.handle('allocations:adjust', async (_, discrepancyAmount, categoryId, reason, date) => { await ready(); return db.adjustInvestmentAllocation(discrepancyAmount, categoryId, reason, date) || true; });
ipcMain.handle('allocations:revert', async (_, logId) => { await ready(); return db.revertInvestmentAllocation(logId); });
ipcMain.handle('allocations:discrepancies', async () => { await ready(); return db.getDiscrepancyLogs(); });

// Transactions
ipcMain.handle('transactions:get', async () => { await ready(); return db.getTransactions(); });
ipcMain.handle('transactions:add', async (_, data) => { await ready(); return db.addTransaction(data); });
ipcMain.handle('transactions:delete', async (_, id) => { await ready(); db.deleteTransaction(id); return true; });

// Portfolio
ipcMain.handle('portfolio:get', async () => { await ready(); return db.getPortfolio(); });
ipcMain.handle('portfolio:summary', async () => { await ready(); return db.getPortfolioSummary(); });

// Activity
ipcMain.handle('activity:get', async (_, limit) => { await ready(); return db.getActivityLog(limit); });
ipcMain.handle('activity:delete', async (_, id) => { await ready(); return db.deleteActivityLog(id); });

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
ipcMain.handle('priceHistory:fetch', async (_, assetId, days) => {
  await ready();
  await priceService.fetchAndCacheHistory(assetId, days || 365);
  return db.getPriceHistory(assetId, days || 365);
});
ipcMain.handle('prices:refresh', async () => {
  await ready();
  const result = await priceService.fetchAllWatchlistPrices();
  const alerts = priceService.generateAlerts();
  return { ...result, alerts: alerts.length, alertDetails: alerts };
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
ipcMain.handle('savings:deleteTransaction', async (_, id) => { await ready(); return db.deleteSavingsTransaction(id); });
ipcMain.handle('savings:updateTransactionDate', async (_, id, date) => { await ready(); return db.updateSavingsTransactionDate(id, date); });
ipcMain.handle('savings:summary', async () => { await ready(); return db.getSavingsSummary(); });
ipcMain.handle('savings:overview', async () => { await ready(); return db.getSavingsOverview(); });
ipcMain.handle('savings:maturities', async (_, days) => { await ready(); return db.getUpcomingMaturities(days || 30); });
ipcMain.handle('savings:processMatured', async () => { await ready(); return db.processMaturedAccounts(); });
