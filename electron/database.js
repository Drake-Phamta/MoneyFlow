const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

let app;
try { app = require('electron').app; } catch (e) { app = null; }

class FinancialDB {
  constructor(dbPath) {
    this.db = null;
    if (dbPath) {
      this.dbPath = dbPath;
    } else if (process.env.MF_DB_PATH) {
      // Cho phép trỏ sang một cơ sở dữ liệu khác. Không có lối này thì bản
      // Electron luôn mở thẳng dữ liệu thật, và không cách nào thử đường IPC
      // mà không đụng vào tiền của người dùng.
      this.dbPath = process.env.MF_DB_PATH;
    } else {
      this.dbPath = (app && app.isPackaged)
        ? path.join(app.getPath('userData'), 'financial.sqlite')
        : path.join(__dirname, '../data/financial.sqlite');
    }
    this.ready = this.init();
  }

  async init() {
    const SQL = await initSqlJs();
    const dbExists = fs.existsSync(this.dbPath);
    if (dbExists) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
      // Check existing data count
      try {
        const cnt = this.query('SELECT COUNT(*) as cnt FROM allocations');
        console.log('[DB] Loaded existing database, allocations:', cnt[0]?.cnt || 0);
      } catch (e) {}
    } else {
      this.db = new SQL.Database();
      console.log('[DB] Created new database');
    }
    this.createTables();
    this.migrateToV2();
    this.migrateToV3();
    this.migrateToV4();
    this.migrateToV5();
    this.migrateToV6();
    this.migrateToV7();
    this.migrateToV8();
    this.migrateToV9();
    this.seedDefaults();
    
    // Ensure category 2 is renamed to "Chứng Khoán" (from old "Đầu Tư" name)
    try {
      this.run("UPDATE categories SET name = 'Chứng Khoán' WHERE name = 'Đầu Tư'");
    } catch (e) {}

    // Ensure SJC gold name is "Vàng SJC" instead of "Vàng miếng SJC"
    try {
      this.run("UPDATE asset_types SET name = 'Vàng SJC' WHERE ticker = 'SJC'");
    } catch (e) {}

    // One-time fix: Correct the date of existing monthly entries in activity_log
    try {
      const logs = this.query("SELECT id, description FROM activity_log WHERE type = 'MONTHLY_ENTRY'");
      let migrated = false;
      for (const log of logs) {
        const match = log.description.match(/Nhập liệu T(\d+)\/(\d+)/);
        if (match) {
          const m = match[1].padStart(2, '0');
          const y = match[2];
          const correctDate = `${y}-${m}-01`;
          this.run("UPDATE activity_log SET date = ? WHERE id = ?", [correctDate, log.id]);
          migrated = true;
        }
      }
      if (migrated) {
        this.save();
      }
    } catch (e) {
      console.error('[DB] Migration of activity dates failed:', e.message);
    }

