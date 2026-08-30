/**
 * A02 — Tài sản, danh mục tra cứu, theo dõi giá.
 */
const { group, t } = require('../rig/assert');
const H = require('./_helpers');

async function run() {
  group('A02 — Tài sản & danh mục tra cứu');
  await H.fresh();

  await t(
    'API-AST-01',
    'GET /api/assets chỉ trả tài sản đang bật, có đủ trường giao diện cần',
    ['rest:GET /api/assets', 'ipc:assets:get', 'bridge:assets.get', 'client:assets.get'],
    async () => {
      const rows = await H.getOk('/api/assets');
      H.expectShape(rows, ['id', 'name', 'category', 'asset_class', 'unit', 'color', 'icon'], 'GET /api/assets');
      H.ok(rows.length > 0, 'không có tài sản nào — fixture hỏng?');
      const off = rows.filter((a) => a.active === 0);
      H.ok(off.length === 0, `${off.length} tài sản đã tắt vẫn được trả về`);
    }
  );

  await t(
    'API-AST-02',
    'GET /api/categories trả đúng 5 danh mục phân bổ, có màu và icon',
    ['rest:GET /api/categories', 'ipc:categories:get', 'bridge:categories.get', 'client:categories.get'],
    async () => {
      const cats = await H.getOk('/api/categories');
      H.expectShape(cats, ['id', 'name', 'color', 'icon', 'sort_order'], 'GET /api/categories');
      H.eq(cats.length, 5, 'số danh mục phân bổ');
      const names = cats.map((c) => c.name);
      for (const need of ['Dự Phòng', 'Chứng Khoán', 'Vàng', 'Bắn Tỉa', 'Tiết kiệm & Trái phiếu']) {
        H.ok(names.includes(need), `thiếu danh mục "${need}". Có: ${names.join(' | ')}`);
      }
    }
  );

  await t(
    'API-AST-03',
    'GET /api/catalog lọc được theo lớp tài sản và theo từ khoá',
    ['rest:GET /api/catalog', 'ipc:catalog:get', 'bridge:catalog.get', 'client:catalog.get'],
    async () => {
      const all = await H.getOk('/api/catalog');
      H.ok(all.length > 0, 'catalog rỗng');
      H.ok(all.every((a) => a.ticker), 'catalog chỉ được chứa tài sản có mã');

      const stocks = await H.getOk('/api/catalog?class=stock');
      H.ok(stocks.length > 0, 'không có cổ phiếu nào');
      const wrong = stocks.filter((a) => a.asset_class !== 'stock');
      H.ok(wrong.length === 0, `${wrong.length} bản ghi sai lớp tài sản`);

      const found = await H.getOk('/api/catalog?search=FPT');
      H.ok(
        found.some((a) => a.ticker === 'FPT'),
        `tìm "FPT" không ra. Nhận: ${found.map((a) => a.ticker).join(', ')}`
      );
    }
  );

  await t(
    'API-AST-04',
    'Vòng đời tài sản: thêm → sửa → xoá',
    [
      'rest:POST /api/assets', 'rest:PUT /api/assets/:id', 'rest:DELETE /api/assets/:id',
      'ipc:assets:add', 'ipc:assets:update', 'ipc:assets:delete',
      'bridge:assets.add', 'bridge:assets.update', 'bridge:assets.delete',
      'client:assets.add', 'client:assets.update', 'client:assets.delete',
    ],
    async () => {
      const created = H.expectOk(
        await H.post('/api/assets', {
          name: 'Tài sản kiểm thử',
          category: 'Giao dịch',
          ticker: 'ZZTEST',
          unit: 'CP',
          asset_class: 'stock',
        }),
        'POST /api/assets'
      );
      const id = typeof created === 'object' ? created.id ?? created : created;
      H.ok(id, `POST /api/assets phải trả về id, nhận ${JSON.stringify(created)}`);

      H.expectOk(await H.put(`/api/assets/${id}`, { name: 'Đã đổi tên' }), 'PUT /api/assets/:id');
      const after = (await H.getOk('/api/assets')).find((a) => a.id === id);
      H.ok(after, 'không tìm lại được tài sản vừa tạo');
      H.eq(after.name, 'Đã đổi tên', 'tên sau khi sửa');

      H.expectOk(await H.del(`/api/assets/${id}`), 'DELETE /api/assets/:id');
      const gone = (await H.getOk('/api/assets')).find((a) => a.id === id);
      H.ok(!gone, 'tài sản vẫn còn sau khi xoá');
    }
  );

  await t(
    'API-AST-05',
    'PUT /api/assets/:id/price ghi giá và không bao giờ hạ đỉnh đã lập',
    ['rest:PUT /api/assets/:id/price', 'ipc:assets:updatePrice', 'bridge:assets.updatePrice', 'client:assets.updatePrice'],
    async () => {
      const asset = await H.anyStock();
      H.expectOk(await H.put(`/api/assets/${asset.id}/price`, { price: 99000 }), 'PUT giá lần 1');
      let row = (await H.getOk('/api/catalog')).find((a) => a.id === asset.id);
      H.eq(row.current_price, 99000, 'giá hiện tại sau lần ghi 1');
      const peak = row.peak_price;

      H.expectOk(await H.put(`/api/assets/${asset.id}/price`, { price: 50000 }), 'PUT giá lần 2');
      row = (await H.getOk('/api/catalog')).find((a) => a.id === asset.id);
      H.eq(row.current_price, 50000, 'giá hiện tại sau lần ghi 2');
      H.ok(
        row.peak_price >= peak,
        `đỉnh bị hạ từ ${H.fmt(peak)} xuống ${H.fmt(row.peak_price)} — mọi phép tính mức giảm từ đỉnh sẽ sai theo`
      );
      await H.fresh();
    }
  );

  await t(
    'API-AST-06',
    'PUT /api/assets/:id/tracked bật tắt được và phản ánh vào watchlist',
    ['rest:PUT /api/assets/:id/tracked', 'ipc:assets:setTracked', 'bridge:assets.setTracked', 'client:assets.setTracked'],
    async () => {
      const asset = await H.anyStock();
      H.expectOk(await H.put(`/api/assets/${asset.id}/tracked`, { tracked: true }), 'bật theo dõi');
      let wl = await H.getOk('/api/watchlist');
      H.ok(wl.some((w) => w.id === asset.id), `${asset.ticker} không xuất hiện trong watchlist sau khi bật`);

      H.expectOk(await H.put(`/api/assets/${asset.id}/tracked`, { tracked: false }), 'tắt theo dõi');
      wl = await H.getOk('/api/watchlist');
      H.ok(!wl.some((w) => w.id === asset.id), `${asset.ticker} vẫn còn trong watchlist sau khi tắt`);
      await H.fresh();
    }
  );
}

module.exports = { run };
