/**
 * A06 — Giao dịch và danh mục nắm giữ.
 */
const { group, t } = require('../rig/assert');
const H = require('./_helpers');

async function run() {
  group('A06 — Giao dịch & danh mục');
  await H.fresh();

  await t(
    'API-TXN-01',
    'GET /api/transactions trả kèm tên hiển thị và thông tin tài sản',
    ['rest:GET /api/transactions', 'ipc:transactions:get', 'bridge:transactions.get', 'client:transactions.get'],
    async () => {
      const rows = await H.getOk('/api/transactions');
      H.expectShape(rows, ['id', 'date', 'asset_type_id', 'type', 'quantity', 'price', 'total_amount', 'display_name'], 'GET /api/transactions');
      const bad = rows.filter((r) => r.type !== 'BUY' && r.type !== 'SELL');
      H.ok(bad.length === 0, `${bad.length} giao dịch có loại khác BUY/SELL`);
    }
  );

  await t(
    'API-TXN-02',
    'Thêm giao dịch mua làm tăng số lượng nắm giữ đúng bằng lượng mua',
    ['rest:POST /api/transactions', 'ipc:transactions:add', 'bridge:transactions.add', 'client:transactions.add'],
    async () => {
      await H.fresh();
      const asset = await H.anyStock();
      const qtyBefore =
        (await H.getOk('/api/portfolio')).find((p) => p.asset_type_id === asset.id)?.total_quantity || 0;

      await H.createTxn({ assetId: asset.id, quantity: 40, price: 30000 });

      const qtyAfter =
        (await H.getOk('/api/portfolio')).find((p) => p.asset_type_id === asset.id)?.total_quantity || 0;
      H.eq(qtyAfter - qtyBefore, 40, 'lượng nắm giữ tăng thêm');
      await H.fresh();
    }
  );

  await t(
    'API-TXN-03',
    'Bán hết thì tài sản biến khỏi danh mục nắm giữ',
    ['rest:POST /api/transactions', 'rest:GET /api/portfolio'],
    async () => {
      await H.fresh();
      const asset = await H.anyAsset('etf');
      await H.createTxn({ assetId: asset.id, type: 'BUY', quantity: 100, price: 20000 });
      let held = (await H.getOk('/api/portfolio')).find((p) => p.asset_type_id === asset.id);
      H.ok(held, 'mua xong phải thấy trong danh mục');

      await H.createTxn({ assetId: asset.id, type: 'SELL', quantity: held.total_quantity, price: 21000 });
      held = (await H.getOk('/api/portfolio')).find((p) => p.asset_type_id === asset.id);
      H.ok(!held, 'bán hết rồi mà vẫn còn trong danh mục');
      await H.fresh();
    }
  );

  await t(
    'API-TXN-04',
    'DELETE /api/transactions/:id gỡ giao dịch và hoàn lại lượng nắm giữ',
    ['rest:DELETE /api/transactions/:id', 'ipc:transactions:delete', 'bridge:transactions.delete', 'client:transactions.delete'],
    async () => {
      await H.fresh();
      const asset = await H.anyStock();
      const before = (await H.getOk('/api/portfolio')).find((p) => p.asset_type_id === asset.id)?.total_quantity || 0;
      await H.createTxn({ assetId: asset.id, quantity: 25, price: 40000 });
      const txns = await H.getOk('/api/transactions');
      const created = txns.find((x) => x.asset_type_id === asset.id && x.quantity === 25);
      H.ok(created, 'không tìm lại được giao dịch vừa tạo');

      H.expectOk(await H.del(`/api/transactions/${created.id}`), 'DELETE /api/transactions/:id');
      const after = (await H.getOk('/api/portfolio')).find((p) => p.asset_type_id === asset.id)?.total_quantity || 0;
      H.eq(after, before, 'lượng nắm giữ sau khi xoá giao dịch');
      await H.fresh();
    }
  );

  await t(
    'API-PF-01',
    'GET /api/portfolio: giá vốn và giá trị thị trường nhất quán với nhau',
    ['rest:GET /api/portfolio', 'ipc:portfolio:get', 'bridge:portfolio.get', 'client:portfolio.get'],
    async () => {
      const rows = await H.getOk('/api/portfolio');
      H.expectShape(rows, ['asset_type_id', 'name', 'total_quantity', 'total_invested', 'avg_cost', 'current_value'], 'GET /api/portfolio');
      for (const p of rows) {
        H.ok(p.total_quantity > 0, `${p.name} có mặt trong danh mục nhưng số lượng ${p.total_quantity}`);
        const expectInvested = p.total_quantity * p.avg_cost;
        H.ok(
          Math.abs(p.total_invested - expectInvested) < 1,
          `${p.name}: total_invested ${H.fmt(p.total_invested)} ≠ số lượng × giá vốn TB ${H.fmt(expectInvested)}`
        );
      }
    }
  );

  await t(
    'API-PF-02',
    'GET /api/portfolio/summary: tổng khớp với từng dòng, lãi = giá trị − vốn',
    ['rest:GET /api/portfolio/summary', 'ipc:portfolio:summary', 'bridge:portfolio.summary', 'client:portfolio.summary'],
    async () => {
      const s = await H.getOk('/api/portfolio/summary');
      for (const k of ['portfolio', 'totalInvested', 'totalCurrentValue', 'totalGain', 'byCategory', 'netCashOutflow']) {
        H.ok(k in s, `summary thiếu khoá ${k}`);
      }
      const sumInvested = s.portfolio.reduce((a, p) => a + p.total_invested, 0);
      const sumValue = s.portfolio.reduce((a, p) => a + p.current_value, 0);
      H.ok(Math.abs(s.totalInvested - sumInvested) < 1, 'totalInvested không khớp tổng các dòng');
      H.ok(Math.abs(s.totalCurrentValue - sumValue) < 1, 'totalCurrentValue không khớp tổng các dòng');
      H.ok(
        Math.abs(s.totalGain - (s.totalCurrentValue - s.totalInvested)) < 1,
        `totalGain ${H.fmt(s.totalGain)} ≠ giá trị − vốn`
      );
    }
  );

  await t(
    'API-ACT-01',
    'GET /api/activity giới hạn đúng số dòng và xếp mới nhất trước',
    ['rest:GET /api/activity', 'ipc:activity:get', 'bridge:activity.get', 'client:activity.get'],
    async () => {
      const rows = await H.getOk('/api/activity?limit=5');
      H.ok(rows.length <= 5, `xin 5 dòng, nhận ${rows.length}`);
      H.expectShape(rows, ['id', 'date', 'type', 'description'], 'GET /api/activity');
      for (let i = 1; i < rows.length; i++) {
        H.ok(rows[i - 1].date >= rows[i].date, `dòng ${i} có ngày mới hơn dòng ${i - 1}`);
      }
    }
  );

  await t(
    'API-ACT-02',
    'DELETE /api/activity/:id xoá đúng một dòng nhật ký',
    ['rest:DELETE /api/activity/:id', 'ipc:activity:delete', 'bridge:activity.delete', 'client:activity.delete'],
    async () => {
      await H.fresh();
      const before = await H.getOk('/api/activity?limit=200');
      H.ok(before.length > 0, 'nhật ký rỗng');
      H.expectOk(await H.del(`/api/activity/${before[0].id}`), 'DELETE /api/activity/:id');
      const after = await H.getOk('/api/activity?limit=200');
      H.eq(after.length, before.length - 1, 'số dòng nhật ký sau khi xoá');
      H.ok(!after.some((a) => a.id === before[0].id), 'dòng đã xoá vẫn còn');
      await H.fresh();
    }
  );
}

module.exports = { run };
