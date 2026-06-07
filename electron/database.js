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
    this.seedDefaults();
    
    // Ensure category 2 is renamed to "Chứng Khoán" (from old "Đầu Tư" name)
    try {
      this.run("UPDATE categories SET name = 'Chứng Khoán' WHERE name = 'Đầu Tư'");
    } catch (e) {}

    // Ensure SJC gold name is "Vàng SJC" instead of "Vàng miếng SJC"
    try {
      this.run("UPDATE asset_types SET name = 'Vàng SJC' WHERE ticker = 'SJC'");
      this.run("UPDATE phases SET guidance = REPLACE(guidance, 'vàng miếng SJC', 'vàng SJC')");
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
        color TEXT DEFAULT '#3b82f6',
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
        color TEXT DEFAULT '#3b82f6',
        icon TEXT DEFAULT '💰',
        sort_order INTEGER DEFAULT 0
      )
    `);

    // Phases with clear goals and action guidance
    this.db.run(`
      CREATE TABLE IF NOT EXISTS phases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        goal_amount REAL DEFAULT 0,
        goal_multiplier REAL DEFAULT 0,
        goal_description TEXT,
        entry_condition TEXT,
        guidance TEXT,
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
          VALUES (?, 'Giao dịch', ?, ?, '#10b981', 'chart-line', 50, ?, ?, 1, 'stock')`,
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
      ['ACB', 'ACB - Ngân hàng Á Châu', 'stock', 'CP', '#10b981', 'chart-line', 10],
      ['BCM', 'Becamex IDC', 'stock', 'CP', '#10b981', 'chart-line', 11],
      ['BID', 'BIDV', 'stock', 'CP', '#10b981', 'chart-line', 12],
      ['BVH', 'BVH - Bảo Việt', 'stock', 'CP', '#10b981', 'chart-line', 13],
      ['CTG', 'VietinBank', 'stock', 'CP', '#10b981', 'chart-line', 14],
      ['FPT', 'FPT Corporation', 'stock', 'CP', '#10b981', 'chart-line', 15],
      ['GAS', 'PV Gas', 'stock', 'CP', '#10b981', 'chart-line', 16],
      ['GVR', 'Tập đoàn Cao su', 'stock', 'CP', '#10b981', 'chart-line', 17],
      ['HDB', 'HDBank', 'stock', 'CP', '#10b981', 'chart-line', 18],
      ['HPG', 'Hòa Phát Group', 'stock', 'CP', '#10b981', 'chart-line', 19],
      ['KDH', 'Khang Điền House', 'stock', 'CP', '#10b981', 'chart-line', 20],
      ['MBB', 'MB Bank', 'stock', 'CP', '#10b981', 'chart-line', 21],
      ['MSN', 'Masan Group', 'stock', 'CP', '#10b981', 'chart-line', 22],
      ['MWG', 'Thế Giới Di Động', 'stock', 'CP', '#10b981', 'chart-line', 23],
      ['NVL', 'Novaland', 'stock', 'CP', '#10b981', 'chart-line', 24],
      ['PDR', 'Phát Đạt', 'stock', 'CP', '#10b981', 'chart-line', 25],
      ['PLX', 'Petrolimex', 'stock', 'CP', '#10b981', 'chart-line', 26],
      ['POW', 'PV Power', 'stock', 'CP', '#10b981', 'chart-line', 27],
      ['SAB', 'Sabeco', 'stock', 'CP', '#10b981', 'chart-line', 28],
      ['SSI', 'SSI Securities', 'stock', 'CP', '#10b981', 'chart-line', 29],
      ['STB', 'Sacombank', 'stock', 'CP', '#10b981', 'chart-line', 30],
      ['TCB', 'Techcombank', 'stock', 'CP', '#10b981', 'chart-line', 31],
      ['TPB', 'TPBank', 'stock', 'CP', '#10b981', 'chart-line', 32],
      ['VCB', 'Vietcombank', 'stock', 'CP', '#10b981', 'chart-line', 33],
      ['VHM', 'Vinhomes', 'stock', 'CP', '#10b981', 'chart-line', 34],
      ['VIB', 'VIB Bank', 'stock', 'CP', '#10b981', 'chart-line', 35],
      ['VIC', 'Vingroup', 'stock', 'CP', '#10b981', 'chart-line', 36],
      ['VJC', 'Vietjet Air', 'stock', 'CP', '#10b981', 'chart-line', 37],
      ['VNM', 'Vinamilk', 'stock', 'CP', '#10b981', 'chart-line', 38],
      ['VRE', 'Vincom Retail', 'stock', 'CP', '#10b981', 'chart-line', 39],
      // ETFs
      ['E1VFVN30', 'VN30 ETF', 'etf', 'CCQ', '#3b82f6', 'chart-pie', 50],
      ['FUEVN100', 'VN100 ETF', 'etf', 'CCQ', '#3b82f6', 'chart-pie', 51],
      // Gold
      ['SJC', 'Vàng SJC', 'gold', 'chỉ', '#f59e0b', 'gem', 60],
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

    // Update phase guidance and goals
    const phases = this.query('SELECT id, sort_order FROM phases ORDER BY sort_order');
    const monthlyExpense = this.getParam('FI_MONTHLY_EXPENSE') || 4000000;

    const updates = [
      {
        goal_desc: 'Dự phòng = 3× chi tiêu mục tiêu',
        entry: 'Bắt đầu ngay',
        goal_multiplier: 3,
        guidance: `Mục tiêu: Dự phòng 3 tháng chi tiêu mục tiêu (~12M với mục tiêu 4M/tháng). Xây thói quen tài chính.

