/**
 * env.js — Giải quyết mọi đường dẫn & cổng cho bộ test, từ biến môi trường.
 *
 * Nguyên tắc: KHÔNG đặt `FOO=bar node ...` trong npm script (trên Windows npm
 * gọi cmd.exe, cú pháp đó là lỗi cú pháp). Mọi env được giải ở đây rồi truyền
 * xuống tiến trình con qua spawn({ env }).
 */
const path = require('path');
const os = require('os');

const REPO_ROOT = path.resolve(__dirname, '../..');
const REAL_DB = path.join(REPO_ROOT, 'data', 'financial.sqlite');

// Gốc scratch — mặc định %LOCALAPPDATA%\MoneyFlowTest, luôn NGOÀI repo.
const TEST_ROOT = path.resolve(
  process.env.MF_TEST_ROOT ||
    path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'MoneyFlowTest')
);

// Chốt chặn #1: gốc test không được nằm trong repo.
// Nếu lọt, mọi thứ bên dưới (kể cả --emptyOutDir của vite) có thể xoá file dự án.
if (
  TEST_ROOT === REPO_ROOT ||
  TEST_ROOT.startsWith(REPO_ROOT + path.sep)
) {
  console.error(
    `\n[RIG] TỪ CHỐI CHẠY: MF_TEST_ROOT nằm trong repo.\n` +
      `      MF_TEST_ROOT = ${TEST_ROOT}\n` +
      `      REPO_ROOT    = ${REPO_ROOT}\n` +
      `      Hãy trỏ MF_TEST_ROOT ra ngoài thư mục dự án.\n`
  );
  process.exit(2);
}

const PORT = Number(process.env.MF_TEST_PORT || 3111);

// Hậu tố demo/build/demo.sqlite là BẮT BUỘC: demo/seed/seed-demo.js và
// demo/record/run-scene.js đều chặn bằng regex /demo[\/]build[\/]demo\.sqlite$/
// trên health.db. Giữ đúng hậu tố để tái dùng chúng mà không sửa source.
const DEMO_DB = path.join(TEST_ROOT, 'demo', 'build', 'demo.sqlite');
const DEMO_DIST = path.join(TEST_ROOT, 'demo', 'build', 'dist');
const SCRATCH_BUILD = path.join(TEST_ROOT, 'demo', 'build');
const FIXTURE_DIR = path.join(TEST_ROOT, 'fixtures');
const FIXTURE_DB = path.join(FIXTURE_DIR, 'base.sqlite');
const REPORT_DIR = path.join(REPO_ROOT, 'tests', 'reports');

const BASE = process.env.MF_TEST_BASE || `http://localhost:${PORT}`;

// Fixture gốc trong repo (chỉ ĐỌC, không bao giờ ghi vào đây).
const REPO_SNAPSHOT = path.join(
  REPO_ROOT,
  'demo',
  'build',
  'db-snapshots',
  'after-00-seeded.sqlite'
);

/** Env truyền cho demo-server.js. */
function serverEnv() {
  return {
    ...process.env,
    MF_DEMO_DB: DEMO_DB,
    MF_DEMO_DIST: DEMO_DIST,
    MF_DEMO_BASE: BASE,
    PORT: String(PORT),
  };
}

module.exports = {
  REPO_ROOT,
  REAL_DB,
  TEST_ROOT,
  PORT,
  BASE,
  DEMO_DB,
  DEMO_DIST,
  SCRATCH_BUILD,
  FIXTURE_DIR,
  FIXTURE_DB,
  REPORT_DIR,
  REPO_SNAPSHOT,
  serverEnv,
};
