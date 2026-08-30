/**
 * guard.js — Ba lớp bảo vệ dữ liệu thật của người dùng.
 *
 *   L1 (trong env.js)  Cô lập đường dẫn: MF_TEST_ROOT phải nằm ngoài repo.
 *   L2 (assertIsolated) Khẳng định danh tính: server đang chạy trên DB nào?
 *   L3 (tripwire)       Dấu vân tay data/financial.sqlite, kiểm lại liên tục.
 *
 * Bất kỳ vi phạm nào cũng dừng toàn bộ tiến trình với exit code 2.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REAL_DB, TEST_ROOT, REPO_ROOT } = require('./env');
const { get } = require('./http');

const EXIT_SAFETY_VIOLATION = 2;

function die(lines) {
  console.error('\n' + '='.repeat(72));
  console.error('⛔ VI PHẠM AN TOÀN — DỪNG TOÀN BỘ');
  console.error('='.repeat(72));
  for (const l of lines) console.error('   ' + l);
  console.error('='.repeat(72) + '\n');
  process.exit(EXIT_SAFETY_VIOLATION);
}

// ───────────────────────── L3: dây bẫy ─────────────────────────

function fingerprint(file) {
  if (!fs.existsSync(file)) return { missing: true };
  const st = fs.statSync(file);
  const sha256 = crypto
    .createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex');
  return { size: st.size, mtimeMs: st.mtimeMs, sha256, missing: false };
}

let baseline = null;

/** Gọi MỘT LẦN ở đầu mọi lần chạy, trước khi khởi động bất cứ thứ gì. */
function armTripwire() {
  baseline = fingerprint(REAL_DB);
  if (baseline.missing) {
    // Không có DB thật thì cũng chẳng có gì để mất — vẫn ghi nhận để phát hiện
    // trường hợp test vô tình TẠO ra nó.
    console.log('[GUARD] Không tìm thấy DB thật (không sao) — bẫy vẫn được đặt.');
  } else {
    console.log(
      `[GUARD] Đã đặt bẫy: data/financial.sqlite ` +
        `${baseline.size} bytes, sha256 ${baseline.sha256.slice(0, 12)}…`
    );
  }
  return baseline;
}

/** Gọi sau mỗi suite và ở cuối. `where` để báo nơi phát hiện. */
function checkTripwire(where = 'kết thúc') {
  if (!baseline) throw new Error('checkTripwire gọi trước armTripwire');
  const now = fingerprint(REAL_DB);

  if (baseline.missing && !now.missing) {
    die([
      `Test đã TẠO RA file DB thật tại: ${REAL_DB}`,
      `Phát hiện tại: ${where}`,
      'Một tiến trình nào đó đang trỏ vào đường dẫn production.',
    ]);
  }
  if (!baseline.missing && now.missing) {
    die([
      `DB THẬT ĐÃ BỊ XOÁ: ${REAL_DB}`,
      `Phát hiện tại: ${where}`,
      `Khôi phục ngay từ bản sao lưu gần nhất.`,
    ]);
  }
  if (!baseline.missing && now.sha256 !== baseline.sha256) {
    die([
      `DB THẬT ĐÃ BỊ THAY ĐỔI: ${REAL_DB}`,
      `Phát hiện tại: ${where}`,
      `sha256 trước: ${baseline.sha256}`,
      `sha256 sau  : ${now.sha256}`,
      `kích thước  : ${baseline.size} → ${now.size} bytes`,
      '',
      'Nguyên nhân thường gặp: có server.js / npm run dev:web đang chạy song song.',
    ]);
  }
  return true;
}

// ───────────────────── L2: khẳng định danh tính ─────────────────────

/**
 * Hình dạng DB thật của người dùng (tính đến lúc viết bộ test).
 * Nếu /api/data/stats trả về thứ GIỐNG cái này, gần như chắc chắn server đang
 * chạy trên DB thật dù đường dẫn có nói gì đi nữa. Chặn ngay.
 */
/** Đổi mọi dấu phân cách về '/' để so sánh hậu tố không phụ thuộc hệ điều hành. */
function toPosix(p) {
  const BACKSLASH = String.fromCharCode(92);
  return String(p).split(BACKSLASH).join('/');
}