Phân bổ dòng tiền nhàn rỗi:
• 70% → Dự Phòng → gửi tiết kiệm ngân hàng (ưu tiên số 1)
• 30% → Đầu tư → mua ETF/cổ phiếu số nhỏ

Hành động cụ thể:
1. Mở TK tiết kiệm online (Timo, MBBank...)
2. Mở TK chứng khoán (SSI, VPS, TCBS — miễn phí)
3. Tháng đầu: chỉ tiết kiệm, chưa mua gì
4. Tháng 2: bắt đầu mua ETF E1VFVN30 hoặc FPT (500K-1tr/lệnh)
5. Ghi chép mọi khoản vào Money_Flow

Chuyển sang Giai đoạn 2 khi: Dự phòng ≥ 3× chi tiêu mục tiêu

Nguyên tắc:
• Không rút dự phòng để đầu tư
• Không FOMO khi thấy người khác kiếm lời
• Số nhỏ không sao — quan trọng là bắt đầu`,
      },
      {
        goal_desc: 'Danh mục đầu tư đa dạng',
        entry: 'Dự phòng ≥ 3× chi tiêu mục tiêu',
        goal_multiplier: 6,
        guidance: `Dự phòng đã đủ. Chuyển trọng tâm sang đầu tư tăng trưởng.

Phân bổ dòng tiền nhàn rỗi:
• 60% → Đầu tư (chứng khoán, ETF) — mua đều đặn hàng tháng
• 15% → Vàng — tích lũy, khi đủ ~16 triệu mua 1 chỉ vàng SJC. Hoặc mua ETF vàng (E1VFVN30) với số tiền nhỏ hơn
• 10% → Bắn Tỉa — tích lũy tiền mặt, chờ thị trường sụt giảm >15% để triển khai
• 10% → Dự Phòng — duy trì, điều chỉnh theo lạm phát
• 5% → Tiết kiệm & Trái phiếu — bắt đầu xây nền tảng ổn định

Hành động cụ thể:
1. Mua cổ phiếu/ETF đều đặn mỗi tháng (FPT, VNM, VCB, MWG, E1VFVN30...)
2. Vàng: tích lũy 1.5-2 triệu/tháng. Khi đủ ~16 triệu → mua 1 chỉ SJC
3. Bắn Tỉa: theo dõi Sniper Playbook, triển khai khi thị trường sụt giảm
4. Rebalance mỗi 3 tháng

Chuyển sang Giai đoạn 3 khi: Tổng tài sản ≥ 6× chi tiêu mục tiêu`,
      },
      {
        goal_desc: 'Tài sản = 24× chi tiêu mục tiêu',
        entry: 'Tổng tài sản ≥ 6× chi tiêu mục tiêu',
        goal_multiplier: 24,
        guidance: `Thu nhập đã tăng đáng kể. Bắt đầu đa dạng hóa và xây thu nhập thụ động.

Phân bổ dòng tiền nhàn rỗi:
• 45% → Đầu tư — đa dạng: cổ phiếu + ETF + vàng
• 20% → Vàng — tăng tỷ lệ, mua 1-2 chỉ SJC/năm. SJC 1 chỉ là chuẩn (thanh khoản tốt nhất)
• 15% → Bắn Tỉa — tích lũy vốn chờ cơ hội. Thị trường sập >15% → triển khai mạnh
• 15% → Tiết kiệm & Trái phiếu — trái phiếu chính phủ/doanh nghiệp uy tín
• 5% → Dự Phòng — duy trì

Hành động cụ thể:
1. Chuyển trọng tâm sang cổ phiếu trả cổ tức (VCB, VNM, REE, GAS...)
2. Vàng: mua 1-2 chỉ SJC/năm
3. Cân nhắc trái phiếu chính phủ/doanh nghiệp uy tín
4. Bắn Tỉa: khi thị trường sụt giảm >25% → triển khai toàn bộ vốn tích lũy
5. Rebalance mỗi quý

Chuyển sang Giai đoạn 4 khi: Tổng tài sản ≥ 24× chi tiêu mục tiêu`,
      },
      {
        goal_desc: 'Thu nhập thụ động ≥ chi tiêu mục tiêu',
        entry: 'Tổng tài sản ≥ 24× chi tiêu mục tiêu',
        goal_multiplier: 0,
        guidance: `Thu nhập thụ động từ đầu tư vượt chi tiêu sinh hoạt. Bạn không cần làm việc nếu không muốn.

Công thức: Tài sản × (lãi năm / 12) ≥ chi tiêu/tháng
Ví dụ: Chi tiêu mục tiêu 15M/tháng, lãi 5%/năm → cần 3.6 tỷ

Phân bổ:
• 40% → Đầu tư — tập trung cổ phiếu trả cổ tức, trái phiếu doanh nghiệp
• 15% → Vàng — duy trì tỷ lệ, vàng là tài sản trú ẩn an toàn
• 15% → Bắn Tỉa — vẫn triển khai khi có cơ hội lớn
• 25% → Tiết kiệm & Trái phiếu — ưu tiên thu nhập thụ động ổn định
• 5% → Dự Phòng — duy trì

