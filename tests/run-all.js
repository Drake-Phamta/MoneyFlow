/**
 * run-all.js — Điểm vào duy nhất của bộ kiểm thử.
 *
 *   node tests/run-all.js                  chế độ kiểm toán (mặc định)
 *   node tests/run-all.js --mode=guard     chế độ canh gác
 *   node tests/run-all.js --only=parity    chỉ chạy một nhóm
 *
 * Thứ tự cố định, và mỗi bước đều kiểm lại dây bẫy dữ liệu thật.
 */
const fs = require('fs');
const path = require('path');
const env = require('./rig/env');
const guard = require('./rig/guard');
const server = require('./rig/server');
const assert = require('./rig/assert');
const report = require('./rig/report');
const { ensureFixture } = require('./fixtures/ensure');

const only = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];

// Nhóm không cần server (phân tích tĩnh) chạy trước — rẻ và bắt lỗi sớm.
const STATIC_SUITES = [
  { group: 'parity', file: './parity/P1-ipc-vs-rest' },
];
const SERVER_SUITES = [
  { group: 'parity', file: './parity/P2-signatures' },
  { group: 'consistency', file: './consistency/C01-categories' },
  { group: 'consistency', file: './consistency/C02-networth' },
  { group: 'consistency', file: './consistency/C03-cash-savings' },
  { group: 'consistency', file: './consistency/C04-integrity' },
];

function loadMatrix() {
  const p = path.join(__dirname, 'coverage-matrix.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error('[RIG] coverage-matrix.json hỏng:', e.message);
    return null;
  }
}

function wanted(s) {
  return !only || s.group === only;
}

/**
 * Chặn vĩnh viễn việc bộ test quay lại đánh vào cổng mặc định của server thật.
 * Cổng viết dưới dạng ghép chuỗi để chính tệp này không tự khớp.
 */
const PROD_PORT = '30' + '01';

function lintPorts() {
  const needle = new RegExp(`(localhost|127\\.0\\.0\\.1):${PROD_PORT}`);
  const bad = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      // legacy/ đã có _guard.js chặn riêng; reports/ là kết quả sinh ra.
      if (e.name === 'legacy' || e.name === 'reports' || e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) {
        if (needle.test(fs.readFileSync(p, 'utf8'))) {
          bad.push(path.relative(env.REPO_ROOT, p));
        }
      }
    }
  };
  walk(__dirname);
  if (bad.length) {
    guard.die([
      `Có tệp test trỏ vào cổng ${PROD_PORT} — cổng của server chạy trên DB THẬT:`,
      ...bad.map((b) => '  ' + b),
      `Mọi test phải dùng env.BASE (cổng ${env.PORT}) qua tests/rig/http.js.`,
    ]);
  }
  console.log(`[RIG] Không tệp test nào trỏ vào cổng ${PROD_PORT}.`);
}

(async () => {
  console.log('='.repeat(72));
  console.log(`MONEY FLOW — BỘ KIỂM THỬ   (chế độ: ${assert.MODE})`);
  console.log('='.repeat(72));

  const before = guard.armTripwire();
  lintPorts();

  for (const s of STATIC_SUITES.filter(wanted)) {
    await require(s.file).run();
    guard.checkTripwire(`sau ${s.file}`);
  }

  const needServer = SERVER_SUITES.filter(wanted).length > 0;
  if (needServer) {
    await ensureFixture();
    await server.start();
    await guard.assertIsolated({ expectFixture: false });

    for (const s of SERVER_SUITES.filter(wanted)) {
      await require(s.file).run();
      guard.checkTripwire(`sau ${s.file}`);
    }
  }

  const counts = assert.summary();
  guard.checkTripwire('kết thúc');
  const after = guard.fingerprint(env.REAL_DB);

  const cov = report.writeAll(assert.state, counts, loadMatrix(), {
    mode: assert.MODE,
    fingerprintBefore: before.sha256,
    fingerprintAfter: after.sha256,
  });

  const pct = cov.total ? ((cov.covered / cov.total) * 100).toFixed(1) : '0.0';
  console.log(`  📊 Độ phủ         ${cov.covered}/${cov.total} (${pct}%)`);
  if (cov.uncovered.length) {
    console.log(`  ⚠️  Chưa phủ       ${cov.uncovered.length} tính năng`);
  }
  console.log(`\n  Báo cáo: tests/reports/BAO-CAO-KIEM-TOAN.md`);
  console.log(`           tests/reports/coverage.md`);
  console.log(
    `\n  🔒 DB thật: ${before.sha256 === after.sha256 ? 'NGUYÊN VẸN' : 'ĐÃ THAY ĐỔI (!!)'}\n`
  );

  server.stop();

  // Chế độ canh gác: lỗi đã biết cũng là lỗi. Chế độ kiểm toán: chỉ lỗi ngoài dự kiến.
  const failed = counts.fail > 0;
  const gaps = assert.MODE === 'guard' && cov.uncovered.length > 0;
  process.exit(failed || gaps ? 1 : 0);
})().catch((e) => {
  console.error(e);
  server.stop();
  process.exit(1);
});
