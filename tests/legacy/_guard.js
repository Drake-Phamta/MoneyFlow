/**
 * _guard.js — Khu cách ly cho bộ test cũ.
 *
 * Sáu tệp trong thư mục này đều hardcode http://localhost:3001, tức là cổng của
 * server chạy trên data/financial.sqlite — DỮ LIỆU THẬT của người dùng. Và
 * chúng không chỉ đọc:
 *
 *   test-42-cases.js     gọi DELETE /api/data/all bốn lần (dòng 99, 217, 321, 353)
 *   test-e2e.js          xoá sạch giao dịch + tiết kiệm + nhập liệu ở dòng 31-33
 *   test-consistency.js  xoá theo id cứng, gồm cả /api/transactions/1
 *   test-api.js          gọi /api/timeline/regenerate {12 tháng} → cắt cụt lộ trình
 *   test-all-features.js như trên, thêm việc ghi tài sản rác
 *   test-frontend.js     Puppeteer vào cổng 5173, Vite proxy thẳng sang 3001
 *
 * Nội dung nghiệp vụ của chúng đã được chuyển sang tests/api/ và tests/consistency/
 * để chạy trên DB cô lập. Giữ lại đây làm tham chiếu, nhưng chặn không cho chạy.
 *
 * Nếu thật sự cần chạy (ví dụ để đối chiếu), phải:
 *   1. Khởi động demo-server trên DB scratch ở cổng khác:  npm run test:rig:up
 *   2. Sửa BASE trong tệp đó sang cổng ấy
 *   3. Đặt MF_ALLOW_DESTRUCTIVE=1
 */
if (process.env.MF_ALLOW_DESTRUCTIVE !== '1') {
  console.error('\n' + '='.repeat(72));
  console.error('⛔ TỪ CHỐI CHẠY TEST CŨ');
  console.error('='.repeat(72));
  console.error('   Tệp này trỏ vào cổng 3001 và có thao tác XOÁ dữ liệu.');
  console.error('   Nếu server thật đang chạy ở đó, nó sẽ xoá dữ liệu tài chính');
  console.error('   thật của bạn — không có bước hỏi lại, không hoàn tác được.');
  console.error('');
  console.error('   Dùng bộ test mới thay thế:   npm test');
  console.error('='.repeat(72) + '\n');
  process.exit(2);
}

const marker = String(process.env.MF_TEST_BASE || '');
if (marker.includes(':3001')) {
  console.error('\n⛔ MF_TEST_BASE vẫn trỏ vào cổng 3001. Từ chối chạy.\n');
  process.exit(2);
}

console.warn(
  '\n⚠️  Đang chạy test cũ ở chế độ cho phép xoá dữ liệu. ' +
    'Hãy chắc chắn cổng 3001 KHÔNG phải server chạy trên DB thật.\n'
);
