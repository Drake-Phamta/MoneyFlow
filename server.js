const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const FinancialDB = require('./electron/database');
const PriceService = require('./electron/priceService');

const app = express();
const PORT = process.env.PORT || 3001;
const upload = multer({ storage: multer.memoryStorage() });

let db;
let priceService;

app.use(cors());
app.use(express.json());

// Serve static frontend in production
app.use(express.static(path.join(__dirname, 'dist')));

// ===== PARAMETERS =====
app.get('/api/params', (req, res) => {
  try { res.json(db.getParameters()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/params', (req, res) => {
  try { db.updateParameter(req.body.key, req.body.value); res.json(true); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/params/avg-expense', (req, res) => {
  try { res.json(db.getAverageExpense()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== TIMELINE =====
app.post('/api/timeline/regenerate', (req, res) => {
  try {
    const { totalMonths, startMonth, startYear } = req.body;
    db.regenerateTimeline(totalMonths, startMonth, startYear);
    res.json(true);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== ASSET TYPES =====
app.get('/api/assets', (req, res) => {
  try { res.json(db.getAssetTypes()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/assets', (req, res) => {
  try { res.json(db.addAssetType(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/assets/:id/price', (req, res) => {
  try { db.updateAssetPrice(parseInt(req.params.id), req.body.price); res.json(true); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/assets/:id', (req, res) => {
  try { db.deleteAsset(parseInt(req.params.id)); res.json(true); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== CATEGORIES =====
app.get('/api/categories', (req, res) => {
  try { res.json(db.getCategories()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== PHASES =====
app.get('/api/phases', (req, res) => {
  try { res.json(db.getPhases()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/phases/active', (req, res) => {
  try { res.json(db.getActivePhase()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/phases/:id/allocations', (req, res) => {
  try { res.json(db.getPhaseAllocations(parseInt(req.params.id))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== MONTHLY ENTRIES =====
app.get('/api/monthly', (req, res) => {
  try { res.json(db.getMonthlyEntries()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/monthly/filled', (req, res) => {
  try { res.json(db.getFilledMonths()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/monthly/next', (req, res) => {
  try { res.json(db.getNextUnfilledMonth()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/monthly/:index', (req, res) => {
  try { res.json(db.getMonthlyEntry(parseInt(req.params.index))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/monthly', (req, res) => {
  try { db.saveMonthlyEntry(req.body); res.json(true); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/monthly/:index', (req, res) => {
  try { db.deleteMonthlyEntry(parseInt(req.params.index)); res.json(true); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== ALLOCATIONS =====
app.get('/api/allocations/all', (req, res) => {
  try { res.json(db.getAllAllocations()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/allocations/:entryId', (req, res) => {
  try { res.json(db.getAllocations(parseInt(req.params.entryId))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/allocations/adjust', (req, res) => {
  try { db.adjustInvestmentAllocation(req.body.discrepancyAmount); res.json(true); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/allocations/:entryId', (req, res) => {
  try { db.saveAllocations(parseInt(req.params.entryId), req.body.allocations); res.json(true); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== TRANSACTIONS =====
app.get('/api/transactions', (req, res) => {
  try { res.json(db.getTransactions()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/transactions', (req, res) => {
  try { res.json(db.addTransaction(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/transactions/:id', (req, res) => {
  try { db.deleteTransaction(parseInt(req.params.id)); res.json(true); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== PORTFOLIO =====
app.get('/api/portfolio', (req, res) => {
  try { res.json(db.getPortfolio()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/portfolio/summary', (req, res) => {
  try { res.json(db.getPortfolioSummary()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== ACTIVITY =====
app.get('/api/activity', (req, res) => {
  try { res.json(db.getActivityLog(parseInt(req.query.limit) || 20)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== DATA MANAGEMENT =====
app.get('/api/data/stats', (req, res) => {
  try { res.json(db.getStats()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/data/transactions', (req, res) => {
  try { db.clearTransactions(); res.json(true); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/data/monthly', (req, res) => {
  try { db.clearMonthlyEntries(); res.json(true); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/data/all', (req, res) => {
  try { db.clearAll(); res.json(true); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/data/savings', (req, res) => {
  try { db.clearSavings(); res.json(true); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== IMPORT/EXPORT =====
app.post('/api/import/excel', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const results = db.importExcelBuffer(req.file.buffer);
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/export/excel', (req, res) => {
  try {
    const buffer = db.exportExcelBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="MoneyFlow_Data.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/database/download', (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/x-sqlite3');
    res.setHeader('Content-Disposition', 'attachment; filename="financial.sqlite"');
    res.sendFile(db.dbPath);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== WATCHLIST =====
app.get('/api/watchlist', (req, res) => {
  try { res.json(db.getWatchlist()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/watchlist', (req, res) => {
  try { res.json(db.addWatchlistItem(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/watchlist/:id', (req, res) => {
  try { db.updateWatchlistItem(parseInt(req.params.id), req.body); res.json(true); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/watchlist/:id', (req, res) => {
  try { db.removeWatchlistItem(parseInt(req.params.id)); res.json(true); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== ALERTS =====
app.get('/api/alerts', (req, res) => {
  try {
    const unreadOnly = req.query.unread === 'true';
    res.json(db.getAlerts(unreadOnly));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/alerts/count', (req, res) => {
  try { res.json({ count: db.getUnreadAlertCount() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/alerts/:id/read', (req, res) => {
  try { db.markAlertRead(parseInt(req.params.id)); res.json(true); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/alerts/read-all', (req, res) => {
  try { db.markAllAlertsRead(); res.json(true); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== PRICE HISTORY =====
app.get('/api/price-history/:assetId', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    res.json(db.getPriceHistory(parseInt(req.params.assetId), days));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== PRICE REFRESH =====
app.post('/api/prices/refresh', async (req, res) => {
  try {
    const results = await priceService.fetchAllWatchlistPrices();
    const alerts = priceService.generateAlerts();
    res.json({ fetched: results.length, alerts: alerts.length, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== CATALOG =====
app.get('/api/catalog', (req, res) => {
  try {
    const assetClass = req.query.class || null;
    const search = req.query.search || null;
    res.json(db.getAssetCatalog(assetClass, search));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/assets/:id/tracked', (req, res) => {
  try { db.setTracked(parseInt(req.params.id), req.body.tracked); res.json(true); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== SAVINGS =====
app.get('/api/savings', (req, res) => {
  try { res.json(db.getSavingsAccounts()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/savings/summary', (req, res) => {
  try { res.json(db.getSavingsSummary()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/savings/overview', (req, res) => {
  try { res.json(db.getSavingsOverview()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/savings/maturities', (req, res) => {
  try { res.json(db.getUpcomingMaturities(parseInt(req.query.days) || 30)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/savings/:id', (req, res) => {
  try { res.json(db.getSavingsAccount(parseInt(req.params.id))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/savings', (req, res) => {
  try { res.json(db.addSavingsAccount(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/savings/:id', (req, res) => {
  try { db.updateSavingsAccount(parseInt(req.params.id), req.body); res.json(true); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/savings/:id', (req, res) => {
  try { db.deleteSavingsAccount(parseInt(req.params.id)); res.json(true); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/savings/:id/transactions', (req, res) => {
  try { res.json(db.addSavingsTransaction(parseInt(req.params.id), req.body.type, req.body.amount, req.body.date, req.body.note)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/savings/process-matured', (req, res) => {
  try { res.json(db.processMaturedAccounts()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// SPA fallback for production
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Not found - run npm run build first' });
  }
});

async function start() {
  const dbPath = path.join(__dirname, 'data', 'financial.sqlite');
  db = new FinancialDB(dbPath);
  await db.ready;
  priceService = new PriceService(db);

  // Auto-fetch prices every 30 min during VN trading hours (Mon-Fri, 9:00-15:00)
  cron.schedule('*/30 9-14 * * 1-5', async () => {
    try {
      console.log('[Cron] Fetching watchlist prices...');
      await priceService.fetchAllWatchlistPrices();
      const alerts = priceService.generateAlerts();
      if (alerts.length) console.log(`[Cron] Generated ${alerts.length} alert(s)`);
    } catch (err) {
      console.error('[Cron] Price fetch error:', err.message);
    }
  }, { timezone: 'Asia/Ho_Chi_Minh' });

  // Also fetch once on startup
  try {
    console.log('Fetching initial watchlist prices...');
    await priceService.fetchAllWatchlistPrices();
    priceService.generateAlerts();
  } catch (err) {
    console.error('Initial price fetch error:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`Money_Flow server running on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
