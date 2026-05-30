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
        ? path.join(app.getPath('userData'), 'money_flow.sqlite')
        : path.join(__dirname, '../data/money_flow.sqlite');
    }
    this.ready = this.init();
  }

  async init() {
    const SQL = await initSqlJs();
    if (fs.existsSync(this.dbPath)) {
      const buf = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buf);
    } else {
      this.db = new SQL.Database();
    }
    this.createTables();
    this.seedDefaults();
    this.save();
  }

  save() {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.dbPath, buffer);
  }

  query(sql, params = []) {
    const stmt = this.db.prepare(sql);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  run(sql, params = []) {
    // sql.js rejects undefined — convert to null
    const safeParams = params.map(p => p === undefined ? null : p);
    this.db.run(sql, safeParams);
  }

  // ─── Create Tables ──────────────────────────────────────────────────

  createTables() {
    this.run(`CREATE TABLE IF NOT EXISTS parameters (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )`);

    this.run(`CREATE TABLE IF NOT EXISTS asset_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ticker TEXT,
      unit TEXT DEFAULT 'cổ phiếu',
      category TEXT DEFAULT 'Giao dịch',
      color TEXT DEFAULT '#3b82f6',
      icon TEXT DEFAULT '📊',
      current_price REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    this.run(`CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT,
      color TEXT DEFAULT '#3b82f6',
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    this.run(`CREATE TABLE IF NOT EXISTS phases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      target_amount REAL DEFAULT 0,
      guidance TEXT,
      is_active INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    this.run(`CREATE TABLE IF NOT EXISTS phase_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phase_id INTEGER,
      category_id INTEGER,
      percentage REAL DEFAULT 0,
      FOREIGN KEY (phase_id) REFERENCES phases(id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )`);

    this.run(`CREATE TABLE IF NOT EXISTS monthly_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      year INTEGER NOT NULL,
      income REAL DEFAULT 0,
      expenses REAL DEFAULT 0,
      savings REAL DEFAULT 0,
      notes TEXT,
      phase_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(month, year)
    )`);

    this.run(`CREATE TABLE IF NOT EXISTS allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monthly_entry_id INTEGER,
      category_id INTEGER,
      planned_amount REAL DEFAULT 0,
      actual_amount REAL DEFAULT 0,
      FOREIGN KEY (monthly_entry_id) REFERENCES monthly_entries(id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )`);

    this.run(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_type_id INTEGER,
      type TEXT NOT NULL,
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      total_amount REAL NOT NULL,
      fee REAL DEFAULT 0,
      date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (asset_type_id) REFERENCES asset_types(id)
    )`);

    this.run(`CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      total_value REAL DEFAULT 0,
      total_invested REAL DEFAULT 0,
      breakdown TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    this.run(`CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    this.run(`CREATE TABLE IF NOT EXISTS savings_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      bank TEXT,
      account_type TEXT DEFAULT 'term',
      interest_rate REAL DEFAULT 0,
      term_months INTEGER DEFAULT 0,
      principal REAL DEFAULT 0,
      start_date TEXT,
      maturity_date TEXT,
      auto_renew INTEGER DEFAULT 0,
      category_id INTEGER,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )`);

    this.run(`CREATE TABLE IF NOT EXISTS savings_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES savings_accounts(id)
    )`);

    this.run(`CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_type_id INTEGER,
      target_price REAL,
      stop_loss REAL,
      notes TEXT,
      status TEXT DEFAULT 'watching',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (asset_type_id) REFERENCES asset_types(id)
    )`);

    this.run(`CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_type_id INTEGER,
      alert_type TEXT NOT NULL,
      message TEXT,
      price_at_alert REAL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (asset_type_id) REFERENCES asset_types(id)
    )`);

    this.run(`CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_type_id INTEGER,
      price REAL NOT NULL,
      date TEXT NOT NULL,
      FOREIGN KEY (asset_type_id) REFERENCES asset_types(id)
    )`);
  }

  // ─── Seed Defaults ──────────────────────────────────────────────────

  seedDefaults() {
    // Parameters
    const params = [
      ['monthly_income', '15000000'],
      ['emergency_fund_target', '30000000'],
      ['savings_rate', '0.3'],
      ['inflation_rate', '0.04'],
      ['investment_return', '0.12'],
      ['current_phase', '1'],
    ];
    for (const [k, v] of params) {
      try { this.run('INSERT INTO parameters (key, value) VALUES (?, ?)', [k, v]); } catch (e) { /* exists */ }
    }

    // Categories
    const cats = [
      ['Dự Phòng', 'shield-check', '#10b981', 'Quỹ dự phòng khẩn cấp'],
      ['Đầu Tư', 'trend-up', '#3b82f6', 'Đầu tư chứng khoán, ETF'],
      ['Vàng', 'coins', '#f59e0b', 'Tích trữ vàng SJC'],
      ['Bắn Tỉa', 'crosshair', '#ef4444', 'Cơ hội ngắn hạn'],
      ['Tiết Kiệm', 'piggy-bank', '#8b5cf6', 'Tiết kiệm ngân hàng'],
    ];
    for (const [name, icon, color, desc] of cats) {
      try { this.run('INSERT INTO categories (name, icon, color, description) VALUES (?, ?, ?, ?)', [name, icon, color, desc]); } catch (e) { /* exists */ }
    }

    // Phases
    const phases = [
      ['Nền Tảng', 'Xây dựng quỹ dự phòng 3-6 tháng chi tiêu', 30000000, 'Tập trung vào tiết kiệm và quỹ dự phòng. Ưu tiên 70% thu nhập cho nhu cầu thiết yếu.', 1],
      ['Tăng Trưởng', 'Bắt đầu đầu tư dài hạn, đa dạng hóa', 100000000, 'Bắt đầu phân bổ 20% thu nhập vào đầu tư. Giữ kỷ luật chi tiêu.', 0],
      ['Mở Rộng', 'Tăng tốc đầu tư, xây dựng nguồn thu nhập thụ động', 500000000, 'Tăng tỷ lệ đầu tư lên 30%. Tìm kiếm cơ hội thu nhập thụ động.', 0],
      ['Tự Do Tài Chính', 'Đạt FI, sống bằng thu nhập thụ động', 2000000000, 'Duy trì lối sống, tối ưu thuế, chuẩn bị nghỉ hưu sớm.', 0],
    ];
    for (const [name, desc, target, guidance, active] of phases) {
      try { this.run('INSERT INTO phases (name, description, target_amount, guidance, is_active) VALUES (?, ?, ?, ?, ?)', [name, desc, target, guidance, active]); } catch (e) { /* exists */ }
    }

    // Asset types
    const assets = [
      ['VN30 ETF', 'E1VFVN30', 'CCQ', 'Giao dịch', '#3b82f6', '📊'],
      ['FPT', 'FPT', 'cổ phiếu', 'Giao dịch', '#10b981', '🏢'],
      ['VNM', 'VNM', 'cổ phiếu', 'Giao dịch', '#f59e0b', '🥛'],
      ['Vàng SJC', 'SJC', 'chỉ', 'Vàng', '#fbbf24', '🥇'],
      ['MB Bank', 'MBB', 'cổ phiếu', 'Giao dịch', '#6366f1', '🏦'],
      ['Vingroup', 'VIC', 'cổ phiếu', 'Giao dịch', '#ef4444', '🏗️'],
      ['Hòa Phát', 'HPG', 'cổ phiếu', 'Giao dịch', '#8b5cf6', '🔩'],
    ];
    for (const [name, ticker, unit, cat, color, icon] of assets) {
      try { this.run('INSERT INTO asset_types (name, ticker, unit, category, color, icon) VALUES (?, ?, ?, ?, ?, ?)', [name, ticker, unit, cat, color, icon]); } catch (e) { /* exists */ }
    }
  }

  // ─── Parameters ─────────────────────────────────────────────────────

  getParameters() {
    return this.query('SELECT * FROM parameters ORDER BY key');
  }

  updateParameter(key, value) {
    this.run('INSERT OR REPLACE INTO parameters (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))', [key, value]);
    this.save();
    return { key, value };
  }

  // ─── Asset Types ────────────────────────────────────────────────────

  getAssetTypes() {
    return this.query('SELECT * FROM asset_types ORDER BY id');
  }

  addAssetType(data) {
    this.run('INSERT INTO asset_types (name, ticker, unit, category, color, icon) VALUES (?, ?, ?, ?, ?, ?)',
      [data.name, data.ticker || '', data.unit || 'cổ phiếu', data.category || 'Giao dịch', data.color || '#3b82f6', data.icon || '📊']);
    this.save();
    return { id: this.query('SELECT last_insert_rowid() as id')[0].id };
  }

  updateAssetPrice(id, price) {
    this.run('UPDATE asset_types SET current_price = ? WHERE id = ?', [price, id]);
    this.save();
  }

  // ─── Categories ─────────────────────────────────────────────────────

  getCategories() {
    return this.query('SELECT * FROM categories ORDER BY id');
  }

  // ─── Phases ─────────────────────────────────────────────────────────

  getPhases() {
    return this.query('SELECT * FROM phases ORDER BY id');
  }

  getActivePhase() {
    return this.query('SELECT * FROM phases WHERE is_active = 1 LIMIT 1')[0] || null;
  }

  setActivePhase(phaseId) {
    this.run('UPDATE phases SET is_active = 0');
    this.run('UPDATE phases SET is_active = 1 WHERE id = ?', [phaseId]);
    this.run('INSERT OR REPLACE INTO parameters (key, value) VALUES (?, ?)', ['current_phase', String(phaseId)]);
    this.save();
  }

  getPhaseAllocations(phaseId) {
    return this.query(`
      SELECT pa.*, c.name as category_name, c.icon, c.color
      FROM phase_allocations pa
      JOIN categories c ON c.id = pa.category_id
      WHERE pa.phase_id = ?
    `, [phaseId]);
  }

  savePhaseAllocations(phaseId, allocations) {
    this.run('DELETE FROM phase_allocations WHERE phase_id = ?', [phaseId]);
    for (const a of allocations) {
      this.run('INSERT INTO phase_allocations (phase_id, category_id, percentage) VALUES (?, ?, ?)',
        [phaseId, a.category_id, a.percentage]);
    }
    this.save();
  }

  // ─── Monthly Entries ────────────────────────────────────────────────

  getMonthlyEntries() {
    return this.query(`
      SELECT me.*, p.name as phase_name
      FROM monthly_entries me
      LEFT JOIN phases p ON p.id = me.phase_id
      ORDER BY me.year DESC, me.month DESC
    `);
  }

  getMonthlyEntry(id) {
    return this.query('SELECT * FROM monthly_entries WHERE id = ?', [id])[0] || null;
  }

  saveMonthlyEntry(data) {
    if (data.id) {
      this.run(`UPDATE monthly_entries SET month=?, year=?, income=?, expenses=?, savings=?, notes=?, phase_id=? WHERE id=?`,
        [data.month, data.year, data.income || 0, data.expenses || 0, data.savings || 0, data.notes || '', data.phase_id || null, data.id]);
    } else {
      this.run(`INSERT INTO monthly_entries (month, year, income, expenses, savings, notes, phase_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [data.month, data.year, data.income || 0, data.expenses || 0, data.savings || 0, data.notes || '', data.phase_id || null]);
      data.id = this.query('SELECT last_insert_rowid() as id')[0].id;
    }
    this.save();
    return data;
  }

  deleteMonthlyEntry(id) {
    this.run('DELETE FROM allocations WHERE monthly_entry_id = ?', [id]);
    this.run('DELETE FROM monthly_entries WHERE id = ?', [id]);
    this.save();
  }

  // ─── Allocations ────────────────────────────────────────────────────

  getAllocations(entryId) {
    return this.query(`
      SELECT a.*, c.name as category_name, c.icon, c.color
      FROM allocations a
      JOIN categories c ON c.id = a.category_id
      WHERE a.monthly_entry_id = ?
    `, [entryId]);
  }

  getAllAllocations() {
    return this.query(`
      SELECT a.*, c.name as category_name, c.icon, c.color,
             me.month, me.year
      FROM allocations a
      JOIN categories c ON c.id = a.category_id
      JOIN monthly_entries me ON me.id = a.monthly_entry_id
      ORDER BY me.year DESC, me.month DESC
    `);
  }

  saveAllocations(entryId, allocations) {
    this.run('DELETE FROM allocations WHERE monthly_entry_id = ?', [entryId]);
    for (const a of allocations) {
      this.run('INSERT INTO allocations (monthly_entry_id, category_id, planned_amount, actual_amount) VALUES (?, ?, ?, ?)',
        [entryId, a.category_id, a.planned_amount || 0, a.actual_amount || 0]);
    }
    this.save();
  }

  adjustInvestmentAllocation(discrepancyAmount) {
    const filled = this.query('SELECT id FROM monthly_entries ORDER BY id DESC');
    if (filled.length === 0) return;
    const allAllocs = this.query(`
      SELECT a.id, a.actual_amount, a.planned_amount, c.name as category_name
      FROM allocations a JOIN categories c ON c.id = a.category_id
    `);
    const investAllocs = allAllocs.filter(a => !a.category_name.includes('Dự Phòng') && !a.category_name.includes('Tiết kiệm'));
    if (investAllocs.length === 0) return;
    const target = investAllocs[0];
    const newAmount = (target.actual_amount || target.planned_amount || 0) + discrepancyAmount;
    this.run('UPDATE allocations SET actual_amount = ? WHERE id = ?', [Math.max(0, newAmount), target.id]);
    this.save();
  }

  // ─── Transactions ───────────────────────────────────────────────────

  getTransactions(limit = 100) {
    return this.query(`
      SELECT t.*, at.name as asset_name, at.ticker, at.icon
      FROM transactions t
      LEFT JOIN asset_types at ON at.id = t.asset_type_id
      ORDER BY t.date DESC, t.id DESC
      LIMIT ?
    `, [limit]);
  }

  addTransaction(data) {
    this.run(`INSERT INTO transactions (asset_type_id, type, quantity, price, total_amount, fee, date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.asset_type_id, data.type, data.quantity, data.price, data.total_amount, data.fee || 0, data.date, data.notes || '']);
    const id = this.query('SELECT last_insert_rowid() as id')[0].id;

    // Update asset price
    if (data.asset_type_id && data.price) {
      this.updateAssetPrice(data.asset_type_id, data.price);
    }

    this.save();
    this.logActivity('transaction', `${data.type === 'buy' ? 'Mua' : 'Bán'} ${data.quantity} ${data.asset_name || ''} @ ${data.price}`);
    return { id };
  }

  // ─── Portfolio ──────────────────────────────────────────────────────

  getPortfolio() {
    return this.query(`
      SELECT at.id as asset_type_id, at.name, at.category, at.ticker, at.unit, at.color, at.icon,
             at.current_price,
             SUM(CASE WHEN t.type='buy' THEN t.quantity ELSE -t.quantity END) as total_quantity,
             SUM(t.total_amount) as total_invested,
             CASE WHEN SUM(CASE WHEN t.type='buy' THEN t.quantity ELSE -t.quantity END) > 0
               THEN SUM(t.total_amount) / SUM(CASE WHEN t.type='buy' THEN t.quantity ELSE -t.quantity END)
               ELSE 0 END as avg_cost
      FROM asset_types at
      LEFT JOIN transactions t ON t.asset_type_id = at.id
      GROUP BY at.id
      HAVING total_quantity > 0
    `);
  }

  getPortfolioSummary() {
    const portfolio = this.getPortfolio().map(p => ({
      ...p,
      current_value: p.total_quantity * p.current_price,
      gain: (p.total_quantity * p.current_price) - p.total_invested,
    }));
    const totalInvested = portfolio.reduce((s, p) => s + p.total_invested, 0);
    const totalCurrentValue = portfolio.reduce((s, p) => s + p.current_value, 0);
    const byCategory = {};
    for (const p of portfolio) {
      if (!byCategory[p.category]) byCategory[p.category] = { total: 0, currentTotal: 0, items: [] };
      byCategory[p.category].total += p.total_invested;
      byCategory[p.category].currentTotal += p.current_value;
      byCategory[p.category].items.push(p);
    }
    return { portfolio, totalInvested, totalCurrentValue, totalGain: totalCurrentValue - totalInvested, byCategory };
  }

  // ─── Savings ────────────────────────────────────────────────────────

  getSavingsAccounts() {
    return this.query(`
      SELECT sa.*, c.name as category_name
      FROM savings_accounts sa
      LEFT JOIN categories c ON c.id = sa.category_id
      ORDER BY sa.status ASC, sa.maturity_date ASC
    `);
  }

  addSavingsAccount(data) {
    this.run(`INSERT INTO savings_accounts (name, bank, account_type, interest_rate, term_months, principal, start_date, maturity_date, auto_renew, category_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.bank || '', data.account_type || 'term', data.interest_rate || 0, data.term_months || 0,
       data.principal || 0, data.start_date, data.maturity_date || null, data.auto_renew ? 1 : 0, data.category_id || null]);
    const id = this.query('SELECT last_insert_rowid() as id')[0].id;
    this.save();
    this.logActivity('savings', `Thêm sổ tiết kiệm: ${data.name}`);
    return { id };
  }

  updateSavingsAccount(id, data) {
    const fields = [];
    const values = [];
    for (const [k, v] of Object.entries(data)) {
      if (['name', 'bank', 'account_type', 'interest_rate', 'term_months', 'start_date', 'maturity_date', 'auto_renew', 'category_id', 'status'].includes(k)) {
        fields.push(`${k} = ?`);
        values.push(k === 'auto_renew' ? (v ? 1 : 0) : v);
      }
    }
    if (fields.length > 0) {
      values.push(id);
      this.run(`UPDATE savings_accounts SET ${fields.join(', ')} WHERE id = ?`, values);
      this.save();
    }
  }

  deleteSavingsAccount(id) {
    this.run('DELETE FROM savings_transactions WHERE account_id = ?', [id]);
    this.run('DELETE FROM savings_accounts WHERE id = ?', [id]);
    this.save();
  }

  addSavingsTransaction(accountId, type, amount, date, note) {
    this.run('INSERT INTO savings_transactions (account_id, type, amount, date, note) VALUES (?, ?, ?, ?, ?)',
      [accountId, type, amount, date, note || '']);

    // Update principal
    const account = this.query('SELECT principal FROM savings_accounts WHERE id = ?', [accountId])[0];
    if (account) {
      const newPrincipal = type === 'deposit' ? account.principal + amount : account.principal - amount;
      this.run('UPDATE savings_accounts SET principal = ? WHERE id = ?', [Math.max(0, newPrincipal), accountId]);
    }
    this.save();
  }

  calculateAccruedInterest(account) {
    if (!account.start_date || !account.interest_rate || !account.principal) return 0;
    const start = new Date(account.start_date);
    const now = new Date();
    const days = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    const dailyRate = account.interest_rate / 100 / 365;
    return Math.round(account.principal * dailyRate * days);
  }

  // ─── Watchlist ──────────────────────────────────────────────────────

  getWatchlist() {
    return this.query(`
      SELECT w.*, at.name, at.ticker, at.current_price, at.icon, at.color
      FROM watchlist w
      JOIN asset_types at ON at.id = w.asset_type_id
      ORDER BY w.status ASC, w.id DESC
    `);
  }

  addToWatchlist(data) {
    this.run('INSERT INTO watchlist (asset_type_id, target_price, stop_loss, notes) VALUES (?, ?, ?, ?)',
      [data.asset_type_id, data.target_price || null, data.stop_loss || null, data.notes || '']);
    this.save();
  }

  updateWatchlist(id, data) {
    const fields = [];
    const values = [];
    for (const [k, v] of Object.entries(data)) {
      if (['target_price', 'stop_loss', 'notes', 'status'].includes(k)) {
        fields.push(`${k} = ?`);
        values.push(v);
      }
    }
    if (fields.length > 0) {
      values.push(id);
      this.run(`UPDATE watchlist SET ${fields.join(', ')} WHERE id = ?`, values);
      this.save();
    }
  }

  // ─── Alerts ─────────────────────────────────────────────────────────

  getAlerts(unreadOnly = false) {
    const where = unreadOnly ? 'WHERE a.is_read = 0' : '';
    return this.query(`
      SELECT a.*, at.name as asset_name, at.ticker, at.icon
      FROM alerts a
      JOIN asset_types at ON at.id = a.asset_type_id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT 50
    `);
  }

  markAlertRead(id) {
    this.run('UPDATE alerts SET is_read = 1 WHERE id = ?', [id]);
    this.save();
  }

  createAlert(assetTypeId, type, message, price) {
    this.run('INSERT INTO alerts (asset_type_id, alert_type, message, price_at_alert) VALUES (?, ?, ?, ?)',
      [assetTypeId, type, message, price]);
    this.save();
  }

  // ─── Activity Log ───────────────────────────────────────────────────

  logActivity(action, details) {
    this.run('INSERT INTO activity_log (action, details) VALUES (?, ?)', [action, details]);
  }

  getActivityLog(limit = 20) {
    return this.query('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?', [limit]);
  }

  // ─── Timeline (for charts) ─────────────────────────────────────────

  getTimeline(months = 12) {
    return this.query(`
      SELECT month, year, income, expenses, savings,
             (income - expenses) as net
      FROM monthly_entries
      ORDER BY year DESC, month DESC
      LIMIT ?
    `, [months]);
  }

  // ─── Price History ──────────────────────────────────────────────────

  savePriceHistory(assetTypeId, price, date) {
    this.run('INSERT OR REPLACE INTO price_history (asset_type_id, price, date) VALUES (?, ?, ?)',
      [assetTypeId, price, date]);
  }

  getPriceHistory(assetTypeId, days = 30) {
    return this.query(`
      SELECT * FROM price_history
      WHERE asset_type_id = ?
      ORDER BY date DESC
      LIMIT ?
    `, [assetTypeId, days]);
  }

  // ─── Import/Export ──────────────────────────────────────────────────

  importExcel(buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    let imported = 0;

    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet);

      for (const row of data) {
        if (row.month && row.year) {
          this.saveMonthlyEntry({
            month: String(row.month).padStart(2, '0'),
            year: row.year,
            income: row.income || 0,
            expenses: row.expenses || 0,
            savings: row.savings || 0,
            notes: row.notes || '',
          });
          imported++;
        }
      }
    }

    this.save();
    this.logActivity('import', `Imported ${imported} records from Excel`);
    return { imported };
  }

  exportExcel() {
    const entries = this.getMonthlyEntries();
    const ws = XLSX.utils.json_to_sheet(entries);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Entries');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }
}

module.exports = FinancialDB;
