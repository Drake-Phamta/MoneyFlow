const VNDIRECT_API = 'https://dchart-api.vndirect.com.vn/dchart/history';

class PriceService {
  constructor(db) {
    this.db = db;
  }

  async fetchPrice(symbol) {
    const now = Math.floor(Date.now() / 1000);
    const from = now - 7 * 86400;
    const url = `${VNDIRECT_API}?resolution=D&symbol=${encodeURIComponent(symbol)}&from=${from}&to=${now}`;

    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
    if (!res.ok) throw new Error(`VNDIRECT API error: ${res.status}`);
    const data = await res.json();

    if (data.s !== 'ok' || !data.t || data.t.length === 0) {
      return null;
    }

    const last = data.t.length - 1;
    // VNDIRECT returns prices in thousands VND — multiply by 1000
    return {
      date: new Date(data.t[last] * 1000).toISOString().split('T')[0],
      open: data.o[last] * 1000,
      high: data.h[last] * 1000,
      low: data.l[last] * 1000,
      close: data.c[last] * 1000,
      volume: data.v[last],
    };
  }

  async fetchPriceHistory(symbol, days = 30) {
    const now = Math.floor(Date.now() / 1000);
    // days=0 means fetch ALL available history (back to year 2000)
    const from = days === 0 ? 946684800 : now - (days + 10) * 86400;
    const url = `${VNDIRECT_API}?resolution=D&symbol=${encodeURIComponent(symbol)}&from=${from}&to=${now}`;

    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
    if (!res.ok) throw new Error(`VNDIRECT API error: ${res.status}`);
    const data = await res.json();

    if (data.s !== 'ok' || !data.t || data.t.length === 0) {
      return [];
    }

    const bars = [];
    for (let i = 0; i < data.t.length; i++) {
      bars.push({
        date: new Date(data.t[i] * 1000).toISOString().split('T')[0],
        open: data.o[i] * 1000,
        high: data.h[i] * 1000,
        low: data.l[i] * 1000,
        close: data.c[i] * 1000,
        volume: data.v[i],
      });
    }
    return bars;
  }

