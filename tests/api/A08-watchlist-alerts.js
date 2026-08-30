/**
 * A08 — Danh sách theo dõi và cảnh báo giá.
 */
const { group, t } = require('../rig/assert');
const H = require('./_helpers');

async function run() {
  group('A08 — Theo dõi & cảnh báo');
  await H.fresh();

  await t(
    'API-WL-01',
    'GET /api/watchlist chỉ trả tài sản đang bật theo dõi',
    ['rest:GET /api/watchlist', 'ipc:watchlist:get', 'bridge:watchlist.get', 'client:watchlist.get'],
    async () => {
      const wl = await H.getOk('/api/watchlist');
      H.ok(Array.isArray(wl), 'phải trả về mảng');
      if (wl.length) H.expectShape(wl, ['id', 'name', 'ticker', 'current_price', 'peak_price'], 'GET /api/watchlist');
      const assets = await H.getOk('/api/catalog');
      for (const w of wl) {
        const a = assets.find((x) => x.id === w.id);
        if (a) H.eq(a.is_tracked, 1, `${w.ticker} có trong watchlist nhưng is_tracked = ${a.is_tracked}`);
      }
    }
  );

  await t(
    'API-WL-02',
    'Vòng đời watchlist: thêm → sửa → gỡ',
    [
      'rest:POST /api/watchlist', 'rest:PUT /api/watchlist/:id', 'rest:DELETE /api/watchlist/:id',
      'ipc:watchlist:add', 'ipc:watchlist:update', 'ipc:watchlist:remove',
      'bridge:watchlist.add', 'bridge:watchlist.update', 'bridge:watchlist.remove',
      'client:watchlist.add', 'client:watchlist.update', 'client:watchlist.remove',
    ],
    async () => {
      await H.fresh();
      const created = H.expectOk(
        await H.post('/api/watchlist', { name: 'Mã kiểm thử', ticker: 'ZZWL', current_price: 10000, peak_price: 12000 }),
        'POST /api/watchlist'
      );
      const id = typeof created === 'object' ? created.id ?? created : created;
      H.ok(id, `POST /api/watchlist phải trả id, nhận ${JSON.stringify(created)}`);

      H.expectOk(await H.put(`/api/watchlist/${id}`, { current_price: 9000 }), 'PUT /api/watchlist/:id');
      H.expectOk(await H.del(`/api/watchlist/${id}`), 'DELETE /api/watchlist/:id');
      await H.fresh();
    }
  );

  await t(
    'API-ALR-01',
    'GET /api/alerts và /api/alerts/count nhất quán với nhau',
    [
      'rest:GET /api/alerts', 'rest:GET /api/alerts/count',
      'ipc:alerts:get', 'ipc:alerts:count', 'bridge:alerts.get', 'bridge:alerts.count',
      'client:alerts.get', 'client:alerts.count',
    ],
    async () => {
      const all = await H.getOk('/api/alerts');
      H.ok(Array.isArray(all), 'phải trả về mảng');
      if (all.length) H.expectShape(all, ['id', 'asset_type_id', 'type', 'message', 'read'], 'GET /api/alerts');
      const count = await H.getOk('/api/alerts/count');
      const n = typeof count === 'object' ? count.count : count;
      const unread = all.filter((a) => !a.read).length;
      H.eq(n, unread, 'số chưa đọc theo /count so với đếm tay trên /alerts');
    }
  );

  await t(
    'API-ALR-02',
    'Đánh dấu đã đọc một cảnh báo làm số chưa đọc giảm đúng một',
    ['rest:PUT /api/alerts/:id/read', 'ipc:alerts:markRead', 'bridge:alerts.markRead', 'client:alerts.markRead'],
    async () => {
      await H.fresh();
      const all = await H.getOk('/api/alerts');
      const unread = all.filter((a) => !a.read);
      if (!unread.length) return; // fixture không có cảnh báo chưa đọc
      const before = (await H.getOk('/api/alerts/count')).count;

      H.expectOk(await H.put(`/api/alerts/${unread[0].id}/read`), 'PUT /api/alerts/:id/read');
      const after = (await H.getOk('/api/alerts/count')).count;
      H.eq(after, before - 1, 'số chưa đọc sau khi đánh dấu một cảnh báo');
      await H.fresh();
    }
  );

  await t(
    'API-ALR-03',
    'Đánh dấu đã đọc tất cả đưa số chưa đọc về 0',
    ['rest:PUT /api/alerts/read-all', 'ipc:alerts:markAllRead', 'bridge:alerts.markAllRead', 'client:alerts.markAllRead'],
    async () => {
      await H.fresh();
      H.expectOk(await H.put('/api/alerts/read-all'), 'PUT /api/alerts/read-all');
      const count = await H.getOk('/api/alerts/count');
      H.eq(typeof count === 'object' ? count.count : count, 0, 'số chưa đọc sau khi đọc tất cả');
      await H.fresh();
    }
  );
}

module.exports = { run };
