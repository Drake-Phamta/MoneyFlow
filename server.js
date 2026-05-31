const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const cron = require('node-cron');
const FinancialDB = require('./electron/database');
const PriceService = require('./electron/priceService');
const setupRoutes = require('./electron/routes');

const app = express();
const PORT = process.env.PORT || 3001;
const upload = multer({ storage: multer.memoryStorage() });

let db;
let priceService;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

async function start() {
  const dbPath = path.join(__dirname, 'data', 'financial.sqlite');
  db = new FinancialDB(dbPath);
  await db.ready;
  priceService = new PriceService(db);

  // Setup all API routes (shared with electron/main.js)
  setupRoutes(app, db, priceService, upload);

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

  // Also fetch once on startup
  try {
    console.log('Fetching initial watchlist prices...');
    const result = await priceService.fetchAllWatchlistPrices();
    priceService.generateAlerts();
    console.log(`Initial price sync: ${result.success}/${result.total} succeeded`);
  } catch (err) {
    console.error('Initial price fetch error:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`Money Flow server running on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