Bạn đã đạt tự do tài chính. Chúc mừng.`,
      },
    ];

    for (let i = 0; i < phases.length && i < updates.length; i++) {
      const p = phases[i];
      const u = updates[i];
      const goalAmount = u.goal_multiplier > 0 ? u.goal_multiplier * monthlyExpense : 0;
      this.run('UPDATE phases SET goal_description = ?, entry_condition = ?, goal_multiplier = ?, goal_amount = ?, guidance = ? WHERE id = ?',
        [u.goal_desc, u.entry, u.goal_multiplier, goalAmount, u.guidance, p.id]);
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

    // 2. Update existing databases' phase guidance for Phase 2 and Phase 3 to use "chỉ" and unified phrasing
    const phase2Guidance = `Dự phòng đã đủ. Chuyển trọng tâm sang đầu tư tăng trưởng.

Phân bổ dòng tiền nhàn rỗi:
• 60% → Đầu tư (chứng khoán, ETF) — mua đều đặn hàng tháng
• 15% → Vàng — tích lũy, khi đủ ~16 triệu mua 1 chỉ vàng SJC. Hoặc mua ETF vàng (E1VFVN30) với số tiền nhỏ hơn
• 10% → Bắn Tỉa — tích lũy tiền mặt, chờ thị trường sụt giảm >15% để triển khai
• 10% → Dự Phòng — duy trì, điều chỉnh theo lạm phát
• 5% → Tiết kiệm & Trái phiếu — bắt đầu xây nền tảng ổn định

Hành động cụ thể:
1. Mua cổ phiếu/ETF đều đặn mỗi tháng (FPT, VNM, VCB, MWG, E1VFVN30...)
2. Vàng: tích lũy 1.5-2 triệu/tháng. Khi đủ ~16 triệu → mua 1 chỉ SJC (thanh khoản tốt, dễ bán lại)
3. Bắn Tỉa: theo dõi Sniper Playbook, triển khai khi thị trường sụt giảm
4. Rebalance mỗi 3 tháng
5. Không bán Đầu Tư để mua khi dip — dùng tiền từ Bắn Tỉa

Chuyển sang Giai đoạn 3 khi: Tổng tài sản ≥ 6× chi tiêu mục tiêu (ví dụ: 24M nếu mục tiêu 4M/tháng)`;

    const phase3Guidance = `Thu nhập đã tăng đáng kể. Bắt đầu đa dạng hóa và xây thu nhập thụ động.

Phân bổ dòng tiền nhàn rỗi:
• 45% → Đầu tư — đa dạng: cổ phiếu + ETF + vàng
• 20% → Vàng — tăng tỷ lệ, mua 1-2 chỉ SJC/năm. SJC 1 chỉ là chuẩn (thanh khoản tốt nhất)
• 15% → Bắn Tỉa — tích lũy vốn chờ cơ hội. Thị trường sập >15% → triển khai mạnh
• 15% → Tiết kiệm & Trái phiếu — trái phiếu chính phủ/doanh nghiệp uy tín
• 5% → Dự Phòng — duy trì, điều chỉnh theo chi tiêu thực tế

Hành động cụ thể:
1. Chuyển trọng tâm sang cổ phiếu trả cổ tức (VCB, VNM, REE, GAS...)
2. Vàng: mua 1-2 chỉ SJC/năm. Có thể đa dạng: vàng miếng + ETF vàng
3. Cân nhắc trái phiếu chính phủ/doanh nghiệp uy tín
4. Bắn Tỉa: khi thị trường sụt giảm >25% → triển khai toàn bộ vốn tích lũy
5. Rebalance mỗi quý

