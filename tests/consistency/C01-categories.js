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
const { group, t, fail, ok, fmt } = require('../rig/assert');
const { reset } = require('../rig/reset');
const F = require('./_formulas');

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
    },
    {
      knownFail:
        "database.js:1547,1556 _getAssetAllocationCategory trả 'Đầu Tư' cho " +
        "stock/etf, nhưng seed + migrateToV5 đặt tên danh mục là 'Chứng Khoán'.",
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
    },
    {
      knownFail:
        'Dashboard.jsx:917 lọc CATEGORY_META theo byCategory[meta.name]; ' +
        "meta.name='Đầu Tư' còn danh mục thật tên 'Chứng Khoán'.",
    }
  );

  await t(
    'C1c',
    'Tab Phân bổ: tử số và mẫu số của mỗi % phải cùng đơn vị (giá thị trường)',
    ['ui:portfolio.summary', 'rest:GET /api/categories'],
    () => {
      // AllocationGoals.jsx:74-81
      const byCategory = d.summary.byCategory || {};
      const allocsByCat = F.allocsByCategory(d);
      const baseTotal = F.netWorth_AllocationGoals(d); // Σ byCategory.currentTotal

      const mixed = [];
      for (const c of d.categories) {
        const fromMarket = byCategory[c.name]; // giá thị trường
        const fromPlan = allocsByCat[c.name]; // tiền đã phân bổ (kế hoạch)
        if (!fromMarket && fromPlan && fromPlan.total > 0) {
          mixed.push(
            `"${c.name}": tử số ${fmt(fromPlan.total)} (tiền phân bổ) / ` +
              `mẫu số ${fmt(baseTotal)} (giá thị trường) = ` +
              `${((fromPlan.total / baseTotal) * 100).toFixed(1)}%`
          );
        }
      }
      if (mixed.length) {
        fail(
          `${mixed.length} danh mục có phần trăm trộn hai đơn vị:\n      ` +
            mixed.join('\n      ')
        );
      }
    },
    {
      knownFail:
        'AllocationGoals.jsx:78-80 — byCategory[c.name] undefined nên rơi về ' +
        'allocsByCategory[c.name].total (VNĐ kế hoạch), còn baseTotal ở :63 là ' +
        'giá thị trường.',
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
