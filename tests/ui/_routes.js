/**
 * _routes.js — Bảng route và ánh xạ sang các tính năng `ui:` mà mỗi route phủ.
 *
 * Danh sách route lấy từ demo/record/probe.js:20-34, đổi sang địa chỉ của rig.
 *
 * Phần `covers` KHÔNG gõ tay: nó suy ra từ inventory — mỗi route khai báo mình
 * mount những component nào, rồi lấy mọi lời gọi `apiClient.<ns>.<fn>` mà các
 * component đó thực hiện. Thêm một lời gọi API mới vào component là nó tự vào
 * danh sách phủ, không phải nhớ cập nhật ở đây.
 */
const inv = require('../rig/inventory');

/** route → những component thực sự được mount khi mở route đó. */
const ROUTES = [
  {
    id: 'dashboard',
    hash: '/',
    label: 'Tổng quan',
    components: ['src/components/Dashboard.jsx', 'src/components/charts/AllocationPie.jsx'],
  },
  {
    id: 'cashflow',
    hash: '/cashflow',
    label: 'Dòng tiền — biểu đồ',
    components: ['src/components/CashFlowPage.jsx'],
  },
  {
    id: 'ledger',
    hash: '/cashflow',
    label: 'Dòng tiền — sổ cái',
    components: ['src/components/MasterLedger.jsx'],
    afterLoad: 'openLedger',
  },
  {
    id: 'wizard',
    hash: '/cashflow',
    label: 'Dòng tiền — wizard nhập liệu',
    components: ['src/components/MonthlyEntry.jsx'],
    afterLoad: 'openWizard',
  },
  {
    id: 'invest-portfolio',
    hash: '/investments?tab=portfolio',
    label: 'Đầu tư — Giao dịch',
    components: ['src/components/InvestmentsPage.jsx', 'src/components/ExecutionLog.jsx'],
  },
  {
    id: 'invest-savings',
    hash: '/investments?tab=savings',
    label: 'Đầu tư — Tiết kiệm',
    components: ['src/components/SavingsSection.jsx'],
  },
  {
    id: 'invest-sniper',
    hash: '/investments?tab=sniper',
    label: 'Đầu tư — Bắn Tỉa',
    components: ['src/components/SniperPlaybook.jsx'],
  },
  {
    id: 'invest-allocation',
    hash: '/investments?tab=allocation',
    label: 'Đầu tư — Phân bổ',
    components: ['src/components/dashboard/AllocationGoals.jsx'],
  },
  {
    id: 'scenarios',
    hash: '/scenarios',
    label: 'Kịch bản',
    components: ['src/components/Scenarios.jsx'],
  },
  {
    id: 'settings',
    hash: '/settings',
    label: 'Cài đặt',
    components: ['src/components/Settings.jsx'],
  },
  {
    id: 'networth-modal',
    hash: '/',
    label: 'Tổng quan — cửa sổ tài sản ròng',
    components: ['src/components/charts/NetWorthModal.jsx'],
    afterLoad: 'openNetWorth',
  },
  {
    id: 'asset-modal',
    hash: '/',
    label: 'Tổng quan — cửa sổ chi tiết tài sản',
    components: ['src/components/charts/AssetDetailModal.jsx'],
    afterLoad: 'openAssetDetail',
  },
];

/** Mọi `ui:` id mà các component của route này gọi tới. */
function coversFor(route, uiUsages) {
  const ids = [];
  for (const u of uiUsages) {
    if (u.files.some((f) => route.components.includes(f))) ids.push(u.id);
  }
  return ids;
}

/** Bảng route đã gắn sẵn danh sách phủ. */
function routes() {
  const uiUsages = inv.uiUsages();
  return ROUTES.map((r) => ({ ...r, covers: coversFor(r, uiUsages) }));
}

module.exports = { routes, ROUTES };

if (require.main === module) {
  const rs = routes();
  const seen = new Set();
  for (const r of rs) {
    console.log(`${r.id.padEnd(20)} ${String(r.covers.length).padStart(2)} tính năng  ${r.hash}`);
    r.covers.forEach((c) => seen.add(c));
  }
  const all = inv.uiUsages().map((u) => u.id);
  const missed = all.filter((id) => !seen.has(id));
  console.log(`\nPhủ ${seen.size}/${all.length} tính năng ui:`);
  if (missed.length) console.log('Chưa gán route:', missed.join(', '));
}
