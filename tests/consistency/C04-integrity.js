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

      // Ngưỡng cấp lấy từ SNIPER_TIERS — nguồn duy nhất. Trước đây test này
      // cào số trực tiếp trong thân getLevel(), nên nó vô tình hợp thức hoá
      // việc viết cứng ngưỡng ở màn hình. Giờ đọc từ nguồn, và kiểm luôn rằng
      // màn hình không tự bịa một bộ ngưỡng thứ hai.
      const tierSrc = read('src/content/phases.js');
      const tm = tierSrc.match(/SNIPER_TIERS\s*=\s*\[([\s\S]*?)\];/);
      ok(tm, 'không tìm thấy SNIPER_TIERS trong src/content/phases.js');
      const tierSet = [...new Set([...tm[1].matchAll(/from:\s*(0?\.\d+)/g)].map((x) => parseFloat(x[1])))]
        .sort((a, b) => a - b);
      ok(tierSet.length >= 3, `SNIPER_TIERS chỉ có ${tierSet.length} ngưỡng`);

      // Màn hình phải đọc từ SNIPER_TIERS, không được có số thập phân ngưỡng
      // nào viết thẳng trong mã.
      ok(
        playbookSrc.includes('SNIPER_TIERS'),
        'SniperPlaybook.jsx không đọc SNIPER_TIERS — ngưỡng đang viết cứng ở đâu đó'
      );
      // Bỏ chú thích trước khi quét — chú thích được phép nhắc tới con số.
      const playbookCode = playbookSrc
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      const hardcoded = [...playbookCode.matchAll(/[><]=?\s*(0\.\d+)/g)]
        .map((x) => parseFloat(x[1]))
        .filter((v) => tierSet.includes(v));
      ok(
        hardcoded.length === 0,
        `SniperPlaybook.jsx còn viết cứng ngưỡng ${hardcoded.join(', ')} — phải lấy từ SNIPER_TIERS`
      );

      const missing = tierSet.filter((tt) => !alertLevels.includes(tt));
      if (missing.length) {
        fail(
          `Playbook có cấp tại ${tierSet.map((x) => (x * 100).toFixed(0) + '%').join(', ')} ` +
            `nhưng cảnh báo chỉ bắn ở ${alertLevels.map((x) => (x * 100).toFixed(0) + '%').join(', ')} ` +
            `→ thiếu mốc ${missing.map((x) => (x * 100).toFixed(0) + '%').join(', ')}. ` +
            `Người dùng không được báo đúng lúc quan trọng nhất.`
        );
      }
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
      const withFee = F.deployed_withFee(d2); // tính từ chính bảng giao dịch
      const shown = F.deployed_exFee(d2); // cơ sở mà ExecutionLog dùng

      // ExecutionLog coi chênh lệch > 1000₫ là bất thường và bật banner hổ phách.
      const gap = Math.abs(withFee - shown);
      ok(
        gap <= 1000,
        `Hai định nghĩa "đã giải ngân" lệch ${fmt(gap)} chỉ vì phí: ` +
          `${fmt(withFee)} (tính có phí) so với ${fmt(shown)} mà trang đang dùng. ` +
          `Ngưỡng cảnh báo là 1.000₫ nên banner "đã đầu tư vượt phân bổ" sẽ bật ` +
          `lên dù người dùng không làm gì sai.`
      );

      // Quỹ Bắn Tỉa cũng phải cùng chính sách phí, nếu không thì "còn lại bao
      // nhiêu đạn" sẽ báo dư ra đúng bằng tiền phí.
      const sn = d2.snapshot;
      approx(
        sn.sniper.available,
        Math.max(0, sn.sniper.allocated - sn.sniper.deployed),
        1,
        'số đạn còn lại không khớp với đã chia trừ đã bắn'
      );
      ok(sn.sniper.available >= 0, `số đạn còn lại âm: ${fmt(sn.sniper.available)}`);

      await reset();
    }
  );

  // ─────────────────────────────────────────────────────────────
  await t(
    'C13',
    'Huỷ xác nhận chênh lệch phải hoàn tác thật, và lặp lại không được cộng dồn',
    [
      'rest:POST /api/allocations/adjust',
      'rest:DELETE /api/allocations/adjust/:id',
      'rest:GET /api/allocations/discrepancies',
      'ipc:allocations:revert',
      'bridge:allocations.revert',
      'client:allocations.revert',
    ],
    async () => {
      await reset();
      const cats = await getOk('/api/categories');
      const target = cats.find((c) => c.name.includes('Chứng Khoán'));
      ok(target, 'không có danh mục Chứng Khoán');

      const sumAlloc = async () =>
        (await getOk('/api/allocations/all'))
          .filter((a) => a.category_id === target.id)
          .reduce((s, a) => s + (a.actual_amount || a.planned_amount || 0), 0);

      const before = await getOk('/api/allocations/discrepancies');
      const allocBefore = await sumAlloc();

      // Ba vòng xác nhận rồi huỷ. Sau cùng mọi thứ phải y như lúc đầu.
      for (let i = 0; i < 3; i++) {
        const r = await post('/api/allocations/adjust', {
          discrepancyAmount: 1000000,
          categoryId: target.id,
          reason: `Vòng ${i + 1}`,
          date: new Date().toISOString().slice(0, 10),
        });
        ok(r.data && r.data.id, 'xác nhận phải trả về id của bút toán để còn huỷ được');
        approx(
          await sumAlloc(),
          allocBefore + 1000000,
          TOL,
          `vòng ${i + 1}: xác nhận không cộng đúng 1.000.000 vào phân bổ`
        );
        const undo = await del(`/api/allocations/adjust/${r.data.id}`);
        eq(undo.status, 200, `vòng ${i + 1}: huỷ bút toán thất bại`);
      }

      const after = await getOk('/api/allocations/discrepancies');
      eq(after.length, before.length, 'số dòng nhật ký chênh lệch sau 3 vòng');
      approx(
        await sumAlloc(),
        allocBefore,
        TOL,
        'phân bổ Chứng Khoán không trở lại như trước sau khi huỷ hết'
      );

      // Huỷ một bút toán không tồn tại phải báo 404, không âm thầm trừ tiếp.
      const missing = await del('/api/allocations/adjust/999999');
      eq(missing.status, 404, 'huỷ bút toán không có thật phải trả 404');

      await reset();
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
  await t(
    'C26',
    'Vị từ checklist phải đúng nghĩa cái nhãn hứa',
    ['rest:GET /api/phases/checklist', 'rest:GET /api/portfolio/summary'],
    async () => {
      await reset();
      const sn = await getOk('/api/snapshot');
      const items = sn.portfolio.items || [];

      // "Sở hữu ≥ 3 mã cổ phiếu riêng lẻ" — crypto và trái phiếu không phải
      // cổ phiếu, không được đếm vào.
      const pureStocks = items.filter((p) => p.asset_class === 'stock').length;
      eq(
        !!sn.checklist?.[3]?.dividend_stocks,
        pureStocks >= 3,
        `nhãn hứa ≥ 3 mã cổ phiếu, danh mục có ${pureStocks} mã ` +
          `(tổng ${items.length} tài sản mọi loại)`
      );

      // Thu nhập thụ động phải là tiền đã về, không phải tiền dự kiến, và
      // không được bắt nhầm ghi chú "chốt lãi" của một lệnh bán.
      const sells = (await getOk('/api/transactions')).filter((t) => t.type === 'SELL');
      if (sells.length === 0) {
        ok(
          typeof sn.checklist?.[4]?.passive_income === 'boolean',
          'thiếu vị từ passive_income'
        );
      }
    }
  );

  await t(
    'C27',
    'Ghi chú "chốt lãi" trên một lệnh bán không được tính là thu nhập thụ động',
    ['rest:POST /api/transactions', 'rest:GET /api/phases/checklist'],
    async () => {
      await reset();
      const before = (await getOk('/api/snapshot')).checklist?.[4]?.passive_income;

      const assets = await getOk('/api/catalog?class=stock');
      const asset = assets[0];
      await post('/api/transactions', {
        date: new Date().toISOString().slice(0, 10),
        asset_type_id: asset.id,
        type: 'BUY',
        quantity: 1000,
        price: 50000,
        total_amount: 50000000,
        fee: 0,
        note: 'Mua vao',
      });
      await post('/api/transactions', {
        date: new Date().toISOString().slice(0, 10),
        asset_type_id: asset.id,
        type: 'SELL',
        quantity: 1000,
        price: 60000,
        total_amount: 60000000,
        fee: 0,
        note: 'Chốt lãi sau khi tăng 20%',
      });

      const after = (await getOk('/api/snapshot')).checklist?.[4]?.passive_income;
      eq(
        after,
        before,
        'bán một lô 60 triệu với ghi chú "chốt lãi" đã bật mục thu nhập thụ động lên — ' +
          'tiền bán tài sản không phải thu nhập thụ động'
      );
      await reset();
    }
  );


  // ─────────────────────────────────────────────────────────────
  await t(
    'C23',
    'Mỗi lần điều chỉnh phải hiện thành chênh lệch ở đúng tháng của nó',
    ['rest:POST /api/allocations/adjust', 'rest:GET /api/snapshot'],
    async () => {
      await reset();
      const cats = await getOk('/api/categories');
      const target = cats.find((c) => c.name.includes('Chứng Khoán'));
      ok(target, 'không có danh mục Chứng Khoán');

      await post('/api/allocations/adjust', {
        discrepancyAmount: 777000,
        categoryId: target.id,
        reason: 'C23',
        date: new Date().toISOString().slice(0, 10),
      });

      const snap = await getOk('/api/snapshot');
      const logs = snap.plan.discrepancies || [];
      const rows = snap.plan.byMonth || [];
      ok(logs.length, 'không ghi được dòng điều chỉnh nào');

      // Thẻ "Kế hoạch so với thực tế" in tổng các lần điều chỉnh ngay dưới
      // bảng. Hai con số đó phải là một, nếu không thẻ tự mâu thuẫn — đúng cái
      // người dùng nhìn thấy: dưới ghi "3 lần điều chỉnh" mà bảng chỉ hiện 2.
      const sumLogs = logs.reduce((s, l) => s + (l.amount || 0), 0);
      const sumDiff = rows.reduce((s, r) => s + (r.diff || 0), 0);
      approx(sumDiff, sumLogs, TOL,
        'tổng chênh lệch trong bảng phải bằng tổng các lần điều chỉnh liệt kê bên dưới');

      // Và từng tháng phải khớp, không chỉ tổng.
      const perMonth = {};
      for (const l of logs) perMonth[l.month_index] = (perMonth[l.month_index] || 0) + (l.amount || 0);
      for (const [mi, amount] of Object.entries(perMonth)) {
        const row = rows.find((r) => String(r.month_index) === String(mi));
        ok(row, `có điều chỉnh ở tháng ${mi} nhưng tháng đó không có trong bảng`);
        approx(row.diff, amount, TOL,
          `tháng ${row.month_label}: bảng báo chênh ${fmt(row.diff)} nhưng sổ ghi ${fmt(amount)}`);
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  await t(
    'C24',
    'Sửa lại một tháng đã có điều chỉnh thì phần lệch không được biến mất',
    ['rest:POST /api/allocations/:entryId', 'rest:POST /api/allocations/adjust'],
    async () => {
      await reset();
      const cats = await getOk('/api/categories');
      const target = cats.find((c) => c.name.includes('Chứng Khoán'));

      await post('/api/allocations/adjust', {
        discrepancyAmount: 456000,
        categoryId: target.id,
        reason: 'C24',
        date: new Date().toISOString().slice(0, 10),
      });

      const snapBefore = await getOk('/api/snapshot');
      const logs = snapBefore.plan.discrepancies || [];
      const mi = logs[0] && logs[0].month_index;
      ok(mi !== undefined, 'không ghi được dòng điều chỉnh nào');

      const filled = await getOk('/api/monthly/filled');
      const month = filled.find((m) => m.month_index === mi);
      ok(month, `không tìm thấy tháng ${mi} trong danh sách đã ghi`);

      const rowBefore = snapBefore.plan.byMonth.find((r) => r.month_index === mi);
      const diffBefore = rowBefore ? rowBefore.diff : 0;
      ok(diffBefore > 0, 'điều chỉnh chưa hiện thành chênh lệch, test sau vô nghĩa');

      // Đúng thứ MonthlyEntry gửi lên khi bấm "Sửa" rồi lưu mà không đổi gì:
      // actual_amount = planned_amount. Trước đây đúng câu lệnh này nuốt mất
      // phần điều chỉnh vào chính kế hoạch.
      const allocs = await getOk(`/api/allocations/${month.id}`);
      await post(`/api/allocations/${month.id}`, {
        allocations: allocs.map((a) => ({
          category_id: a.category_id,
          planned_amount: a.planned_amount,
          actual_amount: a.planned_amount,
        })),
      });

      const snapAfter = await getOk('/api/snapshot');
      const rowAfter = snapAfter.plan.byMonth.find((r) => r.month_index === mi);
      ok(rowAfter, 'tháng biến mất khỏi bảng sau khi lưu lại');
      approx(rowAfter.diff, diffBefore, TOL,
        `sửa lại tháng làm chênh lệch tụt từ ${fmt(diffBefore)} xuống ${fmt(rowAfter.diff)}`);

      const sumRow = await getOk(`/api/allocations/${month.id}`);
      const totalAfter = sumRow.reduce(
        (s, a) => s + (a.actual_amount > 0 ? a.actual_amount : a.planned_amount || 0), 0);
      const totalBefore = allocs.reduce(
        (s, a) => s + (a.actual_amount > 0 ? a.actual_amount : a.planned_amount || 0), 0);
      approx(totalAfter, totalBefore, TOL, 'tổng tiền đã phân bổ của tháng không được đổi');
    }
  );

  // ─────────────────────────────────────────────────────────────
  await t(
    'C30',
    'Rút tiền từ sổ chỉ chuyển ngăn, không làm mất tiền',
    ['rest:POST /api/savings/:accountId/transactions', 'rest:GET /api/cash/ledger'],
    async () => {
      await reset();
      const accounts = await getOk('/api/savings');
      const acc = accounts.find((a) => (a.principal || 0) > 1000000);
      ok(acc, 'fixture không có sổ nào đủ tiền để rút');

      const before = await getOk('/api/snapshot');
      const amount = 1000000;

      await post(`/api/savings/${acc.id}/transactions`, {
        type: 'withdraw', amount, date: new Date().toISOString().slice(0, 10), note: 'C30',
      });

      const after = await getOk('/api/snapshot');

      // Rút tiền ra khỏi sổ không làm bạn nghèo đi — tiền chỉ đổi ngăn.
      approx(after.netWorth.total, before.netWorth.total, TOL,
        `tổng tài sản tụt từ ${fmt(before.netWorth.total)} xuống ${fmt(after.netWorth.total)} ` +
        `chỉ vì rút ${fmt(amount)} từ sổ — tiền bốc hơi`);

      approx(before.savings.balance - after.savings.balance, amount, TOL,
        'tiết kiệm phải giảm đúng bằng số đã rút');
      approx(after.cash.total - before.cash.total, amount, TOL,
        'tiền mặt phải tăng đúng bằng số đã rút');

      const ledger = await getOk('/api/cash/ledger');
      ok(ledger.some((r) => r.source === 'savings_withdraw' && Math.abs(r.amount - amount) < TOL),
        'sổ quỹ không ghi lại lần rút này');
    }
  );

  // ─────────────────────────────────────────────────────────────
  await t(
    'C31',
    'Sổ đáo hạn không tái tục thì gốc và lãi về tiền mặt, không biến mất',
    ['rest:POST /api/savings/process-matured'],
    async () => {
      await reset();
      // Fixture có sẵn vài sổ quá hạn tự tái tục. Chạy một lần cho chúng lắng
      // xuống trước, để phép đo sau chỉ phản ánh đúng sổ mình vừa tạo.
      await post('/api/savings/process-matured', {});

      // Một sổ đã quá hạn và KHÔNG tái tục — nhánh mà tiền từng bốc hơi.
      const created = await post('/api/savings', {
        name: 'C31 sổ quá hạn', bank: 'TEST', type: 'term',
        principal: 20000000, interest_rate: 6, term_months: 6,
        start_date: '2020-01-01', maturity_date: '2020-07-01', auto_renew: 0,
      });
      ok(created.status < 300, 'không tạo được sổ thử');

      const before = await getOk('/api/snapshot');
      await post('/api/savings/process-matured', {});
      const after = await getOk('/api/snapshot');

      approx(after.netWorth.total, before.netWorth.total, TOL,
        `tổng tài sản tụt từ ${fmt(before.netWorth.total)} xuống ${fmt(after.netWorth.total)} ` +
        `khi một sổ đáo hạn — cả sổ rơi khỏi bảng cân đối`);

      // Gốc CỘNG lãi, không phải riêng gốc: tất toán thì ngân hàng trả cả hai.
      const ledger = await getOk('/api/cash/ledger');
      const row = ledger.find((r) => r.source === 'savings_matured');
      ok(row, 'sổ quỹ không ghi lại lần đáo hạn này');
      ok(row.amount > 20000000,
        `sổ quỹ chỉ ghi ${fmt(row.amount)} — phần lãi bị bỏ rơi khi tất toán`);
      approx(after.cash.total - before.cash.total, row.amount, TOL,
        'tiền mặt phải tăng đúng bằng số ghi trong sổ quỹ');
      await reset();
    }
  );

  // ─────────────────────────────────────────────────────────────
  await t(
    'C32',
    'Khoản đã tiêu trừ vào tài sản nhưng không bóp méo chi tiêu trung bình',
    ['rest:POST /api/cash/spend'],
    async () => {
      await reset();
      const before = await getOk('/api/snapshot');
      const amount = 500000;

      await post('/api/cash/spend', {
        amount, date: new Date().toISOString().slice(0, 10), note: 'C32 mua đồ',
      });

      const after = await getOk('/api/snapshot');

      approx(before.netWorth.total - after.netWorth.total, amount, TOL,
        'tổng tài sản phải giảm đúng bằng khoản đã tiêu');

      // Đây là lý do dùng bảng riêng thay vì monthly_entries.expense: mọi trung
      // bình nuôi lộ trình đều lấy từ getCashflowStats().
      approx(after.cashflow.expenseMean, before.cashflow.expenseMean, TOL,
        `chi tiêu trung bình đổi từ ${fmt(before.cashflow.expenseMean)} sang ` +
        `${fmt(after.cashflow.expenseMean)} — khoản chi lớn đang kéo lệch cả lộ trình`);
      approx(after.cashflow.totalExpense, before.cashflow.totalExpense, TOL,
        'tổng chi tiêu hàng tháng không được đổi');
      await reset();
    }
  );

  // ─────────────────────────────────────────────────────────────
  await t(
    'C33',
    'Bán rồi rút ra dùng: tiền đổi ngăn, thanh khoản giữ nguyên',
    ['rest:POST /api/transactions'],
    async () => {
      await reset();
      const assets = await getOk('/api/catalog?class=stock');
      const asset = assets[0];
      const today = new Date().toISOString().slice(0, 10);

      await post('/api/transactions', {
        date: today, asset_type_id: asset.id, type: 'BUY',
        quantity: 100, price: 50000, total_amount: 5000000, note: 'C33 mua',
      });

      const before = await getOk('/api/snapshot');
      await post('/api/transactions', {
        date: today, asset_type_id: asset.id, type: 'SELL',
        quantity: 40, price: 50000, total_amount: 2000000,
        proceeds: 'cash', note: 'C33 bán rút ra dùng',
      });
      const after = await getOk('/api/snapshot');

      // Bán là đổi cổ phiếu lấy tiền, nên tiền mặt PHẢI tăng và tổng tài sản
      // giữ nguyên (bán đúng giá vốn). Cái mà "rút ra dùng" đổi là NGĂN chứa:
      // tiền vào ô chưa phân bổ chứ không nằm ở ô chờ mua, nên app thôi coi
      // khoản đó là phần còn thiếu của danh mục.
      approx(after.cash.unallocated - before.cash.unallocated, 2000000, TOL,
        'tiền bán rút ra dùng phải vào ô chưa phân bổ');
      approx(after.cash.awaitingInvestment, before.cash.awaitingInvestment, TOL,
        `ô "chờ lệnh mua" đổi từ ${fmt(before.cash.awaitingInvestment)} sang ` +
        `${fmt(after.cash.awaitingInvestment)} — đã nói rút ra dùng thì nó phải đứng yên`);
      await reset();
    }
  );

  // ─────────────────────────────────────────────────────────────
  await t(
    'C34',
    'Tiêu quá số tiền mặt đang có thì phải nói ra, không kẹp về 0 rồi im lặng',
    ['rest:POST /api/cash/spend', 'rest:DELETE /api/cash/ledger/:id'],
    async () => {
      await reset();
      const before = await getOk('/api/snapshot');
      const tooMuch = before.cash.total + 9000000;

      const r = await post('/api/cash/spend', {
        amount: tooMuch, date: new Date().toISOString().slice(0, 10), note: 'C34',
      });

      const after = await getOk('/api/snapshot');
      approx(after.cash.overspent, 9000000, TOL,
        `tiêu quá ${fmt(9000000)} mà overspent báo ${fmt(after.cash.overspent)}`);
      eq(after.cash.total, 0, 'tiền mặt không được âm');

      // Xoá được dòng ghi nhầm, và xoá xong mọi thứ trở lại như cũ.
      await del(`/api/cash/ledger/${r.data.id}`);
      const back = await getOk('/api/snapshot');
      approx(back.cash.total, before.cash.total, TOL, 'xoá dòng ghi nhầm phải hoàn nguyên');
      eq(back.cash.overspent, 0, 'hết tiêu quá thì overspent về 0');
      await reset();
    }
  );

}

module.exports = { run };
