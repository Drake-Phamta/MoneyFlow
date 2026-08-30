/**
 * report.js — Sinh các tệp kết quả trong tests/reports/.
 *
 *   results.json            toàn bộ test, trạng thái, thời gian
 *   coverage.json           feature id → test nào phủ → đạt/hỏng
 *   coverage.md             bảng người đọc được, kèm phần còn thiếu
 *   BAO-CAO-KIEM-TOAN.md    báo cáo kiểm toán tiếng Việt (bản chính)
 */
const fs = require('fs');
const path = require('path');
const env = require('./env');
const inv = require('./inventory');

function ensureDir() {
  fs.mkdirSync(env.REPORT_DIR, { recursive: true });
}

function ts() {
  return new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

// ───────────────────────── coverage ─────────────────────────

function buildCoverage(state, matrix) {
  const inventory = inv.inventory();
  const sourceIds = new Set(inv.allFeatureIds(inventory));
  const matrixIds = new Set((matrix?.features || []).map((f) => f.id));
  const waivers = new Map(
    (matrix?.features || []).filter((f) => f.waiver).map((f) => [f.id, f.waiver])
  );

  const rows = [];
  for (const id of sourceIds) {
    const hits = state.coverage.get(id) || [];
    const passing = hits.filter((h) => h.status === 'pass' || h.status === 'fixed');
    rows.push({
      id,
      tests: hits.map((h) => h.testId),
      covered: hits.length > 0,
      verified: passing.length > 0,
      waiver: waivers.get(id) || null,
      inMatrix: matrixIds.has(id),
    });
  }

  const uncovered = rows.filter((r) => !r.covered && !r.waiver);
  const staleMatrixRows = [...matrixIds].filter((id) => !sourceIds.has(id));
  const missingFromMatrix = [...sourceIds].filter((id) => !matrixIds.has(id));

  return {
    total: rows.length,
    covered: rows.filter((r) => r.covered).length,
    waived: rows.filter((r) => r.waiver).length,
    rows,
    uncovered,
    staleMatrixRows,
    missingFromMatrix,
    inventoryCounts: {
      rest: inventory.rest.length,
      ipc: inventory.ipc.length,
      bridge: inventory.bridge.length,
      client: inventory.client.length,
      ui: inventory.ui.length,
    },
  };
}

// ───────────────────────── viết tệp ─────────────────────────

function writeAll(state, counts, matrix, meta = {}) {
  ensureDir();
  const cov = buildCoverage(state, matrix);

  fs.writeFileSync(
    path.join(env.REPORT_DIR, 'results.json'),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), mode: meta.mode, counts, results: state.results },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(env.REPORT_DIR, 'coverage.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), ...cov }, null, 2)
  );

  writeCoverageMd(cov, counts, meta);
  writeAuditMd(state, counts, cov, meta);

  return cov;
}

function writeCoverageMd(cov, counts, meta) {
  const testable = cov.total - cov.waived;
  const pct = testable ? ((cov.covered / testable) * 100).toFixed(1) : '0.0';
  const L = [];
  L.push('# Độ phủ kiểm thử');
  L.push('');
  L.push(`Sinh lúc ${ts()} · chế độ \`${meta.mode}\``);
  L.push('');
  L.push(`## Độ phủ: ${cov.covered}/${testable} (${pct}%)`);
  L.push('');
  L.push(
    `Tổng ${cov.total} tính năng trích từ mã nguồn, trong đó ${cov.waived} được miễn ` +
      `có ghi lý do (xem cuối trang). ${cov.uncovered.length} mục chưa có test nào phủ.`
  );
  L.push('');
  L.push('| Lớp | Số mục trong mã nguồn |');
  L.push('|---|---:|');
  L.push(`| REST route (electron/routes.js) | ${cov.inventoryCounts.rest} |`);
  L.push(`| IPC handler (electron/main.js) | ${cov.inventoryCounts.ipc} |`);
  L.push(`| Cầu nối (electron/preload.js) | ${cov.inventoryCounts.bridge} |`);
  L.push(`| Client REST (src/utils/api.js) | ${cov.inventoryCounts.client} |`);
  L.push(`| Lời gọi từ giao diện | ${cov.inventoryCounts.ui} |`);
  L.push('');

  if (cov.uncovered.length) {
    L.push(`## Chưa có test nào phủ (${cov.uncovered.length})`);
    L.push('');
    for (const r of cov.uncovered) L.push(`- \`${r.id}\``);
    L.push('');
  } else {
    L.push('## Chưa có test nào phủ');
    L.push('');
    L.push('Không có. Mọi tính năng trích được từ mã nguồn đều có ít nhất một test.');
    L.push('');
  }

  const waivedRows = cov.rows.filter((r) => r.waiver);
  if (waivedRows.length) {
    L.push(`## Được miễn có lý do (${waivedRows.length})`);
    L.push('');
    L.push('| Tính năng | Lý do |');
    L.push('|---|---|');
    for (const r of waivedRows.sort((a, b) => a.id.localeCompare(b.id))) {
      L.push(`| \`${r.id}\` | ${r.waiver} |`);
    }
    L.push('');
  }

  L.push('## Đã có test phủ');
  L.push('');
  L.push('| Tính năng | Test | Trạng thái |');
  L.push('|---|---|---|');
  for (const r of cov.rows.filter((x) => x.covered).sort((a, b) => a.id.localeCompare(b.id))) {
    L.push(
      `| \`${r.id}\` | ${r.tests.join(', ')} | ${r.verified ? 'đạt' : 'phát hiện lỗi'} |`
    );
  }
  L.push('');

  fs.writeFileSync(path.join(env.REPORT_DIR, 'coverage.md'), L.join('\n'), 'utf8');
}

