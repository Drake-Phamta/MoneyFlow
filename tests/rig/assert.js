/**
 * assert.js — Khung test tối giản, không phụ thuộc thư viện ngoài.
 *
 * Khác với một test-runner thông thường ở một điểm: mỗi test PHẢI khai báo nó
 * phủ những "feature id" nào. Nhờ đó `run-all.js` có thể trả lời câu hỏi
 * "đã phủ 100% chưa" bằng dữ liệu chứ không bằng cảm tính.
 *
 *   t('API-MON-04', 'mô tả', ['rest:POST /api/monthly'], async () => { ... })
 *
 * Test được đánh dấu KNOWN_FAIL là test mô tả một lỗi ĐANG tồn tại:
 *   --mode=audit  → fail của nó là "phát hiện", không làm hỏng build
 *   --mode=guard  → fail của nó là regression, build đỏ
 */
const MODE = (() => {
  const a = process.argv.find((x) => x.startsWith('--mode='));
  return a ? a.split('=')[1] : 'audit';
})();

const state = {
  groups: [],
  current: null,
  results: [],
  coverage: new Map(), // featureId -> [{testId, status}]
};

function group(name) {
  state.current = { name, tests: [] };
  state.groups.push(state.current);
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}`);
}

function recordCoverage(covers, testId, status) {
  for (const f of covers || []) {
    if (!state.coverage.has(f)) state.coverage.set(f, []);
    state.coverage.get(f).push({ testId, status });
  }
}

/**
 * @param {string} id       mã test, ví dụ 'API-MON-04'
 * @param {string} desc     mô tả tiếng Việt
 * @param {string[]} covers danh sách feature id được phủ
 * @param {Function} fn     thân test; ném lỗi = fail
 * @param {object} opts     { knownFail?: string }  lý do đang hỏng
 */
async function t(id, desc, covers, fn, opts = {}) {
  const started = Date.now();
  const rec = {
    id,
    desc,
    covers: covers || [],
    group: state.current ? state.current.name : '(chưa nhóm)',
    knownFail: opts.knownFail || null,
  };
  try {
    await fn();
    rec.status = 'pass';
    // Một KNOWN_FAIL mà lại pass nghĩa là lỗi đã được sửa → nhắc gỡ nhãn.
    if (rec.knownFail) {
      rec.status = 'fixed';
      console.log(`  🎉 ${id}: ${desc}`);
      console.log(`      (đã sửa — gỡ nhãn KNOWN_FAIL: ${rec.knownFail})`);
    } else {
      console.log(`  ✅ ${id}: ${desc}`);
    }
  } catch (e) {
    rec.error = e && e.message ? e.message : String(e);
    if (rec.knownFail) {
      rec.status = MODE === 'guard' ? 'fail' : 'known';
      const icon = MODE === 'guard' ? '❌' : '🔎';
      console.log(`  ${icon} ${id}: ${desc}`);
      console.log(`      phát hiện: ${rec.error}`);
      console.log(`      lỗi đã biết: ${rec.knownFail}`);
    } else {
      rec.status = 'fail';
      console.log(`  ❌ ${id}: ${desc}`);
      console.log(`      ${rec.error}`);
    }
  }
  rec.ms = Date.now() - started;
  state.results.push(rec);
  if (state.current) state.current.tests.push(rec);
  recordCoverage(rec.covers, id, rec.status);
  return rec;
}

// ───────────────────────── assertion helpers ─────────────────────────

function fail(msg) {
  throw new Error(msg);
}

function ok(cond, msg) {
  if (!cond) fail(msg || 'điều kiện sai');
}

function eq(actual, expected, msg) {
  if (actual !== expected) {
    fail(`${msg || 'không bằng'} — mong đợi ${JSON.stringify(expected)}, nhận ${JSON.stringify(actual)}`);
  }
}

function approx(actual, expected, tol, msg) {
  const diff = Math.abs(Number(actual) - Number(expected));
  if (!(diff <= tol)) {
    fail(
      `${msg || 'lệch quá dung sai'} — mong đợi ≈${fmt(expected)}, nhận ${fmt(actual)} (lệch ${fmt(diff)}, cho phép ${fmt(tol)})`
    );
  }
}

function includes(haystack, needle, msg) {
  const arr = Array.isArray(haystack) ? haystack : Object.keys(haystack || {});
  if (!arr.includes(needle)) {
    fail(`${msg || 'không chứa'} — thiếu "${needle}" trong [${arr.join(', ')}]`);
  }
}

function status2xx(res, what) {
  if (res.status < 200 || res.status >= 300) {
    fail(`${what} trả về ${res.status}: ${String(res.raw).slice(0, 160)}`);
  }
}

/** Định dạng số cho thông báo lỗi: 12345678 → "12.345.678" */
function fmt(n) {
  const num = Number(n);
  if (!isFinite(num)) return String(n);
  return Math.round(num).toLocaleString('vi-VN');
}

// ───────────────────────── tổng kết ─────────────────────────

function summary() {
  const by = (s) => state.results.filter((r) => r.status === s).length;
  const counts = {
    pass: by('pass'),
    fail: by('fail'),
    known: by('known'),
    fixed: by('fixed'),
    total: state.results.length,
  };
  console.log('\n' + '='.repeat(72));
  console.log(`KẾT QUẢ  (chế độ: ${MODE})`);
  console.log('='.repeat(72));
  console.log(`  ✅ Đạt            ${counts.pass}`);
  if (counts.fixed) console.log(`  🎉 Đã sửa         ${counts.fixed}  (gỡ nhãn KNOWN_FAIL được rồi)`);
  if (counts.known) console.log(`  🔎 Phát hiện      ${counts.known}  (lỗi đã biết, đang chờ sửa)`);
  console.log(`  ❌ Hỏng           ${counts.fail}`);
  console.log(`  ── Tổng          ${counts.total}`);
  return counts;
}

module.exports = {
  MODE,
  state,
  group,
  t,
  ok,
  eq,
  approx,
  includes,
  status2xx,
  fail,
  fmt,
  summary,
};
