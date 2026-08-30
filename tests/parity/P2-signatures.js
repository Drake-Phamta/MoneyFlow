/**
 * P2 — Lệch HỢP ĐỒNG giữa hai transport.
 *
 * P1 kiểm "hàm có tồn tại ở cả hai bên không". P2 kiểm nặng hơn: cùng một
 * input, hai bên có lưu ra cùng một thứ không.
 *
 * Trường hợp nặng nhất là monthly.save:
 *   REST  routes.js:132-141  tính LẠI total_inflow = max(0, income+bonus-expense)
 *                            rồi trả về entity đã lưu
 *   IPC   main.js:117        truyền thẳng data xuống DB, trả về true
 * → cùng một thao tác "lưu tháng", bản web và bản desktop ghi ra số khác nhau.
 */
const fs = require('fs');
const path = require('path');
const { group, t, ok, eq, fail, approx } = require('../rig/assert');
const { post, get } = require('../rig/http');
const { REPO_ROOT } = require('../rig/env');
const { reset } = require('../rig/reset');

const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

async function run() {
  group('P2 — Lệch hợp đồng giữa REST và IPC');

  await t(
    'PAR-SIG-01',
    'Khi client KHÔNG gửi total_inflow, REST tự tính đúng thu + thưởng − chi',
    ['rest:POST /api/monthly'],
    async () => {
      await reset();
      const months = await get('/api/monthly');
      const target = months.data.find((m) => m.total_inflow === 0);
      ok(target, 'cần một tháng còn trống để test');

      const r = await post('/api/monthly', {
        month_index: target.month_index,
        month_label: target.month_label,
        income: 10000000,
        bonus: 5000000,
        expense: 4000000,
      });
      ok(r.status >= 200 && r.status < 300, `POST /api/monthly -> ${r.status}`);

      const saved = await get(`/api/monthly/${target.month_index}`);
      approx(saved.data.total_inflow, 11000000, 1, 'total_inflow phải là 10tr + 5tr - 4tr');
    }
  );

  await t(
    'PAR-SIG-01b',
    'Server không được nhận total_inflow mâu thuẫn với thu/chi/thưởng',
    ['rest:POST /api/monthly'],
    async () => {
      await reset();
      const months = await get('/api/monthly');
      const target = months.data.find((m) => m.total_inflow === 0);
      ok(target, 'cần một tháng còn trống');

      // Client gửi một total_inflow vô lý. routes.js:136 dùng
      // `data.total_inflow != null ? data.total_inflow : calculated`
      // nên nó TIN con số client gửi, chỉ kẹp sàn về 0.
      await post('/api/monthly', {
        month_index: target.month_index,
        month_label: target.month_label,
        income: 10000000,
        bonus: 5000000,
        expense: 4000000,
        total_inflow: -999,
      });
      const saved = await get(`/api/monthly/${target.month_index}`);
      const components =
        (saved.data.income || 0) + (saved.data.bonus || 0) - (saved.data.expense || 0);
      approx(
        saved.data.total_inflow,
        Math.max(0, components),
        1,
        `total_inflow đã lưu (${saved.data.total_inflow}) không khớp thu/chi/thưởng ` +
          `(${saved.data.income} + ${saved.data.bonus} - ${saved.data.expense} = ${components})`
      );
    }
  );

  await t(
    'PAR-SIG-02',
    'Việc chuẩn hoá total_inflow nằm trong DB (dùng chung), không nằm riêng ở route',
    ['rest:POST /api/monthly', 'ipc:monthly:save'],
    () => {
      const routes = read('electron/routes.js');
      const dbsrc = read('electron/database.js');

      // Đoạn chuẩn hoá hiện nằm trong routes.js — nghĩa là IPC không có nó.
      const inRoute =
        /total_inflow[\s\S]{0,200}?Math\.max\(\s*0\s*,/.test(routes) &&
        /income[\s\S]{0,80}?bonus[\s\S]{0,80}?expense/.test(routes);

      // saveMonthlyEntry phải tự chuẩn hoá thì hai transport mới bằng nhau.
      const saveFn = dbsrc.slice(
        dbsrc.indexOf('saveMonthlyEntry(data)'),
        dbsrc.indexOf('// ===== ALLOCATIONS =====')
      );
      const inDb = /Math\.max\(\s*0\s*,/.test(saveFn);

      if (inRoute && !inDb) {
        fail(
          'Chuẩn hoá total_inflow chỉ có ở routes.js (REST), không có trong ' +
            'saveMonthlyEntry() — bản Electron gọi thẳng IPC nên lưu số chưa chuẩn hoá.'
        );
      }
    }
  );

  await t(
    'PAR-SIG-03',
    'Route trả về entity đã lưu để nơi gọi đọc lại được giá trị đã chuẩn hoá',
    ['rest:POST /api/monthly'],
    async () => {
      const months = await get('/api/monthly');
      const target = months.data.find((m) => m.total_inflow === 0);
      ok(target, 'cần một tháng còn trống');
      const r = await post('/api/monthly', {
        month_index: target.month_index,
        month_label: target.month_label,
        income: 8000000,
        bonus: 0,
        expense: 3000000,
      });
      ok(
        r.data && typeof r.data === 'object' && 'total_inflow' in r.data,
        `POST /api/monthly nên trả về entity có total_inflow, nhận: ${JSON.stringify(r.data).slice(0, 120)}`
      );
    }
  );
}

module.exports = { run };
