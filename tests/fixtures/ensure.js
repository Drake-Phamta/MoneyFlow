/**
 * ensure.js — Bảo đảm có fixture tất định tại MF_TEST_ROOT/fixtures/base.sqlite.
 *
 * Ưu tiên 1: chép từ demo/build/db-snapshots/after-00-seeded.sqlite (chỉ ĐỌC).
 *            Đây là ảnh chụp 18 tháng + giao dịch + 4 sổ tiết kiệm + watchlist,
 *            sinh bởi demo/seed/seed-demo.js với PRNG cố định nên bất biến.
 * Ưu tiên 2: khởi động server rồi chạy demo/seed/seed-demo.js qua HTTP.
 * Ưu tiên 3: DB rỗng do FinancialDB tự seedDefaults() — vẫn hợp lệ để test.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const env = require('../rig/env');

function log(...a) {
  console.log('[FIXTURE]', ...a);
}

async function ensureFixture({ allowSeed = true } = {}) {
  fs.mkdirSync(env.FIXTURE_DIR, { recursive: true });

  if (fs.existsSync(env.FIXTURE_DB)) {
    const size = fs.statSync(env.FIXTURE_DB).size;
    log(`Đã có: ${env.FIXTURE_DB} (${size} bytes)`);
    return { source: 'cached', path: env.FIXTURE_DB };
  }

  if (fs.existsSync(env.REPO_SNAPSHOT)) {
    fs.copyFileSync(env.REPO_SNAPSHOT, env.FIXTURE_DB);
    log(`Chép từ ảnh chụp repo: ${path.basename(env.REPO_SNAPSHOT)}`);
    return { source: 'snapshot', path: env.FIXTURE_DB };
  }

  if (!allowSeed) {
    log('Không có ảnh chụp, bỏ qua seed → dùng DB rỗng tự seedDefaults().');
    return { source: 'empty', path: null };
  }

  log('Không có ảnh chụp — sinh fixture bằng demo/seed/seed-demo.js…');
  const server = require('../rig/server');
  const { reset } = require('../rig/reset');
  await server.start();

  // seed-demo.js chặn nếu health.db không kết thúc bằng demo/build/demo.sqlite.
  // env.DEMO_DB đã được đặt đúng hậu tố nên nó chấp nhận mà không phải sửa source.
  await new Promise((resolve, reject) => {
    const p = spawn(
      process.execPath,
      [path.join(env.REPO_ROOT, 'demo', 'seed', 'seed-demo.js')],
      { cwd: env.REPO_ROOT, env: env.serverEnv(), stdio: 'inherit' }
    );
    p.on('exit', (c) =>
      c === 0 ? resolve() : reject(new Error(`seed-demo.js thoát mã ${c}`))
    );
  });

  fs.copyFileSync(env.DEMO_DB, env.FIXTURE_DB);
  log(`Đã sinh và lưu fixture: ${env.FIXTURE_DB}`);
  return { source: 'seeded', path: env.FIXTURE_DB };
}

module.exports = { ensureFixture };

if (require.main === module) {
  const { armTripwire, checkTripwire } = require('../rig/guard');
  armTripwire();
  ensureFixture()
    .then((r) => {
      checkTripwire('sau khi tạo fixture');
      console.log('[FIXTURE] Nguồn:', r.source);
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
