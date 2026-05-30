const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const FinancialDB = require('./electron/database');
const PriceService = require('./electron/priceService');

const app = express();
const PORT = process.env.PORT || 3001;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

let db;
let priceService;

app.use(cors());
app.use(express.json());

// ─── Parameters ─────────────────────────────────────────────────────
app.get('/api/params', (req, res) => { try { res.json(db.getParameters()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.put('/api/params/:key', (req, res) => { try { res.json(db.updateParameter(req.params.key, req.body.value)); } catch (e) { res.status(500).json({ error: e.message }); } });

// ─── Timeline ───────────────────────────────────────────────────────
app.get('/api/timeline', (req, res) => { try { res.json(db.getTimeline(parseInt(req.query.months) || 12)); } catch (e) { res.status(500).json({ error: e.message }); } });

// ─── Assets ─────────────────────────────────────────────────────────
app.get('/api/assets', (req, res) => { try { res.json(db.getAssetTypes()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/assets', (req, res) => { try { res.json(db.addAssetType(req.body)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.put('/api/assets/:id/price', (req, res) => { try { db.updateAssetPrice(parseInt(req.params.id), req.body.price); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });

// ─── Categories ─────────────────────────────────────────────────────
app.get('/api/categories', (req, res) => { try { res.json(db.getCategories()); } catch (e) { res.status(500).json({ error: e.message }); } });

// ─── Phases ─────────────────────────────────────────────────────────
app.get('/api/phases', (req, res) => { try { res.json(db.getPhases()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/phases/active', (req, res) => { try { res.json(db.getActivePhase()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.put('/api/phases/:id/activate', (req, res) => { try { db.setActivePhase(parseInt(req.params.id)); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/phases/:id/allocations', (req, res) => { try { res.json(db.getPhaseAllocations(parseInt(req.params.id))); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/phases/:id/allocations', (req, res) => { try { db.savePhaseAllocations(parseInt(req.params.id), req.body); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });

// ─── Monthly Entries ────────────────────────────────────────────────
app.get('/api/monthly', (req, res) => { try { res.json(db.getMonthlyEntries()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/monthly', (req, res) => { try { res.json(db.saveMonthlyEntry(req.body)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/monthly/:id', (req, res) => { try { db.deleteMonthlyEntry(parseInt(req.params.id)); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });

// ─── Allocations ────────────────────────────────────────────────────
app.get('/api/allocations/all', (req, res) => { try { res.json(db.getAllAllocations()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/allocations/adjust', (req, res) => { try { db.adjustInvestmentAllocation(req.body.discrepancyAmount); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/allocations/:entryId', (req, res) => { try { res.json(db.getAllocations(parseInt(req.params.entryId))); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/allocations/:entryId', (req, res) => { try { db.saveAllocations(parseInt(req.params.entryId), req.body); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });

// ─── Transactions ───────────────────────────────────────────────────
app.get('/api/transactions', (req, res) => { try { res.json(db.getTransactions(parseInt(req.query.limit) || 100)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/transactions', (req, res) => { try { res.json(db.addTransaction(req.body)); } catch (e) { res.status(500).json({ error: e.message }); } });

// ─── Portfolio ──────────────────────────────────────────────────────
app.get('/api/portfolio/summary', (req, res) => { try { res.json(db.getPortfolioSummary()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/portfolio', (req, res) => { try { res.json(db.getPortfolio()); } catch (e) { res.status(500).json({ error: e.message }); } });

// ─── Savings ────────────────────────────────────────────────────────
app.get('/api/savings', (req, res) => { try { res.json(db.getSavingsAccounts()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/savings', (req, res) => { try { res.json(db.addSavingsAccount(req.body)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.put('/api/savings/:id', (req, res) => { try { db.updateSavingsAccount(parseInt(req.params.id), req.body); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/savings/:id', (req, res) => { try { db.deleteSavingsAccount(parseInt(req.params.id)); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/savings/:id/transactions', (req, res) => {
  try { db.addSavingsTransaction(parseInt(req.params.id), req.body.type, req.body.amount, req.body.date, req.body.note); res.json(true); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Watchlist ──────────────────────────────────────────────────────
app.get('/api/watchlist', (req, res) => { try { res.json(db.getWatchlist()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/watchlist', (req, res) => { try { db.addToWatchlist(req.body); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });
app.put('/api/watchlist/:id', (req, res) => { try { db.updateWatchlist(parseInt(req.params.id), req.body); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });

// ─── Alerts ─────────────────────────────────────────────────────────
app.get('/api/alerts', (req, res) => { try { res.json(db.getAlerts(req.query.unread === 'true')); } catch (e) { res.status(500).json({ error: e.message }); } });
app.put('/api/alerts/:id/read', (req, res) => { try { db.markAlertRead(parseInt(req.params.id)); res.json(true); } catch (e) { res.status(500).json({ error: e.message }); } });

// ─── Prices ─────────────────────────────────────────────────────────
app.post('/api/prices/refresh', async (req, res) => { try { res.json(await priceService.fetchAllWatchlistPrices()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/prices/history/:id', (req, res) => { try { res.json(db.getPriceHistory(parseInt(req.params.id), parseInt(req.query.days) || 30)); } catch (e) { res.status(500).json({ error: e.message }); } });

// ─── Activity ───────────────────────────────────────────────────────
app.get('/api/activity', (req, res) => { try { res.json(db.getActivityLog(parseInt(req.query.limit) || 20)); } catch (e) { res.status(500).json({ error: e.message }); } });

// ─── Data Management ────────────────────────────────────────────────
app.post('/api/data/import', upload.single('file'), (req, res) => {
  try { if (!req.file) return res.status(400).json({ error: 'No file' }); res.json(db.importExcel(req.file.buffer)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/data/export', (req, res) => {
  try {
    const buffer = db.exportExcel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=money_flow_export.xlsx');
    res.send(buffer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Start Server ───────────────────────────────────────────────────
async function start() {
  db = new FinancialDB();
  await db.ready;
  priceService = new PriceService(db);

  // Initial price fetch
  console.log('Fetching initial watchlist prices...');
  priceService.fetchAllWatchlistPrices().catch(() => {});

  app.listen(PORT, () => {
    console.log(`Money_Flow server running on http://localhost:${PORT}`);
  });
}

start().catch(e => { console.error('Failed to start server:', e); process.exit(1); });
