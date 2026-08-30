/**
 * C01 — Danh mục: tên trong dữ liệu phải khớp tên trong bảng categories.
 *
 * migrateToV5 (database.js:581) đã đổi tên danh mục 'Đầu Tư' → 'Chứng Khoán',
 * nhưng _getAssetAllocationCategory (database.js:1547,1556) vẫn trả về 'Đầu Tư',
 * và Dashboard.jsx:90 CATEGORY_META cũng hardcode 'Đầu Tư'.
 *
 * Hậu quả người dùng thấy được:
 *   - Dashboard: byCategory['Đầu Tư'] không nằm trong danh sách categories nên
 *     thẻ "Phân Bổ Danh Mục" và biểu đồ tròn "Cơ cấu tài sản" bỏ sót nó.
 *   - Tab Phân bổ: byCategory['Chứng Khoán'] undefined nên rơi về tổng phân bổ
 *     (số tiền KẾ HOẠCH), trong khi mẫu số baseTotal là giá trị THỊ TRƯỜNG.
 *     Mọi phần trăm và mọi cảnh báo "Cần rebalance" đều sai đơn vị.
 */
const { group, t, fail, ok, fmt, approx } = require('../rig/assert');
const { reset } = require('../rig/reset');
const F = require('./_formulas');

const TOL = 1;

async function run() {
  group('C01 — Nhất quán tên danh mục');
  await reset();
  const d = await F.loadAll();

  const catNames = d.categories.map((c) => c.name);
  const byCatKeys = Object.keys(d.summary.byCategory || {});

  await t(
    'C1',
    'Mọi khoá của byCategory đều là một danh mục có thật trong bảng categories',
    ['rest:GET /api/portfolio/summary', 'rest:GET /api/categories'],
    () => {
      const orphans = byCatKeys.filter((k) => !catNames.includes(k));
      if (orphans.length) {
        fail(
          `byCategory chứa ${orphans.length} tên không có trong bảng categories: ` +
            `${orphans.map((o) => `"${o}"`).join(', ')}\n` +
            `      bảng categories : ${catNames.join(' | ')}\n` +
            `      khoá byCategory : ${byCatKeys.join(' | ')}`
        );
      }
    }
  );

  await t(
    'C1b',
    'Danh mục Chứng Khoán phải có mặt trong byCategory (nó là danh mục lớn nhất)',
    ['rest:GET /api/portfolio/summary'],
    () => {
      const ck = d.categories.find((c) => c.name.includes('Chứng Khoán'));
      ok(ck, 'không tìm thấy danh mục Chứng Khoán trong bảng categories');
      if (!byCatKeys.includes(ck.name)) {
        const investedElsewhere = (d.summary.byCategory || {})['Đầu Tư'];
        fail(
          `"${ck.name}" không có trong byCategory nên biến mất khỏi biểu đồ tròn ` +
            `và thẻ Phân Bổ Danh Mục trên Dashboard.\n` +
            `      Giá trị của nó đang nằm dưới khoá "Đầu Tư": ` +
            `${investedElsewhere ? fmt(investedElsewhere.currentTotal) : '(không có)'}`
        );
      }
    }
  );

  await t(
    'C1c',
    'Tab Phân bổ: tử số và mẫu số của mỗi % phải cùng đơn vị (giá thị trường)',
    ['ui:portfolio.summary', 'rest:GET /api/categories', 'rest:GET /api/snapshot'],
    () => {
      // AllocationGoals.jsx:40-72 — mỗi danh mục = giá thị trường + số dư sổ,
      // mẫu số là tổng tài sản. Không danh mục nào được lấy tiền kế hoạch
      // làm tử số nữa.
      const sn = d.snapshot;
      const pf = sn.portfolio.byCategory || {};
      const sv = sn.savings.byCategory || {};
      const allocsByCat = F.allocsByCategory(d);

      const rows = d.categories.map((c) => ({
        name: c.name,
        total: (pf[c.name]?.marketValue || 0) + (sv[c.name]?.balance || 0),
      }));
      const sumRows = rows.reduce((s, r) => s + r.total, 0);

      // Mọi phần trăm cộng lại (kể cả lát tiền mặt) đúng bằng 100.
      approx(
        sumRows + sn.cash.total,
        sn.netWorth.total,
        TOL,
        `Σ danh mục (${fmt(sumRows)}) + tiền mặt (${fmt(sn.cash.total)}) ` +
          `≠ tổng tài sản (${fmt(sn.netWorth.total)}) — biểu đồ tròn không cộng thành 100%`
      );

      // Tiền đã chia cho một danh mục nhưng chưa mua gì phải nằm trong lát tiền
      // mặt, không được hiện thành giá trị của danh mục đó.
      const earmarked = rows.filter(
        (r) => r.total === 0 && (allocsByCat[r.name]?.total || 0) > 0
      );
      if (earmarked.length) {
        const sumEarmarked = earmarked.reduce((x, r) => x + allocsByCat[r.name].total, 0);
        ok(
          sn.cash.awaitingInvestment >= sumEarmarked - TOL,
          `${fmt(sumEarmarked)} đã chia cho ${earmarked.map((r) => r.name).join(', ')} ` +
            `nhưng lát tiền mặt chờ lệnh mua chỉ có ${fmt(sn.cash.awaitingInvestment)} — ` +
            `số tiền này biến mất khỏi biểu đồ`
        );
      }
    }
  );

  await t(
    'C15',
    'asset_types.category không được trùng tên với danh mục phân bổ',
    ['rest:GET /api/assets'],
    async () => {
      const assets = await require('../rig/http').getOk('/api/assets');
      const assetCats = [...new Set(assets.map((a) => a.category))];
      const overlap = assetCats.filter((c) => catNames.includes(c));
      if (overlap.length) {
        fail(
          `asset_types.category trùng tên danh mục phân bổ: ${overlap.join(', ')} ` +
            `— hai khái niệm khác nhau không được dùng chung không gian tên.`
        );
      }
      // Ghi nhận giá trị thực tế để giải thích guard chết ở Dashboard.jsx:773
      ok(
        assetCats.length > 0,
        'asset_types.category rỗng — không kiểm được'
      );
    }
  );

  await t(
    'C15b',
    'Không còn điều kiện nào so asset_types.category với tên danh mục phân bổ',
    ['ui:portfolio.summary'],
    async () => {
      const assets = await require('../rig/http').getOk('/api/assets');
      const assetCats = new Set(assets.map((a) => a.category));
      const src = require('fs').readFileSync(
        require('path').join(require('../rig/env').REPO_ROOT, 'src/components/Dashboard.jsx'),
        'utf8'
      );

      // Hai tập giá trị này rời nhau hoàn toàn: asset_types.category chỉ nhận
      // 'Giao dịch'/'Tích trữ', còn categories.name là 5 danh mục phân bổ.
      // Mọi phép so giữa chúng đều là điều kiện chết.
      const deadGuard = /\[[^\]]*'Tiết kiệm & Trái phiếu'[^\]]*\]\s*\.includes\(\s*p\.category\s*\)/;
      if (deadGuard.test(src)) {
        fail(
          `Dashboard vẫn so p.category (giá trị thật: ${[...assetCats].join(', ')}) ` +
            `với danh sách tên danh mục phân bổ (${catNames.join(', ')}). ` +
            `Hai tập rời nhau nên điều kiện không bao giờ đúng.`
        );
      }
    }
  );
}

module.exports = { run };
