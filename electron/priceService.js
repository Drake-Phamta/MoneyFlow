const https = require('https');

const VNDIRECT_API = 'dchart-api.vndirect.com.vn';

class PriceService {
  constructor(db) {
    this.db = db;
  }

  httpsGet(url) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { rejectUnauthorized: false }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Invalid JSON')); }
        });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
  }

  async fetchPrice(symbol) {
    const now = Math.floor(Date.now() / 1000);
    const from = now - 7 * 86400;
    const path = `/dchart/history?resolution=D&symbol=${encodeURIComponent(symbol)}&from=${from}&to=${now}`;

    try {
      const data = await this.httpsGet({ hostname: VNDIRECT_API, path, port: 443 });
      // Check for Access Denied or error responses
      if (data.s === 'error' || data.status === 403) {
        return { error: 'Access Denied' };
      }
      if (data.s !== 'ok' || !data.t || data.t.length === 0) return null;
      const last = data.t.length - 1;
      return {
        date: new Date(data.t[last] * 1000).toISOString().split('T')[0],
        close: data.c[last] * 1000,
      };
    } catch (e) {
      return { error: e.message };
    }
  }

  async fetchAllWatchlistPrices() {
    const assets = this.db.query('SELECT * FROM asset_types WHERE active = 1');
    const results = [];
    const today = new Date().toISOString().split('T')[0];

    for (const asset of assets) {
      if (!asset.ticker) {
        results.push({ id: asset.id, name: asset.name, ticker: asset.ticker, status: 'skipped', error: 'No ticker' });
        continue;
      }

      try {
        const priceData = await this.fetchPrice(asset.ticker);
        if (priceData && priceData.error) {
          results.push({ id: asset.id, name: asset.name, ticker: asset.ticker, status: 'error', error: priceData.error });
        } else if (priceData && priceData.close > 0) {
          this.db.run('UPDATE asset_types SET current_price = ? WHERE id = ?', [priceData.close, asset.id]);
          // Save price history
          this.db.run('INSERT OR REPLACE INTO price_snapshots (asset_type_id, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [asset.id, priceData.date, priceData.open || 0, priceData.high || 0, priceData.low || 0, priceData.close, priceData.volume || 0]);
          results.push({ id: asset.id, name: asset.name, ticker: asset.ticker, price: priceData.close, status: 'ok' });
        } else {
          results.push({ id: asset.id, name: asset.name, ticker: asset.ticker, status: 'no_data' });
        }
      } catch (e) {
        results.push({ id: asset.id, name: asset.name, ticker: asset.ticker, status: 'error', error: e.message });
      }

      // Rate limit: 200ms between requests
      await new Promise(r => setTimeout(r, 200));
    }

    this.db.save();
    return results;
  }

  generateAlerts() {
    const assets = this.db.query('SELECT * FROM asset_types WHERE is_tracked = 1 AND current_price > 0');
    const alerts = [];

    for (const asset of assets) {
      if (!asset.peak_price || asset.peak_price === 0) continue;

      const dropPct = ((asset.peak_price - asset.current_price) / asset.peak_price) * 100;

      if (dropPct >= 15) {
        const existing = this.db.queryOne('SELECT * FROM alerts WHERE asset_type_id = ? AND type = ? AND read = 0', [asset.id, 'price_drop']);
        if (!existing) {
          const msg = `${asset.ticker} giảm ${dropPct.toFixed(1)}% so với đỉnh (${this.formatVND(asset.peak_price)} → ${this.formatVND(asset.current_price)})`;
          this.db.run('INSERT INTO alerts (asset_type_id, type, message, read, created_at) VALUES (?, ?, ?, 0, ?)',
            [asset.id, 'price_drop', msg, new Date().toISOString()]);
          alerts.push({ asset, type: 'price_drop', message: msg });
        }
      }

      if (dropPct >= 35) {
        const existing = this.db.queryOne('SELECT * FROM alerts WHERE asset_type_id = ? AND type = ? AND read = 0', [asset.id, 'stop_loss']);
        if (!existing) {
          const msg = `🚨 ${asset.ticker} đã giảm ${dropPct.toFixed(1)}% — CÂN NHẮC CẮT LỖ!`;
          this.db.run('INSERT INTO alerts (asset_type_id, type, message, read, created_at) VALUES (?, ?, ?, 0, ?)',
            [asset.id, 'stop_loss', msg, new Date().toISOString()]);
          alerts.push({ asset, type: 'stop_loss', message: msg });
        }
      }
    }

    this.db.save();
    return alerts;
  }

  formatVND(n) {
    if (!n) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);
  }
}

module.exports = PriceService;
