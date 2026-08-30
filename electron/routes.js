/**
 * sql.js ném ra CHUỖI chứ không phải Error, nên `e.message` là undefined và
 * JSON.stringify bỏ luôn khoá đó — client nhận về `{}` trên mọi lỗi 500.
 */
function errText(e) {
  if (!e) return 'Lỗi không xác định';
  if (typeof e === 'string') return e;
  return e.message || String(e);
}

const path = require('path');
const fs = require('fs');

/**
 * Setup all Express API routes.
 * Shared between server.js (standalone) and electron/main.js (embedded).
 *
 * @param {import('express').Express} app
 * @param {import('./database')} db
 * @param {import('./priceService')} priceService
 * @param {import('multer').Multer} upload
 * @param {object} [opts] - Optional settings
 * @param {string} [opts.fallbackDir] - SPA fallback directory (default: ../dist)
 */
function setupRoutes(app, db, priceService, upload, opts = {}) {
  const fallbackDir = opts.fallbackDir || path.join(__dirname, '../dist');

  // ===== SNAPSHOT — nguồn sự thật duy nhất cho mọi con số tài chính =====
  app.get('/api/snapshot', (req, res) => {
    try { res.json(db.getFinancialSnapshot()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  // ===== PARAMETERS =====
  app.get('/api/params', (req, res) => {
    try { res.json(db.getParameters()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.put('/api/params', (req, res) => {
    try { db.updateParameter(req.body.key, req.body.value); res.json(true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.get('/api/params/avg-expense', (req, res) => {
    try { res.json(db.getAverageExpense()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.post('/api/params/recalc-goals', (req, res) => {
    try { db.recalculateAllPhaseGoals(); res.json(true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  // ===== TIMELINE =====
  app.post('/api/timeline/regenerate', (req, res) => {
    try {
      const { totalMonths, startMonth, startYear } = req.body;
      db.regenerateTimeline(totalMonths, startMonth, startYear);
      res.json(true);
    } catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  // ===== ASSET TYPES =====
  app.get('/api/assets', (req, res) => {
    try { res.json(db.getAssetTypes()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.post('/api/assets', (req, res) => {
    try { res.json(db.addAssetType(req.body)); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.put('/api/assets/:id', (req, res) => {
    try { db.updateAssetType(parseInt(req.params.id), req.body); res.json(true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.put('/api/assets/:id/price', (req, res) => {
    try { db.updateAssetPrice(parseInt(req.params.id), req.body.price); res.json(true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.delete('/api/assets/:id', (req, res) => {
    try { db.deleteAsset(parseInt(req.params.id)); res.json(true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  // ===== CATEGORIES =====
  app.get('/api/categories', (req, res) => {
    try { res.json(db.getCategories()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  // ===== PHASES =====
  app.get('/api/phases', (req, res) => {
    try { res.json(db.getPhases()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.get('/api/phases/active', (req, res) => {
    try { res.json(db.getActivePhase()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.get('/api/phases/checklist', (req, res) => {
    try { res.json(db.getChecklistStatus()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.post('/api/phases/:id/active', (req, res) => {
    try { db.setActivePhase(parseInt(req.params.id)); res.json(true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.get('/api/phases/:id/allocations', (req, res) => {
    try { res.json(db.getPhaseAllocations(parseInt(req.params.id))); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.post('/api/phases/:id/allocations', (req, res) => {
    try { db.updatePhaseAllocations(parseInt(req.params.id), req.body.allocations); res.json(true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  // ===== MONTHLY ENTRIES =====
  app.get('/api/monthly', (req, res) => {
    try { res.json(db.getMonthlyEntries()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.get('/api/monthly/filled', (req, res) => {
    try { res.json(db.getFilledMonths()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.get('/api/monthly/next', (req, res) => {
    try { res.json(db.getNextUnfilledMonth()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.get('/api/monthly/:index', (req, res) => {
    try { res.json(db.getMonthlyEntry(parseInt(req.params.index))); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.post('/api/monthly', (req, res) => {
    try {
      const data = { ...req.body };
      // Chuẩn hoá total_inflow đã chuyển vào db.saveMonthlyEntry() để bản web và
      // bản Electron (đi thẳng qua IPC) dùng chung một logic.
      db.saveMonthlyEntry(data);
      const entry = db.getMonthlyEntry(data.month_index);
      res.json(entry || true);
    } catch (e) { console.error('[POST /api/monthly] Error:', e); res.status(500).json({ error: errText(e) }); }
  });

  app.delete('/api/monthly/:index', (req, res) => {
    try { db.deleteMonthlyEntry(parseInt(req.params.index)); res.json(true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  // ===== ALLOCATIONS =====
  app.get('/api/allocations/all', (req, res) => {
    try { res.json(db.getAllAllocations()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.get('/api/allocations/discrepancies', (req, res) => {
    try { res.json(db.getDiscrepancyLogs()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.post('/api/allocations/adjust', (req, res) => {
    try { res.json(db.adjustInvestmentAllocation(req.body.discrepancyAmount, req.body.categoryId, req.body.reason, req.body.date) || true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.delete('/api/allocations/adjust/:id', (req, res) => {
    try {
      const r = db.revertInvestmentAllocation(parseInt(req.params.id));
      if (!r.reverted) return res.status(404).json({ error: 'khong tim thay but toan nay' });
      res.json(r);
    } catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.get('/api/allocations/:entryId', (req, res) => {
    try { res.json(db.getAllocations(parseInt(req.params.entryId))); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.post('/api/allocations/:entryId', (req, res) => {
    try { db.saveAllocations(parseInt(req.params.entryId), req.body.allocations); res.json(true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  // ===== TRANSACTIONS =====
  app.get('/api/transactions', (req, res) => {
    try { res.json(db.getTransactions()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.post('/api/transactions', (req, res) => {
    try { res.json(db.addTransaction(req.body)); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.delete('/api/transactions/:id', (req, res) => {
    try { db.deleteTransaction(parseInt(req.params.id)); res.json(true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  // ===== PORTFOLIO =====
  app.get('/api/portfolio', (req, res) => {
    try { res.json(db.getPortfolio()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.get('/api/portfolio/summary', (req, res) => {
    try { res.json(db.getPortfolioSummary()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.get('/api/networth/history', (req, res) => {
    try { res.json(db.getNetWorthHistory()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.get('/api/portfolio/history', (req, res) => {
    try { res.json(db.getPortfolioHistory()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  // ===== ACTIVITY =====
  app.get('/api/activity', (req, res) => {
    try { res.json(db.getActivityLog(parseInt(req.query.limit) || 20)); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.delete('/api/activity/:id', (req, res) => {
    try {
      db.deleteActivityLog(parseInt(req.params.id));
      res.json(true);
    } catch (e) {
      res.status(500).json({ error: errText(e) });
    }
  });

  // ===== DATA MANAGEMENT =====
  app.get('/api/data/stats', (req, res) => {
    try { res.json(db.getStats()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.delete('/api/data/transactions', (req, res) => {
    try { db.clearTransactions(); res.json(true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.delete('/api/data/monthly', (req, res) => {
    try { db.clearMonthlyEntries(); res.json(true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.delete('/api/data/all', (req, res) => {
    try { db.clearAll(); res.json(true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.delete('/api/data/savings', (req, res) => {
    try { db.clearSavings(); res.json(true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  // ===== IMPORT/EXPORT =====
  app.post('/api/import/excel', upload.single('file'), (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const results = db.importExcelBuffer(req.file.buffer);
      res.json(results);
    } catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.get('/api/export/excel', (req, res) => {
    try {
      const buffer = db.exportExcelBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="MoneyFlow_Data.xlsx"');
      res.send(Buffer.from(buffer));
    } catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.get('/api/database/download', (req, res) => {
    try {
      res.setHeader('Content-Type', 'application/x-sqlite3');
      res.setHeader('Content-Disposition', 'attachment; filename="financial.sqlite"');
      res.sendFile(db.dbPath);
    } catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  // ===== WATCHLIST =====
  app.get('/api/watchlist', (req, res) => {
    try { res.json(db.getWatchlist()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.post('/api/watchlist', (req, res) => {
    try { res.json(db.addWatchlistItem(req.body)); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.put('/api/watchlist/:id', (req, res) => {
    try { db.updateWatchlistItem(parseInt(req.params.id), req.body); res.json(true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.delete('/api/watchlist/:id', (req, res) => {
    try { db.removeWatchlistItem(parseInt(req.params.id)); res.json(true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  // ===== ALERTS =====
  app.get('/api/alerts', (req, res) => {
    try {
      const unreadOnly = req.query.unread === 'true';
      res.json(db.getAlerts(unreadOnly));
    } catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.get('/api/alerts/count', (req, res) => {
    try { res.json({ count: db.getUnreadAlertCount() }); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.put('/api/alerts/:id/read', (req, res) => {
    try { db.markAlertRead(parseInt(req.params.id)); res.json(true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.put('/api/alerts/read-all', (req, res) => {
    try { db.markAllAlertsRead(); res.json(true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  // ===== PRICE HISTORY =====
  app.get('/api/price-history/:assetId', (req, res) => {
    try {
      const days = parseInt(req.query.days) || 30;
      res.json(db.getPriceHistory(parseInt(req.params.assetId), days));
    } catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.post('/api/price-history/:assetId/fetch', async (req, res) => {
    try {
      const assetId = parseInt(req.params.assetId);
      const days = parseInt(req.query.days) || 365;
      await priceService.fetchAndCacheHistory(assetId, days);
      res.json(db.getPriceHistory(assetId, days));
    } catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  // ===== PRICE REFRESH =====
  app.post('/api/prices/refresh', async (req, res) => {
    try {
      const result = await priceService.fetchAllWatchlistPrices();
      const alerts = priceService.generateAlerts();
      res.json({ ...result, alerts: alerts.length, alertDetails: alerts });
    } catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  // ===== CATALOG =====
  app.get('/api/catalog', (req, res) => {
    try {
      const assetClass = req.query.class || null;
      const search = req.query.search || null;
      res.json(db.getAssetCatalog(assetClass, search));
    } catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.put('/api/assets/:id/tracked', (req, res) => {
    try { db.setTracked(parseInt(req.params.id), req.body.tracked); res.json(true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  // ===== SAVINGS =====
  app.get('/api/savings', (req, res) => {
    try { res.json(db.getSavingsAccounts()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.get('/api/savings/summary', (req, res) => {
    try { res.json(db.getSavingsSummary()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.get('/api/savings/overview', (req, res) => {
    try { res.json(db.getSavingsOverview()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.get('/api/savings/maturities', (req, res) => {
    try { res.json(db.getUpcomingMaturities(parseInt(req.query.days) || 30)); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.get('/api/savings/:id', (req, res) => {
    try { res.json(db.getSavingsAccount(parseInt(req.params.id))); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.post('/api/savings', (req, res) => {
    try { res.json(db.addSavingsAccount(req.body)); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.put('/api/savings/:id', (req, res) => {
    try { db.updateSavingsAccount(parseInt(req.params.id), req.body); res.json(true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.delete('/api/savings/:id', (req, res) => {
    try { db.deleteSavingsAccount(parseInt(req.params.id)); res.json(true); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.post('/api/savings/:id/transactions', (req, res) => {
    try { res.json(db.addSavingsTransaction(parseInt(req.params.id), req.body.type, req.body.amount, req.body.date, req.body.note)); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.delete('/api/savings/transactions/:id', (req, res) => {
    try { res.json(db.deleteSavingsTransaction(parseInt(req.params.id))); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.put('/api/savings/transactions/:id/date', (req, res) => {
    try { res.json(db.updateSavingsTransactionDate(parseInt(req.params.id), req.body.date)); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  app.post('/api/savings/process-matured', (req, res) => {
    try { res.json(db.processMaturedAccounts()); }
    catch (e) { res.status(500).json({ error: errText(e) }); }
  });

  // ===== SPA FALLBACK =====
  app.get('*', (req, res) => {
    const indexPath = path.join(fallbackDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: 'Not found - run npm run build first' });
    }
  });
}

module.exports = setupRoutes;
