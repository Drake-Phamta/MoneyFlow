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
const { post } = require('./http');

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

/** Xoá sạch về DB rỗng (FinancialDB tự seed lại khi khởi tạo). */
async function resetEmpty() {
  if (fs.existsSync(env.DEMO_DB)) fs.unlinkSync(env.DEMO_DB);
  const r = await post('/api/demo/reload-db');
  if (r.status !== 200) {
    throw new Error(`reload-db (empty) thất bại: ${r.status}`);
  }
  return true;
}

module.exports = { reset, resetEmpty };
