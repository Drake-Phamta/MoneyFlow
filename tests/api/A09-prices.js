/**
 * A09 — Lịch sử giá và đồng bộ giá.
 *
 * Nhóm này GHI dữ liệu dù trông như chỉ đọc: cả price-history/fetch lẫn
 * prices/refresh đều ghi price_snapshots, sửa peak_price và sinh cảnh báo.
 * Vì vậy nó chạy CUỐI trong danh sách và kết thúc bằng một lần reset.
 * Server test đã chặn gọi ra VNDIRECT nên kết quả tất định và không cần mạng.
 */
const { group, t } = require('../rig/assert');
const H = require('./_helpers');

async function run() {
  group('A09 — Giá & lịch sử giá');
  await H.fresh();

  await t(
    'API-PRC-01',
    'GET /api/price-history/:assetId trả chuỗi giá, mới nhất trước',
    ['rest:GET /api/price-history/:assetId', 'ipc:priceHistory:get', 'bridge:priceHistory.get', 'client:priceHistory.get'],
    async () => {
      const withHistory = (await H.getOk('/api/catalog')).filter((a) => a.ticker === 'E1VFVN30');
      H.ok(withHistory.length, 'fixture phải có E1VFVN30');
      const rows = await H.getOk(`/api/price-history/${withHistory[0].id}?days=365`);
      H.ok(Array.isArray(rows), 'phải trả về mảng');
      if (rows.length) {
        H.expectShape(rows, ['date', 'close'], 'GET /api/price-history/:assetId');
        // Hợp đồng là MỚI NHẤT TRƯỚC: cả AssetDetailModal lẫn NetWorthModal
        // đều gọi [...data].reverse() trước khi vẽ.
        for (let i = 1; i < rows.length; i++) {
          H.ok(rows[i - 1].date >= rows[i].date, `dòng ${i} có ngày mới hơn dòng trước — chuỗi phải xếp mới nhất trước`);
        }
      }
    }
  );

  await t(
    'API-PRC-02',
    'POST /api/price-history/:assetId/fetch trả về chuỗi giá, không cần mạng',
    ['rest:POST /api/price-history/:assetId/fetch', 'ipc:priceHistory:fetch', 'bridge:priceHistory.fetch', 'client:priceHistory.fetch'],
    async () => {
      const asset = (await H.getOk('/api/catalog')).find((a) => a.ticker === 'E1VFVN30');
      const r = await H.post(`/api/price-history/${asset.id}/fetch?days=365`);
      H.expectStatus(r, [200], 'POST price-history fetch');
      H.ok(Array.isArray(r.data), `phải trả mảng, nhận ${typeof r.data}`);
    }
  );

  await t(
    'API-PRC-03',
    'POST /api/prices/refresh trả về thống kê và không làm hỏng dữ liệu giá',
    ['rest:POST /api/prices/refresh', 'ipc:prices:refresh', 'bridge:prices.refresh', 'client:prices.refresh'],
    async () => {
      await H.fresh();
      const before = await H.getOk('/api/catalog');
      const r = await H.post('/api/prices/refresh');
      H.expectStatus(r, [200], 'POST /api/prices/refresh');
      const res = r.data;
      H.ok(res && typeof res === 'object', `phải trả object thống kê, nhận ${JSON.stringify(res).slice(0, 80)}`);
      for (const k of ['total', 'success']) H.ok(k in res, `kết quả thiếu khoá ${k}`);

      const after = await H.getOk('/api/catalog');
      H.eq(after.length, before.length, 'đồng bộ giá không được làm mất tài sản nào');
      for (const a of after) {
        const b = before.find((x) => x.id === a.id);
        if (b) H.ok(a.peak_price >= b.peak_price, `${a.ticker}: đỉnh bị hạ sau khi đồng bộ`);
      }
      await H.fresh();
    }
  );
}

module.exports = { run };
