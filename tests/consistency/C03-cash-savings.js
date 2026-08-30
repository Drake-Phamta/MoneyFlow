/**
 * C03 — Tiền mặt và tiết kiệm.
 *
 * Backend đã tính sẵn "tiền chưa phân bổ" (database.js:2192) nhưng Dashboard
 * tính lại bằng công thức khác (Dashboard.jsx:260-261) và không bao giờ đọc
 * con số của backend — trong khi SavingsSection thì có đọc. Hai màn hình, cùng
 * một câu chữ, hai con số.
 */
const { group, t, fail, ok, eq, fmt, approx } = require('../rig/assert');
const { reset } = require('../rig/reset');
const { getOk, post, put } = require('../rig/http');
const F = require('./_formulas');

const TOL = 1;

async function run() {
  group('C03 — Tiền mặt & tiết kiệm');
  await reset();
  const d = await F.loadAll();

  await t(
    'C4',
    'Mỗi tháng: tổng phân bổ phải bằng tiền nhàn rỗi của tháng đó',
    ['rest:GET /api/allocations/all', 'rest:GET /api/monthly/filled'],
    () => {
      const bad = [];
      for (const m of d.filled) {
        const allocs = d.allocsByMonth[m.id] || [];
        if (!allocs.length) continue;
        // Tháng chi vượt thu không có gì để phân bổ — không so ở đây.
        if (m.total_inflow === 0) continue;
        const sum = allocs.reduce(
          (s, a) => s + (a.actual_amount > 0 ? a.actual_amount : a.planned_amount || 0),
          0
        );
        if (Math.abs(sum - m.total_inflow) > TOL) {
          bad.push(
            `${m.month_label}: Σ phân bổ ${fmt(sum)} ≠ tiền nhàn rỗi ${fmt(m.total_inflow)} ` +
              `(lệch ${fmt(sum - m.total_inflow)})`
          );
        }
      }
      if (bad.length) {
        fail(`${bad.length}/${d.filled.length} tháng lệch:\n      ` + bad.join('\n      '));
      }
    }
  );

  await t(
    'C4b',
    'Tổng phân bổ mọi tháng phải khớp con số backend báo trong savings/overview',
    ['rest:GET /api/savings/overview'],
    () => {
      const ov = d.savingsOverview;
      const fromAllocs = d.allAllocs.reduce(
        (s, a) => s + (a.actual_amount > 0 ? a.actual_amount : a.planned_amount || 0),
        0
      );
      approx(
        (ov.totalAllocated || 0) + (ov.totalOtherAllocated || 0),
        fromAllocs,
        TOL,
        'totalAllocated + totalOtherAllocated phải bằng tổng mọi dòng allocations'
      );
    }
  );

  await t(
    'C7',
    'Dashboard và SavingsSection phải hiện cùng một con số "tiền chưa phân bổ"',
    ['rest:GET /api/savings/overview', 'ui:savings.overview'],
    () => {
      const backend = d.savingsOverview.totalUnallocated || 0; // SavingsSection.jsx:451 dùng cái này
      const dashboard = F.dashboardCash(d).totalCashUnallocated; // Dashboard.jsx:261 tính lại
      approx(
        dashboard,
        backend,
        TOL,
        `Dashboard tính lại từ totalNet chưa kẹp sàn (${fmt(dashboard)}), ` +
          `backend dùng Σ total_inflow đã kẹp sàn từng tháng (${fmt(backend)})`
      );
    }
  );

  await t(
    'C7b',
    'Tháng chi vượt thu đã nhập vẫn phải xuất hiện trong lịch sử dòng tiền',
    ['rest:GET /api/monthly/filled', 'rest:POST /api/monthly'],
    async () => {
      // getFilledMonths() lọc `WHERE total_inflow > 0` (database.js:1272), còn
      // routes.js:136 kẹp total_inflow của tháng âm về 0. Kết quả: người dùng
      // nhập một tháng chi vượt thu, bấm lưu, và tháng đó BIẾN MẤT khỏi mọi
      // thống kê — không báo lỗi, không cảnh báo.
      await reset();
      const before = (await getOk('/api/monthly/filled')).length;

      const months = await getOk('/api/monthly');
      const target = months.find((m) => m.total_inflow === 0);
      ok(target, 'cần một tháng trống');
      await post('/api/monthly', {
        month_index: target.month_index,
        month_label: target.month_label,
        income: 2000000,
        bonus: 0,
        expense: 9000000, // chi vượt thu 7 triệu
      });

      const after = await getOk('/api/monthly/filled');
      const saved = await getOk(`/api/monthly/${target.month_index}`);
      const found = after.some((m) => m.month_index === target.month_index);

      if (!found) {
        fail(
          `Đã lưu ${target.month_label} (thu 2.000.000, chi 9.000.000) và DB có ` +
            `ghi lại (income=${fmt(saved.income)}, expense=${fmt(saved.expense)}, ` +
            `status=${saved.status}), nhưng /api/monthly/filled vẫn trả ${after.length} ` +
            `tháng như trước (${before}). Tháng này không xuất hiện ở bất kỳ ` +
            `thống kê nào vì total_inflow bị kẹp về 0.`
        );
      }
      await reset();
    }
  );

  await t(
    'C11',
    '"Thanh khoản" phải là tiền mặt + tiết kiệm KHÔNG kỳ hạn (rút được ngay)',
    ['rest:GET /api/savings/summary', 'rest:GET /api/savings', 'rest:GET /api/snapshot'],
    () => {
      // Dashboard render snapshot.liquidity.total (Dashboard.jsx:694-703).
      const shown = d.snapshot.liquidity.total;
      const cash = d.snapshot.cash.total;
      const liquid = d.savingsAccounts
        .filter((a) => a.status === 'active' && a.type === 'liquid')
        .reduce((s, a) => s + (a.current_balance || a.principal || 0), 0);
      const honest = cash + liquid;

      const locked = d.savingsAccounts
        .filter((a) => a.status === 'active' && a.type !== 'liquid')
        .reduce((s, a) => s + (a.principal || 0), 0);

      approx(
        shown,
        honest,
        TOL,
        `Thanh khoản phải là ${fmt(honest)} ` +
          `(tiền mặt ${fmt(cash)} + không kỳ hạn ${fmt(liquid)}), ` +
          `nhưng hiển thị ${fmt(shown)} — chênh ${fmt(shown - honest)}; ` +
          `${fmt(locked)} đang khoá trong sổ có kỳ hạn không được tính vào đây`
      );
    }
  );

  await t(
    'C5',
    'Tổng các dòng sổ tiết kiệm hiển thị phải khớp tổng ở chân bảng',
    ['rest:GET /api/savings', 'rest:GET /api/savings/summary'],
    async () => {
      await reset();
      // SavingsSection.jsx:756 render TOÀN BỘ getSavingsAccounts() (không lọc status)
      const rows = await getOk('/api/savings');
      const sum = await getOk('/api/savings/summary');
      const rowTotal = rows.reduce((s, a) => s + (a.principal || 0), 0);
      approx(
        rowTotal,
        sum.totalPrincipal,
        TOL,
        `Σ các dòng hiển thị ${fmt(rowTotal)} ≠ tổng chân bảng ${fmt(sum.totalPrincipal)}`
      );
    }
  );

  await t(
    'C5b',
    'Vẫn khớp sau khi một sổ chuyển sang trạng thái đã đáo hạn',
    ['rest:GET /api/savings', 'rest:PUT /api/savings/:id', 'rest:GET /api/snapshot'],
    async () => {
      await reset();
      const rows = await getOk('/api/savings');
      ok(rows.length > 0, 'fixture cần ít nhất một sổ tiết kiệm');
      const victim = rows[0];
      await put(`/api/savings/${victim.id}`, { status: 'matured' });

      const rowsAfter = await getOk('/api/savings');
      const sumAfter = await getOk('/api/savings/summary');

      // SavingsSection.jsx:737 chỉ đưa sổ đang hoạt động vào bảng, sổ đã đáo hạn
      // xuống khu riêng — nên chân bảng phải cộng đúng các dòng phía trên nó.
      const shownRows = rowsAfter.filter((a) => a.status === 'active');
      const rowTotal = shownRows.reduce((s, a) => s + (a.principal || 0), 0);

      approx(
        rowTotal,
        sumAfter.totalPrincipal,
        TOL,
        `Sau khi sổ "${victim.name}" (${fmt(victim.principal)}) đáo hạn: ` +
          `bảng hiện ${shownRows.length} dòng cộng lại ${fmt(rowTotal)}, ` +
          `nhưng chân bảng cộng ${sumAfter.accountCount} sổ = ` +
          `${fmt(sumAfter.totalPrincipal)}`
      );
      eq(shownRows.length, sumAfter.accountCount, 'số dòng hiển thị so với số sổ chân bảng đếm');

      // Sổ đã đáo hạn vẫn phải còn trong dữ liệu để hiện ở khu riêng, và không
      // được lọt vào bất kỳ con số tổng nào.
      const matured = rowsAfter.filter((a) => a.status !== 'active');
      eq(matured.length, 1, 'sổ đã đáo hạn phải còn trong danh sách để hiện ở khu riêng');
      const sn = await getOk('/api/snapshot');
      approx(
        sn.savings.balance,
        rowTotal + shownRows.reduce((s, a) => s + (a.accrued_interest || 0), 0),
        TOL,
        'số dư tiết kiệm trong snapshot vẫn còn cộng sổ đã đáo hạn'
      );
      eq(sn.savings.maturedCount, 1, 'snapshot phải đếm được sổ đã đáo hạn');

      await reset();
    }
  );

  await t(
    'C8',
    'Checklist "dự phòng ≥ 3×" phải dùng cùng định nghĩa với máy dò giai đoạn',
    ['rest:GET /api/phases/checklist', 'rest:GET /api/phases/active', 'rest:GET /api/snapshot'],
    async () => {
      await reset();
      // Ghi một lần trả lãi vào sổ Dự Phòng — đây là lúc hai định nghĩa cũ
      // tách nhau ra: một bên cộng lãi, một bên chỉ lấy gốc.
      const cats0 = await getOk('/api/categories');
      const dp0 = cats0.find((c) => c.name.includes('Dự Phòng'));
      const accounts0 = await getOk('/api/savings');
      const dpAccount = accounts0.find(
        (a) => a.status === 'active' && a.category_id === dp0.id
      );
      ok(dpAccount, 'fixture cần một sổ tiết kiệm gắn danh mục Dự Phòng');
      await post(`/api/savings/${dpAccount.id}/transactions`, {
        type: 'interest',
        amount: 1500000,
        date: new Date().toISOString().slice(0, 10),
        note: 'Ngân hàng trả lãi kỳ này',
      });

      const d2 = await F.loadAll();
      const sn = d2.snapshot;
      const expense = sn.params.FI_MONTHLY_EXPENSE;
      const reserve = sn.savings.reserveBalance;
      const met = reserve >= 3 * expense;

      // Một cơ sở, hai nơi đọc. Nếu hai nơi kết luận khác nhau thì người dùng
      // thấy checklist đã tick mà giai đoạn không lên, hoặc ngược lại.
      eq(
        !!sn.checklist?.[1]?.emergency_3x,
        met,
        `checklist nói ${!!sn.checklist?.[1]?.emergency_3x} trong khi quỹ dự phòng ` +
          `${fmt(reserve)} so với ngưỡng ${fmt(3 * expense)} cho ra ${met}`
      );
      eq(
        sn.phase.sortOrder >= 2,
        met,
        `máy dò xếp giai đoạn ${sn.phase.sortOrder} trong khi quỹ dự phòng ` +
          `${fmt(reserve)} so với ngưỡng ${fmt(3 * expense)} cho ra ${met}`
      );

      await reset();
    }
  );
}

module.exports = { run };