Chuyển sang Giai đoạn 4 khi: Tổng tài sản ≥ 24× chi tiêu mục tiêu (ví dụ: 96M nếu mục tiêu 4M/tháng)`;

    this.run('UPDATE phases SET guidance = ? WHERE sort_order = 2', [phase2Guidance]);
    this.run('UPDATE phases SET guidance = ? WHERE sort_order = 3', [phase3Guidance]);

    // Update schema version
    this.run("INSERT OR REPLACE INTO parameters (key, value, description) VALUES ('SCHEMA_VERSION', 5, 'Database schema version')");
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

      ['FI_MONTHLY_EXPENSE', 4000000, 'Chi tiêu/tháng (tự cập nhật theo dữ liệu thực)'],
      ['DEFAULT_INFLOW', 3700000, 'Dòng tiền nhàn rỗi mặc định/tháng'],
    ];
    for (const [k, v, d] of params) {
      this.db.run('INSERT INTO parameters (key, value, description) VALUES (?, ?, ?)', [k, v, d]);
    }

    // Asset type presets — parent categories
    const assetPresets = [
      ['Cổ phiếu', 'Giao dịch', 'stock', 'CP', '#10b981', 'chart-line', 1],
      ['ETF / Quỹ', 'Giao dịch', 'etf', 'CCQ', '#3b82f6', 'chart-pie', 2],
      ['Vàng', 'Tích trữ', 'gold', 'chỉ', '#f59e0b', 'gem', 3],
      ['Crypto', 'Giao dịch', 'crypto', 'coin', '#8b5cf6', 'currency-btc', 4],
      ['Trái phiếu', 'Tích trữ', 'bond', 'VNĐ', '#ec4899', 'scroll', 5],
      ['Tiết kiệm ngân hàng', 'Tích trữ', 'savings', 'VNĐ', '#8b5cf6', 'bank', 6],
      ['Bất động sản', 'Tích trữ', 'realestate', 'VNĐ', '#f97316', 'house', 7],
      ['Khác', 'Tích trữ', 'other', 'đơn vị', '#64748b', 'package', 8],
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
      ['ACB', 'ACB - Ngân hàng Á Châu', 'stock', 'CP', '#10b981', 'chart-line', 10],
      ['BCM', 'Becamex IDC', 'stock', 'CP', '#10b981', 'chart-line', 11],
      ['BID', 'BIDV', 'stock', 'CP', '#10b981', 'chart-line', 12],
      ['BVH', 'BVH - Bảo Việt', 'stock', 'CP', '#10b981', 'chart-line', 13],
      ['CTG', 'VietinBank', 'stock', 'CP', '#10b981', 'chart-line', 14],
      ['FPT', 'FPT Corporation', 'stock', 'CP', '#10b981', 'chart-line', 15],
      ['GAS', 'PV Gas', 'stock', 'CP', '#10b981', 'chart-line', 16],
      ['GVR', 'Tập đoàn Cao su', 'stock', 'CP', '#10b981', 'chart-line', 17],
      ['HDB', 'HDBank', 'stock', 'CP', '#10b981', 'chart-line', 18],
      ['HPG', 'Hòa Phát Group', 'stock', 'CP', '#10b981', 'chart-line', 19],
      ['KDH', 'Khang Điền House', 'stock', 'CP', '#10b981', 'chart-line', 20],
      ['MBB', 'MB Bank', 'stock', 'CP', '#10b981', 'chart-line', 21],
      ['MSN', 'Masan Group', 'stock', 'CP', '#10b981', 'chart-line', 22],
      ['MWG', 'Thế Giới Di Động', 'stock', 'CP', '#10b981', 'chart-line', 23],
      ['NVL', 'Novaland', 'stock', 'CP', '#10b981', 'chart-line', 24],
      ['PDR', 'Phát Đạt', 'stock', 'CP', '#10b981', 'chart-line', 25],
      ['PLX', 'Petrolimex', 'stock', 'CP', '#10b981', 'chart-line', 26],
      ['POW', 'PV Power', 'stock', 'CP', '#10b981', 'chart-line', 27],
      ['SAB', 'Sabeco', 'stock', 'CP', '#10b981', 'chart-line', 28],
      ['SSI', 'SSI Securities', 'stock', 'CP', '#10b981', 'chart-line', 29],
      ['STB', 'Sacombank', 'stock', 'CP', '#10b981', 'chart-line', 30],
      ['TCB', 'Techcombank', 'stock', 'CP', '#10b981', 'chart-line', 31],
      ['TPB', 'TPBank', 'stock', 'CP', '#10b981', 'chart-line', 32],
      ['VCB', 'Vietcombank', 'stock', 'CP', '#10b981', 'chart-line', 33],
      ['VHM', 'Vinhomes', 'stock', 'CP', '#10b981', 'chart-line', 34],
      ['VIB', 'VIB Bank', 'stock', 'CP', '#10b981', 'chart-line', 35],
      ['VIC', 'Vingroup', 'stock', 'CP', '#10b981', 'chart-line', 36],
      ['VJC', 'Vietjet Air', 'stock', 'CP', '#10b981', 'chart-line', 37],
      ['VNM', 'Vinamilk', 'stock', 'CP', '#10b981', 'chart-line', 38],
      ['VRE', 'Vincom Retail', 'stock', 'CP', '#10b981', 'chart-line', 39],
      // ETFs
      ['E1VFVN30', 'VN30 ETF', 'etf', 'CCQ', '#3b82f6', 'chart-pie', 50],
      ['FUEVN100', 'VN100 ETF', 'etf', 'CCQ', '#3b82f6', 'chart-pie', 51],
      // Gold
      ['SJC', 'Vàng SJC', 'gold', 'chỉ', '#f59e0b', 'gem', 60],
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
      ['Dự Phòng', 'Gửi tiết kiệm ngân hàng. Không đụng trừ khẩn cấp.', '#10b981', 'shield-check', 1],
      ['Chứng Khoán', 'Mua ETF, cổ phiếu tích sản. Giao dịch trên sàn.', '#3b82f6', 'trend-up', 2],
      ['Vàng', 'Mua vàng miếng/SJC tích trữ dài hạn.', '#f59e0b', 'gem', 3],
      ['Bắn Tỉa', 'Giữ tiền mặt. Chỉ dùng khi thị trường sập >15%.', '#ef4444', 'crosshair', 4],
      ['Tiết kiệm & Trái phiếu', 'Gửi ngân hàng kỳ hạn hoặc mua trái phiếu. Ổn định.', '#8b5cf6', 'bank', 5],
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
        guidance: `Mục tiêu: Dự phòng 3 tháng chi tiêu mục tiêu (~12M với mục tiêu 4M/tháng). Xây thói quen tài chính.

Phân bổ dòng tiền nhàn rỗi:
• 70% → Dự Phòng → gửi tiết kiệm ngân hàng (ưu tiên số 1)
• 30% → Đầu tư → mua ETF/cổ phiếu số nhỏ

Hành động cụ thể:
1. Mở TK tiết kiệm online (Timo, MBBank...)
2. Mở TK chứng khoán (SSI, VPS, TCBS — miễn phí)
3. Tháng đầu: chỉ tiết kiệm, chưa mua gì
4. Tháng 2: bắt đầu mua ETF E1VFVN30 hoặc FPT (500K-1tr/lệnh)
5. Ghi chép mọi khoản vào Money_Flow

Chuyển sang Giai đoạn 2 khi: Dự phòng ≥ 3× chi tiêu mục tiêu (ví dụ: 12M nếu mục tiêu 4M/tháng)