function writeAuditMd(state, counts, cov, meta) {
  const findings = state.results.filter(
    (r) => r.status === 'known' || r.status === 'fail'
  );
  const fixed = state.results.filter((r) => r.status === 'fixed');

  const L = [];
  L.push('# Báo cáo kiểm toán — Money Flow');
  L.push('');
  L.push(`Sinh lúc ${ts()}`);
  L.push('');
  L.push('## Dữ liệu thật của bạn không bị đụng tới');
  L.push('');
  L.push('Toàn bộ đợt kiểm toán chạy trên một cơ sở dữ liệu riêng:');
  L.push('');
  L.push('```');
  L.push(`DB test    : ${env.DEMO_DB}`);
  L.push(`DB thật    : ${env.REAL_DB}  (chỉ đọc để lấy dấu vân tay)`);
  if (meta.fingerprintBefore) {
    L.push(`sha256 trước: ${meta.fingerprintBefore}`);
    L.push(`sha256 sau  : ${meta.fingerprintAfter}`);
    L.push(
      `kết luận    : ${
        meta.fingerprintBefore === meta.fingerprintAfter
          ? 'KHÔNG THAY ĐỔI'
          : '!!! ĐÃ THAY ĐỔI !!!'
      }`
    );
  }
  L.push('```');
  L.push('');
  L.push('## Tổng quan');
  L.push('');
  L.push('| | |');
  L.push('|---|---:|');
  L.push(`| Test đạt | ${counts.pass} |`);
  L.push(`| Phát hiện lỗi | ${counts.known} |`);
  L.push(`| Test hỏng ngoài dự kiến | ${counts.fail} |`);
  if (counts.fixed) L.push(`| Lỗi đã được sửa | ${counts.fixed} |`);
  L.push(`| Tổng số test | ${counts.total} |`);
  const testable = cov.total - cov.waived;
  L.push(
    `| Độ phủ tính năng | ${cov.covered}/${testable} (${
      testable ? ((cov.covered / testable) * 100).toFixed(1) : 0
    }%) |`
  );
  L.push(`| Miễn có lý do | ${cov.waived} |`);
  L.push(`| Chưa có test nào phủ | ${cov.uncovered.length} |`);
  L.push('');

  if (findings.length) {
    L.push('## Danh sách phát hiện');
    L.push('');
    let i = 0;
    for (const f of findings) {
      i++;
      L.push(`### ${i}. [${f.id}] ${f.desc}`);
      L.push('');
      L.push(`**Nhóm:** ${f.group}`);
      L.push('');
      L.push('**Quan sát được trên dữ liệu mẫu:**');
      L.push('');
      L.push('```');
      L.push(String(f.error || '').replace(/\n\s+/g, '\n'));
      L.push('```');
      L.push('');
      if (f.knownFail) {
        L.push(`**Nguyên nhân trong mã nguồn:** ${f.knownFail}`);
        L.push('');
      }
      if (f.covers?.length) {
        L.push(`**Chạm tới:** ${f.covers.map((c) => `\`${c}\``).join(', ')}`);
        L.push('');
      }
    }
  }

  if (fixed.length) {
    L.push('## Lỗi đã được sửa (gỡ nhãn KNOWN_FAIL được rồi)');
    L.push('');
    for (const f of fixed) L.push(`- **[${f.id}]** ${f.desc}`);
    L.push('');
  }

  L.push('## Cách chạy lại');
  L.push('');
  L.push('```bash');
  L.push('npm test                 # chế độ kiểm toán: lỗi đã biết không làm đỏ build');
  L.push('npm test -- --mode=guard # chế độ canh gác: mọi lỗi đã biết đều là regression');
  L.push('```');
  L.push('');

  fs.writeFileSync(
    path.join(env.REPORT_DIR, 'BAO-CAO-KIEM-TOAN.md'),
    L.join('\n'),
    'utf8'
  );
}

module.exports = { writeAll, buildCoverage };
