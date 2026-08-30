/**
 * A12 — Lịch sử tài sản ròng.
 *
 * Bản cũ dựng lại lịch sử trong trình duyệt: lấy tổng tài sản HÔM NAY rồi đi
 * ngược thời gian. Hệ quả là mỗi lần đồng bộ giá, cả đường lịch sử dịch theo —
 * quá khứ không đứng yên.
 *
 * Khẳng định quan trọng nhất ở đây: **đồng bộ giá xong, mọi mốc quá khứ giữ
 * nguyên**. Đó là điều một biểu đồ lịch sử phải bảo đảm.
 */
const { group, t } = require('../rig/assert');
const H = require('./_helpers');

const TOL = 1;

async function run() {
  group('A12 — Lịch sử tài sản ròng');
  await H.fresh();

  await t(
    'API-NWH-01',
    'Mỗi mốc có đủ ba thành phần và cộng lại đúng bằng tổng',
    [
      'rest:GET /api/networth/history',
      'ipc:networth:history',
      'bridge:networth.history',
      'client:networth.history',
    ],
    async () => {
      const h = await H.getOk('/api/networth/history');
      H.ok(Array.isArray(h), 'phải trả về một mảng');
      H.ok(h.length > 0, 'fixture có tháng đã ghi mà lịch sử rỗng');

      for (const p of h) {
        for (const k of ['month_label', 'date', 'cash', 'portfolio', 'savings', 'total']) {
          H.ok(k in p, `mốc ${p.month_label}: thiếu trường "${k}"`);
        }
        H.ok(
          Math.abs(p.total - (p.cash + p.portfolio + p.savings)) <= TOL,
          `${p.month_label}: ${H.fmt(p.total)} ≠ ${H.fmt(p.cash)} + ${H.fmt(p.portfolio)} + ${H.fmt(p.savings)}`
        );
        for (const k of ['cash', 'portfolio', 'savings']) {
          H.ok(p[k] >= 0, `${p.month_label}: ${k} âm (${p[k]})`);
        }
      }
    }
  );

  await t(
    'API-NWH-02',
    'Mốc xếp theo thời gian và không mốc nào rơi vào tương lai',
    ['rest:GET /api/networth/history', 'rest:GET /api/monthly/filled'],
    async () => {
      const h = await H.getOk('/api/networth/history');
      const filled = await H.getOk('/api/monthly/filled');

      H.eq(h.length, filled.length, 'số mốc so với số tháng đã ghi');

      let prev = 0;
      for (const p of h) {
        H.ok(
          p.month_index > prev,
          `mốc ${p.month_label} không đứng sau mốc trước (${prev})`
        );
        prev = p.month_index;
      }
    }
  );

  await t(
    'API-NWH-03',
    'Điểm cuối cùng khớp tổng tài sản đang hiển thị trên Tổng quan',
    ['rest:GET /api/networth/history', 'rest:GET /api/snapshot'],
    async () => {
      const h = await H.getOk('/api/networth/history');
      const sn = await H.getOk('/api/snapshot');
      const last = h[h.length - 1];

      // Chênh lệch chỉ được đến từ lãi tích thêm giữa ngày cuối tháng và hôm
      // nay — vài nghìn đồng. Lệch lớn nghĩa là hai bên dùng hai định nghĩa.
      const gap = Math.abs(last.total - sn.netWorth.total);
      H.ok(
        gap < sn.netWorth.total * 0.01,
        `mốc cuối ${H.fmt(last.total)} lệch ${H.fmt(gap)} so với tổng tài sản ` +
          `${H.fmt(sn.netWorth.total)} — hai bên đang dùng hai định nghĩa khác nhau`
      );
    }
  );

  await t(
    'API-NWH-04',
    'Đồng bộ giá xong, mọi mốc quá khứ giữ nguyên',
    ['rest:GET /api/networth/history', 'rest:POST /api/prices/refresh'],
    async () => {
      const before = await H.getOk('/api/networth/history');
      H.ok(before.length >= 2, 'cần ít nhất hai mốc để kiểm');

      await H.post('/api/prices/refresh', {});

      const after = await H.getOk('/api/networth/history');
      H.eq(after.length, before.length, 'số mốc sau khi đồng bộ giá');

      // Mốc cuối được phép đổi — nó là tháng đang chạy. Mọi mốc trước đó phải
      // đứng yên: giá hôm nay không có quyền viết lại quá khứ.
      const moved = [];
      for (let i = 0; i < before.length - 1; i++) {
        if (Math.abs(after[i].total - before[i].total) > TOL) {
          moved.push(
            `${before[i].month_label}: ${H.fmt(before[i].total)} → ${H.fmt(after[i].total)}`
          );
        }
      }
      H.ok(
        moved.length === 0,
        `${moved.length} mốc quá khứ đổi giá trị sau khi đồng bộ giá:\n      ` +
          moved.join('\n      ')
      );
    }
  );

  await t(
    'API-NWH-05',
    'Lãi tiết kiệm ở mốc cũ không mang theo lãi của hôm nay',
    ['rest:GET /api/networth/history', 'rest:GET /api/savings/summary'],
    async () => {
      const h = await H.getOk('/api/networth/history');
      const sum = await H.getOk('/api/savings/summary');
      if (h.length < 2) return;

      // Sổ tiết kiệm chỉ lớn lên theo thời gian trong tệp mẫu, nên mốc đầu
      // phải nhỏ hơn hẳn mốc cuối. Bằng nhau nghĩa là mọi mốc đang dùng số
      // dư của hôm nay.
      const first = h[0].savings;
      const last = h[h.length - 1].savings;
      H.ok(
        first < last,
        `số dư tiết kiệm mốc đầu (${H.fmt(first)}) không nhỏ hơn mốc cuối ` +
          `(${H.fmt(last)}) — nghi mọi mốc đang lấy số dư hôm nay`
      );
      H.ok(
        last <= (sum.totalBalance || 0) * 1.01,
        `mốc cuối ${H.fmt(last)} vượt số dư thật ${H.fmt(sum.totalBalance)}`
      );
    }
  );
}

module.exports = { run };