const REAL_DB_SHAPE = { txns: 11, monthly: 4, savings: 1, allocs: 8 };

async function assertIsolated({ expectFixture = true } = {}) {
  let health;
  try {
    health = await get('/api/demo/health');
  } catch (e) {
    die([
      `Không gọi được /api/demo/health: ${e.message}`,
      'Server test chưa chạy, hoặc đang chạy một server KHÔNG PHẢI demo-server.js.',
      'Tuyệt đối không chạy test khi chưa xác minh được server đang dùng DB nào.',
    ]);
  }
  if (health.status !== 200 || !health.data || !health.data.db) {
    die([
      `/api/demo/health trả về bất thường (status ${health.status}).`,
      `Nội dung: ${String(health.raw).slice(0, 200)}`,
      'Nghi vấn: cổng này đang bị server khác chiếm (rất có thể là server.js → DB thật).',
    ]);
  }

  const dbPath = path.resolve(health.data.db);
  const realPath = path.resolve(REAL_DB);
  const dataDir = path.resolve(REPO_ROOT, 'data');
  const testRoot = path.resolve(TEST_ROOT);

  // (1) phải nằm trong MF_TEST_ROOT
  if (dbPath !== testRoot && !dbPath.startsWith(testRoot + path.sep)) {
    die([
      'Server KHÔNG chạy trên DB test.',
      `db   = ${dbPath}`,
      `phải nằm trong ${testRoot}`,
    ]);
  }
  // (2) không được là DB thật
  if (dbPath === realPath) {
    die(['Server đang chạy TRỰC TIẾP trên DB thật.', `db = ${dbPath}`]);
  }
  // (3) không được nằm trong data/
  if (dbPath === dataDir || dbPath.startsWith(dataDir + path.sep)) {
    die(['Server đang chạy trên một file trong thư mục data/.', `db = ${dbPath}`]);
  }
  // (4) tên file không được là financial.sqlite
  if (path.basename(dbPath) === 'financial.sqlite') {
    die([
      'Tên file DB là financial.sqlite — quá giống DB thật, từ chối để tránh nhầm.',
      `db = ${dbPath}`,
    ]);
  }
  // (5) giữ hậu tố demo/build/demo.sqlite để tái dùng seed-demo.js / run-scene.js.
  // So sánh trên chuỗi đã chuẩn hoá sang '/' thay vì regex có escape — trên
  // Windows path dùng '\' nên regex rất dễ viết sai mà không ai để ý.
  if (!toPosix(dbPath).endsWith('demo/build/demo.sqlite')) {
    die([
      'Đường dẫn DB không kết thúc bằng demo/build/demo.sqlite.',
      'Hậu tố này bắt buộc để demo/seed/seed-demo.js chấp nhận chạy.',
      `db = ${dbPath}`,
    ]);
  }

  // (6) dấu vân tay dữ liệu — bắt trường hợp đường dẫn nói dối
  if (expectFixture) {
    const stats = await get('/api/data/stats');
    if (stats.status === 200 && stats.data && typeof stats.data === 'object') {
      const s = stats.data;
      const looksReal =
        s.txns === REAL_DB_SHAPE.txns &&
        s.monthly === REAL_DB_SHAPE.monthly &&
        s.savings === REAL_DB_SHAPE.savings &&
        s.allocs === REAL_DB_SHAPE.allocs;
      if (looksReal) {
        die([
          'Dữ liệu trên server TRÙNG KHỚP hình dạng DB thật của người dùng',
          `(${s.txns} giao dịch, ${s.monthly} tháng, ${s.savings} sổ tiết kiệm).`,
          `db báo là: ${dbPath}`,
          'Đường dẫn có thể đang nói dối. Dừng để an toàn.',
        ]);
      }
    }
  }

  console.log(`[GUARD] Cô lập OK — server dùng: ${dbPath}`);
  return health.data;
}

module.exports = {
  armTripwire,
  checkTripwire,
  assertIsolated,
  fingerprint,
  die,
  EXIT_SAFETY_VIOLATION,
};
