/**
 * J02 — Ảnh chụp danh mục theo tháng.
 *
 * Bảng portfolio_snapshots có từ đầu nhưng chưa ai ghi vào, nên app không có
 * cách nào biết tài sản đã đi qua những mốc nào. Bộ này khẳng định việc lưu
 * một tháng có ghi lại ảnh chụp, và ghi lại đúng một lần.
 */
const { group, t, ok, eq, approx, fmt } = require('../rig/assert');
const { reset } = require('../rig/reset');
const { getOk, post } = require('../rig/http');

const TOL = 1;

async function run() {
  group('J02 — Lịch sử danh mục');
  await reset();

  await t(
    'C33p',
    'Lưu một tháng thì chụp lại danh mục tại thời điểm đó',
    [
      'rest:GET /api/portfolio/history',
      'ipc:portfolio:history',
      'bridge:portfolio.history',
      'client:portfolio.history',
    ],
    async () => {
      const filled = await getOk('/api/monthly/filled');
      ok(filled.length > 0, 'fixture cần ít nhất một tháng đã ghi');
      const target = filled[filled.length - 1];

      await post('/api/monthly', {
        month_index: target.month_index,
        month_label: target.month_label,
        income: target.income,
        expense: target.expense,
        bonus: target.bonus,
        note: target.note,
        status: 'confirmed',
      });

      const history = await getOk('/api/portfolio/history');
      const row = history.find((h) => h.month_index === target.month_index);
      ok(
        row,
        'lưu ' + target.month_label + ' xong mà không có ảnh chụp danh mục nào cho tháng đó'
      );

      const summary = await getOk('/api/portfolio/summary');
      approx(
        row.market_value,
        summary.totalCurrentValue || 0,
        TOL,
        'ảnh chụp ghi ' + fmt(row.market_value) + ' trong khi danh mục đang là ' +
          fmt(summary.totalCurrentValue)
      );
    }
  );

  await t(
    'C34p',
    'Lưu lại cùng một tháng không nhân đôi số dòng',
    ['rest:POST /api/monthly'],
    async () => {
      // Bảng không có ràng buộc UNIQUE, nên nếu dùng INSERT OR REPLACE thay vì
      // xoá trước thì sửa lại một tháng là số dòng tăng gấp đôi mỗi lần.
      const filled = await getOk('/api/monthly/filled');
      const target = filled[filled.length - 1];
      const body = {
        month_index: target.month_index,
        month_label: target.month_label,
        income: target.income,
        expense: target.expense,
        bonus: target.bonus,
        status: 'confirmed',
      };

      await post('/api/monthly', body);
      const first = (await getOk('/api/portfolio/history')).find(
        (h) => h.month_index === target.month_index
      );
      await post('/api/monthly', body);
      await post('/api/monthly', body);
      const after = (await getOk('/api/portfolio/history')).find(
        (h) => h.month_index === target.month_index
      );

      eq(after.assets, first.assets, 'số tài sản trong ảnh chụp sau ba lần lưu');
      approx(after.market_value, first.market_value, TOL, 'giá trị danh mục trong ảnh chụp');
      await reset();
    }
  );

  await t(
    'C35p',
    'Không bịa ảnh chụp cho những tháng chưa từng lưu lại',
    ['rest:GET /api/portfolio/history'],
    async () => {
      await reset();
      const history = await getOk('/api/portfolio/history');
      const filled = await getOk('/api/monthly/filled');
      const filledIdx = new Set(filled.map((f) => f.month_index));

      for (const h of history) {
        ok(
          filledIdx.has(h.month_index),
          'có ảnh chụp cho tháng ' + h.month_index + ' nhưng tháng đó chưa được ghi'
        );
      }
      // Giá đóng cửa của những tháng đã qua không lấy lại được, nên không bù
      // ngược. Lịch sử rỗng trên dữ liệu cũ là đúng, không phải lỗi.
      ok(Array.isArray(history), 'lịch sử phải là mảng, kể cả khi rỗng');
    }
  );
}

module.exports = { run };