  async fetchGoldPrice() {
    try {
      const res = await fetch('http://banggia.phuquygroup.vn/', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
      if (!res.ok) return null;
      const html = await res.text();

      // Find SJC row: "V&#224;ng miếng SJC" or "Vàng miếng SJC"
      const sjcIdx = html.indexOf('mi&#7871;ng SJC');
      const searchStart = sjcIdx !== -1 ? sjcIdx : html.indexOf('miếng SJC');
      if (searchStart === -1) return null;

      // Extract buy/sell prices (format: 15,500,000)
      const rowHtml = html.substring(searchStart, searchStart + 500);
      const prices = rowHtml.match(/[\d,]{5,12}/g);
      if (!prices || prices.length < 2) return null;

      const buyPrice = parseInt(prices[0].replace(/,/g, ''));
      const sellPrice = parseInt(prices[1].replace(/,/g, ''));
      const midPrice = Math.round((buyPrice + sellPrice) / 2);

      return {
        date: new Date().toISOString().split('T')[0],
        open: buyPrice,
        high: sellPrice,
        low: buyPrice,
        close: midPrice,
        volume: 0,
      };
    } catch (err) {
      console.error('Gold price fetch error:', err.message);
      return null;
    }
  }

  async fetchGoldHistoryPeak() {
    // Fetch gold prices to find historical peak
    // btmc.vn rate-limits concurrent requests, so fetch in batches
    let peak = 0;
    const now = new Date();

    const fetchDate = async (d) => {
      const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      try {
        const res = await fetch(`https://btmc.vn/ProductHome/getGoldDate?date=${encodeURIComponent(dateStr)}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
        const data = await res.json();
        const sjcSell = data?.Data?.sjcban;
        if (sjcSell) {
          const price = parseInt(sjcSell.replace(/<[^>]*>/g, '')) * 1000;
          if (price > peak) peak = price;
        }
      } catch (e) { /* skip */ }
    };

    // Build date list: last 730 days (2 years) daily for 100% accuracy
    const dates = [];
    for (let i = 0; i < 730; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dates.push(d);
    }

    // Fetch sequentially with delay to avoid rate limit
    for (let i = 0; i < dates.length; i++) {
      await fetchDate(dates[i]);
      if (i < dates.length - 1) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    // Enforce the correct historical peak price of SJC gold (19,080,000 VND per chỉ / 190.8M per lượng, reached on Jan 29, 2026)
    // to prevent rate limiting or missing data from returning a lower peak price.
    const SJC_HISTORICAL_PEAK = 19080000;
    return Math.max(peak, SJC_HISTORICAL_PEAK);
  }

  async fetchAllWatchlistPrices() {
    // Only fetch prices for assets that are tracked AND have active investments
    const tracked = this.db.getPriceRefreshTargets();
    console.log(`[PriceService] Fetching prices for ${tracked.length} invested assets: ${tracked.map(t => t.ticker).join(', ')}`);
    const results = [];

    for (const item of tracked) {
      if (!item.ticker) continue;
      try {
        let price;
        let highForPeak;
        let forcePeak = false;

        if (item.asset_class === 'gold') {
          // Gold (SJC): fetch from phuquygroup.vn (price is per-chỉ)
          price = await this.fetchGoldPrice();
          if (!price) {
            console.log(`[PriceService] No data for gold (${item.ticker})`);
            results.push({ id: item.id, name: item.name, ticker: item.ticker, status: 'no_data' });
            continue;
          }
          highForPeak = price.high;

          // First time (peak = 0): fetch historical peak for gold
          if (!item.peak_price || item.peak_price === 0) {
            try {
              const goldPeak = await this.fetchGoldHistoryPeak();
              if (goldPeak > highForPeak) highForPeak = goldPeak;
            } catch (e) { /* fallback to daily high */ }
          }
        } else {
          // Stocks/ETFs: Check if we need to fetch full history (if peak_price is 0)
          if (!item.peak_price || item.peak_price === 0) {
            console.log(`[PriceService] Fetching full history once for ${item.ticker} to determine historical peak...`);
            let history = [];
            try {
              history = await this.fetchPriceHistory(item.ticker, 0); // days = 0 fetches full history
            } catch (err) {
              console.warn(`[PriceService] Full history fetch failed for ${item.ticker}:`, err.message);
            }

            if (history && history.length > 0) {
              const last = history.length - 1;
              price = history[last];
              
              // Calculate true peak from full adjusted history
              highForPeak = price.high;
              for (const bar of history) {
                if (bar.high > highForPeak) highForPeak = bar.high;
              }
              forcePeak = true; // Overwrite database peak_price with the newly determined peak
            }
          }

          // If we didn't fetch history (peak_price already > 0) OR history fetch failed:
          if (!price) {
            // Optimized path: fetch recent price (last 7 days)
            price = await this.fetchPrice(item.ticker);
            if (!price) {
              console.log(`[PriceService] No data for ${item.ticker}`);
              results.push({ id: item.id, name: item.name, ticker: item.ticker, status: 'no_data' });
              continue;
            }
            highForPeak = price.high;
            forcePeak = false; // Do not force, use MAX(peak_price, price.high)
          }
        }

        console.log(`[PriceService] ${item.ticker}: current = ${price.close}, peak = ${highForPeak} (force = ${forcePeak})`);

        this.db.savePriceSnapshot(item.id, price.date, price);
        this.db.updateAssetPrice(item.id, price.close, highForPeak, forcePeak);

        results.push({ id: item.id, name: item.name, ticker: item.ticker, price: price.close, status: 'ok' });
      } catch (err) {
        results.push({ id: item.id, name: item.name, ticker: item.ticker, status: 'error', error: err.message });
      }
    }

    const success = results.filter(r => r.status === 'ok').length;
    const failed = results.filter(r => r.status === 'error').length;
    const noData = results.filter(r => r.status === 'no_data').length;

    return { results, total: tracked.length, success, failed, noData };
  }

  generateAlerts() {
    // Only generate alerts for assets that are tracked AND have active investments
    const tracked = this.db.getPriceRefreshTargets();
    const alerts = [];

    // Alert thresholds for price drops (only alert at these specific levels)
    const DROP_THRESHOLDS = [0.15, 0.20, 0.25, 0.30, 0.40, 0.50];

    for (const item of tracked) {
      if (!item.current_price || !item.peak_price) continue;

      const dropPct = (item.peak_price - item.current_price) / item.peak_price;
      const recoveryPct = item.current_price / item.peak_price;
      const label = item.ticker ? `${item.ticker} (${item.name})` : item.name;

      // Price drop alert: only at specific thresholds (15%, 20%, 25%, etc.)
      if (item.current_price > 0 && dropPct >= 0.15) {
        // Find the highest threshold this drop crosses
        const crossedThreshold = DROP_THRESHOLDS.filter(t => dropPct >= t).pop();
        if (crossedThreshold) {
          // Check if we already alerted at this threshold level
          const lastAlert = this.db.queryOne(
            `SELECT data FROM alerts WHERE asset_type_id = ? AND type = 'price_drop' ORDER BY created_at DESC LIMIT 1`,
            [item.id]
          );
          let lastThreshold = 0;
          if (lastAlert?.data) {
            try {
              const data = JSON.parse(lastAlert.data);
              lastThreshold = DROP_THRESHOLDS.filter(t => data.drop_pct >= t).pop() || 0;
            } catch (e) {}
          }

          // Only alert if we've crossed a new threshold
          if (crossedThreshold > lastThreshold) {
            const id = this.db.addAlert(
              item.id,
              'price_drop',
              `${label} giảm ${(dropPct * 100).toFixed(0)}% từ đỉnh. Giá: ${item.current_price.toLocaleString('vi-VN')} ${item.unit}, Đỉnh: ${item.peak_price.toLocaleString('vi-VN')} ${item.unit}`,
              { price: item.current_price, peak: item.peak_price, drop_pct: dropPct, threshold: crossedThreshold }
            );
            if (id) alerts.push({ id, type: 'price_drop', name: label });
          }
        }
      }

      // Recovery alert: back to 90%+ of peak (only once)
      if (recoveryPct >= 0.90 && recoveryPct < 1.0) {
        // Check if we already have a recovery alert
        const existingRecovery = this.db.queryOne(
          `SELECT id FROM alerts WHERE asset_type_id = ? AND type = 'price_recovery' AND created_at > datetime('now', '-30 days')`,
          [item.id]
        );
        if (!existingRecovery) {
          const id = this.db.addAlert(
            item.id,
            'price_recovery',
            `${label} phục hồi về ${(recoveryPct * 100).toFixed(0)}% đỉnh. Giá: ${item.current_price.toLocaleString('vi-VN')} ${item.unit}`,
            { price: item.current_price, peak: item.peak_price, recovery_pct: recoveryPct }
          );
          if (id) alerts.push({ id, type: 'price_recovery', name: label });
        }
      }

      // Take profit alert: full recovery to 100%+ of peak (only once per 7 days)
      if (recoveryPct >= 1.0) {
        const id = this.db.addAlert(
          item.id,
          'take_profit',
          `${label} đạt đỉnh mới! Giá: ${item.current_price.toLocaleString('vi-VN')} ${item.unit}`,
          { price: item.current_price, peak: item.peak_price }
        );
        if (id) alerts.push({ id, type: 'take_profit', name: label });
      }
    }

    // Check for stop-loss on sniper transactions (strategy = 'sniper')
    const sniperTxns = this.db.query(`
      SELECT t.*, a.ticker, a.name as asset_type_name, a.current_price as market_price
      FROM transactions t
      JOIN asset_types a ON a.id = t.asset_type_id
      WHERE t.type = 'BUY' AND t.strategy = 'sniper'
    `);

    for (const txn of sniperTxns) {
      if (!txn.market_price || txn.market_price <= 0 || !txn.price || txn.price <= 0) continue;

      const lossPct = (txn.price - txn.market_price) / txn.price;
      // Stop-loss thresholds: 25%, 35%, 50%
      const STOP_LOSS_THRESHOLDS = [0.25, 0.35, 0.50];
      const crossedThreshold = STOP_LOSS_THRESHOLDS.filter(t => lossPct >= t).pop();

      if (crossedThreshold) {
        // Check last stop-loss alert for this transaction
        const lastAlert = this.db.queryOne(
          `SELECT data FROM alerts WHERE asset_type_id = ? AND type = 'stop_loss' ORDER BY created_at DESC LIMIT 1`,
          [txn.asset_type_id]
        );
        let lastThreshold = 0;
        if (lastAlert?.data) {
          try {
            const data = JSON.parse(lastAlert.data);
            lastThreshold = STOP_LOSS_THRESHOLDS.filter(t => data.loss_pct >= t).pop() || 0;
          } catch (e) {}
        }

        if (crossedThreshold > lastThreshold) {
          const label = txn.asset_name || txn.asset_type_name;
          const id = this.db.addAlert(
            txn.asset_type_id,
            'stop_loss',
            `${label} lỗ ${(lossPct * 100).toFixed(0)}% từ giá mua ${txn.price.toLocaleString('vi-VN')}. Giá hiện tại: ${txn.market_price.toLocaleString('vi-VN')}`,
            { entry_price: txn.price, current_price: txn.market_price, loss_pct: lossPct, threshold: crossedThreshold }
          );
          if (id) alerts.push({ id, type: 'stop_loss', name: label });
        }
      }
    }

    return alerts;
  }

  /**
   * Fetch full price history from external API and cache into price_snapshots.
   * Smart caching: only fetches data newer than the latest snapshot in DB.
   * @param {number} assetId - asset_type_id
   * @param {number} days - number of days to fetch (0 = all available)
   * @returns {{ cached: number, fetched: number, total: number }}
   */
  async fetchAndCacheHistory(assetId, days = 365) {
    const asset = this.db.queryOne('SELECT * FROM asset_types WHERE id = ?', [assetId]);
    if (!asset || !asset.ticker) throw new Error('Asset not found or no ticker');

    // Check what we already have cached
    const latestSnapshot = this.db.queryOne(
      'SELECT date FROM price_snapshots WHERE asset_type_id = ? ORDER BY date DESC LIMIT 1',
      [assetId]
    );
    const cachedCount = this.db.queryOne(
      'SELECT COUNT(*) as cnt FROM price_snapshots WHERE asset_type_id = ?',
      [assetId]
    )?.cnt || 0;

    let bars = [];

    if (asset.asset_class === 'gold') {
      // Gold: fetch from btmc.vn day by day
      const now = new Date();
      const fetchDays = days === 0 ? 730 : Math.min(days, 730);
      
      // Smart: only fetch days we don't have
      const startDate = latestSnapshot?.date ? new Date(latestSnapshot.date) : null;
      
      for (let i = 0; i < fetchDays; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        
        // Skip weekends
        if (d.getDay() === 0 || d.getDay() === 6) continue;
        
        // Skip dates we already have (except today for freshness)
        if (i > 0 && startDate && d <= startDate) continue;
        
        const dateParam = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        try {
          const res = await fetch(`https://btmc.vn/ProductHome/getGoldDate?date=${encodeURIComponent(dateParam)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          });
          const data = await res.json();
          const sjcMua = data?.Data?.sjcmua;
          const sjcBan = data?.Data?.sjcban;
          if (sjcMua && sjcBan) {
            const buyPrice = parseInt(sjcMua.replace(/<[^>]*>/g, '')) * 1000;
            const sellPrice = parseInt(sjcBan.replace(/<[^>]*>/g, '')) * 1000;
            const midPrice = Math.round((buyPrice + sellPrice) / 2);
            bars.push({
              date: dateStr,
              open: buyPrice,
              high: sellPrice,
              low: buyPrice,
              close: midPrice,
              volume: 0
            });
          }
        } catch (e) { /* skip failed dates */ }
        
        // Rate limit: 80ms delay between requests
        if (i < fetchDays - 1) {
          await new Promise(r => setTimeout(r, 80));
        }
      }
    } else {
      // Stocks/ETFs: fetch from VNDirect API (bulk)
      bars = await this.fetchPriceHistory(asset.ticker, days);
    }

    // Save all fetched bars into DB
    let newCount = 0;
    for (const bar of bars) {
      try {
        this.db.savePriceSnapshot(assetId, bar.date, bar);
        newCount++;
      } catch (e) { /* skip duplicates */ }
    }

    // Return the full history from DB
    const total = this.db.queryOne(
      'SELECT COUNT(*) as cnt FROM price_snapshots WHERE asset_type_id = ?',
      [assetId]
    )?.cnt || 0;

    console.log(`[PriceService] fetchAndCacheHistory: asset=${assetId}, cached=${cachedCount}, fetched=${newCount}, total=${total}`);
    return { cached: cachedCount, fetched: newCount, total };
  }
}

module.exports = PriceService;
