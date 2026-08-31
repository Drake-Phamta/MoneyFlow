/**
 * T05 — Cơ sở dữ liệu hoàn toàn mới phải khởi tạo được.
 *
 * Toàn bộ bộ test còn lại chạy trên một fixture đã có sẵn dữ liệu, nên không
 * nhóm nào đi qua đường "người dùng cài lần đầu". Đúng đường đó từng chết vì
 * migrateToV7 seed một tham số rồi seedDefaults chèn lại chính khoá đó.
 *
 * Chạy trong tiến trình riêng, trên thư mục riêng, không đụng cả DB thật lẫn
 * DB fixture.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { group, t, ok, eq } = require('../rig/assert');
const { REPO_ROOT } = require('../rig/env');

/** Dựng một DB mới toanh trong tiến trình con, trả về mô tả kết quả. */
function bootFresh() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-fresh-'));
  const dbPath = path.join(dir, 'fresh.sqlite');
  const script = `
    const M = require(${JSON.stringify(path.join(REPO_ROOT, 'electron/database.js'))});
    const Cls = M.Database || M.default || M;
    (async () => {
      const db = new Cls(${JSON.stringify(dbPath)});
      await db.init();
      const out = {
        phases: db.query('SELECT sort_order, name, goal_multiplier FROM phases ORDER BY sort_order'),
        categories: db.query('SELECT name FROM categories ORDER BY sort_order').map(c => c.name),
        allocations: db.query('SELECT phase_id, category_id, ratio FROM phase_allocations'),
        params: Object.fromEntries(db.query('SELECT key, value FROM parameters').map(p => [p.key, p.value])),
        snapshot: null,
      };
      try { out.snapshot = db.getFinancialSnapshot(); } catch (e) { out.snapshotError = String(e.message || e); }
      process.stdout.write('@@' + JSON.stringify(out) + '@@');
    })().catch(e => {
      process.stdout.write('@@' + JSON.stringify({ fatal: String(e.message || e) }) + '@@');
    });
  `;
  try {
    const raw = execFileSync(process.execPath, ['-e', script], {
      encoding: 'utf8',
      timeout: 60000,
      cwd: REPO_ROOT,
    });
    const m = raw.match(/@@([\s\S]*)@@/);
    if (!m) return { fatal: 'tiến trình con không trả về gì: ' + raw.slice(-300) };
    return JSON.parse(m[1]);
  } catch (e) {
    return { fatal: String(e.stderr || e.message || e).slice(-400) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

let fresh = null;

async function run() {
  group('T05 — Cài lần đầu');

  await t(
    'CT-40',
    'Cơ sở dữ liệu mới khởi tạo xong không ném lỗi',
    [],
    () => {
      fresh = bootFresh();
      ok(!fresh.fatal, `init() chết trên DB mới: ${fresh.fatal}`);
    }
  );

  await t(
    'CT-41',
    'Bốn giai đoạn và năm danh mục có mặt ngay từ đầu',
    [],
    () => {
      ok(fresh && !fresh.fatal, 'chưa dựng được DB mới');
      eq(fresh.phases.length, 4, 'số giai đoạn');
      eq(fresh.phases[3].name, 'Giai đoạn 4: Thu nhập thụ động', 'tên giai đoạn 4');
      ok(
        fresh.categories.length >= 5,
        `chỉ có ${fresh.categories.length} danh mục: ${fresh.categories.join(', ')}`
      );
      ok(
        fresh.allocations.length > 0,
        'không giai đoạn nào có tỷ lệ phân bổ — trang nhập liệu sẽ không chia được tiền'
      );
    }
  );

  await t(
    'CT-42',
    'Mọi tham số mà lớp nội dung cần đều có sẵn',
    [],
    () => {
      ok(fresh && !fresh.fatal, 'chưa dựng được DB mới');
      for (const k of [
        'TOTAL_MONTHS', 'START_MONTH', 'START_YEAR',
        'FI_MONTHLY_EXPENSE', 'DEFAULT_INFLOW',
        'INFLATION_RATE', 'EXPECTED_RETURN_STOCK',
      ]) {
        ok(fresh.params[k] !== undefined, `thiếu tham số ${k} trên bản cài mới`);
      }
    }
  );

  await t(
    'CT-43',
    'Snapshot dựng được trên dữ liệu rỗng, mọi con số bằng 0 chứ không phải NaN',
    ['rest:GET /api/snapshot'],
    () => {
      ok(fresh && !fresh.fatal, 'chưa dựng được DB mới');
      ok(!fresh.snapshotError, `snapshot chết trên DB rỗng: ${fresh.snapshotError}`);
      const s = fresh.snapshot;
      ok(s, 'không dựng được snapshot');
      for (const [label, v] of [
        ['tổng tài sản', s.netWorth.total],
        ['thanh khoản', s.liquidity.total],
        ['tiền mặt', s.cash.total],
        ['tiến độ giai đoạn', s.phase.pct],
        ['tỷ lệ tự do tài chính', s.fi.ratio],
      ]) {
        ok(Number.isFinite(v), `${label} là ${v} trên cơ sở dữ liệu rỗng`);
        ok(v >= 0, `${label} âm trên cơ sở dữ liệu rỗng: ${v}`);
      }
      eq(s.phase.sortOrder, 1, 'người dùng mới phải bắt đầu ở giai đoạn 1');
    }
  );

  await t(
    'CT-44',
    'Tệp dữ liệu bị cắt cụt giữa chừng thì mở lại vẫn còn sổ',
    [],
    () => {
      // sql.js xuất lại TOÀN BỘ cơ sở dữ liệu mỗi lần lưu, nên mỗi lần ghi một
      // tháng là cả tệp bị viết lại. Trước đây save() ghi thẳng vào tệp đích:
      // mất điện giữa chừng là tệp cụt và mất sạch sổ. Đây là phép thử đúng
      // tình huống đó.
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-crash-'));
      const dbPath = path.join(dir, 'c.sqlite');
      const script = `
        const M = require(${JSON.stringify(path.join(REPO_ROOT, 'electron/database.js'))});
        const Cls = M.Database || M.default || M;
        const fs = require('fs');
        (async () => {
          let db = new Cls(${JSON.stringify(dbPath)});
          await db.init();
          db.run("INSERT INTO parameters (key, value, description) VALUES ('CRASH_TEST', 42, 't')");
          db.save();
          db.run("UPDATE parameters SET value = 43 WHERE key = 'CRASH_TEST'");
          db.save();

          const leftover = fs.existsSync(${JSON.stringify(dbPath)} + '.tmp');

          // Đúng hình dạng tệp để lại khi mất điện giữa lúc ghi.
          fs.writeFileSync(${JSON.stringify(dbPath)}, Buffer.alloc(0));

          db = new Cls(${JSON.stringify(dbPath)});
          await db.init();
          const row = db.queryOne("SELECT value FROM parameters WHERE key = 'CRASH_TEST'");
          process.stdout.write(JSON.stringify({ leftover, recovered: row ? row.value : null }));
        })();
      `;
      const out = execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' });
      const res = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));

      ok(!res.leftover, 'còn sót tệp .tmp sau khi lưu — ghi chưa nguyên tử');
      ok(
        res.recovered !== null,
        'tệp dữ liệu bị cắt cụt và không khôi phục được — mất toàn bộ sổ'
      );
      fs.rmSync(dir, { recursive: true, force: true });
    }
  );
}

module.exports = { run };