Nguyên tắc:
• Không rút dự phòng để đầu tư
• Không FOMO khi thấy người khác kiếm lời
• Số nhỏ không sao — quan trọng là bắt đầu`,
        active: 1,
      },
      {
        name: 'Giai đoạn 2: Tăng tốc',
        order: 2,
        goal_multiplier: 6,
        goal_desc: 'Danh mục đầu tư đa dạng',
        entry: 'Dự phòng ≥ 3× chi tiêu mục tiêu',
        guidance: `Dự phòng đã đủ. Chuyển trọng tâm sang đầu tư tăng trưởng.

Phân bổ dòng tiền nhàn rỗi:
• 60% → Đầu tư (chứng khoán, ETF) — mua đều đặn hàng tháng
• 15% → Vàng — tích lũy, khi đủ ~16 triệu mua 1 chỉ vàng SJC. Hoặc mua ETF vàng (E1VFVN30) với số tiền nhỏ hơn
• 10% → Bắn Tỉa — tích lũy tiền mặt, chờ thị trường sụt giảm >15% để triển khai
• 10% → Dự Phòng — duy trì, điều chỉnh theo lạm phát
• 5% → Tiết kiệm & Trái phiếu — bắt đầu xây nền tảng ổn định

Hành động cụ thể:
1. Mua cổ phiếu/ETF đều đặn mỗi tháng (FPT, VNM, VCB, MWG, E1VFVN30...)
2. Vàng: tích lũy 1.5-2 triệu/tháng. Khi đủ ~16 triệu → mua 1 chỉ SJC (thanh khoản tốt, dễ bán lại)
3. Bắn Tỉa: theo dõi Sniper Playbook, triển khai khi thị trường sụt giảm
4. Rebalance mỗi 3 tháng
5. Không bán Đầu Tư để mua khi dip — dùng tiền từ Bắn Tỉa

Chuyển sang Giai đoạn 3 khi: Tổng tài sản ≥ 6× chi tiêu mục tiêu (ví dụ: 24M nếu mục tiêu 4M/tháng)`,
        active: 0,
      },
      {
        name: 'Giai đoạn 3: Tích lũy',
        order: 3,
        goal_multiplier: 24,
        goal_desc: 'Tài sản = 24× chi tiêu mục tiêu',
        entry: 'Tổng tài sản ≥ 6× chi tiêu mục tiêu',
        guidance: `Thu nhập đã tăng đáng kể. Bắt đầu đa dạng hóa và xây thu nhập thụ động.

Phân bổ dòng tiền nhàn rỗi:
• 45% → Đầu tư — đa dạng: cổ phiếu + ETF + vàng
• 20% → Vàng — tăng tỷ lệ, mua 1-2 chỉ SJC/năm. SJC 1 chỉ là chuẩn (thanh khoản tốt nhất)
• 15% → Bắn Tỉa — tích lũy vốn chờ cơ hội. Thị trường sập >15% → triển khai mạnh
• 15% → Tiết kiệm & Trái phiếu — trái phiếu chính phủ/doanh nghiệp uy tín
• 5% → Dự Phòng — duy trì, điều chỉnh theo chi tiêu thực tế

Hành động cụ thể:
1. Chuyển trọng tâm sang cổ phiếu trả cổ tức (VCB, VNM, REE, GAS...)
2. Vàng: mua 1-2 chỉ SJC/năm. Có thể đa dạng: vàng miếng + ETF vàng
3. Cân nhắc trái phiếu chính phủ/doanh nghiệp uy tín
4. Bắn Tỉa: khi thị trường sụt giảm >25% → triển khai toàn bộ vốn tích lũy
5. Rebalance mỗi quý

Chuyển sang Giai đoạn 4 khi: Tổng tài sản ≥ 24× chi tiêu mục tiêu (ví dụ: 96M nếu mục tiêu 4M/tháng)`,
        active: 0,
      },
      {
        name: 'Giai đoạn 4: Tự do tài chính',
        order: 4,
        goal_multiplier: 0,
        goal_desc: 'Thu nhập thụ động ≥ chi tiêu mục tiêu',
        entry: 'Tổng tài sản ≥ 24× chi tiêu mục tiêu',
        guidance: `Thu nhập thụ động từ đầu tư vượt chi tiêu sinh hoạt. Bạn không cần làm việc nếu không muốn.

Công thức: Tài sản × (lãi năm / 12) ≥ chi tiêu/tháng
Ví dụ: Chi tiêu mục tiêu 15M/tháng, lãi 5%/năm → cần 3.6 tỷ

Phân bổ:
• 40% → Đầu tư — tập trung cổ phiếu trả cổ tức, trái phiếu doanh nghiệp
• 15% → Vàng — duy trì tỷ lệ, vàng là tài sản trú ẩn an toàn
• 15% → Bắn Tỉa — vẫn triển khai khi có cơ hội lớn
• 25% → Tiết kiệm & Trái phiếu — ưu tiên thu nhập thụ động ổn định
• 5% → Dự Phòng — duy trì

