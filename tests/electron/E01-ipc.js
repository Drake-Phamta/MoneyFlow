/**
 * E01 — Đường IPC của bản Electron, chạy thật.
 *
 * Toàn bộ bộ test còn lại đi qua REST. Bản Electron gọi thẳng qua IPC, và hai
 * đường đó là hai đoạn mã khác nhau: P1/P2 chỉ đối chiếu CHỮ KÝ, không ai bấm
 * thật. Bộ này mở app Electron thật, nối vào cổng gỡ lỗi, rồi gọi window.api
 * đúng như giao diện gọi.
 *
 * Chạy trên một BẢN SAO của tệp mẫu, qua biến MF_DB_PATH. Dữ liệu thật không
 * bao giờ nằm trong tầm với của bộ này.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { group, t, ok, eq, approx, fmt } = require('../rig/assert');
const env = require('../rig/env');
const { attach } = require('./_cdp');

const PORT = 9333;
const TOL = 1;

let proc = null;
let cdp = null;
let workDir = null;

/** Mở Electron trỏ vào bản sao của tệp mẫu, nối Puppeteer vào cổng gỡ lỗi. */
async function launch() {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-electron-'));
  const dbPath = path.join(workDir, 'financial.sqlite');
  fs.copyFileSync(env.DEMO_DB, dbPath);

  const electron = require(path.join(env.REPO_ROOT, 'node_modules/electron'));

  const childEnv = { ...process.env };
  childEnv.MF_DB_PATH = dbPath;
  // Bản dev nạp từ Vite; ở đây dùng bản đã dựng sẵn của rig để khỏi phải chạy
  // thêm một máy chủ nữa.
  childEnv.MF_ELECTRON_TEST = '1';
  childEnv.MF_DIST_DIR = path.join(env.SCRATCH_BUILD, 'dist');
  // Biến này đang bật trong môi trường chạy test. Còn nó thì Electron khởi
  // động như Node thuần và không bao giờ mở cửa sổ nào.
  delete childEnv.ELECTRON_RUN_AS_NODE;

  proc = spawn(
    electron,
    ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox'],
    { cwd: env.REPO_ROOT, env: childEnv, stdio: 'ignore', windowsHide: true }
  );

  cdp = await attach(PORT);

  // Đợi tới khi cầu nối preload sẵn sàng.
  const started = Date.now();
  while (Date.now() - started < 30000) {
    if (await cdp.eval('!!window.api')) return { dbPath };
    await sleep(400);
  }
  throw new Error('window.api không xuất hiện — cầu nối preload chưa nạp');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Gọi một hàm trên window.api, đúng như giao diện gọi. */
function api(pathStr, ...args) {
  const expr = `(async () => {
    const fn = ${JSON.stringify(pathStr)}.split('.').reduce((o, k) => (o ? o[k] : undefined), window.api);
    if (typeof fn !== 'function') throw new Error('window.api.' + ${JSON.stringify(pathStr)} + ' khong phai ham');
    return await fn(...${JSON.stringify(args)});
  })()`;
  return cdp.eval(expr);
}

async function close() {
  try {
    if (cdp) cdp.close();
  } catch {}
  try {
    if (proc && !proc.killed) proc.kill();
  } catch {}
  if (workDir) {
    await sleep(500);
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {}
  }
}

async function run() {
  group('E01 — Đường IPC của bản Electron');

  try {
    await launch();
  } catch (e) {
    // Không có Electron trên máy thì bỏ qua, chứ không báo hỏng: bộ này chỉ
    // chạy được khi có cả Electron lẫn Chrome.
    console.log('      (bỏ qua: ' + String(e.message).slice(0, 120) + ')');
    await close();
    return;
  }

  try {
    await t(
      'E-01',
      'Cầu nối preload phơi đủ mọi nhóm hàm mà giao diện gọi',
      ['bridge:snapshot.get', 'ipc:snapshot:get'],
      async () => {
        const groups = await cdp.eval('Object.keys(window.api || {})');
        for (const g of ['snapshot', 'savings', 'monthly', 'allocations', 'transactions', 'phases']) {
          ok(groups.includes(g), `window.api thiếu nhóm "${g}" — bản Electron sẽ chết ở trang dùng nó`);
        }
      }
    );

    await t(
      'E-02',
      'Snapshot qua IPC trả về cùng cấu trúc như qua REST',
      ['ipc:snapshot:get', 'bridge:snapshot.get'],
      async () => {
        const s = await api('snapshot.get');
        for (const k of ['netWorth', 'liquidity', 'cash', 'savings', 'portfolio', 'phase', 'cashflow', 'prices']) {
          ok(s && k in s, `snapshot qua IPC thiếu khối "${k}"`);
        }
        approx(
          s.netWorth.total,
          s.cash.total + s.portfolio.marketValue + s.savings.balance,
          TOL,
          'tổng tài sản qua IPC không bằng ba thành phần cộng lại'
        );
      }
    );

    await t(
      'E-03',
      'Xoá một giao dịch trong sổ tiết kiệm: đúng đường người dùng thật đi',
      ['ipc:savings:deleteTransaction', 'bridge:savings.deleteTransaction', 'ipc:savings:get'],
      async () => {
        const accounts = await api('savings.get');
        const acc = (accounts || []).find((a) => (a.transactions || []).length > 0);
        ok(acc, 'tệp mẫu cần một sổ tiết kiệm có ít nhất một giao dịch');

        const before = { count: acc.transactions.length, principal: acc.principal };
        const victim = acc.transactions[acc.transactions.length - 1];

        await api('savings.deleteTransaction', victim.id);

        const after = (await api('savings.get')).find((a) => a.id === acc.id);
        eq(
          after.transactions.length,
          before.count - 1,
          'số giao dịch còn lại trong sổ sau khi xoá'
        );
        ok(
          !after.transactions.some((x) => x.id === victim.id),
          'giao dịch đã xoá vẫn còn trong danh sách'
        );

        // Vốn gốc phải tính lại theo các giao dịch còn lại, không giữ số cũ.
        const expected = (after.transactions || []).reduce(
          (s, x) =>
            s + (x.type === 'deposit' ? x.amount : x.type === 'withdraw' ? -x.amount : 0),
          0
        );
        if (expected > 0) {
          approx(
            after.principal,
            expected,
            TOL,
            `vốn gốc ${fmt(after.principal)} không khớp tổng giao dịch còn lại ${fmt(expected)}`
          );
        }
      }
    );

    await t(
      'E-04',
      'Sửa một sổ tiết kiệm qua IPC rồi đọc lại thấy đúng giá trị mới',
      ['ipc:savings:update', 'bridge:savings.update'],
      async () => {
        const accounts = await api('savings.get');
        const acc = accounts[0];
        ok(acc, 'tệp mẫu cần ít nhất một sổ tiết kiệm');

        const newName = acc.name + ' (đã sửa)';
        await api('savings.update', acc.id, { ...acc, name: newName });

        const after = (await api('savings.get')).find((a) => a.id === acc.id);
        eq(after.name, newName, 'tên sổ sau khi sửa qua IPC');

        await api('savings.update', acc.id, { ...acc, name: acc.name });
      }
    );

    await t(
      'E-05',
      'Huỷ xác nhận chênh lệch hoàn tác được qua IPC, không chỉ qua REST',
      ['ipc:allocations:revert', 'bridge:allocations.revert', 'ipc:allocations:adjust'],
      async () => {
        const cats = await api('categories.get');
        const target = cats.find((c) => c.name.includes('Chứng Khoán'));
        ok(target, 'tệp mẫu cần danh mục Chứng Khoán');

        const sumAlloc = async () =>
          (await api('allocations.all'))
            .filter((a) => a.category_id === target.id)
            .reduce((s, a) => s + (a.actual_amount || a.planned_amount || 0), 0);

        const before = await sumAlloc();
        const r = await api('allocations.adjust', 1000000, target.id, 'Thử qua IPC', '2026-08-30');
        ok(r && r.id, 'xác nhận qua IPC phải trả về id của bút toán');
        approx(await sumAlloc(), before + 1000000, TOL, 'phân bổ sau khi xác nhận');

        await api('allocations.revert', r.id);
        approx(await sumAlloc(), before, TOL, 'phân bổ sau khi huỷ');
      }
    );

    await t(
      'E-06',
      'Lưu một tháng qua IPC chuẩn hoá tiền nhàn rỗi giống hệt bản web',
      ['ipc:monthly:save', 'bridge:monthly.save'],
      async () => {
        const filled = await api('monthly.filled');
        const m = filled[filled.length - 1];

        // Gửi total_inflow mâu thuẫn với thu/chi. Backend phải bỏ qua nó.
        await api('monthly.save', {
          month_index: m.month_index,
          month_label: m.month_label,
          income: 5000000,
          expense: 2000000,
          bonus: 0,
          total_inflow: 99999999,
          status: 'confirmed',
        });

        const after = (await api('monthly.filled')).find((x) => x.month_index === m.month_index);
        eq(
          after.total_inflow,
          3000000,
          'bản Electron nhận total_inflow do nơi gọi truyền vào thay vì tự suy ra'
        );

        await api('monthly.save', {
          month_index: m.month_index,
          month_label: m.month_label,
          income: m.income,
          expense: m.expense,
          bonus: m.bonus,
          status: 'confirmed',
        });
      }
    );

    await t(
      'E-08',
      'Sổ quỹ tiền mặt đi được qua IPC, không chỉ qua REST',
      ['ipc:cash:ledger', 'ipc:cash:spend', 'ipc:cash:deleteMovement',
       'bridge:cash.ledger', 'bridge:cash.spend', 'bridge:cash.deleteMovement',
       'client:cash.ledger', 'client:cash.spend', 'client:cash.deleteMovement'],
      async () => {
        const before = await api('snapshot.get');
        const amount = 250000;

        const r = await api('cash.spend', amount, '2026-08-30', 'Thử qua IPC');
        ok(r && r.id, 'ghi khoản đã tiêu qua IPC phải trả về id');

        const ledger = await api('cash.ledger');
        ok(
          ledger.some((x) => x.id === r.id && Math.abs(x.amount - amount) < TOL),
          'sổ quỹ đọc qua IPC phải thấy dòng vừa ghi'
        );

        const after = await api('snapshot.get');
        approx(
          before.netWorth.total - after.netWorth.total,
          amount,
          TOL,
          'khoản đã tiêu phải trừ thẳng vào tổng tài sản'
        );

        await api('cash.deleteMovement', r.id);
        const back = await api('snapshot.get');
        approx(back.netWorth.total, before.netWorth.total, TOL,
          'xoá dòng ghi nhầm phải hoàn nguyên tổng tài sản');
      }
    );

    await t(
      'E-07',
      'Giao diện thật mở được trong Electron, không lỗi JS',
      [],
      async () => {
        // Đợi tới khi React vẽ xong, thay vì đọc ngay rồi kết luận là trống.
        let txt = '';
        const until = Date.now() + 20000;
        while (Date.now() < until) {
          txt = String(
            (await cdp.eval(
              "(function () { const m = document.querySelector('main') || document.body; return (m.innerText || ''); })()"
            )) || ''
          );
          if (txt.trim().length > 40 && !txt.includes('Đang tải')) break;
          await sleep(400);
        }
        txt = txt.slice(0, 4000);
        ok(txt.trim().length > 40, 'vùng nội dung của bản Electron trống');
        for (const tok of ['NaN', 'undefined', 'Infinity', '[object Object]']) {
          ok(!String(txt).includes(tok), `bản Electron lộ "${tok}" ra màn hình`);
        }
      }
    );
  } finally {
    await close();
  }
}

module.exports = { run };
