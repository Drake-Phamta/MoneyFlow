const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const FinancialDB = require('./database');
const PriceService = require('./priceService');

let mainWindow;
let db;
let priceService;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  db = new FinancialDB();
  await db.ready;
  priceService = new PriceService(db);

  // Fetch prices on startup
  priceService.fetchAllWatchlistPrices().catch(() => {});
  // Refresh prices every 30 minutes
  setInterval(() => priceService.fetchAllWatchlistPrices().catch(() => {}), 30 * 60 * 1000);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC Handlers ───────────────────────────────────────────────────

// Parameters
ipcMain.handle('params:get', async () => db.getParameters());
ipcMain.handle('params:update', async (_, key, value) => db.updateParameter(key, value));

// Asset Types
ipcMain.handle('assets:get', async () => db.getAssetTypes());
ipcMain.handle('assets:add', async (_, data) => db.addAssetType(data));
ipcMain.handle('assets:updatePrice', async (_, id, price) => { db.updateAssetPrice(id, price); return true; });

// Categories
ipcMain.handle('categories:get', async () => db.getCategories());

// Phases
ipcMain.handle('phases:get', async () => db.getPhases());
ipcMain.handle('phases:getActive', async () => db.getActivePhase());
ipcMain.handle('phases:setActive', async (_, id) => { db.setActivePhase(id); return true; });
ipcMain.handle('phases:getAllocations', async (_, phaseId) => db.getPhaseAllocations(phaseId));
ipcMain.handle('phases:saveAllocations', async (_, phaseId, allocs) => { db.savePhaseAllocations(phaseId, allocs); return true; });

// Monthly Entries
ipcMain.handle('monthly:get', async () => db.getMonthlyEntries());
ipcMain.handle('monthly:save', async (_, data) => db.saveMonthlyEntry(data));
ipcMain.handle('monthly:delete', async (_, id) => { db.deleteMonthlyEntry(id); return true; });

// Allocations
ipcMain.handle('allocations:get', async (_, entryId) => db.getAllocations(entryId));
ipcMain.handle('allocations:getAll', async () => db.getAllAllocations());
ipcMain.handle('allocations:save', async (_, entryId, allocs) => { db.saveAllocations(entryId, allocs); return true; });
ipcMain.handle('allocations:adjust', async (_, amount) => { db.adjustInvestmentAllocation(amount); return true; });

// Transactions
ipcMain.handle('transactions:get', async (_, limit) => db.getTransactions(limit));
ipcMain.handle('transactions:add', async (_, data) => db.addTransaction(data));

// Portfolio
ipcMain.handle('portfolio:summary', async () => db.getPortfolioSummary());
ipcMain.handle('portfolio:get', async () => db.getPortfolio());

// Savings
ipcMain.handle('savings:get', async () => db.getSavingsAccounts());
ipcMain.handle('savings:add', async (_, data) => db.addSavingsAccount(data));
ipcMain.handle('savings:update', async (_, id, data) => { db.updateSavingsAccount(id, data); return true; });
ipcMain.handle('savings:delete', async (_, id) => { db.deleteSavingsAccount(id); return true; });
ipcMain.handle('savings:addTransaction', async (_, accountId, type, amount, date, note) => {
  db.addSavingsTransaction(accountId, type, amount, date, note); return true;
});

// Watchlist
ipcMain.handle('watchlist:get', async () => db.getWatchlist());
ipcMain.handle('watchlist:add', async (_, data) => { db.addToWatchlist(data); return true; });
ipcMain.handle('watchlist:update', async (_, id, data) => { db.updateWatchlist(id, data); return true; });

// Alerts
ipcMain.handle('alerts:get', async (_, unreadOnly) => db.getAlerts(unreadOnly));
ipcMain.handle('alerts:markRead', async (_, id) => { db.markAlertRead(id); return true; });

// Activity
ipcMain.handle('activity:get', async (_, limit) => db.getActivityLog(limit));

// Timeline
ipcMain.handle('timeline:get', async (_, months) => db.getTimeline(months));

// Prices
ipcMain.handle('prices:refresh', async () => priceService.fetchAllWatchlistPrices());
ipcMain.handle('prices:history', async (_, id, days) => db.getPriceHistory(id, days));

// Data Management
ipcMain.handle('data:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
    properties: ['openFile'],
  });
  if (result.canceled) return null;
  const fs = require('fs');
  const buffer = fs.readFileSync(result.filePaths[0]);
  return db.importExcel(buffer);
});

ipcMain.handle('data:export', async () => {
  const buffer = db.exportExcel();
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'money_flow_export.xlsx',
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });
  if (result.canceled) return null;
  const fs = require('fs');
  fs.writeFileSync(result.filePath, buffer);
  return result.filePath;
});