Bạn đã đạt tự do tài chính. Chúc mừng.`,
        active: 0,
      },
    ];

    for (const p of phases) {
      const monthlyExpense = this.getParam('FI_MONTHLY_EXPENSE') || 4000000;
      const goalAmount = p.goal_multiplier > 0 ? p.goal_multiplier * monthlyExpense : 0;
      this.db.run(
        'INSERT INTO phases (name, sort_order, goal_amount, goal_multiplier, goal_description, entry_condition, guidance, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [p.name, p.order, goalAmount, p.goal_multiplier, p.goal_desc, p.entry, p.guidance, p.active]
      );
    }

    // Default phase allocations (match guidance exactly)
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

  // Recalculate all phase goals based on actual average expense
  recalculateAllPhaseGoals() {
    const avgExpense = this.getAverageExpense();
    this.recalculatePhaseGoals(avgExpense);
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
  updateAssetPrice(assetId, price, highPrice) {
    const peak = highPrice ? Math.max(price, highPrice) : price;
    this.run('UPDATE asset_types SET current_price = ?, peak_price = MAX(peak_price, ?) WHERE id = ?', [price, peak, assetId]);
    this.save();
    console.log(`[DB] Updated asset ${assetId} price to ${price}`);
  }
  addAssetType(data) {
    this.run('INSERT INTO asset_types (name, category, ticker, unit, color, icon, sort_order, asset_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [data.name, data.category || 'Giao dịch', data.ticker, data.unit, data.color || '#3b82f6', data.icon || '📦', data.sort_order || 99, data.asset_class || 'other']);
    this.save();
    return this.lastId();
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
      [data.name, data.description, data.color || '#3b82f6', data.icon || '💰', data.sort_order || 99]);
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

  getActivePhase() {
    // Auto-detect phase based on ACTUAL data (not allocations) — supports regression
    const phases = this.query('SELECT * FROM phases ORDER BY sort_order');
    if (!phases.length) return null;

    // Phase 1: Use ACTUAL savings balance assigned to Dự Phòng category or fallback to allocations
    let duPhongSavingsVal = 0;
    try {
      const duPhongSavings = this.query(`
        SELECT COALESCE(SUM(sa.principal + COALESCE(
          (SELECT SUM(st.amount) FROM savings_transactions st
           WHERE st.savings_account_id = sa.id AND st.type = 'interest'), 0
        )), 0) as total
        FROM savings_accounts sa
        JOIN categories c ON c.id = sa.category_id
        WHERE c.name LIKE '%Dự Phòng%' AND sa.status = 'active'
      `);
      duPhongSavingsVal = duPhongSavings[0]?.total || 0;
    } catch (e) { /* savings table may not exist yet */ }

    const duPhongAllocations = this.queryOne(`
      SELECT COALESCE(SUM(CASE WHEN actual_amount > 0 THEN actual_amount ELSE planned_amount END), 0) as total
      FROM allocations a
      JOIN categories c ON c.id = a.category_id
      WHERE c.name LIKE '%Dự Phòng%'
    `)?.total || 0;

    const duPhongActual = Math.max(duPhongSavingsVal, duPhongAllocations);

    // Phase 2+: Use total assets = portfolio value + all savings, fallback to total allocations
    const portfolio = this.query(`
      SELECT COALESCE(SUM(CASE WHEN type='BUY' THEN total_amount ELSE -total_amount END), 0) as total
      FROM transactions
    `);
    const portfolioTotal = portfolio[0]?.total || 0;

    let totalSavings = 0;
    try {
      const savingsResult = this.query(`
        SELECT COALESCE(SUM(principal), 0) as total FROM savings_accounts WHERE status = 'active'
      `);
      totalSavings = savingsResult[0]?.total || 0;
    } catch (e) { /* savings table may not exist yet */ }

    const allocationsTotal = this.queryOne(`
      SELECT COALESCE(SUM(CASE WHEN actual_amount > 0 THEN actual_amount ELSE planned_amount END), 0) as total
      FROM allocations
    `)?.total || 0;

    const totalAssets = Math.max(portfolioTotal + totalSavings, allocationsTotal);

    // Use TARGET expense (FI_MONTHLY_EXPENSE) — this is the lifestyle user is building toward
    const monthlyExpense = this.getParam('FI_MONTHLY_EXPENSE') || 4000000;

    // Phase logic — find HIGHEST qualifying phase (supports regression)
    // Phase 1: Dự phòng < 3× expense → building emergency fund
    // Phase 2: Dự phòng ≥ 3× expense → start investing
    // Phase 3: Total assets ≥ 6× expense → accumulate
    // Phase 4: Total assets ≥ 24× expense → financial independence
    let activePhase = phases[0]; // Default Phase 1
    for (const p of phases) {
      if (p.sort_order === 1) { activePhase = p; continue; }
      if (p.sort_order === 2 && duPhongActual >= 3 * monthlyExpense) { activePhase = p; continue; }
      if (p.sort_order === 3 && totalAssets >= 6 * monthlyExpense) { activePhase = p; continue; }
      if (p.sort_order === 4 && totalAssets >= 24 * monthlyExpense) { activePhase = p; continue; }
      break;
    }

    // Update is_active flags only if changed
    const currentActive = this.queryOne('SELECT id FROM phases WHERE is_active = 1');
    if (!currentActive || currentActive.id !== activePhase.id) {
      this.run('UPDATE phases SET is_active = 0');
      this.run('UPDATE phases SET is_active = 1 WHERE id = ?', [activePhase.id]);
      this.save();
    }

    return activePhase;
  }
  setActivePhase(phaseId) {
    this.run('UPDATE phases SET is_active = 0');
    this.run('UPDATE phases SET is_active = 1 WHERE id = ?', [phaseId]);
    this.save();
  }
  getChecklistStatus() {
    const monthlyExpense = this.getParam('FI_MONTHLY_EXPENSE') || 4000000;
    const portfolio = this.getPortfolio();
    const savings = this.getSavingsAccounts().filter(s => s.status === 'active');
    const totalSavings = savings.reduce((sum, s) => sum + (s.principal || 0), 0);
    const totalAssets = portfolio.reduce((sum, p) => sum + (p.current_value || p.total_invested || 0), 0) + totalSavings;
    const duPhongSavings = savings.filter(s => {
      const cat = this.queryOne('SELECT name FROM categories WHERE id = ?', [s.category_id]);
      return cat?.name?.includes('Dự Phòng');
    }).reduce((sum, s) => sum + (s.principal || 0), 0);
    const hasTermSavings = savings.some(s => s.type === 'term');
    const goldAssets = portfolio.filter(p => p.asset_class === 'gold');
    const stockAssets = portfolio.filter(p => p.asset_class !== 'gold' && p.asset_class !== 'etf');
    const etfAssets = portfolio.filter(p => p.asset_class === 'etf');
    const sniperTxns = this.query("SELECT COUNT(*) as cnt FROM transactions WHERE strategy = 'sniper'");
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

    // Phase 4: passive_income = lãi tiết kiệm/tháng + cổ tức trung bình/tháng >= chi tiêu mục tiêu
    const monthlySavingsInterest = savings.reduce((sum, s) => {
      return sum + (s.principal * (s.interest_rate / 100) / 12);
    }, 0);
    const filledMonths = this.query('SELECT COUNT(*) as cnt FROM monthly_entries WHERE total_inflow > 0')[0]?.cnt || 1;
    const totalDividends = this.queryOne(`
      SELECT COALESCE(SUM(total_amount), 0) as total FROM transactions
      WHERE LOWER(note) LIKE '%cổ tức%' OR LOWER(note) LIKE '%lãi%'
    `)?.total || 0;
    const monthlyPassive = monthlySavingsInterest + (totalDividends / Math.max(1, filledMonths));
    const hasPassiveIncome = monthlyPassive >= monthlyExpense;

    // Phase 4: rebalance_quarterly = có giao dịch tái cơ cấu trong 90 ngày gần nhất
    const hasRecentRebalance = (this.queryOne(
      "SELECT COUNT(*) as cnt FROM transactions WHERE date >= date('now', '-90 days')"
    )?.cnt || 0) > 0;

    return {
      1: {
        savings_acc: hasAnySavings,
        broker_acc: portfolio.length > 0,
        emergency_3x: duPhongSavings >= 3 * monthlyExpense,
        first_etf: hasAnyStocks,
        track_money: true,
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
    for (const [catId, ratio] of allocations) {
      this.run('INSERT INTO phase_allocations (phase_id, category_id, ratio) VALUES (?, ?, ?)', [phaseId, catId, ratio]);
    }
    this.save();
  }

  // ===== MONTHLY ENTRIES =====
  getMonthlyEntries() { return this.query('SELECT * FROM monthly_entries ORDER BY month_index'); }
  getMonthlyEntry(monthIndex) { return this.queryOne('SELECT * FROM monthly_entries WHERE month_index = ?', [monthIndex]); }
  getFilledMonths() { return this.query('SELECT * FROM monthly_entries WHERE total_inflow > 0 ORDER BY month_index'); }
  getNextUnfilledMonth() {
    // 1. Find the first month in chronological order that is not confirmed (unfilled)
    const firstUnfilled = this.queryOne("SELECT * FROM monthly_entries WHERE status IS NULL OR status != 'confirmed' ORDER BY month_index ASC LIMIT 1");
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
    const existing = this.getMonthlyEntry(data.month_index);
    if (existing) {
      this.run(`UPDATE monthly_entries SET
        income = ?, expense = ?, bonus = ?, total_inflow = ?, note = ?, phase_id = ?, status = ?
        WHERE month_index = ?`,
        [data.income || 0, data.expense || 0, data.bonus || 0, data.total_inflow || 0,
         data.note || null, data.phase_id || null, data.status || 'confirmed', data.month_index]);
    } else {
      this.run(`INSERT INTO monthly_entries (month_index, month_label, income, expense, bonus, total_inflow, note, phase_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.month_index, data.month_label, data.income || 0, data.expense || 0, data.bonus || 0,
         data.total_inflow || 0, data.note || null, data.phase_id || null, data.status || 'confirmed']);
    }
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
    this.save();
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

  adjustInvestmentAllocation(discrepancyAmount) {
    // Find the most recent filled monthly entry
    const latest = this.queryOne('SELECT id FROM monthly_entries WHERE total_inflow > 0 ORDER BY id DESC LIMIT 1');
    if (!latest) return;

    // Find investment allocations for the latest month (exclude Dự Phòng and Tiết kiệm)
    const allAllocs = this.query(`
      SELECT a.id, a.actual_amount, a.planned_amount, a.monthly_entry_id, c.name as category_name
      FROM allocations a
      JOIN categories c ON c.id = a.category_id
      WHERE a.monthly_entry_id = ?
    `, [latest.id]);
    const investAllocs = allAllocs.filter(a => !a.category_name.includes('Dự Phòng') && !a.category_name.includes('Tiết kiệm'));

    if (investAllocs.length === 0) return;

    // Add discrepancy to the first investment allocation's actual_amount
    const target = investAllocs[0];
    const newAmount = (target.actual_amount || target.planned_amount || 0) + discrepancyAmount;
    this.run('UPDATE allocations SET actual_amount = ? WHERE id = ?', [Math.max(0, newAmount), target.id]);
    this.save();
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
    return this.query(`
      SELECT
        a.id as asset_type_id,
        CASE WHEN a.ticker IS NOT NULL AND a.ticker != '' THEN a.ticker ELSE a.name END as name,
        a.category, a.ticker, a.unit, a.color, a.icon,
        a.current_price, a.asset_class,
        COALESCE(SUM(CASE WHEN t.type = 'BUY' THEN t.quantity ELSE -t.quantity END), 0) as total_quantity,
        COALESCE(SUM(CASE WHEN t.type = 'BUY' THEN t.total_amount ELSE -t.total_amount END), 0) as total_invested,
        CASE WHEN COALESCE(SUM(CASE WHEN t.type = 'BUY' THEN t.quantity ELSE -t.quantity END), 0) > 0
          THEN SUM(CASE WHEN t.type = 'BUY' THEN t.total_amount ELSE -t.total_amount END) /
               SUM(CASE WHEN t.type = 'BUY' THEN t.quantity ELSE -t.quantity END)
          ELSE 0 END as avg_cost,
        CASE WHEN a.current_price > 0
          THEN COALESCE(SUM(CASE WHEN t.type = 'BUY' THEN t.quantity ELSE -t.quantity END), 0) * a.current_price
          ELSE COALESCE(SUM(CASE WHEN t.type = 'BUY' THEN t.total_amount ELSE -t.total_amount END), 0)
        END as current_value
      FROM asset_types a
      LEFT JOIN transactions t ON t.asset_type_id = a.id
      WHERE a.active = 1 AND a.asset_class NOT IN ('savings', 'bond')
      GROUP BY a.id
      HAVING total_quantity > 0
      ORDER BY current_value DESC
    `);
  }

  // Map asset to allocation category based on asset_class and transaction strategy
  _getAssetAllocationCategory(assetTypeId, assetClass) {
    // Check if this asset has any sniper strategy transactions
    const sniperTx = this.queryOne(
      "SELECT COUNT(*) as cnt FROM transactions WHERE asset_type_id = ? AND LOWER(strategy) = 'sniper'",
      [assetTypeId]
    );
    if (sniperTx?.cnt > 0) return 'Bắn Tỉa';

    // Map by asset_class
    switch (assetClass) {
      case 'stock':
      case 'etf':
        return 'Đầu Tư';
      case 'gold':
        return 'Vàng';
      case 'crypto':
        return 'Bắn Tỉa';  // High risk, speculative
      case 'bond':
      case 'savings':
        return 'Tiết kiệm & Trái phiếu';
      default:
        return 'Đầu Tư';
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

    return { portfolio, totalInvested, totalCurrentValue, totalGain, byCategory };
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
      const accrued = this.calculateAccruedInterest(a);
      const transactions = this.query('SELECT * FROM savings_transactions WHERE savings_account_id = ? ORDER BY date DESC', [a.id]);
      const totalDeposited = transactions.filter(t => t.type === 'deposit').reduce((s, t) => s + t.amount, 0);
      const totalWithdrawn = transactions.filter(t => t.type === 'withdraw').reduce((s, t) => s + t.amount, 0);
      const totalInterest = transactions.filter(t => t.type === 'interest').reduce((s, t) => s + t.amount, 0);
      return {
        ...a,
        accrued_interest: accrued,
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
    const accrued = this.calculateAccruedInterest(a);
    const transactions = this.query('SELECT * FROM savings_transactions WHERE savings_account_id = ? ORDER BY date DESC', [a.id]);
    return { ...a, accrued_interest: accrued, transactions };
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

  calculateAccruedInterest(account) {
    if (!account || account.status !== 'active' || account.interest_rate <= 0 || account.principal <= 0) return 0;
    const start = new Date(account.start_date);
    const now = new Date();
    const daysElapsed = Math.floor((now - start) / 86400000);
    if (daysElapsed <= 0) return 0;

    if (account.type === 'liquid') {
      // Liquid: simple interest, prorated daily
      return Math.round(account.principal * (account.interest_rate / 100) * (daysElapsed / 365));
    } else {
      // Term: if matured, full interest; otherwise prorate
      if (account.term_months <= 0) return 0;
      const fullInterest = Math.round(account.principal * (account.interest_rate / 100) * (account.term_months / 12));
      if (account.maturity_date) {
        const maturity = new Date(account.maturity_date);
        if (now >= maturity) return fullInterest;
      }
      // Prorate based on days elapsed vs term days (use 365-day year)
      const termDays = Math.round(account.term_months * 365 / 12);
      const prorated = Math.round(fullInterest * Math.min(daysElapsed / termDays, 1));
      return prorated;
    }
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
        const interest = this.calculateAccruedInterest(a);
        if (interest > 0) {
          this.run(`INSERT INTO savings_transactions (savings_account_id, type, amount, date, note) VALUES (?, 'interest', ?, ?, ?)`,
            [a.id, interest, today, 'Tự động tất toán - tái tục']);
          this.run('UPDATE savings_accounts SET principal = principal + ?, start_date = ?, maturity_date = ? WHERE id = ?',
            [interest, today, this._calcMaturityDate(today, a.term_months), a.id]);
        }
        results.push({ id: a.id, name: a.name, action: 'renewed', interest });
      } else {
        // Mark as matured
        const interest = this.calculateAccruedInterest(a);
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
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + termMonths);
    return d.toISOString().split('T')[0];
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