    // Only save if database didn't exist before (new DB)
    if (!dbExists) {
      this.save();
    }
  }

  save() {
    // Mọi thay đổi đều đi qua đây, nên đây là chỗ đúng để bỏ bộ nhớ đệm của
    // snapshot. Thiếu bước này thì trang sẽ đọc lại số cũ sau khi ghi.
    this._coreCache = null;
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  createTables() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS parameters (
        key TEXT PRIMARY KEY,
        value REAL NOT NULL,
        description TEXT
      )
    `);

    // Asset types: stocks, ETFs, gold, bonds, savings accounts, etc.
    this.db.run(`
      CREATE TABLE IF NOT EXISTS asset_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        ticker TEXT,
        unit TEXT DEFAULT 'đơn vị',
        color TEXT DEFAULT '#6B6660',
        icon TEXT DEFAULT '📦',
        active INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        current_price REAL DEFAULT 0
      )
    `);

    // Allocation categories (buckets where money goes)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        color TEXT DEFAULT '#6B6660',
        icon TEXT DEFAULT '💰',
        sort_order INTEGER DEFAULT 0
      )
    `);

    // Bốn giai đoạn của lộ trình. Chữ hướng dẫn không nằm ở đây —
    // nó sinh từ phase_allocations ở src/content/phases.js.
    this.db.run(`
      CREATE TABLE IF NOT EXISTS phases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        goal_amount REAL DEFAULT 0,
        goal_multiplier REAL DEFAULT 0,
        goal_description TEXT,
        entry_condition TEXT,
        is_active INTEGER DEFAULT 0
      )
    `);

    // Phase-category allocation rules
    this.db.run(`
      CREATE TABLE IF NOT EXISTS phase_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phase_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        ratio REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (phase_id) REFERENCES phases(id),
        FOREIGN KEY (category_id) REFERENCES categories(id)
      )
    `);

    // Monthly entries
    this.db.run(`
      CREATE TABLE IF NOT EXISTS monthly_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        month_index INTEGER NOT NULL UNIQUE,
        month_label TEXT NOT NULL,
        income REAL DEFAULT 0,
        expense REAL DEFAULT 0,
        bonus REAL DEFAULT 0,
        total_inflow REAL DEFAULT 0,
        note TEXT,
        phase_id INTEGER,
        status TEXT DEFAULT 'draft',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (phase_id) REFERENCES phases(id)
      )
    `);

    // Allocations per month per category
    this.db.run(`
      CREATE TABLE IF NOT EXISTS allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        monthly_entry_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        planned_amount REAL DEFAULT 0,
        actual_amount REAL DEFAULT 0,
        FOREIGN KEY (monthly_entry_id) REFERENCES monthly_entries(id),
        FOREIGN KEY (category_id) REFERENCES categories(id)
      )
    `);

    // Transactions (buy/sell any asset)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        asset_type_id INTEGER NOT NULL,
        asset_name TEXT DEFAULT '',
        type TEXT NOT NULL DEFAULT 'BUY',
        quantity REAL NOT NULL,
        price REAL NOT NULL,
        total_amount REAL NOT NULL,
        fee REAL DEFAULT 0,
        note TEXT,
        monthly_entry_id INTEGER,
        FOREIGN KEY (asset_type_id) REFERENCES asset_types(id),
        FOREIGN KEY (monthly_entry_id) REFERENCES monthly_entries(id)
      )
    `);

    // Portfolio snapshots (monthly)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS portfolio_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        month_index INTEGER NOT NULL,
        asset_type_id INTEGER NOT NULL,
        quantity REAL DEFAULT 0,
        avg_cost REAL DEFAULT 0,
        market_value REAL DEFAULT 0,
        FOREIGN KEY (asset_type_id) REFERENCES asset_types(id)
      )
    `);

    // Activity log (all events)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL,
        metadata TEXT
      )
    `);

    // Price snapshots (daily OHLCV from API)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS price_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_type_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        open REAL, high REAL, low REAL, close REAL,
        volume INTEGER,
        source TEXT DEFAULT 'vndirect',
        fetched_at TEXT DEFAULT (datetime('now')),
        UNIQUE(asset_type_id, date),
        FOREIGN KEY (asset_type_id) REFERENCES asset_types(id)
      )
    `);

    // Alerts (auto-generated from price movements)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_type_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        data TEXT,
        read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (asset_type_id) REFERENCES asset_types(id)
      )
    `);

    // Watchlist (assets to auto-track prices)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS watchlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        ticker TEXT,
        current_price REAL DEFAULT 0,
        peak_price REAL DEFAULT 0,
        unit TEXT DEFAULT 'điểm',
        auto_track INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Savings accounts (per-account tracking)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS savings_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        bank TEXT NOT NULL,
        account_number TEXT,
        type TEXT NOT NULL DEFAULT 'term',
        principal REAL NOT NULL DEFAULT 0,
        interest_rate REAL NOT NULL DEFAULT 0,
        term_months INTEGER DEFAULT 0,
        start_date TEXT NOT NULL,
        maturity_date TEXT,
        auto_renew INTEGER DEFAULT 0,
        category_id INTEGER,
        note TEXT,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (category_id) REFERENCES categories(id)
      )
    `);

    // Savings transactions (deposit, withdraw, interest, maturity)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS savings_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        savings_account_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT NOT NULL,
        note TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (savings_account_id) REFERENCES savings_accounts(id)
      )
    `);

    // Discrepancy logs
    this.db.run(`
      CREATE TABLE IF NOT EXISTS discrepancy_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        month_index INTEGER NOT NULL,
        month_label TEXT NOT NULL,
        amount REAL NOT NULL,
        reason TEXT,
        target_category_id INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Migration: add current_price if missing
    try {
      this.db.run('ALTER TABLE asset_types ADD COLUMN current_price REAL DEFAULT 0');
    } catch (e) { /* column already exists */ }

    // Migration: add asset_name to transactions if missing
    try {
      this.db.run('ALTER TABLE transactions ADD COLUMN asset_name TEXT DEFAULT ""');
    } catch (e) { /* column already exists */ }

    // Migration: add goal_multiplier to phases if missing
    try {
      this.db.run('ALTER TABLE phases ADD COLUMN goal_multiplier REAL DEFAULT 0');
    } catch (e) { /* column already exists */ }

    // Migration: add tracking columns to asset_types
    try { this.db.run('ALTER TABLE asset_types ADD COLUMN is_tracked INTEGER DEFAULT 0'); } catch (e) {}
    try { this.db.run('ALTER TABLE asset_types ADD COLUMN peak_price REAL DEFAULT 0'); } catch (e) {}
    try { this.db.run('ALTER TABLE asset_types ADD COLUMN asset_class TEXT DEFAULT "other"'); } catch (e) {}
    try { this.db.run('ALTER TABLE transactions ADD COLUMN strategy TEXT DEFAULT ""'); } catch (e) {}
    try { this.db.run('ALTER TABLE savings_accounts ADD COLUMN product_type TEXT DEFAULT "savings"'); } catch (e) {}
  }

  migrateToV2() {
    const version = this.getParam('SCHEMA_VERSION') || 1;
    if (version >= 2) return;

    // Reclassify existing 8 rows
    const reclassify = [
      ['Cổ phiếu', 'stock', 'Giao dịch'],
      ['ETF / Quỹ', 'etf', 'Giao dịch'],
      ['Vàng', 'gold', 'Tích trữ'],
      ['Crypto', 'crypto', 'Giao dịch'],
      ['Trái phiếu', 'bond', 'Tích trữ'],
      ['Tiết kiệm ngân hàng', 'savings', 'Tích trữ'],
      ['Bất động sản', 'realestate', 'Tích trữ'],
      ['Khác', 'other', 'Tích trữ'],
    ];
    for (const [name, assetClass, cat] of reclassify) {
      this.run('UPDATE asset_types SET asset_class = ?, category = ? WHERE name = ?', [assetClass, cat, name]);
    }

    // Migrate watchlist items into asset_types
    const watchlistItems = this.query('SELECT * FROM watchlist');
    for (const w of watchlistItems) {
      if (!w.ticker) continue;
      const existing = this.queryOne('SELECT id FROM asset_types WHERE ticker = ?', [w.ticker]);
      if (existing) {
        this.run('UPDATE asset_types SET is_tracked = 1, current_price = ?, peak_price = MAX(peak_price, ?) WHERE id = ?',
          [w.current_price, w.peak_price || 0, existing.id]);
      } else {
        this.run(`INSERT INTO asset_types (name, category, ticker, unit, color, icon, sort_order, current_price, peak_price, is_tracked, asset_class)
          VALUES (?, 'Giao dịch', ?, ?, '#3A6B8A', 'chart-line', 50, ?, ?, 1, 'stock')`,
          [w.name, w.ticker, w.unit || 'CP', w.current_price || 0, w.peak_price || 0]);
      }
    }

    // Fix alerts FK: update alerts that reference watchlist IDs to point to asset_types
    const alerts = this.query('SELECT DISTINCT asset_type_id FROM alerts');
    for (const a of alerts) {
      const inWatchlist = this.queryOne('SELECT ticker FROM watchlist WHERE id = ?', [a.asset_type_id]);
      if (inWatchlist?.ticker) {
        const assetType = this.queryOne('SELECT id FROM asset_types WHERE ticker = ?', [inWatchlist.ticker]);
        if (assetType) {
          this.run('UPDATE alerts SET asset_type_id = ? WHERE asset_type_id = ?', [assetType.id, a.asset_type_id]);
        }
      }
    }

    // Seed curated catalog — full VN30 + ETFs + Gold
    const catalog = [
      // VN30 Stocks
      ['ACB', 'ACB - Ngân hàng Á Châu', 'stock', 'CP', '#3A6B8A', 'chart-line', 10],
      ['BCM', 'Becamex IDC', 'stock', 'CP', '#3A6B8A', 'chart-line', 11],
      ['BID', 'BIDV', 'stock', 'CP', '#3A6B8A', 'chart-line', 12],
      ['BVH', 'BVH - Bảo Việt', 'stock', 'CP', '#3A6B8A', 'chart-line', 13],
      ['CTG', 'VietinBank', 'stock', 'CP', '#3A6B8A', 'chart-line', 14],
      ['FPT', 'FPT Corporation', 'stock', 'CP', '#3A6B8A', 'chart-line', 15],
      ['GAS', 'PV Gas', 'stock', 'CP', '#3A6B8A', 'chart-line', 16],
      ['GVR', 'Tập đoàn Cao su', 'stock', 'CP', '#3A6B8A', 'chart-line', 17],
      ['HDB', 'HDBank', 'stock', 'CP', '#3A6B8A', 'chart-line', 18],
      ['HPG', 'Hòa Phát Group', 'stock', 'CP', '#3A6B8A', 'chart-line', 19],
      ['KDH', 'Khang Điền House', 'stock', 'CP', '#3A6B8A', 'chart-line', 20],
      ['MBB', 'MB Bank', 'stock', 'CP', '#3A6B8A', 'chart-line', 21],
      ['MSN', 'Masan Group', 'stock', 'CP', '#3A6B8A', 'chart-line', 22],
      ['MWG', 'Thế Giới Di Động', 'stock', 'CP', '#3A6B8A', 'chart-line', 23],
      ['NVL', 'Novaland', 'stock', 'CP', '#3A6B8A', 'chart-line', 24],
      ['PDR', 'Phát Đạt', 'stock', 'CP', '#3A6B8A', 'chart-line', 25],
      ['PLX', 'Petrolimex', 'stock', 'CP', '#3A6B8A', 'chart-line', 26],
      ['POW', 'PV Power', 'stock', 'CP', '#3A6B8A', 'chart-line', 27],
      ['SAB', 'Sabeco', 'stock', 'CP', '#3A6B8A', 'chart-line', 28],
      ['SSI', 'SSI Securities', 'stock', 'CP', '#3A6B8A', 'chart-line', 29],
      ['STB', 'Sacombank', 'stock', 'CP', '#3A6B8A', 'chart-line', 30],
      ['TCB', 'Techcombank', 'stock', 'CP', '#3A6B8A', 'chart-line', 31],
      ['TPB', 'TPBank', 'stock', 'CP', '#3A6B8A', 'chart-line', 32],
      ['VCB', 'Vietcombank', 'stock', 'CP', '#3A6B8A', 'chart-line', 33],
      ['VHM', 'Vinhomes', 'stock', 'CP', '#3A6B8A', 'chart-line', 34],
      ['VIB', 'VIB Bank', 'stock', 'CP', '#3A6B8A', 'chart-line', 35],
      ['VIC', 'Vingroup', 'stock', 'CP', '#3A6B8A', 'chart-line', 36],
      ['VJC', 'Vietjet Air', 'stock', 'CP', '#3A6B8A', 'chart-line', 37],
      ['VNM', 'Vinamilk', 'stock', 'CP', '#3A6B8A', 'chart-line', 38],
      ['VRE', 'Vincom Retail', 'stock', 'CP', '#3A6B8A', 'chart-line', 39],
      // ETFs
      ['E1VFVN30', 'VN30 ETF', 'etf', 'CCQ', '#4E8C76', 'chart-pie', 50],
      ['FUEVN100', 'VN100 ETF', 'etf', 'CCQ', '#4E8C76', 'chart-pie', 51],
      // Gold
      ['SJC', 'Vàng SJC', 'gold', 'chỉ', '#B06D22', 'gem', 60],
    ];
    for (const [ticker, name, assetClass, unit, color, icon, order] of catalog) {
      const cat = assetClass === 'gold' ? 'Tích trữ' : 'Giao dịch';
      this.run(`INSERT OR IGNORE INTO asset_types (name, category, ticker, unit, color, icon, sort_order, asset_class, is_tracked)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [name, cat, ticker, unit, color, icon, order, assetClass]);
    }

    // Update schema version
    this.run("INSERT OR REPLACE INTO parameters (key, value, description) VALUES ('SCHEMA_VERSION', 2, 'Database schema version')");
  }

  migrateToV3() {
    const version = this.getParam('SCHEMA_VERSION') || 1;
    if (version >= 3) return;
    // Only migrate existing databases — fresh DBs are handled by seedDefaults()
    const hasPhases = this.queryOne('SELECT id FROM phases LIMIT 1');
    if (!hasPhases) {
      this.run("INSERT OR REPLACE INTO parameters (key, value, description) VALUES ('SCHEMA_VERSION', 3, 'Database schema version')");
      return;
    }

    // Update phase allocations to new ratios
    this.run('DELETE FROM phase_allocations');
    const pa = [
      [1, 1, 0.70], [1, 2, 0.30],
      [2, 1, 0.10], [2, 2, 0.60], [2, 3, 0.15], [2, 4, 0.10], [2, 5, 0.05],
      [3, 1, 0.05], [3, 2, 0.45], [3, 3, 0.20], [3, 4, 0.15], [3, 5, 0.15],
      [4, 1, 0.05], [4, 2, 0.40], [4, 3, 0.15], [4, 4, 0.15], [4, 5, 0.25],
    ];
    for (const [phaseId, catId, ratio] of pa) {
      this.db.run('INSERT INTO phase_allocations (phase_id, category_id, ratio) VALUES (?, ?, ?)', [phaseId, catId, ratio]);
    }

    // Cập nhật mục tiêu của từng giai đoạn
    const phases = this.query('SELECT id, sort_order FROM phases ORDER BY sort_order');
    const monthlyExpense = this.getParam('FI_MONTHLY_EXPENSE') || 4000000;

    const updates = [
      {
        goal_desc: 'Dự phòng = 3× chi tiêu mục tiêu',
        entry: 'Bắt đầu ngay',
        goal_multiplier: 3,
      },
      {
        goal_desc: 'Danh mục đầu tư đa dạng',
        entry: 'Dự phòng ≥ 3× chi tiêu mục tiêu',
        goal_multiplier: 6,
      },
      {
        goal_desc: 'Tài sản = 24× chi tiêu mục tiêu',
        entry: 'Tổng tài sản ≥ 6× chi tiêu mục tiêu',
        goal_multiplier: 24,
      },
      {
        goal_desc: 'Thu nhập thụ động ≥ chi tiêu mục tiêu',
        entry: 'Tổng tài sản ≥ 24× chi tiêu mục tiêu',
        goal_multiplier: 0,
      },
    ];

    for (let i = 0; i < phases.length && i < updates.length; i++) {
      const p = phases[i];
      const u = updates[i];
      const goalAmount = u.goal_multiplier > 0 ? u.goal_multiplier * monthlyExpense : 0;
      this.run('UPDATE phases SET goal_description = ?, entry_condition = ?, goal_multiplier = ?, goal_amount = ? WHERE id = ?',
        [u.goal_desc, u.entry, u.goal_multiplier, goalAmount, p.id]);
    }

    // Update schema version
    this.run("INSERT OR REPLACE INTO parameters (key, value, description) VALUES ('SCHEMA_VERSION', 3, 'Database schema version')");
  }

  migrateToV4() {
    const version = this.getParam('SCHEMA_VERSION') || 1;
    if (version >= 4) return;

    // Tables are created in createTables() — just update version
    this.run("INSERT OR REPLACE INTO parameters (key, value, description) VALUES ('SCHEMA_VERSION', 4, 'Database schema version')");
  }

  migrateToV5() {
    const version = this.getParam('SCHEMA_VERSION') || 1;
    if (version >= 5) return;

    // 1. Update all gold asset types to use "chỉ" as unit
    this.run("UPDATE asset_types SET unit = 'chỉ' WHERE asset_class = 'gold'");

    // Rename 'Đầu Tư' category to 'Chứng Khoán' for schema consistency
    this.run("UPDATE categories SET name = 'Chứng Khoán' WHERE name = 'Đầu Tư'");

    // Update schema version
    this.run("INSERT OR REPLACE INTO parameters (key, value, description) VALUES ('SCHEMA_VERSION', 5, 'Database schema version')");
    this.save();
  }

  migrateToV6() {
    const version = this.getParam('SCHEMA_VERSION') || 1;
    if (version >= 6) return;

    // Reset peak_price to 0 for all stocks/ETFs so they are recalculated once from history
    try {
      this.run("UPDATE asset_types SET peak_price = 0 WHERE asset_class IN ('stock', 'etf') AND ticker IS NOT NULL");
    } catch (e) {}

    // Update schema version
    this.run("INSERT OR REPLACE INTO parameters (key, value, description) VALUES ('SCHEMA_VERSION', 6, 'Database schema version')");
    this.save();
  }

  /**
   * V7 — bổ sung tham số cho mô hình dự phóng.
   * seedDefaults() thoát sớm khi DB đã có TOTAL_MONTHS, nên cơ sở dữ liệu đang
   * dùng sẽ không bao giờ nhận được tham số mới nếu chỉ thêm vào seed.
   */
  /**
   * V8 — đổi tên Giai đoạn 4 và dọn chữ hướng dẫn chép tay khỏi bảng phases.
   *
   * Tên cũ "Tự do tài chính" mô tả ĐÍCH của cả lộ trình, không phải giai đoạn
   * này. Nó bắt đầu khi tài sản đạt 24× chi tiêu mục tiêu, còn tự do tài chính
   * cần 300× — chênh hơn mười lần. Người dùng vào giai đoạn 4 tưởng mình đã
   * xong trong khi mới đi được một phần chặng.
   */
  /**
   * V9 — màu danh mục theo bảng màu giấy.
   *
   * Năm màu cũ lấy thẳng từ bảng mặc định của Tailwind: xanh lá neon, xanh
   * dương, vàng chanh, đỏ tươi, tím. Chúng chói trên nền giấy, và đỏ với lục
   * cạnh nhau thì người mù màu đỏ-lục không tách được hai lát biểu đồ.
   *
   * Bộ mới lệch nhau cả về sắc lẫn độ sáng, nên phân biệt được kể cả khi in
   * đen trắng.
   */
  migrateToV9() {
    const version = this.getParam('SCHEMA_VERSION') || 1;
    if (version >= 9) return;

    const colors = [
      ['Dự Phòng', '#0F5D4A'],               // rêu đậm — lớp đệm
      ['Chứng Khoán', '#3A6B8A'],            // xanh mực
      ['Vàng', '#B06D22'],                   // hổ phách đất nung
      ['Bắn Tỉa', '#A93E27'],                // gạch nung
      ['Tiết kiệm & Trái phiếu', '#67558F'], // tím mực
    ];
    for (const [name, color] of colors) {
      this.run('UPDATE categories SET color = ? WHERE name = ?', [color, name]);
    }

    this.run("INSERT OR REPLACE INTO parameters (key, value, description) VALUES ('SCHEMA_VERSION', 9, 'Database schema version')");
    this.save();
  }

  migrateToV8() {
    const version = this.getParam('SCHEMA_VERSION') || 1;
    if (version >= 8) return;

    this.run(
      "UPDATE phases SET name = 'Giai đoạn 4: Thu nhập thụ động' WHERE sort_order = 4"
    );

    // Chữ hướng dẫn nay sinh từ phase_allocations lúc hiển thị. Bản chép tay
    // trong cột này không còn được đọc ở đâu; để lại là một bản sao mâu thuẫn
    // chờ ai đó đọc nhầm.
    try {
      this.run('UPDATE phases SET guidance = NULL');
    } catch (e) {}

    this.run("INSERT OR REPLACE INTO parameters (key, value, description) VALUES ('SCHEMA_VERSION', 8, 'Database schema version')");
    this.save();
  }

  migrateToV7() {
    const version = this.getParam('SCHEMA_VERSION') || 1;
    if (version >= 7) return;

    const extra = [
      ['INFLATION_RATE', 0.035, 'Lạm phát năm dùng cho dự phóng'],
      ['EXPECTED_RETURN_STOCK', 0.115, 'Lợi suất kỳ vọng của nhóm Chứng Khoán'],
    ];
    for (const [k, v, d] of extra) {
      this.run('INSERT OR IGNORE INTO parameters (key, value, description) VALUES (?, ?, ?)', [k, v, d]);
    }
    this.run(
      "UPDATE parameters SET description = 'Chi tiêu mục tiêu mỗi tháng (do bạn đặt)' WHERE key = 'FI_MONTHLY_EXPENSE'"
    );

    this.run("INSERT OR REPLACE INTO parameters (key, value, description) VALUES ('SCHEMA_VERSION', 7, 'Database schema version')");
    this.save();
  }

  seedDefaults() {
    const hasDefaults = this.getParam('TOTAL_MONTHS');
    if (hasDefaults) return;

    // Parameters — use current date as default start
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const params = [
      ['TOTAL_MONTHS', 120, 'Tổng số tháng hành trình'],
      ['START_MONTH', currentMonth, 'Tháng bắt đầu (1-12)'],
      ['START_YEAR', currentYear, 'Năm bắt đầu'],

      // Mô tả cũ ghi "tự cập nhật theo dữ liệu thực" là sai — không có chỗ nào
      // trong app tự cập nhật giá trị này; nó là mức sống người dùng nhắm tới.
      ['FI_MONTHLY_EXPENSE', 4000000, 'Chi tiêu mục tiêu mỗi tháng (do bạn đặt)'],
      ['DEFAULT_INFLOW', 3700000, 'Dòng tiền nhàn rỗi kỳ vọng mỗi tháng'],
      ['INFLATION_RATE', 0.035, 'Lạm phát năm dùng cho dự phóng'],
      ['EXPECTED_RETURN_STOCK', 0.115, 'Lợi suất kỳ vọng của nhóm Chứng Khoán'],
    ];
    for (const [k, v, d] of params) {
      // OR IGNORE: migrateToV7 chạy TRƯỚC hàm này và đã seed INFLATION_RATE
      // cùng EXPECTED_RETURN_STOCK. INSERT trần ở đây làm cơ sở dữ liệu hoàn
      // toàn mới chết ngay lúc khởi tạo vì trùng khoá.
      this.db.run('INSERT OR IGNORE INTO parameters (key, value, description) VALUES (?, ?, ?)', [k, v, d]);
    }

    // Asset type presets — parent categories
    const assetPresets = [
      ['Cổ phiếu', 'Giao dịch', 'stock', 'CP', '#3A6B8A', 'chart-line', 1],
      ['ETF / Quỹ', 'Giao dịch', 'etf', 'CCQ', '#4E8C76', 'chart-pie', 2],
      ['Vàng', 'Tích trữ', 'gold', 'chỉ', '#B06D22', 'gem', 3],
      ['Crypto', 'Giao dịch', 'crypto', 'coin', '#67558F', 'currency-btc', 4],
      ['Trái phiếu', 'Tích trữ', 'bond', 'VNĐ', '#5A554F', 'scroll', 5],
      ['Tiết kiệm ngân hàng', 'Tích trữ', 'savings', 'VNĐ', '#0F5D4A', 'bank', 6],
      ['Bất động sản', 'Tích trữ', 'realestate', 'VNĐ', '#8E5518', 'house', 7],
      ['Khác', 'Tích trữ', 'other', 'đơn vị', '#6B6660', 'package', 8],
    ];
    for (const [name, cat, assetClass, unit, color, icon, order] of assetPresets) {
      this.db.run(
        'INSERT INTO asset_types (name, category, ticker, unit, color, icon, sort_order, asset_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [name, cat, null, unit, color, icon, order, assetClass]
      );
    }

    // Curated catalog — full VN30 + ETFs + Gold
    const catalog = [
      // VN30 Stocks
      ['ACB', 'ACB - Ngân hàng Á Châu', 'stock', 'CP', '#3A6B8A', 'chart-line', 10],
      ['BCM', 'Becamex IDC', 'stock', 'CP', '#3A6B8A', 'chart-line', 11],
      ['BID', 'BIDV', 'stock', 'CP', '#3A6B8A', 'chart-line', 12],
      ['BVH', 'BVH - Bảo Việt', 'stock', 'CP', '#3A6B8A', 'chart-line', 13],
      ['CTG', 'VietinBank', 'stock', 'CP', '#3A6B8A', 'chart-line', 14],
      ['FPT', 'FPT Corporation', 'stock', 'CP', '#3A6B8A', 'chart-line', 15],
      ['GAS', 'PV Gas', 'stock', 'CP', '#3A6B8A', 'chart-line', 16],
      ['GVR', 'Tập đoàn Cao su', 'stock', 'CP', '#3A6B8A', 'chart-line', 17],
      ['HDB', 'HDBank', 'stock', 'CP', '#3A6B8A', 'chart-line', 18],
      ['HPG', 'Hòa Phát Group', 'stock', 'CP', '#3A6B8A', 'chart-line', 19],
      ['KDH', 'Khang Điền House', 'stock', 'CP', '#3A6B8A', 'chart-line', 20],
      ['MBB', 'MB Bank', 'stock', 'CP', '#3A6B8A', 'chart-line', 21],
      ['MSN', 'Masan Group', 'stock', 'CP', '#3A6B8A', 'chart-line', 22],
      ['MWG', 'Thế Giới Di Động', 'stock', 'CP', '#3A6B8A', 'chart-line', 23],
      ['NVL', 'Novaland', 'stock', 'CP', '#3A6B8A', 'chart-line', 24],
      ['PDR', 'Phát Đạt', 'stock', 'CP', '#3A6B8A', 'chart-line', 25],
      ['PLX', 'Petrolimex', 'stock', 'CP', '#3A6B8A', 'chart-line', 26],
      ['POW', 'PV Power', 'stock', 'CP', '#3A6B8A', 'chart-line', 27],
      ['SAB', 'Sabeco', 'stock', 'CP', '#3A6B8A', 'chart-line', 28],
      ['SSI', 'SSI Securities', 'stock', 'CP', '#3A6B8A', 'chart-line', 29],
      ['STB', 'Sacombank', 'stock', 'CP', '#3A6B8A', 'chart-line', 30],
      ['TCB', 'Techcombank', 'stock', 'CP', '#3A6B8A', 'chart-line', 31],
      ['TPB', 'TPBank', 'stock', 'CP', '#3A6B8A', 'chart-line', 32],
      ['VCB', 'Vietcombank', 'stock', 'CP', '#3A6B8A', 'chart-line', 33],
      ['VHM', 'Vinhomes', 'stock', 'CP', '#3A6B8A', 'chart-line', 34],
      ['VIB', 'VIB Bank', 'stock', 'CP', '#3A6B8A', 'chart-line', 35],
      ['VIC', 'Vingroup', 'stock', 'CP', '#3A6B8A', 'chart-line', 36],
      ['VJC', 'Vietjet Air', 'stock', 'CP', '#3A6B8A', 'chart-line', 37],
      ['VNM', 'Vinamilk', 'stock', 'CP', '#3A6B8A', 'chart-line', 38],
      ['VRE', 'Vincom Retail', 'stock', 'CP', '#3A6B8A', 'chart-line', 39],
      // ETFs
      ['E1VFVN30', 'VN30 ETF', 'etf', 'CCQ', '#4E8C76', 'chart-pie', 50],
      ['FUEVN100', 'VN100 ETF', 'etf', 'CCQ', '#4E8C76', 'chart-pie', 51],
      // Gold
      ['SJC', 'Vàng SJC', 'gold', 'chỉ', '#B06D22', 'gem', 60],
    ];
    for (const [ticker, name, assetClass, unit, color, icon, order] of catalog) {
      const cat = assetClass === 'gold' ? 'Tích trữ' : 'Giao dịch';
      const exists = this.queryOne('SELECT id FROM asset_types WHERE ticker = ?', [ticker]);
      if (!exists) {
        this.db.run(
          'INSERT INTO asset_types (name, category, ticker, unit, color, icon, sort_order, asset_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [name, cat, ticker, unit, color, icon, order, assetClass]
        );
      }
    }

    // Default categories
    const cats = [
      ['Dự Phòng', 'Gửi tiết kiệm ngân hàng. Không đụng trừ khẩn cấp.', '#0F5D4A', 'shield-check', 1],
      ['Chứng Khoán', 'Mua ETF, cổ phiếu tích sản. Giao dịch trên sàn.', '#3A6B8A', 'trend-up', 2],
      ['Vàng', 'Mua vàng miếng/SJC tích trữ dài hạn.', '#B06D22', 'gem', 3],
      ['Bắn Tỉa', 'Giữ tiền mặt. Chỉ dùng khi thị trường sập >15%.', '#A93E27', 'crosshair', 4],
      ['Tiết kiệm & Trái phiếu', 'Gửi ngân hàng kỳ hạn hoặc mua trái phiếu. Ổn định.', '#67558F', 'bank', 5],
    ];
    for (const [name, desc, color, icon, order] of cats) {
      this.db.run(
        'INSERT INTO categories (name, description, color, icon, sort_order) VALUES (?, ?, ?, ?, ?)',
        [name, desc, color, icon, order]
      );
    }

    // Default phases — aligned with target expense (FI_MONTHLY_EXPENSE)
    const phases = [
      {
        name: 'Giai đoạn 1: Nền tảng',
        order: 1,
        goal_multiplier: 3,
        goal_desc: 'Dự phòng = 3× chi tiêu mục tiêu',
        entry: 'Bắt đầu ngay',
        active: 1,
      },
      {
        name: 'Giai đoạn 2: Tăng tốc',
        order: 2,
        goal_multiplier: 6,
        goal_desc: 'Danh mục đầu tư đa dạng',
        entry: 'Dự phòng ≥ 3× chi tiêu mục tiêu',
        active: 0,
      },
      {
        name: 'Giai đoạn 3: Tích lũy',
        order: 3,
        goal_multiplier: 24,
        goal_desc: 'Tài sản = 24× chi tiêu mục tiêu',
        entry: 'Tổng tài sản ≥ 6× chi tiêu mục tiêu',
        active: 0,
      },
      {
        name: 'Giai đoạn 4: Thu nhập thụ động',
        order: 4,
        goal_multiplier: 0,
        goal_desc: 'Thu nhập thụ động ≥ chi tiêu mục tiêu',
        entry: 'Tổng tài sản ≥ 24× chi tiêu mục tiêu',
        active: 0,
      },
    ];

    for (const p of phases) {
      const monthlyExpense = this.getParam('FI_MONTHLY_EXPENSE') || 4000000;
      const goalAmount = p.goal_multiplier > 0 ? p.goal_multiplier * monthlyExpense : 0;
      this.db.run(
        'INSERT INTO phases (name, sort_order, goal_amount, goal_multiplier, goal_description, entry_condition, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [p.name, p.order, goalAmount, p.goal_multiplier, p.goal_desc, p.entry, p.active]
      );
    }

    // Tỷ lệ phân bổ mặc định của từng giai đoạn. Đây là NGUỒN của các
    // dòng phần trăm mà người dùng đọc — sửa ở đây là chữ đổi theo.
    // cat 1: Dự Phòng, cat 2: Chứng Khoán, cat 3: Vàng, cat 4: Bắn Tỉa, cat 5: TK&TP
    const pa = [
      [1, 1, 0.70], [1, 2, 0.30],
      [2, 1, 0.10], [2, 2, 0.60], [2, 3, 0.15], [2, 4, 0.10], [2, 5, 0.05],
      [3, 1, 0.05], [3, 2, 0.45], [3, 3, 0.20], [3, 4, 0.15], [3, 5, 0.15],
      [4, 1, 0.05], [4, 2, 0.40], [4, 3, 0.15], [4, 4, 0.15], [4, 5, 0.25],
    ];
    for (const [phaseId, catId, ratio] of pa) {
      this.db.run('INSERT INTO phase_allocations (phase_id, category_id, ratio) VALUES (?, ?, ?)', [phaseId, catId, ratio]);
    }

    // Generate empty monthly entries
    this.generateMonthlyEntries();
  }

  generateMonthlyEntries() {
    const totalMonths = this.getParam('TOTAL_MONTHS') || 120;
    const startMonth = this.getParam('START_MONTH') || 5;
    const startYear = this.getParam('START_YEAR') || 2026;

    for (let i = 0; i < totalMonths; i++) {
      const m = ((startMonth - 1 + i) % 12) + 1;
      const y = startYear + Math.floor((startMonth - 1 + i) / 12);
      const label = `T${m}/${y}`;
      // Skip if this month already has data (from an existing entry with any month_index)
      const existing = this.queryOne('SELECT id FROM monthly_entries WHERE month_label = ? AND total_inflow > 0', [label]);
      if (existing) continue;
      this.db.run(
        'INSERT OR IGNORE INTO monthly_entries (month_index, month_label, phase_id) VALUES (?, ?, ?)',
        [i + 1, label, i < 12 ? 1 : 2]
      );
    }
  }

  getParam(key) {
    const row = this.queryOne('SELECT value FROM parameters WHERE key = ?', [key]);
    return row?.value;
  }

  regenerateTimeline(totalMonths, startMonth, startYear) {
    // Update parameters
    this.run('INSERT OR REPLACE INTO parameters (key, value, description) VALUES (?, ?, ?)', ['TOTAL_MONTHS', totalMonths, 'Tổng số tháng hành trình']);
    this.run('INSERT OR REPLACE INTO parameters (key, value, description) VALUES (?, ?, ?)', ['START_MONTH', startMonth, 'Tháng bắt đầu (1-12)']);
    this.run('INSERT OR REPLACE INTO parameters (key, value, description) VALUES (?, ?, ?)', ['START_YEAR', startYear, 'Năm bắt đầu']);

    // Delete future empty entries (keep ones with data)
    this.run('DELETE FROM monthly_entries WHERE total_inflow = 0 AND month_index > (SELECT COALESCE(MAX(month_index), 0) FROM monthly_entries WHERE total_inflow > 0)');

    // Generate new entries
    for (let i = 0; i < totalMonths; i++) {
      const m = ((startMonth - 1 + i) % 12) + 1;
      const y = startYear + Math.floor((startMonth - 1 + i) / 12);
      this.db.run(
        'INSERT OR IGNORE INTO monthly_entries (month_index, month_label, phase_id) VALUES (?, ?, ?)',
        [i + 1, `T${m}/${y}`, 1]
      );
    }

    // Log activity
    this.run('INSERT INTO activity_log (date, type, description) VALUES (?, ?, ?)',
      [new Date().toISOString().split('T')[0], 'SETTING_CHANGE',
       `Thay đổi hành trình: ${totalMonths} tháng, bắt đầu T${startMonth}/${startYear}`]);
    this.save();
  }

  query(sql, params = []) {
    const result = this.db.exec(sql, params);
    if (!result.length) return [];
    const cols = result[0].columns;
    return result[0].values.map(row => {
      const obj = {};
      cols.forEach((c, i) => { obj[c] = row[i]; });
      return obj;
    });
  }

  queryOne(sql, params = []) {
    return this.query(sql, params)[0] || null;
  }

  run(sql, params = []) {
    this.db.run(sql, params);
  }

  lastId() {
    return this.query('SELECT last_insert_rowid() as id')[0]?.id;
  }

  // ===== PARAMETERS =====
  getParameters() { return this.query('SELECT * FROM parameters ORDER BY key'); }
  updateParameter(key, value) {
    this.run('UPDATE parameters SET value = ? WHERE key = ?', [value, key]);
    // Recalculate phase goals when expenses change
    if (key === 'FI_MONTHLY_EXPENSE') {
      this.recalculatePhaseGoals(value);
    }
    this.save();
  }

  recalculatePhaseGoals(monthlyExpense) {
    const phases = this.query('SELECT id, goal_multiplier FROM phases ORDER BY sort_order');
    for (const p of phases) {
      const goalAmount = p.goal_multiplier > 0 ? p.goal_multiplier * monthlyExpense : 0;
      this.run('UPDATE phases SET goal_amount = ? WHERE id = ?', [goalAmount, p.id]);
    }
  }

  // Recalculate all phase goals based on user's TARGET expected expense
  recalculateAllPhaseGoals() {
    const targetExpense = this.getParam('FI_MONTHLY_EXPENSE') || 4000000;
    this.recalculatePhaseGoals(targetExpense);
    this.save();
  }

  // ===== ASSET TYPES =====
  getAssetTypes() { return this.query('SELECT * FROM asset_types WHERE active = 1 ORDER BY sort_order'); }
  getParentAssetTypes() { return this.query("SELECT * FROM asset_types WHERE active = 1 AND ticker IS NULL ORDER BY sort_order"); }
  getAssetCatalog(assetClass, search) {
    let sql = 'SELECT * FROM asset_types WHERE active = 1 AND ticker IS NOT NULL';
    const params = [];
    if (assetClass) { sql += ' AND asset_class = ?'; params.push(assetClass); }
    if (search) { sql += ' AND (name LIKE ? OR ticker LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    sql += ' ORDER BY is_tracked DESC, sort_order, name';
    return this.query(sql, params);
  }
  getTrackedAssets() { return this.query('SELECT * FROM asset_types WHERE is_tracked = 1 AND active = 1 ORDER BY sort_order'); }
  getPriceRefreshTargets() {
    // Assets being invested (net quantity > 0) OR being watched in Sniper (is_tracked = 1)
    return this.query(`
      SELECT * FROM asset_types
      WHERE ticker IS NOT NULL AND active = 1 AND is_tracked = 1
      UNION
      SELECT a.* FROM asset_types a
      INNER JOIN transactions t ON t.asset_type_id = a.id
      WHERE a.ticker IS NOT NULL AND a.active = 1
      GROUP BY a.id
      HAVING SUM(CASE WHEN t.type = 'BUY' THEN t.quantity ELSE -t.quantity END) > 0
    `);
  }
  setTracked(assetId, tracked) {
    this.run('UPDATE asset_types SET is_tracked = ? WHERE id = ?', [tracked ? 1 : 0, assetId]);
    this.save();
  }
  updateAssetPrice(assetId, price, highPrice, forcePeak = false) {
    if (forcePeak) {
      this.run('UPDATE asset_types SET current_price = ?, peak_price = ? WHERE id = ?', [price, highPrice || price, assetId]);
    } else {
      const peak = highPrice ? Math.max(price, highPrice) : price;
      this.run('UPDATE asset_types SET current_price = ?, peak_price = MAX(peak_price, ?) WHERE id = ?', [price, peak, assetId]);
    }
    this.save();
    console.log(`[DB] Updated asset ${assetId} price to ${price}`);
  }
  addAssetType(data) {
    this.run('INSERT INTO asset_types (name, category, ticker, unit, color, icon, sort_order, asset_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [data.name, data.category || 'Giao dịch', data.ticker ?? null, data.unit || 'đơn vị', data.color || '#3A6B8A', data.icon || '📦', data.sort_order || 99, data.asset_class || 'other']);
    // Lấy id TRƯỚC khi save(): save() xuất lại toàn bộ DB và làm mất
    // last_insert_rowid(), nên đảo thứ tự là route trả về 0.
    const id = this.lastId();
    this.save();
    return id;
  }
  updateAssetType(id, data) {
    const fields = [];
    const vals = [];
    for (const [k, v] of Object.entries(data)) {
      if (['name', 'category', 'ticker', 'unit', 'color', 'icon', 'sort_order', 'asset_class'].includes(k)) {
        fields.push(`${k} = ?`);
        vals.push(v);
      }
    }
    if (fields.length) {
      vals.push(id);
      this.run(`UPDATE asset_types SET ${fields.join(', ')} WHERE id = ?`, vals);
      this.save();
    }
  }
  deleteAsset(id) {
    this.run('UPDATE asset_types SET active = 0 WHERE id = ?', [id]);
    this.save();
  }

  // ===== CATEGORIES =====
  getCategories() { return this.query('SELECT * FROM categories ORDER BY sort_order'); }
  addCategory(data) {
    this.run('INSERT INTO categories (name, description, color, icon, sort_order) VALUES (?, ?, ?, ?, ?)',
      [data.name, data.description, data.color || '#3A6B8A', data.icon || '💰', data.sort_order || 99]);
    this.save();
    return this.lastId();
  }

  // ===== PHASES =====
  getPhases() { return this.query('SELECT * FROM phases ORDER BY sort_order'); }

  getAverageExpense() {
    // Tính chi tiêu trung bình thực tế từ monthly entries
    const result = this.query(`
      SELECT COALESCE(AVG(expense), 0) as avg_expense
      FROM monthly_entries
      WHERE expense > 0 AND total_inflow > 0
    `);
    const avgExpense = result[0]?.avg_expense || 0;
    // Nếu chưa có dữ liệu → dùng FI_MONTHLY_EXPENSE từ settings
    return avgExpense > 0 ? avgExpense : (this.getParam('FI_MONTHLY_EXPENSE') || 4000000);
  }

  /**
   * Giai đoạn đang ở, suy từ lõi snapshot.
   *
   * Trước đây hàm này tự tính tài sản theo GIÁ VỐN và tiết kiệm chỉ tính gốc,
   * còn getChecklistStatus tính theo GIÁ THỊ TRƯỜNG — hai định nghĩa khác nhau
   * cho cùng một khái niệm. Giờ cả hai đọc chung một chỗ.
   */
  getActivePhase() {
    const core = this._snapshotCore();
    if (!core.phases.length) return null;

    const resolved = this._resolvePhase(core);
    const activePhase = core.phases.find((p) => p.id === resolved.id);

    // Cập nhật cờ is_active nếu đổi. save() sẽ xoá bộ nhớ đệm, nên đọc lõi
    // trước rồi mới ghi.
    const currentActive = this.queryOne('SELECT id FROM phases WHERE is_active = 1');
    if (!currentActive || currentActive.id !== activePhase.id) {
      this.run('UPDATE phases SET is_active = 0');
      this.run('UPDATE phases SET is_active = 1 WHERE id = ?', [activePhase.id]);
      this.save();
    }

    return { ...activePhase, is_active: 1 };
  }

  setActivePhase(phaseId) {
    this.run('UPDATE phases SET is_active = 0');
    this.run('UPDATE phases SET is_active = 1 WHERE id = ?', [phaseId]);
    this.save();
  }
  getChecklistStatus() {
    // Mọi con số tài sản lấy từ lõi snapshot, để checklist và máy dò giai đoạn
    // không bao giờ nói hai chuyện khác nhau về cùng một ngưỡng.
    const core = this._snapshotCore();
    const monthlyExpense = core.params.FI_MONTHLY_EXPENSE || 4000000;
    const portfolio = core.portfolio.items;
    const savings = core.savings.accounts.filter(s => s.status === 'active');
    const totalSavings = core.savings.principal;
    const totalAssets = core.netWorth.total;
    const duPhongSavings = core.savings.reserveBalance;
    const hasTermSavings = savings.some(s => s.type === 'term');
    const goldAssets = portfolio.filter(p => p.asset_class === 'gold');
    // Cổ phiếu là cổ phiếu. Trước đây phép lọc là "không phải vàng và không
    // phải ETF" nên crypto, trái phiếu và mọi thứ khác đều được đếm là cổ phiếu.
    const stockAssets = portfolio.filter(p => p.asset_class === 'stock');
    const etfAssets = portfolio.filter(p => p.asset_class === 'etf');
    // LOWER(): giao diện ghi 'Sniper' (SniperPlaybook.jsx:188, ExecutionLog.jsx:395)
    // còn SQLite so sánh TEXT phân biệt hoa thường, nên `= 'sniper'` không bao giờ
    // khớp. Cùng phép so ở :1538 vốn đã dùng LOWER() cho đúng.
    const sniperTxns = this.query("SELECT COUNT(*) as cnt FROM transactions WHERE LOWER(strategy) = 'sniper'");
    const sniperDeployed = (sniperTxns[0]?.cnt || 0) > 0;
    const hasAnySavings = savings.length > 0;
    const hasAnyStocks = stockAssets.length > 0 || etfAssets.length > 0;
    const hasETF = etfAssets.length > 0;
    const diversified = (stockAssets.length + etfAssets.length) >= 3;
    const hasGold = goldAssets.length > 0;

    // Phase 2: gold_fund = đã phân bổ quỹ vàng (có actual_amount > 0 trong danh mục Vàng)
    const goldAllocated = this.queryOne(`
      SELECT COALESCE(SUM(CASE WHEN a.actual_amount > 0 THEN a.actual_amount ELSE a.planned_amount END), 0) as total
      FROM allocations a
      JOIN categories c ON c.id = a.category_id
      WHERE c.name LIKE '%Vàng%'
    `)?.total > 0;

    // Phase 2: sniper_ammo = đã thực sự phân bổ tiền vào quỹ Bắn Tỉa (không chỉ cấu hình tỷ lệ)
    const sniperAllocated = this.queryOne(`
      SELECT COALESCE(SUM(CASE WHEN a.actual_amount > 0 THEN a.actual_amount ELSE a.planned_amount END), 0) as total
      FROM allocations a
      JOIN categories c ON c.id = a.category_id
      WHERE c.name LIKE '%Bắn Tỉa%'
    `)?.total > 0;

    // Phase 3: gov_bonds = sở hữu trái phiếu hoặc sổ tiết kiệm loại bond
    const hasBonds = (this.queryOne(`
      SELECT COUNT(*) as cnt FROM transactions t
      JOIN asset_types a ON a.id = t.asset_type_id
      WHERE a.asset_class = 'bond'
    `)?.cnt || 0) > 0 || savings.some(s => s.product_type === 'bond');

    // Giai đoạn 4: thu nhập thụ động = tiền THỰC SỰ đã về tài khoản mỗi tháng.
    // Chỉ đếm lãi ngân hàng đã ghi nhận và cổ tức đã ghi nhận trong 12 tháng gần
    // nhất. Không dùng `note LIKE '%lãi%'` nữa: câu đó bắt luôn ghi chú "chốt
    // lãi" của một lệnh bán, rồi cộng cả số tiền bán vào thu nhập thụ động.
    const interestRow = this.queryOne(`
      SELECT COALESCE(SUM(amount), 0) as total FROM savings_transactions
      WHERE type = 'interest' AND date >= date('now', '-12 months')
    `);
    const dividendRow = this.queryOne(`
      SELECT COALESCE(SUM(total_amount), 0) as total FROM transactions
      WHERE UPPER(type) = 'DIVIDEND' AND date >= date('now', '-12 months')
    `);
    const passiveWindow = 12;
    const monthlyPassive =
      ((interestRow?.total || 0) + (dividendRow?.total || 0)) / passiveWindow;
    const hasPassiveIncome = monthlyPassive >= monthlyExpense;

    // Giai đoạn 4: cân lại danh mục. Một lệnh mua đơn lẻ không phải là cân lại;
    // phải có tiền vào từ hai nhóm tài sản trở lên, hoặc có bán bớt.
    const recentClasses = this.query(`
      SELECT DISTINCT COALESCE(a.asset_class, 'other') as cls
      FROM transactions t
      JOIN asset_types a ON a.id = t.asset_type_id
      WHERE t.date >= date('now', '-90 days')
    `).length;
    const recentSells = (this.queryOne(
      "SELECT COUNT(*) as cnt FROM transactions WHERE type = 'SELL' AND date >= date('now', '-90 days')"
    )?.cnt || 0) > 0;
    const hasRecentRebalance = recentClasses >= 2 || recentSells;

    return {
      1: {
        savings_acc: hasAnySavings,
        broker_acc: portfolio.length > 0,
        emergency_3x: duPhongSavings >= 3 * monthlyExpense,
        first_etf: hasAnyStocks,
        // Đã ghi nhận ít nhất một tháng nghĩa là người dùng có ghi chép thật.
        // Trước đây mục này hardcode `true` nên luôn hiện đã hoàn thành dù hệ
        // thống chưa từng kiểm gì.
        track_money: this.getFilledMonths().length > 0,
      },
      2: {
        emergency_done: duPhongSavings >= 3 * monthlyExpense,
        diversify_stocks: diversified,
        gold_fund: goldAllocated,
        sniper_ammo: sniperAllocated,
        start_tktp: hasTermSavings,
      },
      3: {
        gold_1chi: goldAssets.some(g => g.total_quantity >= 1),
        dividend_stocks: stockAssets.length >= 3,
        tktp_1so: hasTermSavings,
        sniper_deploy: sniperDeployed,
        gov_bonds: hasBonds,
      },
      4: {
        passive_income: hasPassiveIncome,
        balanced_portfolio: diversified && hasGold && hasTermSavings,
        emergency_6x: duPhongSavings >= 6 * monthlyExpense,
        rebalance_quarterly: hasRecentRebalance,
      },
    };
  }
  getPhaseAllocations(phaseId) {
    return this.query(`
      SELECT pa.*, c.name as category_name, c.color, c.icon
      FROM phase_allocations pa
      JOIN categories c ON c.id = pa.category_id
      WHERE pa.phase_id = ?
      ORDER BY c.sort_order
    `, [phaseId]);
  }
  updatePhaseAllocations(phaseId, allocations) {
    this.run('DELETE FROM phase_allocations WHERE phase_id = ?', [phaseId]);
    for (const a of allocations || []) {
      // Nhận cả hai dạng: object {category_id, ratio} — đúng dạng mà
      // getPhaseAllocations() trả về, nên lấy kết quả GET đưa thẳng vào POST
      // là chạy được — và cặp [catId, ratio] của các nơi gọi cũ.
      const catId = Array.isArray(a) ? a[0] : a.category_id;
      const ratio = Array.isArray(a) ? a[1] : a.ratio;
      if (catId == null || ratio == null) continue;
      this.run('INSERT INTO phase_allocations (phase_id, category_id, ratio) VALUES (?, ?, ?)', [phaseId, catId, ratio]);
    }
    this.save();
  }

  // ===== MONTHLY ENTRIES =====
  getMonthlyEntries() { return this.query('SELECT * FROM monthly_entries ORDER BY month_index'); }
  getMonthlyEntry(monthIndex) { return this.queryOne('SELECT * FROM monthly_entries WHERE month_index = ?', [monthIndex]); }
  /**
   * Các tháng người dùng đã nhập và đã lưu. Lọc theo TRẠNG THÁI, không theo
   * total_inflow: tháng chi vượt thu có total_inflow bằng 0, lọc theo số tiền
   * thì tháng đó biến mất khỏi mọi thống kê dù người dùng đã nhập và đã lưu.
   */
  getFilledMonths() {
    return this.query(
      "SELECT * FROM monthly_entries WHERE status IN ('confirmed', 'filled') ORDER BY month_index"
    );
  }
  getNextUnfilledMonth() {
    // 1. Find the first month in chronological order that is not confirmed (unfilled)
    const firstUnfilled = this.queryOne("SELECT * FROM monthly_entries WHERE status IS NULL OR (status != 'confirmed' AND status != 'filled') ORDER BY month_index ASC LIMIT 1");
    if (firstUnfilled) return firstUnfilled;

    // 2. If all generated timeline months are filled, create and return the next chronological month
    const lastMonth = this.queryOne("SELECT * FROM monthly_entries ORDER BY month_index DESC LIMIT 1");
    if (lastMonth) {
      const parts = lastMonth.month_label.match(/T(\d+)\/(\d+)/);
      if (parts) {
        let nextM = parseInt(parts[1]) + 1;
        let nextY = parseInt(parts[2]);
        if (nextM > 12) { nextM = 1; nextY++; }
        const nextLabel = `T${nextM}/${nextY}`;
        const newIdx = lastMonth.month_index + 1;
        this.run('INSERT INTO monthly_entries (month_index, month_label, phase_id) VALUES (?, ?, ?)', [newIdx, nextLabel, lastMonth.phase_id || 1]);
        this.save();
        return this.queryOne('SELECT * FROM monthly_entries WHERE month_index = ?', [newIdx]);
      }
    }

    return null;
  }

  deleteMonthlyEntry(monthIndex) {
    const entry = this.getMonthlyEntry(monthIndex);
    if (!entry) return;
    // Delete allocations for this month
    this.run('DELETE FROM allocations WHERE monthly_entry_id = ?', [entry.id]);
    // Delete transactions linked to this month
    this.run('DELETE FROM transactions WHERE monthly_entry_id = ?', [entry.id]);
    // Reset the monthly entry (keep the row, just clear data)
    this.run(`UPDATE monthly_entries SET
      income = 0, expense = 0, bonus = 0, total_inflow = 0, note = '', status = 'draft'
      WHERE month_index = ?`, [monthIndex]);
    // Log activity
    this.run('INSERT INTO activity_log (date, type, description) VALUES (?, ?, ?)',
      [new Date().toISOString().split('T')[0], 'DELETE_ENTRY', `Xóa nhập liệu ${entry.month_label}`]);
    this.save();
  }

  saveMonthlyEntry(data) {
    // total_inflow LUÔN được suy ra từ thu/chi/thưởng, không nhận giá trị do
    // nơi gọi truyền vào. Hai lý do:
    //  1. Trước đây phép chuẩn hoá này chỉ nằm ở routes.js nên bản web và bản
    //     Electron (gọi thẳng IPC) lưu ra hai con số khác nhau cho cùng input.
    //  2. Nơi gọi có thể gửi total_inflow mâu thuẫn với chính thu/chi của nó,
    //     mà mọi phép tính phía sau (phân bổ, tiền mặt, giai đoạn) đều đọc
    //     total_inflow — sai một chỗ là sai cả chuỗi.
    const income = Number(data.income) || 0;
    const expense = Number(data.expense) || 0;
    const bonus = Number(data.bonus) || 0;
    const totalInflow = Math.max(0, income + bonus - expense);

    const existing = this.getMonthlyEntry(data.month_index);
    if (existing) {
      this.run(`UPDATE monthly_entries SET
        income = ?, expense = ?, bonus = ?, total_inflow = ?, note = ?, phase_id = ?, status = ?
        WHERE month_index = ?`,
        [income, expense, bonus, totalInflow,
         data.note || null, data.phase_id || null, data.status || 'confirmed', data.month_index]);
    } else {
      this.run(`INSERT INTO monthly_entries (month_index, month_label, income, expense, bonus, total_inflow, note, phase_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.month_index, data.month_label, income, expense, bonus,
         totalInflow, data.note || null, data.phase_id || null, data.status || 'confirmed']);
    }
    // Để lời gọi bên dưới (ghi nhật ký) dùng đúng con số đã chuẩn hoá.
    data = { ...data, total_inflow: totalInflow };
    // Clean up old activity for this month to avoid duplicates
    if (data.month_label) {
      this.run(`DELETE FROM activity_log WHERE type = 'MONTHLY_ENTRY' AND description LIKE ?`, [`Nhập liệu ${data.month_label}%`]);
    }
    // Calculate log date based on the month being entered rather than today's date
    let logDate = new Date().toISOString().split('T')[0];
    if (data.month_label) {
      const match = data.month_label.match(/T(\d+)\/(\d+)/);
      if (match) {
        const m = match[1].padStart(2, '0');
        const y = match[2];
        logDate = `${y}-${m}-01`;
      }
    }
    // Log activity
    this.run('INSERT INTO activity_log (date, type, description, amount) VALUES (?, ?, ?, ?)',
      [logDate, 'MONTHLY_ENTRY',
       `Nhập liệu ${data.month_label || ''}: ${formatVND(data.total_inflow)}`, data.total_inflow || 0]);

    this.snapshotPortfolio(data.month_index);
    this.save();
  }

  /**
   * Chụp lại danh mục tại thời điểm chốt một tháng.
   *
   * Bảng portfolio_snapshots có từ đầu nhưng chưa ai ghi vào, nên app không có
   * cách nào biết tài sản đã đi qua những mốc nào — mọi biểu đồ "tăng trưởng
   * theo thời gian" đều phải suy ngược từ giao dịch, mà giá quá khứ từng ngày
   * chốt tháng thì suy ngược không chính xác được. Ghi từ bây giờ.
   *
   * Cố ý KHÔNG bù ngược các tháng cũ: giá đóng cửa của những ngày đó không còn
   * lấy lại được, bịa ra một con số trông có vẻ đúng còn tệ hơn là để trống.
   */
  snapshotPortfolio(monthIndex) {
    if (!monthIndex) return;
    // Bảng không có ràng buộc UNIQUE nên INSERT OR REPLACE không gộp dòng —
    // phải xoá trước, nếu không sửa lại một tháng là nhân đôi số dòng.
    this.run('DELETE FROM portfolio_snapshots WHERE month_index = ?', [monthIndex]);

    const portfolio = this.getPortfolio();
    for (const item of portfolio) {
      this.run(
        'INSERT INTO portfolio_snapshots (month_index, asset_type_id, quantity, avg_cost, market_value) VALUES (?, ?, ?, ?, ?)',
        [monthIndex, item.asset_type_id, item.total_quantity || 0, item.avg_cost || 0, item.current_value || 0]
      );
    }
  }

  /** Lịch sử danh mục theo tháng, để vẽ đường tăng trưởng thật. */
  getPortfolioHistory() {
    return this.query(`
      SELECT ps.month_index, me.month_label,
             SUM(ps.market_value) as market_value,
             SUM(ps.quantity * ps.avg_cost) as invested,
             COUNT(*) as assets
      FROM portfolio_snapshots ps
      LEFT JOIN monthly_entries me ON me.month_index = ps.month_index
      GROUP BY ps.month_index
      ORDER BY ps.month_index
    `);
  }

  /**
   * Tài sản ròng theo từng tháng đã ghi, tính XUÔI thời gian từ bản ghi thật.
   *
   * Mỗi mốc dùng đúng ba thành phần mà getFinancialSnapshot dùng — tiền mặt,
   * giá thị trường danh mục, gốc và lãi tiết kiệm — nên điểm cuối cùng của
   * đường này bằng đúng tổng tài sản đang hiển thị trên Tổng quan.
   *
   * Quá khứ đứng yên: không có con số nào của hôm nay đi vào các mốc trước.
   */
  getNetWorthHistory() {
    const months = this.getFilledMonths();
    if (!months.length) return [];

    const allocs = this.getAllAllocations();
    const amountOf = (a) => (a.actual_amount > 0 ? a.actual_amount : a.planned_amount || 0);

    // Giao dịch mua bán, kèm ngày, để cộng dồn tới từng mốc.
    const txns = this.query(`
      SELECT t.date, t.type, t.total_amount, t.fee, t.quantity, t.asset_type_id,
             a.asset_class
      FROM transactions t
      JOIN asset_types a ON a.id = t.asset_type_id
      ORDER BY t.date ASC, t.id ASC
    `);

    // Tiền vào ra sổ tiết kiệm, kèm ngày.
    const svTxns = this.query(`
      SELECT date, type, amount FROM savings_transactions ORDER BY date ASC, id ASC
    `);

    // Ảnh chụp danh mục theo tháng, nếu có. Tháng nào chưa chụp thì dựng lại
    // từ giao dịch với GIÁ ĐÓNG CỬA gần nhất trước mốc đó — không dùng giá
    // hôm nay, vì như vậy là để hôm nay quyết định quá khứ.
    const snaps = {};
    for (const r of this.query('SELECT month_index, SUM(market_value) as v FROM portfolio_snapshots GROUP BY month_index')) {
      snaps[r.month_index] = r.v || 0;
    }

    const priceAt = (assetId, dateStr) => {
      const row = this.queryOne(
        'SELECT close FROM price_snapshots WHERE asset_type_id = ? AND date <= ? ORDER BY date DESC LIMIT 1',
        [assetId, dateStr]
      );
      return row ? row.close : null;
    };

    /** Ngày cuối tháng của một dòng monthly_entries. */
    const endOf = (label) => {
      const m = String(label || '').match(/T(\d+)\/(\d+)/);
      if (!m) return null;
      const month = Number(m[1]);
      const year = Number(m[2]);
      const last = new Date(year, month, 0).getDate();
      return `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    };

    const out = [];
    for (const me of months) {
      const asOf = endOf(me.month_label);
      if (!asOf) continue;

      // ── Tiền mặt: tiền nhàn rỗi đã ghi trừ phần đã chia và đã tiêu ──
      const inflow = months
        .filter((m) => m.month_index <= me.month_index)
        .reduce((x, m) => x + (Number(m.total_inflow) || 0), 0);
      const deficit = months
        .filter((m) => m.month_index <= me.month_index)
        .reduce(
          (x, m) =>
            x + Math.max(0, (Number(m.expense) || 0) - (Number(m.income) || 0) - (Number(m.bonus) || 0)),
          0
        );
      const ids = new Set(
        months.filter((m) => m.month_index <= me.month_index).map((m) => m.id)
      );
      const mine = allocs.filter((a) => ids.has(a.monthly_entry_id));
      const allocated = mine.reduce((x, a) => x + amountOf(a), 0);

      // Cùng hai thành phần mà snapshot dùng: phần chưa chia cho danh mục nào,
      // cộng phần đã chia cho danh mục thị trường nhưng chưa kịp mua.
      const unallocated = Math.max(0, inflow - allocated - deficit);
      const toMarket = mine
        .filter((a) => {
          const n = a.category_name || '';
          return !n.includes('Dự Phòng') && !n.includes('Tiết kiệm');
        })
        .reduce((x, a) => x + amountOf(a), 0);
      const deployedSoFar = txns
        .filter((t) => t.date <= asOf)
        .reduce(
          (x, t) =>
            x + (t.type === 'BUY'
              ? (t.total_amount || 0) + (t.fee || 0)
              : -(t.total_amount || 0) + (t.fee || 0)),
          0
        );
      const cash = unallocated + Math.max(0, toMarket - deployedSoFar);

      // ── Danh mục: ảnh chụp nếu có, không thì dựng lại theo giá đúng ngày ──
      let market = snaps[me.month_index];
      if (market === undefined) {
        const held = {};
        for (const t of txns) {
          if (t.date > asOf) break;
          const q = Number(t.quantity) || 0;
          held[t.asset_type_id] = (held[t.asset_type_id] || 0) + (t.type === 'BUY' ? q : -q);
        }
        market = 0;
        for (const [assetId, qty] of Object.entries(held)) {
          if (qty <= 0) continue;
          const px = priceAt(Number(assetId), asOf);
          if (px) market += qty * px;
        }
      }

      // ── Tiết kiệm: cộng dồn tiền vào ra và lãi đã ghi tới mốc đó ──
      let savings = 0;
      for (const acc of this.getSavingsAccounts()) {
        const upTo = (acc.transactions || []).filter((t) => t.date <= asOf);
        if (!upTo.length) continue;
        const principal = upTo.reduce(
          (x, t) =>
            x + (t.type === 'deposit' ? t.amount : t.type === 'withdraw' ? -t.amount : 0),
          0
        );
        if (principal <= 0) continue;
        // Lãi tính TỚI MỐC ĐÓ, không phải lãi của hôm nay.
        savings += principal + this.calculateAccruedInterest(acc, upTo, false, asOf);
      }

      out.push({
        month_index: me.month_index,
        month_label: me.month_label,
        date: asOf,
        cash,
        portfolio: market,
        savings,
        total: cash + market + savings,
        // Ảnh chụp thật hay dựng lại — để giao diện nói rõ với người dùng.
        estimated: snaps[me.month_index] === undefined,
      });
    }
    return out;
  }

  // ===== ALLOCATIONS =====
  getAllocations(entryId) {
    return this.query(`
      SELECT a.*, c.name as category_name, c.color, c.icon
      FROM allocations a
      JOIN categories c ON c.id = a.category_id
      WHERE a.monthly_entry_id = ?
      ORDER BY c.sort_order
    `, [entryId]);
  }
  getAllAllocations() {
    return this.query(`
      SELECT a.*, c.name as category_name, c.color, c.icon
      FROM allocations a
      JOIN categories c ON c.id = a.category_id
      ORDER BY c.sort_order
    `);
  }
  saveAllocations(entryId, allocations) {
    this.run('DELETE FROM allocations WHERE monthly_entry_id = ?', [entryId]);
    for (const a of allocations) {
      this.run('INSERT INTO allocations (monthly_entry_id, category_id, planned_amount, actual_amount) VALUES (?, ?, ?, ?)',
        [entryId, a.category_id, a.planned_amount, a.actual_amount || 0]);
    }
    this.save();
  }

  getDiscrepancyLogs() {
    return this.query(`
      SELECT d.*, c.name as category_name
      FROM discrepancy_logs d
      LEFT JOIN categories c ON c.id = d.target_category_id
      ORDER BY d.date DESC, d.id DESC
    `);
  }

  adjustInvestmentAllocation(discrepancyAmount, categoryId, reason, dateStr) {
    // Find the most recent monthly entry that actually has allocations
    let latest = this.queryOne(`
      SELECT DISTINCT me.id, me.month_index, me.month_label 
      FROM monthly_entries me 
      JOIN allocations a ON a.monthly_entry_id = me.id 
      WHERE me.status = 'confirmed' OR me.income IS NOT NULL
      ORDER BY me.month_index DESC LIMIT 1
    `);
    // Fallback: any filled entry
    if (!latest) {
      latest = this.queryOne("SELECT id, month_index, month_label FROM monthly_entries WHERE income IS NOT NULL OR status = 'filled' ORDER BY month_index DESC LIMIT 1");
    }
    if (!latest) return;

    if (categoryId) {
      const target = this.queryOne('SELECT * FROM allocations WHERE monthly_entry_id = ? AND category_id = ?', [latest.id, categoryId]);
      if (target) {
        const newAmount = (target.actual_amount || target.planned_amount || 0) + discrepancyAmount;
        this.run('UPDATE allocations SET actual_amount = ? WHERE id = ?', [Math.max(0, newAmount), target.id]);
      } else {
        this.run('INSERT INTO allocations (monthly_entry_id, category_id, planned_amount, actual_amount) VALUES (?, ?, 0, ?)', [latest.id, categoryId, Math.max(0, discrepancyAmount)]);
      }
    } else {
      // Fallback
      const allAllocs = this.query(`
        SELECT a.id, a.actual_amount, a.planned_amount, a.monthly_entry_id, c.name as category_name
        FROM allocations a
        JOIN categories c ON c.id = a.category_id
        WHERE a.monthly_entry_id = ?
      `, [latest.id]);
      const investAllocs = allAllocs.filter(a => !a.category_name.includes('Dự Phòng') && !a.category_name.includes('Tiết kiệm'));

      if (investAllocs.length > 0) {
        const target = investAllocs[0];
        const newAmount = (target.actual_amount || target.planned_amount || 0) + discrepancyAmount;
        this.run('UPDATE allocations SET actual_amount = ? WHERE id = ?', [Math.max(0, newAmount), target.id]);
      }
    }

    this.run('INSERT INTO discrepancy_logs (date, month_index, month_label, amount, reason, target_category_id) VALUES (?, ?, ?, ?, ?, ?)',
      [dateStr || this._todayLocal(), latest.month_index, latest.month_label, discrepancyAmount, reason || '', categoryId || null]);

    // Lấy id TRƯỚC save() — save() xuất lại cả tệp nên last_insert_rowid() mất.
    const id = this.lastId();
    this.save();
    return { id, amount: discrepancyAmount };
  }

  /**
   * Đảo lại một bút toán điều chỉnh đã ghi. Không có hàm này thì nút "huỷ xác
   * nhận" chỉ xoá dấu vết trên máy người dùng, còn số liệu trong sổ vẫn cộng
   * thêm mỗi lần bấm.
   */
  revertInvestmentAllocation(logId) {
    const log = this.queryOne('SELECT * FROM discrepancy_logs WHERE id = ?', [logId]);
    if (!log) return { reverted: false, reason: 'not_found' };

    const entry = this.queryOne('SELECT id FROM monthly_entries WHERE month_index = ?', [log.month_index]);
    if (entry && log.target_category_id) {
      const target = this.queryOne(
        'SELECT * FROM allocations WHERE monthly_entry_id = ? AND category_id = ?',
        [entry.id, log.target_category_id]
      );
      if (target) {
        const newAmount = (target.actual_amount || target.planned_amount || 0) - log.amount;
        // Dòng do chính bút toán này sinh ra (kế hoạch bằng 0) thì xoá hẳn,
        // đừng để lại một dòng 0 đồng trong bảng phân bổ.
        if (!target.planned_amount && newAmount <= 0) {
          this.run('DELETE FROM allocations WHERE id = ?', [target.id]);
        } else {
          this.run('UPDATE allocations SET actual_amount = ? WHERE id = ?', [Math.max(0, newAmount), target.id]);
        }
      }
    }

    this.run('DELETE FROM discrepancy_logs WHERE id = ?', [logId]);
    this.save();
    return { reverted: true, amount: log.amount };
  }

  // ===== TRANSACTIONS =====
  getTransactions() {
    return this.query(`
      SELECT t.*, a.name as asset_type_name, a.category as asset_category, a.ticker, a.unit, a.icon,
        CASE WHEN t.asset_name != '' THEN t.asset_name ELSE a.name END as display_name
      FROM transactions t
      JOIN asset_types a ON a.id = t.asset_type_id
      ORDER BY t.date DESC, t.id DESC
    `);
  }
  addTransaction(data) {
    this.run(`INSERT INTO transactions (date, asset_type_id, asset_name, type, quantity, price, total_amount, fee, note, monthly_entry_id, strategy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.date, data.asset_type_id, data.asset_name || '', data.type, data.quantity, data.price,
       data.total_amount, data.fee || 0, data.note || '', data.monthly_entry_id || null, data.strategy || '']);
    // Log activity
    const asset = this.queryOne('SELECT name, ticker FROM asset_types WHERE id = ?', [data.asset_type_id]);
    const displayName = data.asset_name || asset?.ticker || asset?.name || '';
    this.run('INSERT INTO activity_log (date, type, description, amount) VALUES (?, ?, ?, ?)',
      [data.date, data.type === 'BUY' ? 'BUY' : 'SELL',
       `${data.type === 'BUY' ? 'Mua' : 'Bán'} ${displayName} × ${data.quantity}`, data.total_amount]);
    this.save();
    return this.lastId();
  }
  deleteTransaction(id) {
    this.run('DELETE FROM transactions WHERE id = ?', [id]);
    this.save();
  }

  // ===== PORTFOLIO =====
  getPortfolio() {
    const assets = this.query(`
      SELECT id as asset_type_id, name, category, ticker, unit, color, icon, current_price, asset_class
      FROM asset_types
      WHERE active = 1 AND asset_class NOT IN ('savings', 'bond')
    `);
    const txs = this.query(`
      SELECT asset_type_id, type, quantity, price, total_amount, date
      FROM transactions
      ORDER BY date ASC, id ASC
    `);

    const txsByAsset = {};
    for (const t of txs) {
      if (!txsByAsset[t.asset_type_id]) txsByAsset[t.asset_type_id] = [];
      txsByAsset[t.asset_type_id].push(t);
    }

    const portfolio = [];
    for (const a of assets) {
      const assetTxs = txsByAsset[a.asset_type_id] || [];
      let qty = 0;
      let avgCost = 0;
      let firstBuyDate = null;

      for (const t of assetTxs) {
        const tQty = Number(t.quantity);
        const tAmount = Number(t.total_amount);

        if (t.type === 'BUY') {
          if (qty === 0) firstBuyDate = t.date;
          const prevQty = qty;
          qty += tQty;
          if (qty > 0) {
            avgCost = (prevQty * avgCost + tAmount) / qty;
          } else {
            avgCost = 0;
          }
        } else if (t.type === 'SELL') {
          qty = Math.max(0, qty - tQty);
          if (qty === 0) {
            avgCost = 0;
            firstBuyDate = null;
          }
        }
      }

      if (qty > 0) {
        const name = a.ticker && a.ticker !== '' ? a.ticker : a.name;
        const current_value = a.current_price > 0 ? qty * a.current_price : qty * avgCost;
        portfolio.push({
          asset_type_id: a.asset_type_id,
          name,
          category: a.category,
          ticker: a.ticker,
          unit: a.unit,
          color: a.color,
          icon: a.icon,
          current_price: a.current_price,
          asset_class: a.asset_class,
          total_quantity: qty,
          total_invested: qty * avgCost,
          avg_cost: avgCost,
          current_value,
          first_buy_date: firstBuyDate
        });
      }
    }

    // Sort by current_value DESC
    return portfolio.sort((x, y) => y.current_value - x.current_value);
  }

  // Map asset to allocation category based on asset_class and transaction strategy
  _getAssetAllocationCategory(assetTypeId, assetClass) {
    // Check if this asset has any sniper strategy transactions
    const sniperTx = this.queryOne(
      "SELECT COUNT(*) as cnt FROM transactions WHERE asset_type_id = ? AND LOWER(strategy) = 'sniper'",
      [assetTypeId]
    );
    if (sniperTx?.cnt > 0) return 'Bắn Tỉa';

    // Map by asset_class.
    // Tên trả về PHẢI trùng với categories.name, nếu không thì byCategory sinh ra
    // một khoá không ai tra được: Dashboard lọc theo tên danh mục nên sẽ bỏ sót
    // cả nhóm, còn tab Phân bổ rơi về số tiền kế hoạch trong khi mẫu số là giá
    // thị trường. migrateToV5 (:581) đã đổi 'Đầu Tư' → 'Chứng Khoán'.
    switch (assetClass) {
      case 'stock':
      case 'etf':
        return 'Chứng Khoán';
      case 'gold':
        return 'Vàng';
      case 'crypto':
        return 'Bắn Tỉa';  // High risk, speculative
      case 'bond':
      case 'savings':
        return 'Tiết kiệm & Trái phiếu';
      default:
        return 'Chứng Khoán';
    }
  }

  getPortfolioSummary() {
    const portfolio = this.getPortfolio();
    const totalInvested = portfolio.reduce((s, p) => s + p.total_invested, 0);
    const totalCurrentValue = portfolio.reduce((s, p) => s + p.current_value, 0);
    const totalGain = totalCurrentValue - totalInvested;
    const byCategory = {};

    // Investment assets — map to allocation category (not asset_types.category)
    for (const p of portfolio) {
      const catName = this._getAssetAllocationCategory(p.asset_type_id, p.asset_class || 'other');
      if (!byCategory[catName]) byCategory[catName] = { total: 0, currentTotal: 0, items: [] };
      byCategory[catName].total += p.total_invested;
      byCategory[catName].currentTotal += p.current_value;
      byCategory[catName].items.push(p);
    }

    // Savings accounts — group by their assigned category
    try {
      const savingsAccounts = this.getSavingsAccounts().filter(a => a.status === 'active');
      for (const a of savingsAccounts) {
        const catName = a.category_name || 'Tiết kiệm & Trái phiếu';
        const balance = a.current_balance || a.principal;
        if (!byCategory[catName]) byCategory[catName] = { total: 0, currentTotal: 0, items: [] };
        byCategory[catName].total += a.principal;
        byCategory[catName].currentTotal += balance;
        byCategory[catName].items.push({ name: a.name, type: 'savings', ...a });
      }
    } catch (e) {
      console.error('getPortfolioSummary: savings error:', e.message);
    }

    // Tính toán dòng tiền ra ròng thực tế của toàn bộ ví giao dịch (để tính Tiền mặt trên Dashboard)
    let netCashOutflow = totalInvested;
    try {
      const netFlowRes = this.queryOne("SELECT COALESCE(SUM(CASE WHEN type = 'BUY' THEN total_amount + fee ELSE -total_amount + fee END), 0) as net_flow FROM transactions");
      if (netFlowRes) {
        netCashOutflow = netFlowRes.net_flow;
      }
    } catch (e) {
      console.error('getPortfolioSummary: netCashOutflow error:', e.message);
    }

    return { portfolio, totalInvested, totalCurrentValue, totalGain, byCategory, netCashOutflow };
  }

  // ===== ACTIVITY LOG =====
  getActivityLog(limit = 20) {
    return this.query('SELECT * FROM activity_log ORDER BY date DESC, id DESC LIMIT ?', [limit]);
  }

  deleteActivityLog(id) {
    this.run('DELETE FROM activity_log WHERE id = ?', [id]);
    this.save();
    return true;
  }

  // ===== IMPORT EXCEL =====
  importExcel(filePath) {
    const wb = XLSX.readFile(filePath);
    return this._importWorkbook(wb);
  }

  exportExcel(filePath) {
    const wb = this._buildExportWorkbook();
    XLSX.writeFile(wb, filePath);
    return true;
  }

  importExcelBuffer(buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    return this._importWorkbook(wb);
  }

  exportExcelBuffer() {
    const wb = this._buildExportWorkbook();
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  _importWorkbook(wb) {
    const results = { parameters: 0, ledger: 0, transactions: 0 };

    if (wb.SheetNames.includes('⚙️ Tham Số')) {
      const data = XLSX.utils.sheet_to_json(wb.Sheets['⚙️ Tham Số'], { header: 1, defval: null });
      for (const row of data) {
        if (row[0] && typeof row[0] === 'string' && row[0].match(/^[A-Z_]+$/) && row[1] != null) {
          this.run('INSERT OR REPLACE INTO parameters (key, value, description) VALUES (?, ?, ?)', [row[0], row[1], row[2] || '']);
          results.parameters++;
        }
      }
    }

    if (wb.SheetNames.includes('📊 Master Ledger')) {
      const data = XLSX.utils.sheet_to_json(wb.Sheets['📊 Master Ledger'], { header: 1, defval: null });
      for (let i = 1; i < data.length; i++) {
        const r = data[i];
        if (!r || r[0] == null) continue;
        const idx = i;
        this.run(`INSERT OR REPLACE INTO monthly_entries (month_index, month_label, income, expense, bonus, total_inflow, note, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [idx, r[0], r[1] || 0, r[2] || 0, r[3] || 0, r[4] || 0, r[5] || '', r[6] || 'confirmed']);
        results.ledger++;
      }
    }

    if (wb.SheetNames.includes('📋 Execution Log')) {
      const data = XLSX.utils.sheet_to_json(wb.Sheets['📋 Execution Log'], { header: 1, defval: null });
      function excelDateToISO(serial) {
        if (typeof serial !== 'number') return serial;
        const d = new Date((Math.floor(serial) - 25569) * 86400000);
        return d.toISOString().split('T')[0];
      }
      for (let i = 1; i < data.length; i++) {
        const r = data[i];
        if (!r || r[0] == null) continue;
        // Column mapping: [STT, Ngày, Loại, Mã CK, Tên, Khối Lượng, Giá, Thành Tiền, Ghi Chú]
        const ticker = r[3] || '';
        const assetName = r[4] || '';
        let assetId = null;
        if (ticker) {
          const match = this.queryOne('SELECT id FROM asset_types WHERE ticker = ?', [ticker]);
          if (match) assetId = match.id;
        }
        if (!assetId && assetName) {
          const match = this.queryOne('SELECT id FROM asset_types WHERE name = ?', [assetName]);
          if (match) assetId = match.id;
        }
        if (!assetId) {
          // Default to parent "Cổ phiếu" category
          const fallback = this.queryOne("SELECT id FROM asset_types WHERE name = 'Cổ phiếu' AND ticker IS NULL");
          assetId = fallback?.id || 1;
        }
        const txnType = (r[2] && r[2].toUpperCase().includes('SELL')) ? 'SELL' : 'BUY';
        const qty = r[5] || 0;
        const price = r[6] || 0;
        const total = r[7] || (qty * price);
        this.run(`INSERT INTO transactions (date, asset_type_id, asset_name, type, quantity, price, total_amount, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [excelDateToISO(r[1]), assetId, assetName || ticker, txnType, qty, price, total, r[8] || '']);
        results.transactions++;
      }
    }

    this.save();
    return results;
  }

  _buildExportWorkbook() {
    const wb = XLSX.utils.book_new();

    const params = this.getParameters();
    const paramData = [['Key', 'Value', 'Description']];
    for (const p of params) {
      paramData.push([p.key, p.value, p.description]);
    }
    const wsParams = XLSX.utils.aoa_to_sheet(paramData);
    XLSX.utils.book_append_sheet(wb, wsParams, '⚙️ Tham Số');

    const ledger = this.getMonthlyEntries();
    const ledgerHeader = ['Tháng', 'Thu Nhập', 'Chi Tiêu', 'Thưởng', 'Dòng Tiền', 'Ghi Chú', 'Trạng Thái'];
    const ledgerData = [ledgerHeader];
    for (const row of ledger) {
      ledgerData.push([
        row.month_label, row.income || 0, row.expense || 0, row.bonus || 0,
        row.total_inflow || 0, row.note || '', row.status || 'draft'
      ]);
    }
    const wsLedger = XLSX.utils.aoa_to_sheet(ledgerData);
    XLSX.utils.book_append_sheet(wb, wsLedger, '📊 Master Ledger');

    const txns = this.getTransactions();
    const txnHeader = ['STT', 'Ngày', 'Loại', 'Mã CK', 'Tên', 'Khối Lượng', 'Giá', 'Thành Tiền', 'Ghi Chú'];
    const txnData = [txnHeader];
    txns.forEach((t, i) => {
      txnData.push([
        i + 1, t.date, t.type, t.asset_type_name || '', t.display_name || '',
        t.quantity, t.price, t.total_amount, t.note || ''
      ]);
    });
    const wsTxns = XLSX.utils.aoa_to_sheet(txnData);
    XLSX.utils.book_append_sheet(wb, wsTxns, '📋 Execution Log');

    const assets = this.getAssetTypes();
    const assetHeader = ['ID', 'Tên', 'Loại', 'Mã', 'Đơn Vị', 'Giá Hiện Tại'];
    const assetData = [assetHeader];
    for (const a of assets) {
      assetData.push([a.id, a.name, a.category, a.ticker || '', a.unit, a.current_price || 0]);
    }
    const wsAssets = XLSX.utils.aoa_to_sheet(assetData);
    XLSX.utils.book_append_sheet(wb, wsAssets, '📦 Asset Types');

    return wb;
  }

  // ===== DATA MANAGEMENT =====
  getStats() {
    const monthly = this.query('SELECT COUNT(*) as c FROM monthly_entries WHERE total_inflow > 0')[0]?.c || 0;
    const txns = this.query('SELECT COUNT(*) as c FROM transactions')[0]?.c || 0;
    const allocs = this.query('SELECT COUNT(*) as c FROM allocations')[0]?.c || 0;
    const activity = this.query('SELECT COUNT(*) as c FROM activity_log')[0]?.c || 0;
    const savings = this.query('SELECT COUNT(*) as c FROM savings_accounts')[0]?.c || 0;
    return { monthly, txns, allocs, activity, savings };
  }

  clearTransactions() {
    this.run('DELETE FROM transactions');
    this.run("INSERT INTO activity_log (date, type, description) VALUES (?, ?, ?)",
      [new Date().toISOString().split('T')[0], 'CLEAR', 'Xóa tất cả giao dịch']);
    this.save();
  }

  clearMonthlyEntries() {
    this.run('DELETE FROM allocations');
    this.run('DELETE FROM transactions');
    this.run('UPDATE monthly_entries SET income=0, expense=0, bonus=0, total_inflow=0, note="", status="draft"');
    this.run("INSERT INTO activity_log (date, type, description) VALUES (?, ?, ?)",
      [new Date().toISOString().split('T')[0], 'CLEAR', 'Xóa tất cả dữ liệu nhập liệu']);
    this.save();
  }

  clearSavings() {
    this.run('DELETE FROM savings_transactions');
    this.run('DELETE FROM savings_accounts');
    this.run("INSERT INTO activity_log (date, type, description) VALUES (?, ?, ?)",
      [new Date().toISOString().split('T')[0], 'CLEAR', 'Xóa tất cả sổ tiết kiệm']);
    this.save();
  }

  clearAll() {
    this.run('DELETE FROM allocations');
    this.run('DELETE FROM transactions');
    this.run('UPDATE monthly_entries SET income=0, expense=0, bonus=0, total_inflow=0, note="", status="draft"');
    this.run('DELETE FROM activity_log');
    this.run('DELETE FROM portfolio_snapshots');
    this.run('DELETE FROM savings_transactions');
    this.run('DELETE FROM savings_accounts');
    // Reset phase detection
    this.run('UPDATE phases SET is_active = 0');
    this.run('UPDATE phases SET is_active = 1 WHERE sort_order = 1');
    this.save();
  }

  // ===== WATCHLIST (compatibility wrappers → use asset_types) =====
  getWatchlist() {
    // Return tracked assets in watchlist-compatible shape
    return this.query("SELECT id, name, ticker, current_price, peak_price, unit, asset_class, is_tracked FROM asset_types WHERE is_tracked = 1 AND active = 1 ORDER BY sort_order");
  }
  addWatchlistItem(data) {
    // Find or create asset_type with this ticker
    if (data.ticker) {
      const existing = this.queryOne('SELECT id FROM asset_types WHERE ticker = ?', [data.ticker]);
      if (existing) {
        this.setTracked(existing.id, true);
        if (data.current_price) this.updateAssetPrice(existing.id, data.current_price);
        return existing.id;
      }
    }
    const id = this.addAssetType({ ...data, category: data.category || 'Giao dịch', asset_class: data.asset_class || 'stock' });
    this.setTracked(id, true);
    if (data.current_price) this.updateAssetPrice(id, data.current_price);
    return id;
  }
  updateWatchlistItem(id, data) {
    // Map watchlist fields to asset_types fields
    const fieldMap = { current_price: 'current_price', peak_price: 'peak_price', name: 'name', unit: 'unit' };
    const fields = [];
    const vals = [];
    for (const [k, v] of Object.entries(data)) {
      if (fieldMap[k]) { fields.push(`${fieldMap[k]} = ?`); vals.push(v); }
    }
    if (fields.length) {
      vals.push(id);
      this.run(`UPDATE asset_types SET ${fields.join(', ')} WHERE id = ?`, vals);
      this.save();
    }
  }
  removeWatchlistItem(id) {
    this.setTracked(id, false);
  }

  // ===== PRICE SNAPSHOTS =====
  savePriceSnapshot(assetTypeId, date, ohlcv) {
    this.run(`INSERT OR REPLACE INTO price_snapshots (asset_type_id, date, open, high, low, close, volume, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'vndirect')`,
      [assetTypeId, date, ohlcv.open, ohlcv.high, ohlcv.low, ohlcv.close, ohlcv.volume || 0]);
    this.save();
  }
  getPriceHistory(assetTypeId, days = 30) {
    return this.query(
      'SELECT * FROM price_snapshots WHERE asset_type_id = ? ORDER BY date DESC LIMIT ?',
      [assetTypeId, days]
    );
  }
  getLatestPrice(assetTypeId) {
    return this.queryOne(
      'SELECT * FROM price_snapshots WHERE asset_type_id = ? ORDER BY date DESC LIMIT 1',
      [assetTypeId]
    );
  }

  // ===== ALERTS =====
  getAlerts(unreadOnly = false) {
    const where = unreadOnly ? 'WHERE a.read = 0' : '';
    return this.query(`
      SELECT a.*, at.name as asset_name, at.ticker, at.icon
      FROM alerts a
      JOIN asset_types at ON at.id = a.asset_type_id
      ${where}
      ORDER BY a.read ASC, a.created_at DESC
    `);
  }
  getUnreadAlertCount() {
    return this.query('SELECT COUNT(*) as c FROM alerts WHERE read = 0')[0]?.c || 0;
  }
  addAlert(assetTypeId, type, message, data = null) {
    // Dedup window: take_profit = 7 days, others = 24 hours
    const window = type === 'take_profit' ? '-7 days' : '-1 day';
    const existing = this.queryOne(
      `SELECT id FROM alerts WHERE asset_type_id = ? AND type = ? AND created_at > datetime('now', '${window}')`,
      [assetTypeId, type]
    );
    if (existing) return existing.id;
    this.run('INSERT INTO alerts (asset_type_id, type, message, data) VALUES (?, ?, ?, ?)',
      [assetTypeId, type, message, data ? JSON.stringify(data) : null]);
    this.save();
    return this.lastId();
  }
  markAlertRead(id) {
    this.run('UPDATE alerts SET read = 1 WHERE id = ?', [id]);
    this.save();
  }
  markAllAlertsRead() {
    this.run('UPDATE alerts SET read = 1');
    this.save();
  }

  // ===== SAVINGS ACCOUNTS =====
  addSavingsAccount(data) {
    this.run(`INSERT INTO savings_accounts (name, bank, account_number, type, principal, interest_rate, term_months, start_date, maturity_date, auto_renew, category_id, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.bank, data.account_number || null, data.type || 'term',
       data.principal || 0, data.interest_rate || 0, data.term_months || 0,
       data.start_date, data.maturity_date || null, data.auto_renew ? 1 : 0,
       data.category_id || null, data.note || null]);
    const id = this.lastId();
    // Record initial deposit
    if (data.principal > 0) {
      this.run(`INSERT INTO savings_transactions (savings_account_id, type, amount, date, note)
        VALUES (?, 'deposit', ?, ?, ?)`, [id, data.principal, data.start_date, 'Gửi ban đầu']);
    }
    this.run('INSERT INTO activity_log (date, type, description, amount) VALUES (?, ?, ?, ?)',
      [data.start_date, 'SAVINGS', `Mở sổ tiết kiệm: ${data.name} tại ${data.bank}`, data.principal]);
    this.save();
    return id;
  }

  updateSavingsAccount(id, data) {
    const fields = [];
    const vals = [];
    for (const [k, v] of Object.entries(data)) {
      if (['name', 'bank', 'account_number', 'type', 'principal', 'interest_rate', 'term_months', 'start_date', 'maturity_date', 'auto_renew', 'category_id', 'note', 'status'].includes(k)) {
        fields.push(`${k} = ?`);
        vals.push(k === 'auto_renew' ? (v ? 1 : 0) : v);
      }
    }
    if (fields.length) {
      vals.push(id);
      this.run(`UPDATE savings_accounts SET ${fields.join(', ')} WHERE id = ?`, vals);
      this.save();
    }
  }

  deleteSavingsAccount(id) {
    this.run('DELETE FROM savings_transactions WHERE savings_account_id = ?', [id]);
    this.run('DELETE FROM savings_accounts WHERE id = ?', [id]);
    this.save();
  }

  getSavingsAccounts() {
    const accounts = this.query(`
      SELECT sa.*, c.name as category_name, c.color as category_color, c.icon as category_icon
      FROM savings_accounts sa
      LEFT JOIN categories c ON c.id = sa.category_id
      ORDER BY sa.status ASC, sa.maturity_date ASC
    `);
    return accounts.map(a => {
      const transactions = this.query('SELECT * FROM savings_transactions WHERE savings_account_id = ? ORDER BY date DESC', [a.id]);
      const accrued = this.calculateAccruedInterest(a, transactions);
      const projected = this.calculateAccruedInterest(a, transactions, true);
      const totalDeposited = transactions.filter(t => t.type === 'deposit').reduce((s, t) => s + t.amount, 0);
      const totalWithdrawn = transactions.filter(t => t.type === 'withdraw').reduce((s, t) => s + t.amount, 0);
      const totalInterest = transactions.filter(t => t.type === 'interest').reduce((s, t) => s + t.amount, 0);
      return {
        ...a,
        accrued_interest: accrued,
        projected_interest: projected,
        total_deposited: totalDeposited,
        total_withdrawn: totalWithdrawn,
        total_interest: totalInterest,
        current_balance: a.principal + accrued,
        transactions,
      };
    });
  }

  getSavingsAccount(id) {
    const a = this.queryOne('SELECT * FROM savings_accounts WHERE id = ?', [id]);
    if (!a) return null;
    const transactions = this.query('SELECT * FROM savings_transactions WHERE savings_account_id = ? ORDER BY date DESC', [a.id]);
    const accrued = this.calculateAccruedInterest(a, transactions);
    const projected = this.calculateAccruedInterest(a, transactions, true);
    return { ...a, accrued_interest: accrued, projected_interest: projected, transactions };
  }

  addSavingsTransaction(accountId, type, amount, date, note) {
    this.run(`INSERT INTO savings_transactions (savings_account_id, type, amount, date, note)
      VALUES (?, ?, ?, ?, ?)`, [accountId, type, amount, date, note || '']);
    // Update principal for deposits/withdrawals
    if (type === 'deposit') {
      this.run('UPDATE savings_accounts SET principal = principal + ? WHERE id = ?', [amount, accountId]);
    } else if (type === 'withdraw') {
      this.run('UPDATE savings_accounts SET principal = MAX(0, principal - ?) WHERE id = ?', [amount, accountId]);
    }
    this.save();
    return this.lastId();
  }

  getSavingsTransactions(accountId) {
    return this.query('SELECT * FROM savings_transactions WHERE savings_account_id = ? ORDER BY date DESC', [accountId]);
  }

  deleteSavingsTransaction(id) {
    const txn = this.queryOne('SELECT * FROM savings_transactions WHERE id = ?', [id]);
    if (!txn) return false;
    
    // Decrease/increase principal depending on transaction type
    if (txn.type === 'deposit') {
      this.run('UPDATE savings_accounts SET principal = MAX(0, principal - ?) WHERE id = ?', [txn.amount, txn.savings_account_id]);
    } else if (txn.type === 'withdraw') {
      this.run('UPDATE savings_accounts SET principal = principal + ? WHERE id = ?', [txn.amount, txn.savings_account_id]);
    }
    
    this.run('DELETE FROM savings_transactions WHERE id = ?', [id]);
    this.save();
    return true;
  }

  updateSavingsTransactionDate(id, date) {
    this.run('UPDATE savings_transactions SET date = ? WHERE id = ?', [date, id]);
    this.save();
    return true;
  }

  /**
   * Lãi đã tích của một sổ.
   *
   * `asOf` cho phép hỏi "tới ngày này là bao nhiêu" — biểu đồ lịch sử cần nó
   * để mốc quá khứ không mang theo lãi của hôm nay. Bỏ trống thì tính tới
   * hôm nay như trước.
   */
  calculateAccruedInterest(account, transactions, toMaturity = false, asOf = null) {
    if (!account || account.status !== 'active' || account.interest_rate <= 0) return 0;
    
    const parseDate = (dStr) => {
      if (!dStr) return new Date();
      if (dStr instanceof Date) return new Date(dStr.getFullYear(), dStr.getMonth(), dStr.getDate());
      const parts = String(dStr).split('T')[0].split('-');
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    };

    // Sort transactions oldest first
    const txns = (transactions || account.transactions || []).slice().sort((a, b) => parseDate(a.date) - parseDate(b.date));
    
    const today = asOf ? parseDate(asOf) : new Date();
    const todayNormalized = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    // Find latest transaction date
    let maxTxnDate = todayNormalized;
    for (const t of txns) {
      const d = parseDate(t.date);
      // Hỏi tới một ngày trong quá khứ thì giao dịch sau ngày đó chưa xảy ra.
      if (asOf && d > todayNormalized) continue;
      if (d > maxTxnDate) maxTxnDate = d;
    }

    let endDate = todayNormalized;
    if (account.maturity_date) {
      const maturity = parseDate(account.maturity_date);
      if (toMaturity || todayNormalized >= maturity) {
        endDate = maturity;
      } else {
        // For current accrued: take max of today and maxTxnDate (capped at maturity)
        endDate = maxTxnDate < maturity ? maxTxnDate : maturity;
      }
    } else {
      if (toMaturity) {
        endDate = todayNormalized;
      } else {
        endDate = maxTxnDate;
      }
    }
    
    let currentBalance = 0;
    let totalInterest = 0;
    let lastDate = parseDate(account.start_date);
    
    for (const txn of txns) {
      if (txn.type === 'interest') continue; // Interest payout doesn't accrue unless reinvested
      
      const txnDate = parseDate(txn.date);
      if (txnDate > endDate) break; // Stop computing if transaction is in the future relative to endDate
      
      const days = Math.max(0, Math.round((txnDate - lastDate) / (1000 * 60 * 60 * 24)));
      if (days > 0 && currentBalance > 0) {
        totalInterest += currentBalance * (account.interest_rate / 100) * (days / 365);
      }
      
      if (txn.type === 'deposit') currentBalance += txn.amount;
      if (txn.type === 'withdraw') currentBalance = Math.max(0, currentBalance - txn.amount);
      
      lastDate = txnDate;
    }
    
    // Add interest from last transaction date to endDate
    const remainingDays = Math.max(0, Math.round((endDate - lastDate) / (1000 * 60 * 60 * 24)));
    if (remainingDays > 0 && currentBalance > 0) {
      totalInterest += currentBalance * (account.interest_rate / 100) * (remainingDays / 365);
    }
    
    return Math.round(totalInterest);
  }

  getSavingsSummary() {
    const accounts = this.getSavingsAccounts().filter(a => a.status === 'active');
    const totalPrincipal = accounts.reduce((s, a) => s + a.principal, 0);
    const totalAccrued = accounts.reduce((s, a) => s + a.accrued_interest, 0);
    const totalInterestPaid = accounts.reduce((s, a) => s + a.total_interest, 0);

    const byBank = {};
    for (const a of accounts) {
      if (!byBank[a.bank]) byBank[a.bank] = { principal: 0, accrued: 0, count: 0 };
      byBank[a.bank].principal += a.principal;
      byBank[a.bank].accrued += a.accrued_interest;
      byBank[a.bank].count++;
    }

    const byType = { liquid: { principal: 0, count: 0 }, term: { principal: 0, count: 0 } };
    for (const a of accounts) {
      const t = a.type === 'liquid' ? 'liquid' : 'term';
      byType[t].principal += a.principal;
      byType[t].count++;
    }

    return {
      totalPrincipal,
      totalAccrued,
      totalInterestPaid,
      totalBalance: totalPrincipal + totalAccrued,
      accountCount: accounts.length,
      byBank,
      byType,
    };
  }

  getSavingsOverview() {
    // ── Bucket 1: Dự Phòng ──────────────────────────────────────────────────
    const duPhongRow = this.queryOne(`
      SELECT COALESCE(SUM(CASE WHEN a.actual_amount > 0 THEN a.actual_amount ELSE a.planned_amount END), 0) as total
      FROM allocations a
      JOIN categories c ON c.id = a.category_id
      WHERE c.name LIKE '%Dự Phòng%'
    `);
    const duPhongAllocated = duPhongRow?.total || 0;

    // ── Bucket 2: Tiết kiệm & Trái phiếu ────────────────────────────────────
    const tktpRow = this.queryOne(`
      SELECT COALESCE(SUM(CASE WHEN a.actual_amount > 0 THEN a.actual_amount ELSE a.planned_amount END), 0) as total
      FROM allocations a
      JOIN categories c ON c.id = a.category_id
      WHERE c.name LIKE '%Tiết kiệm%'
    `);
    const tktpAllocated = tktpRow?.total || 0;

    const totalAllocated = duPhongAllocated + tktpAllocated;

    // ── Savings accounts (split by category) ────────────────────────────────
    const accounts = this.getSavingsAccounts().filter(a => a.status === 'active');
    const totalInSavings = accounts.reduce((s, a) => s + a.principal, 0);
    const totalAccrued   = accounts.reduce((s, a) => s + a.accrued_interest, 0);

    // Accounts linked to Dự Phòng category
    const duPhongCat = this.queryOne("SELECT id FROM categories WHERE name LIKE '%Dự Phòng%'");
    const duPhongInSavings = accounts
      .filter(a => duPhongCat && a.category_id === duPhongCat.id)
      .reduce((s, a) => s + a.principal, 0);

    // Accounts linked to TKTP category
    const tktpCat = this.queryOne("SELECT id FROM categories WHERE name LIKE '%Tiết kiệm%'");
    const tktpInSavings = accounts
      .filter(a => tktpCat && a.category_id === tktpCat.id)
      .reduce((s, a) => s + a.principal, 0);

    // Accounts not linked to any category — track separately, do NOT subtract from DP
    const unassignedInSavings = accounts
      .filter(a => !a.category_id)
      .reduce((s, a) => s + a.principal, 0);

    // Available = what's been allocated but not yet put into the correct-category account
    const availableForDuPhong = Math.max(0, duPhongAllocated - duPhongInSavings);
    const availableForTKTP    = Math.max(0, tktpAllocated - tktpInSavings);
    const availableForSavings = Math.max(0, totalAllocated - totalInSavings);

    // ── Bucket 3: Vàng (gold accumulation) ──────────────────────────────────
    const goldAllocRow = this.queryOne(`
      SELECT COALESCE(SUM(CASE WHEN a.actual_amount > 0 THEN a.actual_amount ELSE a.planned_amount END), 0) as total
      FROM allocations a
      JOIN categories c ON c.id = a.category_id
      WHERE c.name LIKE '%Vàng%'
    `);
    const goldAllocated = goldAllocRow?.total || 0;

    // Gold already spent (BUY transactions for gold asset class)
    const goldSpentRow = this.queryOne(`
      SELECT COALESCE(SUM(t.total_amount), 0) as total
      FROM transactions t
      JOIN asset_types a ON a.id = t.asset_type_id
      WHERE a.asset_class = 'gold' AND t.type = 'BUY'
    `);
    const goldSpent = goldSpentRow?.total || 0;
    const availableGoldFund = Math.max(0, goldAllocated - goldSpent);

    // ── Overall inflow & unallocated ─────────────────────────────────────────
    const inflowResult = this.query('SELECT COALESCE(SUM(total_inflow), 0) as total FROM monthly_entries WHERE total_inflow > 0');
    const totalInflow = inflowResult[0]?.total || 0;

    const otherAllocResult = this.query(`
      SELECT COALESCE(SUM(CASE WHEN a.actual_amount > 0 THEN a.actual_amount ELSE a.planned_amount END), 0) as total
      FROM allocations a
      JOIN categories c ON c.id = a.category_id
      WHERE c.name NOT LIKE '%Dự Phòng%' AND c.name NOT LIKE '%Tiết kiệm%'
    `);
    const totalOtherAllocated = otherAllocResult[0]?.total || 0;
    const totalUnallocated = Math.max(0, totalInflow - totalAllocated - totalOtherAllocated);

    // ── Phase info ────────────────────────────────────────────────────────────
    const phase = this.getActivePhase();
    let phaseAllocs = [];
    if (phase) phaseAllocs = this.getPhaseAllocations(phase.id);

    // ── Alloc breakdown for display ───────────────────────────────────────────
    const allocRows = this.query(`
      SELECT c.name as category_name, c.icon, c.color,
             SUM(CASE WHEN a.actual_amount > 0 THEN a.actual_amount ELSE a.planned_amount END) as total_allocated
      FROM allocations a
      JOIN categories c ON c.id = a.category_id
      WHERE c.name LIKE '%Dự Phòng%' OR c.name LIKE '%Tiết kiệm%'
      GROUP BY c.id
    `);

    return {
      totalInflow,
      totalAllocated,
      totalOtherAllocated,
      totalUnallocated,
      totalInSavings,
      totalAccrued,
      availableForSavings,
      // ── Separate buckets ──
      duPhongAllocated,
      duPhongInSavings,
      availableForDuPhong,
      tktpAllocated,
      tktpInSavings,
      availableForTKTP,
      unassignedInSavings,  // sổ chưa gán danh mục
      // ── Gold fund ──
      goldAllocated,
      goldSpent,
      availableGoldFund,
      // ── Meta ──
      accountCount: accounts.length,
      allocByCategory: allocRows,
      phase,
      phaseAllocs,
    };
  }

  getUpcomingMaturities(days = 30) {
    const now = new Date();
    const future = new Date(now.getTime() + days * 86400000);
    const nowStr = now.toISOString().split('T')[0];
    const futureStr = future.toISOString().split('T')[0];
    return this.query(
      `SELECT * FROM savings_accounts WHERE status = 'active' AND maturity_date IS NOT NULL AND maturity_date >= ? AND maturity_date <= ? ORDER BY maturity_date ASC`,
      [nowStr, futureStr]
    );
  }

  processMaturedAccounts() {
    const today = new Date().toISOString().split('T')[0];
    const matured = this.query(`SELECT * FROM savings_accounts WHERE status = 'active' AND maturity_date IS NOT NULL AND maturity_date <= ?`, [today]);
    const results = [];
    for (const a of matured) {
      if (a.auto_renew) {
        // Auto-renew: record interest, reset start date
        const interest = this.calculateAccruedInterest(a, a.transactions);
        if (interest > 0) {
          this.run(`INSERT INTO savings_transactions (savings_account_id, type, amount, date, note) VALUES (?, 'interest', ?, ?, ?)`,
            [a.id, interest, today, 'Tự động tất toán - tái tục']);
          this.run('UPDATE savings_accounts SET principal = principal + ?, start_date = ?, maturity_date = ? WHERE id = ?',
            [interest, today, this._calcMaturityDate(today, a.term_months), a.id]);
        }
        results.push({ id: a.id, name: a.name, action: 'renewed', interest });
      } else {
        // Mark as matured
        const interest = this.calculateAccruedInterest(a, a.transactions);
        if (interest > 0) {
          this.run(`INSERT INTO savings_transactions (savings_account_id, type, amount, date, note) VALUES (?, 'interest', ?, ?, ?)`,
            [a.id, interest, today, 'Tất toán']);
        }
        this.run('UPDATE savings_accounts SET status = ? WHERE id = ?', ['matured', a.id]);
        results.push({ id: a.id, name: a.name, action: 'matured', interest });
      }
    }
    if (results.length) this.save();
    return results;
  }

  _calcMaturityDate(startDate, termMonths) {
    // setMonth() tự tràn sang tháng sau khi ngày gốc không tồn tại ở tháng đích:
    // 31/01 + 1 tháng cho ra 03/03 vì tháng 2 không có ngày 31. Kẹp về ngày cuối
    // tháng đích mới đúng cách ngân hàng tính kỳ hạn.
    // Cũng dựng ngày theo giờ địa phương thay vì toISOString() (vốn là giờ UTC).
    const [y, m, day] = String(startDate).split('T')[0].split('-').map(Number);
    const targetMonth = m - 1 + termMonths;
    const targetYear = y + Math.floor(targetMonth / 12);
    const normMonth = ((targetMonth % 12) + 12) % 12;
    const lastDay = new Date(targetYear, normMonth + 1, 0).getDate();
    const d = new Date(targetYear, normMonth, Math.min(day, lastDay));
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }


  // ═══════════════════════════════════════════════════════════════════
  //  SNAPSHOT TÀI CHÍNH — nguồn sự thật duy nhất
  //
  //  Trước đây mỗi trang tự tính "Tổng tài sản" theo cách riêng, cho ra sáu
  //  con số khác nhau. Mọi phép tính tài chính giờ đi qua đây.
  //
  //  Kiến trúc: _snapshotCore() CHỈ đọc bảng, không gọi getActivePhase hay
  //  getSavingsOverview — hai hàm đó xếp lớp lên trên nó. Nếu không tách vậy
  //  sẽ đệ quy, vì getSavingsOverview vốn đang gọi getActivePhase.
  // ═══════════════════════════════════════════════════════════════════

  /** Thống kê dòng tiền từ các tháng đã ghi nhận. */
  getCashflowStats() {
    const months = this.getFilledMonths();
    const n = months.length;
    if (!n) {
      return {
        months: 0, totalIncome: 0, totalExpense: 0, totalBonus: 0, totalInflow: 0,
        totalDeficit: 0, totalNet: 0, deficitMonths: 0,
        incomeMean: 0, expenseMean: 0, bonusMean: 0, inflowMean: 0,
        inflowSd: 0, inflowCv: 0, salaryNet: 0, bonusFreq: 0, bestMonth: 0,
      };
    }

    const sum = (f) => months.reduce((s, m) => s + (Number(m[f]) || 0), 0);
    const totalIncome = sum('income');
    const totalExpense = sum('expense');
    const totalBonus = sum('bonus');
    const totalInflow = sum('total_inflow');

    // Tháng chi vượt thu: total_inflow bằng 0 (không có gì để phân bổ), nhưng
    // phần thiếu hụt là tiền thật đã rút từ số dư sẵn có. Không trừ ra thì
    // tiền mặt bị báo dư đúng bằng khoản đó.
    const totalDeficit = months.reduce(
      (s, m) => s + Math.max(0, (Number(m.expense) || 0) - (Number(m.income) || 0) - (Number(m.bonus) || 0)),
      0
    );

    const inflowMean = totalInflow / n;
    const variance = months.reduce((s, m) => s + Math.pow((Number(m.total_inflow) || 0) - inflowMean, 2), 0) / n;
    const inflowSd = Math.sqrt(variance);
    const incomeMean = totalIncome / n;
    const expenseMean = totalExpense / n;

    return {
      months: n,
      totalIncome, totalExpense, totalBonus, totalInflow,
      totalDeficit,
      totalNet: totalIncome + totalBonus - totalExpense,
      deficitMonths: months.filter(
        (m) => (Number(m.expense) || 0) > (Number(m.income) || 0) + (Number(m.bonus) || 0)
      ).length,
      incomeMean, expenseMean,
      bonusMean: totalBonus / n,
      inflowMean,
      inflowSd,
      inflowCv: inflowMean > 0 ? inflowSd / inflowMean : 0,
      // Lương trừ chi tiêu — phần dòng tiền đáng tin nhất, không phụ thuộc thưởng.
      salaryNet: Math.max(0, incomeMean - expenseMean),
      bonusFreq: months.filter((m) => (Number(m.bonus) || 0) > 0).length / n,
      bestMonth: Math.max(...months.map((m) => Number(m.total_inflow) || 0)),
    };
  }

  /** Kế hoạch so với thực tế theo từng tháng, kèm lý do người dùng đã ghi. */
  getPlanVsActual() {
    const rows = this.query(
      'SELECT me.month_index, me.month_label, me.total_inflow, ' +
      'SUM(a.planned_amount) as planned, ' +
      'SUM(CASE WHEN a.actual_amount > 0 THEN a.actual_amount ELSE a.planned_amount END) as actual ' +
      'FROM monthly_entries me JOIN allocations a ON a.monthly_entry_id = me.id ' +
      'WHERE me.total_inflow > 0 GROUP BY me.id ORDER BY me.month_index'
    );
    const byMonth = rows.map((r) => ({
      month_index: r.month_index,
      month_label: r.month_label,
      total_inflow: r.total_inflow,
      planned: r.planned || 0,
      actual: r.actual || 0,
      diff: (r.actual || 0) - (r.planned || 0),
      diffPct: r.planned > 0 ? ((r.actual || 0) - r.planned) / r.planned : 0,
    }));
    return { byMonth, discrepancies: this.getDiscrepancyLogs() };
  }

  /** Tỷ lệ phân bổ của cả bốn giai đoạn trong một truy vấn. */
  getAllPhaseAllocations() {
    const rows = this.query(
      'SELECT pa.phase_id, p.sort_order, pa.category_id, c.name as category_name, pa.ratio ' +
      'FROM phase_allocations pa ' +
      'JOIN phases p ON p.id = pa.phase_id ' +
      'JOIN categories c ON c.id = pa.category_id ' +
      'ORDER BY p.sort_order, c.sort_order'
    );
    const bySortOrder = {};
    for (const r of rows) {
      (bySortOrder[r.sort_order] ||= []).push({
        category_id: r.category_id,
        category_name: r.category_name,
        ratio: r.ratio,
      });
    }
    return bySortOrder;
  }

  /**
   * Biến động và mức sụt sâu nhất, đo từ lịch sử giá thật.
   * Chỉ báo cáo mã có từ 60 phiên trở lên — dưới mức đó con số không nói lên gì.
   * Có bộ nhớ đệm vì price_snapshots chỉ đổi khi cron chạy.
   */
  getPriceRiskStats() {
    const stamp = this.queryOne('SELECT COUNT(*) as n, MAX(date) as d FROM price_snapshots');
    const key = String(stamp && stamp.n) + '|' + String(stamp && stamp.d);
    if (this._riskCache && this._riskCache.key === key) return this._riskCache.value;

    const rows = this.query(
      'SELECT a.ticker, p.close FROM price_snapshots p ' +
      'JOIN asset_types a ON a.id = p.asset_type_id ' +
      'WHERE a.ticker IS NOT NULL AND p.close > 0 ORDER BY a.ticker, p.date ASC'
    );
    const series = {};
    for (const r of rows) (series[r.ticker] ||= []).push(r.close);

    const byAsset = {};
    for (const ticker of Object.keys(series)) {
      const closes = series[ticker];
      if (closes.length < 60) continue;

      const rets = [];
      for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
      const mean = rets.reduce((s, x) => s + x, 0) / rets.length;
      const varr = rets.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / rets.length;

      let peak = closes[0];
      let maxDd = 0;
      for (const c of closes) {
        if (c > peak) peak = c;
        maxDd = Math.min(maxDd, c / peak - 1);
      }

      byAsset[ticker] = {
        sessions: closes.length,
        cagr: Math.pow(closes[closes.length - 1] / closes[0], 252 / closes.length) - 1,
        annualVol: Math.sqrt(varr) * Math.sqrt(252),
        maxDrawdown: maxDd,
      };
    }

    const value = { byAsset };
    this._riskCache = { key, value };
    return value;
  }

  /**
   * Lõi snapshot — CHỈ đọc bảng. Không gọi getActivePhase/getSavingsOverview.
   * Nhớ kết quả trong một lượt xử lý; cờ được xoá trong save().
   */
  _snapshotCore() {
    // Bộ nhớ đệm phải gắn với ĐÚNG đối tượng DB đang dùng. Ngoài save(), còn
    // một đường khác thay cả cơ sở dữ liệu mà không đi qua save(): endpoint
    // reload-db của server demo gán thẳng db.db = new SQL.Database(...).
    // Không so danh tính ở đây thì sau mỗi lần khôi phục snapshot sẽ trả số cũ.
    if (this._coreCache && this._coreCache.__db === this.db) return this._coreCache;

    const params = {};
    for (const p of this.getParameters()) params[p.key] = p.value;

    const categories = this.getCategories();
    const nameOf = (frag) => {
      const c = categories.find((x) => x.name.includes(frag));
      return c ? c.name : null;
    };
    const RESERVE = nameOf('Dự Phòng');
    const SAVINGS_CAT = nameOf('Tiết kiệm');

    // ── Danh mục đầu tư ────────────────────────────────────────────
    const portfolio = this.getPortfolio();
    const invested = portfolio.reduce((s, p) => s + p.total_invested, 0);
    const marketValue = portfolio.reduce((s, p) => s + p.current_value, 0);
    const pfByCategory = {};
    for (const p of portfolio) {
      const cat = this._getAssetAllocationCategory(p.asset_type_id, p.asset_class || 'other');
      pfByCategory[cat] ||= { invested: 0, marketValue: 0, items: [] };
      pfByCategory[cat].invested += p.total_invested;
      pfByCategory[cat].marketValue += p.current_value;
      pfByCategory[cat].items.push(p);
    }
    // MỘT định nghĩa "đã giải ngân", có tính phí — tiền thực sự rời túi.
    // Tách theo danh mục phân bổ để mỗi trang so được với đúng phần tiền của nó.
    const deployedRows = this.query(`
      SELECT t.asset_type_id, a.asset_class,
             COALESCE(SUM(CASE WHEN t.type = 'BUY' THEN t.total_amount + COALESCE(t.fee, 0)
                                                   ELSE -t.total_amount + COALESCE(t.fee, 0) END), 0) as v
      FROM transactions t
      JOIN asset_types a ON a.id = t.asset_type_id
      GROUP BY t.asset_type_id, a.asset_class
    `);
    const deployedByCategory = {};
    let deployed = 0;
    for (const r of deployedRows) {
      const cat = this._getAssetAllocationCategory(r.asset_type_id, r.asset_class || 'other');
      deployedByCategory[cat] = (deployedByCategory[cat] || 0) + (r.v || 0);
      deployed += r.v || 0;
    }

    // ── Tiết kiệm ──────────────────────────────────────────────────
    const accounts = this.getSavingsAccounts();
    const active = accounts.filter((a) => a.status === 'active');
    const isLiquid = (a) => a.type === 'liquid';
    const sumBy = (list, f) => list.reduce((s, a) => s + (Number(a[f]) || 0), 0);
    const reserveCat = categories.find((c) => c.name === RESERVE);
    const reserveAccts = active.filter((a) => reserveCat && a.category_id === reserveCat.id);

    const svByCategory = {};
    for (const a of active) {
      const cat = a.category_name || SAVINGS_CAT;
      if (!cat) continue;
      svByCategory[cat] ||= { principal: 0, balance: 0, count: 0 };
      svByCategory[cat].principal += a.principal || 0;
      svByCategory[cat].balance += a.current_balance || a.principal || 0;
      svByCategory[cat].count++;
    }

    const savings = {
      principal: sumBy(active, 'principal'),
      accrued: sumBy(active, 'accrued_interest'),
      projectedInterest: sumBy(active, 'projected_interest'),
      liquidPrincipal: sumBy(active.filter(isLiquid), 'principal'),
      liquidAccrued: sumBy(active.filter(isLiquid), 'accrued_interest'),
      termPrincipal: sumBy(active.filter((a) => !isLiquid(a)), 'principal'),
      termAccrued: sumBy(active.filter((a) => !isLiquid(a)), 'accrued_interest'),
      reservePrincipal: sumBy(reserveAccts, 'principal'),
      reserveAccrued: sumBy(reserveAccts, 'accrued_interest'),
      accountCount: active.length,
      maturedCount: accounts.filter((a) => a.status !== 'active').length,
      byCategory: svByCategory,
      accounts,
    };
    savings.balance = savings.principal + savings.accrued;
    savings.liquidBalance = savings.liquidPrincipal + savings.liquidAccrued;
    savings.termBalance = savings.termPrincipal + savings.termAccrued;
    savings.reserveBalance = savings.reservePrincipal + savings.reserveAccrued;
    savings.weightedRate = savings.principal > 0
      ? active.reduce((s, a) => s + (a.principal || 0) * (a.interest_rate || 0), 0) / savings.principal
      : 0;

    // ── Phân bổ ────────────────────────────────────────────────────
    const allAllocs = this.getAllAllocations();
    const amountOf = (a) => (a.actual_amount > 0 ? a.actual_amount : a.planned_amount || 0);
    const alByCategory = {};
    for (const a of allAllocs) {
      alByCategory[a.category_name] ||= 0;
      alByCategory[a.category_name] += amountOf(a);
    }
    const allocTotal = Object.values(alByCategory).reduce((s, v) => s + v, 0);
    const toReserve = alByCategory[RESERVE] || 0;
    const toSavings = alByCategory[SAVINGS_CAT] || 0;
    const toMarket = allocTotal - toReserve - toSavings;

    // ── Dòng tiền và tiền mặt ──────────────────────────────────────
    const cashflow = this.getCashflowStats();
    const unallocated = Math.max(0, cashflow.totalInflow - allocTotal - cashflow.totalDeficit);
    const awaitingInvestment = Math.max(0, toMarket - deployed);
    const cash = { unallocated, awaitingInvestment, total: unallocated + awaitingInvestment };

    const netWorth = {
      cash: cash.total,
      portfolio: marketValue,
      savings: savings.balance,
      total: cash.total + marketValue + savings.balance,
      basis: 'tiền mặt + giá thị trường danh mục + gốc và lãi tiết kiệm',
    };

    const core = {
      params,
      categories,
      roles: { RESERVE, SAVINGS_CAT },
      cashflow,
      allocations: {
        total: allocTotal, toReserve, toSavings, toMarket,
        unallocated, byCategory: alByCategory, rows: allAllocs,
      },
      portfolio: {
        invested, marketValue, deployed, deployedByCategory,
        gain: marketValue - invested,
        gainPct: invested > 0 ? (marketValue - invested) / invested : 0,
        byCategory: pfByCategory,
        items: portfolio,
      },
      savings,
      cash,
      liquidity: { total: cash.total + savings.liquidBalance },
      netWorth,
      phases: this.getPhases(),
      phaseAllocations: this.getAllPhaseAllocations(),
    };

    core.__db = this.db;
    this._coreCache = core;
    return core;
  }

  /** Giai đoạn đang ở, tính từ lõi snapshot. */
  _resolvePhase(core) {
    const expense = core.params.FI_MONTHLY_EXPENSE || 4000000;
    const phases = core.phases;
    if (!phases.length) return null;

    // Ngưỡng: GĐ2 khi dự phòng ≥ 3× chi tiêu mục tiêu, GĐ3 khi tổng tài sản
    // ≥ 6×, GĐ4 khi ≥ 24×. Cho phép tụt hạng nếu tài sản giảm — có chủ ý.
    const reserve = core.savings.reserveBalance;
    const total = core.netWorth.total;

    let active = phases[0];
    for (const p of phases) {
      if (p.sort_order === 1) { active = p; continue; }
      if (p.sort_order === 2 && reserve >= 3 * expense) { active = p; continue; }
      if (p.sort_order === 3 && total >= 6 * expense) { active = p; continue; }
      if (p.sort_order === 4 && total >= 24 * expense) { active = p; continue; }
      break;
    }

    const goalMultiplier = active.goal_multiplier || 0;
    const goalAmount = goalMultiplier * expense;
    const isReservePhase = active.sort_order === 1;
    const current = isReservePhase ? reserve : total;

    return {
      id: active.id,
      sortOrder: active.sort_order,
      name: active.name,
      goalDescription: active.goal_description,
      entryCondition: active.entry_condition,
      goalMultiplier,
      goalAmount,
      basis: isReservePhase ? 'số dư các sổ gắn danh mục Dự Phòng' : 'tổng tài sản',
      current,
      pct: goalAmount > 0 ? Math.min(100, Math.max(0, (current / goalAmount) * 100)) : 100,
      isFinal: active.sort_order === phases.length,
      thresholds: { p2: 3 * expense, p3: 6 * expense, p4: 24 * expense },
    };
  }

  /** Ngày hôm nay theo giờ địa phương — không dùng toISOString (giờ UTC). */
  _todayLocal() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** Snapshot đầy đủ — thứ mọi trang nên đọc. */
  getFinancialSnapshot() {
    const core = this._snapshotCore();
    const phase = this._resolvePhase(core);
    const expense = core.params.FI_MONTHLY_EXPENSE || 4000000;
    const fiNumber = (expense * 12) / 0.04;

    const sniperCatObj = core.categories.find((c) => c.name.includes('Bắn Tỉa'));
    const sniperCat = sniperCatObj ? sniperCatObj.name : null;
    const sniperAllocated = sniperCat ? core.allocations.byCategory[sniperCat] || 0 : 0;
    // Cùng chính sách phí với portfolio.deployed — nếu không, banner "đã đầu tư
    // vượt phân bổ" sẽ bật lên chỉ vì phí môi giới.
    const sniperDeployed = sniperCat ? core.portfolio.deployedByCategory[sniperCat] || 0 : 0;

    const nextSort = (phase ? phase.sortOrder : 0) + 1;
    const nextPhase = core.phases.find((p) => p.sort_order === nextSort) || null;

    return {
      asOf: this._todayLocal(),
      params: core.params,
      categories: core.categories,
      cashflow: core.cashflow,
      allocations: {
        total: core.allocations.total,
        toReserve: core.allocations.toReserve,
        toSavings: core.allocations.toSavings,
        toMarket: core.allocations.toMarket,
        unallocated: core.allocations.unallocated,
        byCategory: core.allocations.byCategory,
      },
      portfolio: core.portfolio,
      savings: core.savings,
      cash: core.cash,
      liquidity: core.liquidity,
      netWorth: core.netWorth,
      phase,
      nextPhase: nextPhase
        ? {
            id: nextPhase.id,
            sortOrder: nextPhase.sort_order,
            name: nextPhase.name,
            entryCondition: nextPhase.entry_condition,
          }
        : null,
      phaseAllocations: core.phaseAllocations,
      fi: {
        monthlyExpense: expense,
        fiNumber,
        ratio: fiNumber > 0 ? (core.netWorth.total / fiNumber) * 100 : 0,
      },
      sniper: {
        allocated: sniperAllocated,
        deployed: sniperDeployed,
        available: Math.max(0, sniperAllocated - sniperDeployed),
        feePolicy: 'included',
      },
      // Giá dùng trong văn bản hướng dẫn. Không có ở đây thì chữ đóng băng ở
      // một mức giá cũ — hướng dẫn từng ghi "đủ ~16 triệu mua 1 chỉ SJC" trong
      // khi giá thật là 14,72 triệu.
      prices: {
        goldUnit: this.queryOne(
          "SELECT current_price as v FROM asset_types WHERE ticker = 'SJC' LIMIT 1"
        )?.v || 0,
      },
      plan: this.getPlanVsActual(),
      risk: this.getPriceRiskStats(),
      checklist: this.getChecklistStatus(),
    };
  }

  close() {
    if (this.db) { this.save(); this.db.close(); }
  }
}

function formatVND(n) {
  if (!n) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);
}

module.exports = FinancialDB;
