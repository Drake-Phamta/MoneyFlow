/**
 * demo-server.js — Express server dành riêng cho việc quay video demo.
 *
 * Khác server.js gốc ở 3 điểm, và KHÔNG sửa gì trong source app:
 *   1. Trỏ FinancialDB vào demo/build/demo.sqlite (constructor đã nhận dbPath sẵn).
 *      => data/financial.sqlite tuyệt đối không bị đụng tới.
 *   2. Tắt cron + tắt fetch giá VNDIRECT lúc boot => giá không bị ghi đè, render deterministic.
 *   3. Thêm POST /api/demo/generate-alerts để sinh cảnh báo sau khi seed xong.
 *
 * Serve frontend từ demo/build/dist (build riêng, không đụng dist/ của project).
 */
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '../..');
const FinancialDB = require(path.join(ROOT, 'electron/database'));
const PriceService = require(path.join(ROOT, 'electron/priceService'));
const setupRoutes = require(path.join(ROOT, 'electron/routes'));

const DEMO_DB = process.env.MF_DEMO_DB || path.join(ROOT, 'demo/build/demo.sqlite');
const DIST_DIR = process.env.MF_DEMO_DIST || path.join(ROOT, 'demo/build/dist');
const PORT = Number(process.env.PORT || 3001);

// ---- Chốt chặn an toàn: không bao giờ để demo chạy trên DB thật ----
const REAL_DB = path.join(ROOT, 'data/financial.sqlite');
if (path.resolve(DEMO_DB) === path.resolve(REAL_DB)) {
  console.error('[DEMO] TỪ CHỐI KHỞI ĐỘNG: DEMO_DB đang trỏ vào database thật.');
  process.exit(1);
}

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static(DIST_DIR));

let db, priceService;

async function start() {
  fs.mkdirSync(path.dirname(DEMO_DB), { recursive: true });

  db = new FinancialDB(DEMO_DB);
  await db.ready;
  priceService = new PriceService(db);

  // Route riêng của demo — phải đăng ký TRƯỚC setupRoutes vì nó có app.get('*') catch-all.
  app.post('/api/demo/generate-alerts', (req, res) => {
    try {
      const alerts = priceService.generateAlerts();
      res.json({ ok: true, generated: Array.isArray(alerts) ? alerts.length : 0 });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/demo/health', (req, res) => {
    res.json({ ok: true, db: DEMO_DB, dist: DIST_DIR, distExists: fs.existsSync(path.join(DIST_DIR, 'index.html')) });
  });

  // Nạp lại file DB vào bộ nhớ mà không cần restart server.
  // FinancialDB giữ toàn bộ DB trong RAM, nên sau khi khôi phục snapshot từ ngoài
  // thì phải bảo nó đọc lại — nếu không, lần save() tiếp theo sẽ ghi đè bằng
  // bản cũ đang nằm trong bộ nhớ. Dùng khi quay lại một scene có ghi dữ liệu.
  app.post('/api/demo/reload-db', async (req, res) => {
    try {
      const initSqlJs = require('sql.js');
      const SQL = await initSqlJs();
      db.db = new SQL.Database(fs.readFileSync(DEMO_DB));

      // Chạy lại chuỗi migration đúng như lúc app khởi động thật. Thiếu bước
      // này thì tệp mẫu đứng mãi ở phiên bản schema lúc nó được tạo, và mọi
      // migration viết từ đó về sau không bao giờ được bộ test đi qua.
      db.createTables();
      for (let v = 2; v <= 9; v++) {
        const fn = db['migrateToV' + v];
        if (typeof fn === 'function') fn.call(db);
      }
      db.seedDefaults();
      db._coreCache = null;

      res.json({ ok: true, db: DEMO_DB, schema: db.getParam('SCHEMA_VERSION') });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Nạp lịch sử giá hàng loạt (1 lần save thay vì mỗi dòng 1 lần ghi file).
  // Không có API sẵn cho price_snapshots nên demo tự lo phần này.
  app.post('/api/demo/price-snapshots', (req, res) => {
    try {
      const { assetId, rows } = req.body;
      for (const r of rows) {
        db.run(
          `INSERT OR REPLACE INTO price_snapshots (asset_type_id, date, open, high, low, close, volume, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'demo')`,
          [assetId, r.date, r.open ?? r.close, r.high ?? r.close, r.low ?? r.close, r.close, r.volume ?? 0]
        );
      }
      db.save();
      res.json({ ok: true, inserted: rows.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GHI ĐÈ route thật của app (đăng ký trước setupRoutes nên thắng).
  // Bản gốc gọi priceService.fetchAndCacheHistory() → bắn request ra VNDIRECT:
  // chậm, phụ thuộc mạng, và trả dữ liệu khác nhau mỗi lần chạy => video không deterministic.
  // NetWorthModal gọi endpoint này với days=0, bản gốc quy về 365 và cắt mất lịch sử;
  // ở đây trả về TOÀN BỘ snapshot để bộ lọc "Tất cả" hiển thị đủ 18 tháng.
  app.post('/api/price-history/:assetId/fetch', (req, res) => {
    try {
      res.json(db.getPriceHistory(parseInt(req.params.assetId), 100000));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  setupRoutes(app, db, priceService, upload, { fallbackDir: DIST_DIR });

  // KHÔNG cron, KHÔNG fetch giá lúc boot — có chủ đích, xem docstring ở đầu file.

  app.listen(PORT, () => {
    console.log(`[DEMO] server http://localhost:${PORT}`);
    console.log(`[DEMO] db   ${DEMO_DB}`);
    console.log(`[DEMO] dist ${DIST_DIR}`);
    console.log('[DEMO] READY');
  });
}

start().catch(err => {
  console.error('[DEMO] Failed to start:', err);
  process.exit(1);
});
