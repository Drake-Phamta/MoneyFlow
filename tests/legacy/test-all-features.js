require('./_guard');
const http = require('http');

const BASE = 'http://localhost:3001';
let passed = 0, failed = 0, skipped = 0;
const results = [];

function request(method, path, body) {
  return new Promise((resolve) => {
    const url = new URL(BASE + path);
    const opts = { method, hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers: { 'Content-Type': 'application/json' } };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data, parseError: true }); }
      });
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test(method, path, body, validate, desc, category) {
  const res = await request(method, path, body);
  if (res.error) { failed++; results.push({ category, desc, status: '❌', detail: res.error }); return null; }
  try {
    const ok = validate(res);
    if (ok) { passed++; results.push({ category, desc, status: '✅', detail: '' }); return res.data; }
    else { failed++; results.push({ category, desc, status: '❌', detail: 'validation failed' }); return null; }
  } catch (e) { failed++; results.push({ category, desc, status: '❌', detail: e.message }); return null; }
}

async function run() {
  console.log('=== MONEY_FLOW FULL FEATURE TEST ===\n');

  // ═══════════════════════════════════════
  // 1. HỆ THỐNG & CẤU HÌNH
  // ═══════════════════════════════════════
  console.log('1. HỆ THỐNG & CẤU HÌNH');
  await test('GET', '/api/params', null, r => Array.isArray(r.data) && r.data.length > 0, 'Tham số hệ thống', 'Config');
  await test('PUT', '/api/params', { key: 'DEFAULT_INFLOW', value: '3700000' }, r => r.status === 200, 'Cập nhật tham số', 'Config');
  await test('GET', '/api/params/avg-expense', null, r => r.status === 200, 'Chi tiêu trung bình', 'Config');
  await test('GET', '/api/categories', null, r => Array.isArray(r.data) && r.data.length >= 5, 'Danh mục (5 loại)', 'Config');
  await test('GET', '/api/phases', null, r => Array.isArray(r.data) && r.data.length >= 4, 'Giai đoạn (4 phases)', 'Config');
  await test('GET', '/api/phases/active', null, r => r.data && r.data.id, 'Giai đoạn hiện tại', 'Config');
  await test('POST', '/api/phases/2/active', null, r => r.status === 200, 'Chuyển giai đoạn', 'Config');
  await test('POST', '/api/phases/1/active', null, r => r.status === 200, 'Khôi phục giai đoạn', 'Config');

  // ═══════════════════════════════════════
  // 2. QUẢN LÝ TÀI SẢN
  // ═══════════════════════════════════════
  console.log('\n2. QUẢN LÝ TÀI SẢN');
  await test('GET', '/api/assets', null, r => Array.isArray(r.data) && r.data.length >= 5, 'Danh sách tài sản', 'Assets');
  await test('POST', '/api/assets', { name: 'Test_CP', ticker: 'TCP', unit: 'CP', category: 'Giao dịch' }, r => r.status === 200, 'Thêm tài sản mới', 'Assets');
  await test('PUT', '/api/assets/1/price', { price: 25000 }, r => r.status === 200, 'Cập nhật giá', 'Assets');
  await test('GET', '/api/catalog', null, r => r.status === 200, 'Catalog tài sản', 'Assets');
  await test('PUT', '/api/assets/1/tracked', { tracked: true }, r => r.status === 200, 'Theo dõi tài sản', 'Assets');

  // ═══════════════════════════════════════
  // 3. DÒNG TIỀN HÀNG THÁNG
  // ═══════════════════════════════════════
  console.log('\n3. DÒNG TIỀN HÀNG THÁNG');
  await test('GET', '/api/monthly', null, r => Array.isArray(r.data), 'Danh sách tháng', 'Monthly');
  await test('GET', '/api/monthly/filled', null, r => Array.isArray(r.data), 'Tháng đã nhập', 'Monthly');
  await test('GET', '/api/monthly/next', null, r => r.status === 200, 'Tháng tiếp theo', 'Monthly');
  const month = await test('POST', '/api/monthly', { month_index: 1, month_label: 'T1/2026', income: 15000000, expense: 8000000, bonus: 0, total_inflow: 15000000 }, r => r.status === 200, 'Lưu dòng tiền tháng', 'Monthly');
  await test('GET', '/api/monthly/1', null, r => r.status === 200, 'Xem chi tiết tháng', 'Monthly');

  // ═══════════════════════════════════════
  // 4. PHÂN BỔ DANH MỤC
  // ═══════════════════════════════════════
  console.log('\n4. PHÂN BỔ DANH MỤC');
  await test('GET', '/api/allocations/1', null, r => Array.isArray(r.data), 'Phân bổ tháng 1', 'Alloc');
  await test('POST', '/api/allocations/1', { allocations: [{ category_id: 1, planned_amount: 3000000, actual_amount: 3000000 }, { category_id: 2, planned_amount: 5000000, actual_amount: 5000000 }] }, r => r.status === 200, 'Lưu phân bổ', 'Alloc');
  await test('POST', '/api/allocations/adjust', { discrepancyAmount: 100000 }, r => r.status === 200, 'Điều chỉnh chênh lệch', 'Alloc');
  await test('GET', '/api/phases/1/allocations', null, r => Array.isArray(r.data), 'Phân bổ giai đoạn', 'Alloc');

  // ═══════════════════════════════════════
  // 5. GIAO DỊCH CHỨNG KHOÁN
  // ═══════════════════════════════════════
  console.log('\n5. GIAO DỊCH CHỨNG KHOÁN');
  await test('GET', '/api/transactions', null, r => Array.isArray(r.data), 'Danh sách giao dịch', 'Trans');
  await test('POST', '/api/transactions', { asset_type_id: 31, type: 'buy', quantity: 10, price: 35000, total_amount: 350000, date: '2026-05-01', notes: 'Mua test' }, r => r.status === 200, 'Mua chứng khoán', 'Trans');
  await test('POST', '/api/transactions', { asset_type_id: 31, type: 'sell', quantity: 5, price: 36000, total_amount: 180000, date: '2026-05-15', notes: 'Bán test' }, r => r.status === 200, 'Bán chứng khoán', 'Trans');
  await test('GET', '/api/transactions', null, r => r.data.length >= 2, 'Xác nhận giao dịch', 'Trans');

  // ═══════════════════════════════════════
  // 6. DANH MỤC ĐẦU TƯ
  // ═══════════════════════════════════════
  console.log('\n6. DANH MỤC ĐẦU TƯ');
  await test('GET', '/api/portfolio', null, r => Array.isArray(r.data), 'Danh mục đầu tư', 'Portfolio');
  await test('GET', '/api/portfolio/summary', null, r => r.data && typeof r.data.totalInvested === 'number', 'Tóm tắt danh mục', 'Portfolio');

  // ═══════════════════════════════════════
  // 7. TIẾT KIỆM
  // ═══════════════════════════════════════
  console.log('\n7. TIẾT KIỆM');
  await test('GET', '/api/savings', null, r => Array.isArray(r.data), 'Danh sách sổ tiết kiệm', 'Savings');
  await test('GET', '/api/savings/summary', null, r => r.status === 200, 'Tóm tắt tiết kiệm', 'Savings');
  await test('GET', '/api/savings/overview', null, r => r.status === 200, 'Tổng quan tiết kiệm', 'Savings');
  await test('GET', '/api/savings/maturities', null, r => r.status === 200, 'Sổ sắp đáo hạn', 'Savings');
  const sav = await test('POST', '/api/savings', { name: 'Test Savings', bank: 'VCB', account_type: 'term', interest_rate: 5.5, term_months: 6, principal: 10000000, start_date: '2026-01-01' }, r => r.status === 200, 'Tạo sổ tiết kiệm', 'Savings');
  if (sav && sav.id) {
    await test('GET', `/api/savings/${sav.id}`, null, r => r.data && r.data.id, 'Xem chi tiết sổ', 'Savings');
    await test('POST', `/api/savings/${sav.id}/transactions`, { type: 'deposit', amount: 5000000, date: '2026-02-01', note: 'Bơm vốn' }, r => r.status === 200, 'Bơm vốn vào sổ', 'Savings');
    await test('PUT', `/api/savings/${sav.id}`, { interest_rate: 6.0 }, r => r.status === 200, 'Cập nhật sổ', 'Savings');
    await test('DELETE', `/api/savings/${sav.id}`, null, r => r.status === 200, 'Xóa sổ tiết kiệm', 'Savings');
  }

  // ═══════════════════════════════════════
  // 8. WATCHLIST & BẮN TỈA
  // ═══════════════════════════════════════
  console.log('\n8. WATCHLIST & BẮN TỈA');
  await test('GET', '/api/watchlist', null, r => Array.isArray(r.data), 'Danh sách theo dõi', 'Watchlist');
  await test('POST', '/api/watchlist', { asset_type_id: 31, target_price: 30000, stop_loss: 20000 }, r => r.status === 200, 'Thêm vào watchlist', 'Watchlist');
  await test('PUT', '/api/watchlist/31', { target_price: 28000 }, r => r.status === 200, 'Cập nhật watchlist', 'Watchlist');

  // ═══════════════════════════════════════
  // 9. CẢNH BÁO
  // ═══════════════════════════════════════
  console.log('\n9. CẢNH BÁO');
  await test('GET', '/api/alerts', null, r => Array.isArray(r.data), 'Danh sách cảnh báo', 'Alerts');
  await test('GET', '/api/alerts?unread=true', null, r => Array.isArray(r.data), 'Cảnh báo chưa đọc', 'Alerts');
  await test('GET', '/api/alerts/count', null, r => r.data && typeof r.data.count === 'number', 'Số cảnh báo', 'Alerts');
  await test('PUT', '/api/alerts/read-all', null, r => r.status === 200, 'Đánh dấu đã đọc', 'Alerts');

  // ═══════════════════════════════════════
  // 10. GIÁ & LỊCH SỬ
  // ═══════════════════════════════════════
  console.log('\n10. GIÁ & LỊCH SỬ');
  await test('GET', '/api/price-history/31', null, r => Array.isArray(r.data), 'Lịch sử giá', 'Prices');
  await test('POST', '/api/prices/refresh', null, r => r.data && typeof r.data.fetched === 'number', 'Đồng bộ giá', 'Prices');

  // ═══════════════════════════════════════
  // 11. TIMELINE
  // ═══════════════════════════════════════
  console.log('\n11. TIMELINE');
  await test('POST', '/api/timeline/regenerate', { totalMonths: 12, startMonth: 1, startYear: 2026 }, r => r.status === 200, 'Tạo timeline', 'Timeline');

  // ═══════════════════════════════════════
  // 12. HOẠT ĐỘNG
  // ═══════════════════════════════════════
  console.log('\n12. HOẠT ĐỘNG');
  await test('GET', '/api/activity', null, r => Array.isArray(r.data), 'Nhật ký hoạt động', 'Activity');

  // ═══════════════════════════════════════
  // 13. IMPORT/EXPORT
  // ═══════════════════════════════════════
  console.log('\n13. IMPORT/EXPORT');
  await test('GET', '/api/data/stats', null, r => r.status === 200, 'Thống kê dữ liệu', 'Data');
  await test('GET', '/api/export/excel', null, r => r.status === 200, 'Export Excel', 'Data');
  await test('GET', '/api/database/download', null, r => r.status === 200, 'Tải database', 'Data');

  // ═══════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log('KẾT QUẢ TEST TOÀN BỘ HỆ THỐNG');
  console.log('═'.repeat(60));

  const categories = {};
  for (const r of results) {
    if (!categories[r.category]) categories[r.category] = { passed: 0, failed: 0, items: [] };
    if (r.status === '✅') categories[r.category].passed++;
    else categories[r.category].failed++;
    categories[r.category].items.push(r);
  }

  for (const [cat, data] of Object.entries(categories)) {
    const icon = data.failed === 0 ? '✅' : '⚠️';
    console.log(`\n${icon} ${cat}: ${data.passed}/${data.passed + data.failed} passed`);
    for (const item of data.items) {
      if (item.status === '❌') {
        console.log(`   ${item.status} ${item.desc} — ${item.detail}`);
      }
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`TỔNG: ${passed} ✅ | ${failed} ❌ | ${skipped} ⏭️`);
  console.log(`${'═'.repeat(60)}`);
}

run().catch(console.error);
