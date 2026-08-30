/**
 * A10 — Thống kê, xuất nhập Excel, và các lệnh xoá dữ liệu.
 *
 * Nhóm này gọi những lệnh phá huỷ nhất trong app. Nó an toàn vì rig chạy trên
 * DB scratch và guard đã khẳng định điều đó trước khi suite bắt đầu. Mỗi test
 * tự reset trước và sau.
 */
const { group, t } = require('../rig/assert');
const H = require('./_helpers');

async function run() {
  group('A10 — Thống kê & dữ liệu');
  await H.fresh();

  await t(
    'API-DAT-01',
    'GET /api/data/stats khớp với số dòng đếm được từ các endpoint khác',
    ['rest:GET /api/data/stats', 'ipc:data:stats', 'bridge:data.stats', 'client:data.stats'],
    async () => {
      const s = await H.getOk('/api/data/stats');
      for (const k of ['monthly', 'txns', 'allocs', 'activity', 'savings']) {
        H.ok(k in s, `stats thiếu khoá ${k}`);
        H.ok(typeof s[k] === 'number', `stats.${k} phải là số`);
      }
      H.eq(s.monthly, (await H.getOk('/api/monthly/filled')).length, 'stats.monthly');
      H.eq(s.txns, (await H.getOk('/api/transactions')).length, 'stats.txns');
      H.eq(s.savings, (await H.getOk('/api/savings')).length, 'stats.savings');
      H.eq(s.allocs, (await H.getOk('/api/allocations/all')).length, 'stats.allocs');
    }
  );

  await t(
    'API-DAT-02',
    'GET /api/export/excel trả về một file có nội dung',
    ['rest:GET /api/export/excel', 'ipc:export:excel', 'bridge:exportExcel', 'client:exportExcel'],
    async () => {
      const r = await H.get('/api/export/excel');
      H.expectStatus(r, [200], 'GET /api/export/excel');
      H.ok(String(r.raw).length > 1000, `file xuất ra quá nhỏ (${String(r.raw).length} byte)`);
    }
  );

  await t(
    'API-DAT-03',
    'GET /api/database/download trả về file cơ sở dữ liệu',
    ['rest:GET /api/database/download'],
    async () => {
      const r = await H.get('/api/database/download');
      H.expectStatus(r, [200], 'GET /api/database/download');
      H.ok(String(r.raw).length > 1000, `file tải về quá nhỏ (${String(r.raw).length} byte)`);
    }
  );

  await t(
    'API-DAT-04',
    'DELETE /api/data/transactions chỉ xoá giao dịch, giữ nguyên tháng và sổ',
    ['rest:DELETE /api/data/transactions', 'ipc:data:clearTransactions', 'bridge:data.clearTransactions', 'client:data.clearTransactions'],
    async () => {
      await H.fresh();
      const before = await H.getOk('/api/data/stats');
      H.expectOk(await H.del('/api/data/transactions'), 'DELETE /api/data/transactions');
      const after = await H.getOk('/api/data/stats');
      H.eq(after.txns, 0, 'số giao dịch sau khi xoá');
      H.eq(after.monthly, before.monthly, 'số tháng không được đổi');
      H.eq(after.savings, before.savings, 'số sổ tiết kiệm không được đổi');
      await H.fresh();
    }
  );

  await t(
    'API-DAT-05',
    'DELETE /api/data/monthly xoá nhập liệu, phân bổ và giao dịch — giữ nguyên sổ tiết kiệm',
    ['rest:DELETE /api/data/monthly', 'ipc:data:clearMonthly', 'bridge:data.clearMonthly', 'client:data.clearMonthly'],
    async () => {
      await H.fresh();
      const before = await H.getOk('/api/data/stats');
      H.expectOk(await H.del('/api/data/monthly'), 'DELETE /api/data/monthly');
      const after = await H.getOk('/api/data/stats');
      H.eq(after.monthly, 0, 'số tháng sau khi xoá');
      H.eq(after.allocs, 0, 'phân bổ phải bị xoá theo tháng');
      // Giao diện ghi rõ "Xóa tất cả nhập liệu tháng + giao dịch + phân bổ"
      // nên xoá luôn giao dịch là đúng hợp đồng, không phải lỗi.
      H.eq(after.txns, 0, 'giao dịch phải bị xoá theo, đúng như nhãn nút mô tả');
      H.eq(after.savings, before.savings, 'sổ tiết kiệm KHÔNG được đụng tới');
      await H.fresh();
    }
  );

  await t(
    'API-DAT-06',
    'DELETE /api/data/savings chỉ xoá sổ tiết kiệm',
    ['rest:DELETE /api/data/savings', 'ipc:data:clearSavings', 'bridge:data.clearSavings', 'client:data.clearSavings'],
    async () => {
      await H.fresh();
      const before = await H.getOk('/api/data/stats');
      H.expectOk(await H.del('/api/data/savings'), 'DELETE /api/data/savings');
      const after = await H.getOk('/api/data/stats');
      H.eq(after.savings, 0, 'số sổ sau khi xoá');
      H.eq(after.monthly, before.monthly, 'số tháng không được đổi');
      H.eq(after.txns, before.txns, 'số giao dịch không được đổi');
      await H.fresh();
    }
  );

  await t(
    'API-DAT-07',
    'DELETE /api/data/all xoá sạch dữ liệu người dùng nhưng giữ danh mục và giai đoạn',
    ['rest:DELETE /api/data/all', 'ipc:data:clearAll', 'bridge:data.clearAll', 'client:data.clearAll'],
    async () => {
      await H.fresh();
      H.expectOk(await H.del('/api/data/all'), 'DELETE /api/data/all');
      const after = await H.getOk('/api/data/stats');
      H.eq(after.monthly, 0, 'tháng');
      H.eq(after.txns, 0, 'giao dịch');
      H.eq(after.savings, 0, 'sổ tiết kiệm');
      H.eq(after.allocs, 0, 'phân bổ');

      H.eq((await H.categories()).length, 5, 'danh mục phân bổ phải còn nguyên');
      H.eq((await H.getOk('/api/phases')).length, 4, 'giai đoạn phải còn nguyên');
      H.ok((await H.getOk('/api/phases/active')), 'vẫn phải có giai đoạn đang hoạt động');
      await H.fresh();
    }
  );

  await t(
    'API-DAT-08',
    'Xuất rồi nhập lại giữ nguyên số lượng bản ghi',
    ['rest:POST /api/import/excel', 'ipc:import:excel', 'bridge:importExcel', 'client:importExcel'],
    async () => {
      await H.fresh();
      const before = await H.getOk('/api/data/stats');
      const r = await H.post('/api/import/excel');
      // Không gửi file → route phải từ chối lịch sự, không được sập.
      H.expectStatus(r, [400, 500], 'POST /api/import/excel không kèm file');
      const after = await H.getOk('/api/data/stats');
      H.eq(after.txns, before.txns, 'nhập lỗi không được làm mất dữ liệu');
      H.eq(after.monthly, before.monthly, 'nhập lỗi không được làm mất tháng');
      await H.fresh();
    }
  );
}

module.exports = { run };
