/**
 * reset.js — Đưa DB test về trạng thái fixture gốc.
 *
 * HAI BƯỚC, cả hai đều bắt buộc:
 *   1. copy fixture → MF_DEMO_DB
 *   2. POST /api/demo/reload-db
 *
 * Thiếu bước 2 là vô nghĩa: FinancialDB giữ toàn bộ DB trong RAM và save() ghi
 * đè cả file, nên lần ghi kế tiếp sẽ khôi phục lại đúng trạng thái vừa xoá.
 * (demo-server.js:64-67 giải thích chính xác cái bẫy này.)
 */
const fs = require('fs');
const env = require('./env');
const { post, del } = require('./http');

async function reset() {
  if (!fs.existsSync(env.FIXTURE_DB)) {
    throw new Error(
      `Chưa có fixture: ${env.FIXTURE_DB} — chạy tests/fixtures/ensure.js trước.`
    );
  }
  fs.copyFileSync(env.FIXTURE_DB, env.DEMO_DB);
  const r = await post('/api/demo/reload-db');
  if (r.status !== 200 || !r.data || !r.data.ok) {
    throw new Error(
      `reload-db thất bại (${r.status}): ${String(r.raw).slice(0, 200)}`
    );
  }
  return true;
}

/**
 * Đưa về trạng thái người dùng mới: chưa có tháng, giao dịch hay sổ tiết kiệm
 * nào, nhưng vẫn còn danh mục và các giai đoạn.
 *
 * Dùng DELETE /api/data/all chứ KHÔNG xoá file DB: server giữ toàn bộ DB trong
 * RAM, xoá file rồi bảo nó đọc lại là bảo nó đọc một file không còn tồn tại.
 */
async function resetEmpty() {
  await reset();
  const r = await del('/api/data/all');
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`Không xoá được dữ liệu (${r.status}): ${String(r.raw).slice(0, 160)}`);
  }
  return true;
}

module.exports = { reset, resetEmpty };
