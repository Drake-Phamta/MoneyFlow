const VNDIRECT_API = 'https://dchart-api.vndirect.com.vn/dchart/history';

class PriceService {
  constructor(db) {
    this.db = db;
  }

  async fetchPrice(symbol) {
    const now = Math.floor(Date.now() / 1000);
    const from = now - 7 * 86400;
    const url = `${VNDIRECT_API}?resolution=D&symbol=${encodeURIComponent(symbol)}&from=${from}&to=${now}`;

    const res = await fetch(url);
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
    const from = now - (days + 10) * 86400;
    const url = `${VNDIRECT_API}?resolution=D&symbol=${encodeURIComponent(symbol)}&from=${from}&to=${now}`;

    const res = await fetch(url);
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
      const res = await fetch('http://banggia.phuquygroup.vn/');
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
        const res = await fetch(`https://btmc.vn/ProductHome/getGoldDate?date=${encodeURIComponent(dateStr)}`);
        const data = await res.json();
        const sjcSell = data?.Data?.sjcban;
        if (sjcSell) {
          const price = parseInt(sjcSell.replace(/<[^>]*>/g, '')) * 1000;
          if (price > peak) peak = price;
        }
      } catch (e) { /* skip */ }
    };

    // Build date list: last 30 days + monthly for 2 years
    const dates = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dates.push(d);
    }
    for (let i = 1; i <= 24; i++) {
      dates.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
    }

    // Fetch sequentially with delay to avoid rate limit
    for (let i = 0; i < dates.length; i++) {
      await fetchDate(dates[i]);
      if (i < dates.length - 1) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    return peak;
  }

  async fetchAllWatchlistPrices() {
    // Fetch prices for ALL assets with a ticker (not just tracked ones)
    const tracked = this.db.query('SELECT * FROM asset_types WHERE ticker IS NOT NULL AND active = 1 ORDER BY sort_order');
    console.log(`[PriceService] Fetching prices for ${tracked.length} assets: ${tracked.map(t => t.ticker).join(', ')}`);
    const results = [];

    for (const item of tracked) {
      if (!item.ticker) continue;
      try {
        let price;

        // Gold (SJC): fetch from btmc.vn
        if (item.asset_class === 'gold' || item.ticker === 'SJC') {
          price = await this.fetchGoldPrice();
        } else {
          // Stocks/ETFs: fetch from VNDIRECT
          price = await this.fetchPrice(item.ticker);
        }

        if (!price) {
          console.log(`[PriceService] No data for ${item.ticker}`);
          results.push({ id: item.id, name: item.name, status: 'no_data' });
          continue;
        }

        console.log(`[PriceService] ${item.ticker}: ${price.close}`);

        let highForPeak = price.high;

        // First time (peak = 0): fetch historical peak
        if (!item.peak_price || item.peak_price === 0) {
          try {
            if (item.asset_class === 'gold') {
              // Gold: fetch 30-day history from btmc.vn API
              const goldPeak = await this.fetchGoldHistoryPeak();
              if (goldPeak > highForPeak) highForPeak = goldPeak;
            } else {
              // Stocks/ETFs: fetch full history from VNDIRECT
              const history = await this.fetchPriceHistory(item.ticker, 3650);
              for (const bar of history) {
                if (bar.high > highForPeak) highForPeak = bar.high;
              }
            }
          } catch (e) { /* fallback to daily high */ }
        }

        // Save snapshot + update price (updateAssetPrice uses MAX(peak, high))
        this.db.savePriceSnapshot(item.id, price.date, price);
        this.db.updateAssetPrice(item.id, price.close, highForPeak);

        results.push({ id: item.id, name: item.name, ticker: item.ticker, price: price.close, status: 'ok' });
      } catch (err) {
        results.push({ id: item.id, name: item.name, ticker: item.ticker, status: 'error', error: err.message });
      }
    }

    return results;
  }

  generateAlerts() {
    const tracked = this.db.query('SELECT * FROM asset_types WHERE ticker IS NOT NULL AND active = 1 ORDER BY sort_order');
    const alerts = [];

    for (const item of tracked) {
      if (!item.current_price || !item.peak_price) continue;

      const dropPct = (item.peak_price - item.current_price) / item.peak_price;
      const recoveryPct = item.current_price / item.peak_price;
      const label = item.ticker ? `${item.ticker} (${item.name})` : item.name;

      // Price drop alert: 15%+ from peak (skip if no current price)
      if (item.current_price > 0 && dropPct >= 0.15) {
        const id = this.db.addAlert(
          item.id,
          'price_drop',
          `${label} giảm ${(dropPct * 100).toFixed(1)}% từ đỉnh. Giá: ${item.current_price.toLocaleString('vi-VN')} ${item.unit}, Đỉnh: ${item.peak_price.toLocaleString('vi-VN')} ${item.unit}`,
          { price: item.current_price, peak: item.peak_price, drop_pct: dropPct }
        );
        if (id) alerts.push({ id, type: 'price_drop', name: label });
      }

      // Recovery alert: back to 90%+ of peak
      if (recoveryPct >= 0.90 && recoveryPct < 1.0) {
        const id = this.db.addAlert(
          item.id,
          'price_recovery',
          `${label} phục hồi về ${(recoveryPct * 100).toFixed(1)}% đỉnh. Giá: ${item.current_price.toLocaleString('vi-VN')} ${item.unit}`,
          { price: item.current_price, peak: item.peak_price, recovery_pct: recoveryPct }
        );
        if (id) alerts.push({ id, type: 'price_recovery', name: label });
      }

      // Take profit alert: full recovery to 100%+ of peak
      if (recoveryPct >= 1.0) {
        const id = this.db.addAlert(
          item.id,
          'take_profit',
          `${label} đã phục hồi hoàn toàn! Giá: ${item.current_price.toLocaleString('vi-VN')} ${item.unit} >= Đỉnh: ${item.peak_price.toLocaleString('vi-VN')} ${item.unit}`,
          { price: item.current_price, peak: item.peak_price }
        );
        if (id) alerts.push({ id, type: 'take_profit', name: label });
      }
    }

    // Check for stop-loss on sniper transactions
    const sniperTxns = this.db.query(`
      SELECT t.*, a.ticker, a.name as asset_type_name, a.current_price as market_price
      FROM transactions t
      JOIN asset_types a ON a.id = t.asset_type_id
      WHERE t.type = 'BUY' AND (t.note LIKE '%Bắn Tỉa%' OR t.note LIKE '%[deploy]%')
    `);

    for (const txn of sniperTxns) {
      if (!txn.market_price || txn.market_price <= 0 || !txn.price || txn.price <= 0) continue;

      const lossPct = (txn.price - txn.market_price) / txn.price;
      if (lossPct >= 0.35) {
        const label = txn.asset_name || txn.asset_type_name;
        const id = this.db.addAlert(
          txn.asset_type_id,
          'stop_loss',
          `${label} lỗ ${(lossPct * 100).toFixed(1)}% từ giá mua ${txn.price.toLocaleString('vi-VN')}. Giá hiện tại: ${txn.market_price.toLocaleString('vi-VN')}`,
          { entry_price: txn.price, current_price: txn.market_price, loss_pct: lossPct }
        );
        if (id) alerts.push({ id, type: 'stop_loss', name: label });
      }
    }

    return alerts;
  }
}

module.exports = PriceService;
