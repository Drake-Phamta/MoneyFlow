/**
 * C04 — Toàn vẹn dữ liệu & các bất biến còn lại.
 *
 * Nhóm này kiểm những chỗ mà chữ trên màn hình và code kiểm tra nói hai chuyện
 * khác nhau: checklist, chiến lược bắn tỉa, hoàn tác chênh lệch, múi giờ.
 */
const fs = require('fs');
const path = require('path');
const { group, t, fail, ok, fmt, approx, eq } = require('../rig/assert');
const { reset } = require('../rig/reset');
const { getOk, post, del } = require('../rig/http');
const { REPO_ROOT } = require('../rig/env');
const F = require('./_formulas');

const TOL = 1;
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

async function run() {
  group('C04 — Toàn vẹn & bất biến còn lại');
  await reset();

  // ─────────────────────────────────────────────────────────────
  await t(
    'C9',
    'Ghi nhận một lệnh bắn tỉa phải làm mục checklist tương ứng bật lên',
    ['rest:POST /api/transactions', 'rest:GET /api/phases/checklist'],
    async () => {
      await reset();
      const assets = await getOk('/api/catalog?class=stock');
      ok(assets.length, 'catalog không có cổ phiếu nào');
      const asset = assets[0];

      // Giá trị 'Sniper' viết hoa chữ S là đúng thứ UI ghi vào DB:
      // SniperPlaybook.jsx:188 và ExecutionLog.jsx:395 <option value="Sniper">
      await post('/api/transactions', {
        date: new Date().toISOString().slice(0, 10),
        asset_type_id: asset.id,
        type: 'BUY',
        quantity: 10,
        price: 50000,
        total_amount: 500000,
        strategy: 'Sniper',
        note: 'Test bắn tỉa',
      });

      const cl = await getOk('/api/phases/checklist');
      const flag = cl?.[3]?.sniper_deploy;
      if (flag !== true) {
        fail(
          `Đã ghi một giao dịch strategy='Sniper' nhưng checklist.sniper_deploy ` +
            `vẫn là ${JSON.stringify(flag)}. SQLite so sánh TEXT phân biệt hoa ` +
            `thường, mà database.js:1174 truy vấn WHERE strategy = 'sniper'.`
        );
      }
      await reset();
    },
    {
      knownFail:
        "database.js:1174 dùng `strategy = 'sniper'` (thường) trong khi UI ghi " +
        "'Sniper' (hoa). So sánh cùng loại ở database.js:1538 dùng LOWER() nên " +
        'đây là lỗi chứ không phải chủ ý. priceService.js:303 cũng dính.',
    }
  );

  // ─────────────────────────────────────────────────────────────
  await t(
    'C21',
    'Mọi mục checklist đều phải được suy ra từ dữ liệu, không mục nào cứng',
    ['rest:GET /api/phases/checklist'],
    () => {
      const src = read('electron/database.js');
      const fn = src.slice(
        src.indexOf('getChecklistStatus()'),
        src.indexOf('getPhaseAllocations(')
      );
      // Bắt các dòng dạng `key: true,` hoặc `key: false,` — hằng số cứng.
      const hard = [...fn.matchAll(/^\s*([a-z_]+):\s*(true|false),\s*$/gm)].map(
        (m) => `${m[1]} = ${m[2]}`
      );
      if (hard.length) {
        fail(
          `${hard.length} mục checklist là hằng số cứng, không kiểm gì cả: ` +
            hard.join(', ') +
            ` — người dùng thấy dấu tick nhưng hệ thống chưa từng xác minh.`
        );
      }
    },
    {
      knownFail:
        'database.js:1228 `track_money: true` — mục "Ghi chép mọi khoản vào ' +
        'Money Flow" luôn hiện đã hoàn thành.',
    }
  );

  // ─────────────────────────────────────────────────────────────
  await t(
    'C21b',
    'Checklist không được tự đánh dấu hoàn thành cho giai đoạn đã qua',
    ['ui:phases.checklist'],
    () => {
      const src = read('src/components/Scenarios.jsx');
      if (/isDone\s*\|\|\s*!!\(?\s*checklistStatus/.test(src)) {
        fail(
          'Scenarios.jsx dùng `isDone || checklistStatus[...]` nên mọi mục của ' +
            'giai đoạn đã qua đều bị gạch xanh, kể cả việc người dùng chưa từng ' +
            'làm. Tiêu đề khối lại ghi "Bảng kiểm tra (tự động)", hàm ý đã được ' +
            'xác minh từ dữ liệu.'
        );
      }
    },
    {
      knownFail:
        'Scenarios.jsx:362 — điều kiện duy nhất để "hoàn thành giai đoạn" là ' +
        'ngưỡng tài sản, nên chạm mốc là toàn bộ checklist các giai đoạn trước ' +
        'tự tick, mất hoàn toàn giá trị hồi cứu.',
    }
  );

  // ─────────────────────────────────────────────────────────────
  await t(
    'C22',
    'Mọi ngưỡng "mức giảm từ đỉnh" trong hệ thống phải khớp nhau',
    ['rest:POST /api/prices/refresh'],
    () => {
      const priceSrc = read('electron/priceService.js');
      const playbookSrc = read('src/components/SniperPlaybook.jsx');

      // Các mốc sinh cảnh báo
      const m = priceSrc.match(/DROP_THRESHOLDS\s*=\s*\[([^\]]+)\]/);
      ok(m, 'không tìm thấy DROP_THRESHOLDS trong priceService.js');
      const alertLevels = m[1]
        .split(',')
        .map((x) => parseFloat(x.trim()))
        .filter((x) => !isNaN(x));

      // Các ngưỡng cấp trong playbook — lấy từ thân hàm getLevel()
      const lvlStart = playbookSrc.indexOf('function getLevel(');
      ok(lvlStart > 0, 'không tìm thấy getLevel() trong SniperPlaybook.jsx');
      const lvlBody = playbookSrc.slice(lvlStart, playbookSrc.indexOf('}', lvlStart));
      const tiers = [...lvlBody.matchAll(/>=\s*(0?\.\d+)/g)].map((x) => parseFloat(x[1]));
      const tierSet = [...new Set(tiers)].sort((a, b) => a - b);
      ok(tierSet.length >= 3, `getLevel() chỉ có ${tierSet.length} ngưỡng`);

      const missing = tierSet.filter((tt) => !alertLevels.includes(tt));
      if (missing.length) {
        fail(
          `Playbook có cấp tại ${tierSet.map((x) => (x * 100).toFixed(0) + '%').join(', ')} ` +
            `nhưng cảnh báo chỉ bắn ở ${alertLevels.map((x) => (x * 100).toFixed(0) + '%').join(', ')} ` +
            `→ thiếu mốc ${missing.map((x) => (x * 100).toFixed(0) + '%').join(', ')}. ` +
            `Người dùng không được báo đúng lúc quan trọng nhất.`
        );
      }
    },
    {
      knownFail:
        'priceService.js:228 thiếu mốc 0.35 — đúng ngưỡng lên Cấp 3 ' +
        '(triển khai 40% kho đạn) của SniperPlaybook.jsx:95-99.',
    }
  );

  // ─────────────────────────────────────────────────────────────
  await t(
    'C6',
    'Phí giao dịch không được làm banner "đã đầu tư vượt phân bổ" kêu oan',
    ['rest:POST /api/transactions', 'rest:GET /api/portfolio/summary'],
    async () => {
      await reset();
      const assets = await getOk('/api/catalog?class=stock');
      const asset = assets[0];
      await post('/api/transactions', {
        date: new Date().toISOString().slice(0, 10),
        asset_type_id: asset.id,
        type: 'BUY',
        quantity: 100,
        price: 50000,
        total_amount: 5000000,
        fee: 17500, // 0,35% — mức phí thật của môi giới VN
        note: 'Test phí',
      });

      const d2 = await F.loadAll();
      const withFee = F.deployed_withFee(d2); // database.js:1594 → Dashboard
      const exFee = F.deployed_exFee(d2); // ExecutionLog.jsx:184

      // ExecutionLog.jsx:186-187 coi chênh lệch > 1000₫ là bất thường và bật
      // banner cảnh báo màu hổ phách.
      const gap = Math.abs(withFee - exFee);
      if (gap > 1000) {
        fail(
          `Hai định nghĩa "đã giải ngân" lệch ${fmt(gap)} chỉ vì phí: ` +
            `Dashboard dùng ${fmt(withFee)} (có phí), ExecutionLog dùng ${fmt(exFee)} ` +
            `(không phí). Ngưỡng cảnh báo của ExecutionLog là 1.000₫ nên banner ` +
            `"đã đầu tư vượt phân bổ" sẽ bật lên dù người dùng không làm gì sai.`
        );
      }
      await reset();
    },
    {
      knownFail:
        'database.js:1594 cộng fee, ExecutionLog.jsx:184 và SniperPlaybook.jsx:67 ' +
        'không cộng — ba định nghĩa cho cùng một khái niệm.',
    }
  );

  // ─────────────────────────────────────────────────────────────
  await t(
    'C13',
    'Huỷ xác nhận chênh lệch phải hoàn tác thật, và lặp lại không được cộng dồn',
    ['rest:POST /api/allocations/adjust', 'rest:GET /api/allocations/discrepancies'],
    async () => {
      await reset();
      const cats = await getOk('/api/categories');
      const target = cats.find((c) => c.name.includes('Chứng Khoán'));
      ok(target, 'không có danh mục Chứng Khoán');

      const before = await getOk('/api/allocations/discrepancies');
      const allocBefore = (await getOk('/api/allocations/all'))
        .filter((a) => a.category_id === target.id)
        .reduce((s, a) => s + (a.actual_amount || a.planned_amount || 0), 0);

      // Ba vòng xác nhận rồi huỷ. ExecutionLog.jsx:175-179 chỉ xoá localStorage
      // nên phía DB không có gì được hoàn lại.
      for (let i = 0; i < 3; i++) {
        await post('/api/allocations/adjust', {
          discrepancyAmount: 1000000,
          categoryId: target.id,
          reason: `Vòng ${i + 1}`,
          date: new Date().toISOString().slice(0, 10),
        });
        // "Huỷ xác nhận" ở giao diện: không gọi API nào cả.
      }

      const after = await getOk('/api/allocations/discrepancies');
      const allocAfter = (await getOk('/api/allocations/all'))
        .filter((a) => a.category_id === target.id)
        .reduce((s, a) => s + (a.actual_amount || a.planned_amount || 0), 0);

      if (after.length !== before.length || Math.abs(allocAfter - allocBefore) > TOL) {
        fail(
          `Sau 3 vòng xác nhận-rồi-huỷ: discrepancy_logs ${before.length} → ` +
            `${after.length} dòng, phân bổ Chứng Khoán ${fmt(allocBefore)} → ` +
            `${fmt(allocAfter)} (cộng thêm ${fmt(allocAfter - allocBefore)}). ` +
            `Không có đường nào để hoàn tác.`
        );
      }
      await reset();
    },
    {
      knownFail:
        'ExecutionLog.jsx:175-179 handleRevokeConfirmation chỉ ' +
        'localStorage.removeItem, không đảo bút toán đã ghi bởi ' +
        'database.js:1385 adjustInvestmentAllocation.',
    }
  );

  // ─────────────────────────────────────────────────────────────
  await t(
    'C16',
    'Dashboard không được đọc trường allocations trên dòng /monthly/filled',
    ['rest:GET /api/monthly/filled'],
    async () => {
      const filled = await getOk('/api/monthly/filled');
      ok(filled.length, 'fixture không có tháng nào');
      const hasKey = filled.some((m) => 'allocations' in m);
      const src = read('src/components/Dashboard.jsx');
      const reads = /m\.allocations\?\./.test(src);
      if (reads && !hasKey) {
        fail(
          'Dashboard.jsx:287 đọc `m.allocations?.find(...)` nhưng dòng trả về từ ' +
            'getFilledMonths() không có trường đó → nhánh dự phòng luôn chạy, ' +
            'và biến kết quả `allocatedToDuPhong` lại không được dùng ở đâu cả.'
        );
      }
    },
    {
      knownFail:
        'Dashboard.jsx:286-289 tính allocatedToDuPhong từ một trường không tồn ' +
        'tại, rồi bỏ đi không dùng; dòng :295 dùng biểu thức hoàn toàn khác.',
    }
  );

  // ─────────────────────────────────────────────────────────────
  await t(
    'C19',
    'Sửa một tháng cũ mà không đổi gì thì phân bổ đã lưu phải giữ nguyên',
    ['rest:POST /api/allocations/:entryId', 'ui:monthly.get'],
    async () => {
      await reset();
      const filled = await getOk('/api/monthly/filled');
      const month = filled[filled.length - 1];
      const before = await getOk(`/api/allocations/${month.id}`);
      ok(before.length, 'tháng này chưa có phân bổ');

      // Mô phỏng "Điều chỉnh tạm": dồn phần lớn vào Bắn Tỉa rồi lưu.
      const cats = await getOk('/api/categories');
      const sniper = cats.find((c) => c.name.includes('Bắn Tỉa'));
      const custom = before.map((a) => ({
        category_id: a.category_id,
        planned_amount: a.category_id === sniper.id ? month.total_inflow : 0,
        actual_amount: a.category_id === sniper.id ? month.total_inflow : 0,
      }));
      await post(`/api/allocations/${month.id}`, { allocations: custom });

      const saved = await getOk(`/api/allocations/${month.id}`);
      const savedSniper =
        saved.find((a) => a.category_id === sniper.id)?.actual_amount || 0;
      approx(
        savedSniper,
        month.total_inflow,
        TOL,
        'phân bổ điều chỉnh phải được lưu nguyên vẹn'
      );

      // Bây giờ mô phỏng đúng thứ MonthlyEntry làm khi bấm "Sửa": nạp lại tháng,
      // rồi lưu lại mà KHÔNG đổi gì. Đây là chỗ effect ở :112-132 tính lại
      // planned_amount từ tỷ lệ giai đoạn và xoá mất điều chỉnh.
      const phase = await getOk('/api/phases/active');
      const ratios = await getOk(`/api/phases/${phase.id}/allocations`);
      const recomputed = ratios.map((r) => ({
        category_id: r.category_id,
        planned_amount: Math.round(month.total_inflow * r.ratio),
        actual_amount: Math.round(month.total_inflow * r.ratio),
      }));
      const ratioBased =
        recomputed.find((r) => r.category_id === sniper.id)?.actual_amount || 0;
      const atStake = Math.abs(ratioBased - savedSniper) > TOL;

      // Lỗi nằm trong logic state của React nên tầng API không quan sát được.
      // Thay vào đó kiểm chốt chặn có thật trong mã nguồn hay không:
      // effect chia lại chỉ được chạy khi tiền nhàn rỗi THỰC SỰ đổi, và
      // startEdit() phải ghim mốc so sánh khi nạp phân bổ đã lưu.
      const src = read('src/components/MonthlyEntry.jsx');
      const hasMarker = /allocsForInflow/.test(src);
      const guardsEffect =
        /allocsForInflow\.current === totalInflow\)\s*return/.test(src);
      const pinsOnEdit = /allocsForInflow\.current = entry\.total_inflow/.test(src);

      if (!(hasMarker && guardsEffect && pinsOnEdit)) {
        fail(
          `Phân bổ đã lưu cho ${month.month_label}: Bắn Tỉa = ${fmt(savedSniper)}; ` +
            `tính lại theo tỷ lệ giai đoạn sẽ ra ${fmt(ratioBased)} ` +
            `(chênh ${fmt(Math.abs(ratioBased - savedSniper))}). ` +
            `Thiếu chốt chặn trong MonthlyEntry.jsx: ` +
            `mốc so sánh=${hasMarker}, effect có guard=${guardsEffect}, ` +
            `startEdit ghim mốc=${pinsOnEdit}. ` +
            `Không có đủ ba thứ này thì bấm "Sửa" là mất phân bổ đã điều chỉnh.`
        );
      }
      ok(atStake, 'kịch bản test chưa dựng được chênh lệch để kiểm');
      await reset();
    }
  );

  // ─────────────────────────────────────────────────────────────
  await t(
    'C20',
    'Ngày mặc định phải là ngày địa phương (UTC+7), không phải ngày UTC',
    ['ui:transactions.add'],
    () => {
      const files = [
        'src/components/ExecutionLog.jsx',
        'src/components/SniperPlaybook.jsx',
        'src/components/SavingsSection.jsx',
        'src/components/charts/NetWorthModal.jsx',
        'src/components/charts/AssetDetailModal.jsx',
      ];
      const hits = [];
      for (const f of files) {
        const src = read(f);
        const n = (src.match(/toISOString\(\)\s*\.\s*(split|slice)/g) || []).length;
        if (n) hits.push(`${f.split('/').pop()}: ${n} chỗ`);
      }
      if (hits.length) {
        const now = new Date();
        const utcDate = now.toISOString().slice(0, 10);
        const localDate = new Date(now.getTime() + 7 * 3600 * 1000)
          .toISOString()
          .slice(0, 10);
        fail(
          `${hits.join(', ')} dùng toISOString() để lấy ngày. Đó là ngày UTC, ` +
            `Việt Nam là UTC+7 nên từ 0h đến 7h sáng app ghi lùi một ngày. ` +
            `(Ngay lúc chạy test: UTC ${utcDate}, giờ VN ${localDate}.) ` +
            `Cần một hàm todayLocal() dùng getFullYear/getMonth/getDate.`
        );
      }
    },
    {
      knownFail:
        '20 chỗ trong src/ dùng new Date().toISOString().split("T")[0]. ' +
        'Nặng nhất là khoá localStorage discrepancy_YYYY-MM ở ExecutionLog.jsx:72 ' +
        '— ngày 1 hàng tháng lúc 6h sáng nó trỏ vào tháng trước.',
    }
  );

  // ─────────────────────────────────────────────────────────────
  await t(
    'C14',
    'Mọi tham số mà giao diện hứa cho chỉnh đều phải tồn tại trong /api/params',
    ['rest:GET /api/params'],
    async () => {
      const params = await getOk('/api/params');
      const existing = new Set(params.map((p) => p.key));
      const paramFile = path.join(REPO_ROOT, 'src/components/Parameters.jsx');
      if (!fs.existsSync(paramFile)) return; // component đã bị xoá thì không còn lỗi
      const src = fs.readFileSync(paramFile, 'utf8');
      // Chỉ lấy các khoá thật sự được liệt kê trong `keys: [...]` của PARAM_GROUPS,
      // đừng quét cả file kẻo dính mọi chuỗi viết hoa khác.
      const advertised = [];
      for (const blk of src.matchAll(/keys:\s*\[([^\]]+)\]/g)) {
        for (const k of blk[1].matchAll(/'([A-Z][A-Z0-9_]+)'/g)) advertised.push(k[1]);
      }
      const missing = [...new Set(advertised)].filter((k) => !existing.has(k));
      if (missing.length) {
        fail(
          `Parameters.jsx quảng cáo ${missing.length} tham số không hề được seed: ` +
            `${missing.join(', ')} — các thẻ tương ứng render rỗng hoàn toàn ` +
            `vì dòng :97 trả về null khi không tìm thấy tham số.`
        );
      }
    },
    {
      knownFail:
        'database.js:650-657 seedDefaults chỉ seed 5 tham số, trong khi ' +
        'Parameters.jsx liệt kê 11. Component này hiện cũng không được import ' +
        'ở đâu (code chết) nhưng vẫn nên dọn.',
    }
  );

  // ─────────────────────────────────────────────────────────────
  await t(
    'C10',
    'Danh mục rỗng: Kịch bản không được cộng đôi số dư tiết kiệm',
    ['rest:GET /api/portfolio/summary', 'rest:GET /api/savings/summary', 'rest:GET /api/snapshot'],
    async () => {
      await reset();
      // Xoá hết giao dịch để giá thị trường danh mục về 0. Đây là lúc công thức
      // cũ rơi vào nhánh dự phòng và cộng phần tiết kiệm lần thứ hai.
      await del('/api/data/transactions');

      const d2 = await F.loadAll();
      const sn = d2.snapshot;
      const shown = F.netWorth_Scenarios(d2);

      approx(sn.portfolio.marketValue, 0, TOL, 'xoá hết giao dịch mà danh mục vẫn còn giá trị');
      approx(
        shown,
        sn.cash.total + sn.savings.balance,
        TOL,
        `danh mục rỗng thì tài sản chỉ còn tiền mặt ${fmt(sn.cash.total)} ` +
          `+ tiết kiệm ${fmt(sn.savings.balance)}, nhưng Kịch bản hiện ${fmt(shown)}`
      );

      // Chặn kiểu cộng đôi cũ: không thể sở hữu nhiều hơn tổng tiền đã kiếm được
      // cộng với số dư tiết kiệm.
      const ceiling = sn.cashflow.totalInflow + sn.savings.balance;
      ok(
        shown <= ceiling + TOL,
        `${fmt(shown)} vượt trần ${fmt(ceiling)} (tiền nhàn rỗi đã kiếm + tiết kiệm) — ` +
          `phần tiết kiệm đang bị đếm hai lần`
      );

      await reset();
    }
  );
}

module.exports = { run };
