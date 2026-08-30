/**
 * P1 — Parity giữa hai transport.
 *
 * apiClient tự chọn window.api (Electron) hoặc REST (trình duyệt). Component
 * gọi chung một tên hàm, nên bất kỳ tên nào chỉ tồn tại ở một bên sẽ chạy tốt
 * trên web và ném "is not a function" trong bản desktop đóng gói — không
 * test giao diện nào chạy trong trình duyệt bắt được lỗi này.
 *
 * Đây là phân tích tĩnh: không cần server, không cần Electron, chạy ~50ms.
 */
const { group, t, ok, fail } = require('../rig/assert');
const inv = require('../rig/inventory');

/**
 * Bất đối xứng CÓ CHỦ Ý — mỗi mục phải kèm lý do.
 * Bất cứ thứ gì không nằm trong danh sách này mà lệch đều là lỗi.
 */
const ALLOWED_ASYMMETRY = {
  'openFile': 'Hộp thoại chọn file chỉ có ở Electron; web dùng <input type=file>.',
  'saveFile': 'Hộp thoại lưu file chỉ có ở Electron; web tải blob về.',
  'importExcel':
    'Chữ ký khác nhau có chủ ý: REST nhận File (multipart), IPC nhận đường dẫn. ' +
    'Nơi gọi tự rẽ nhánh theo isElectron.',
  'exportExcel':
    'Chữ ký khác nhau có chủ ý: REST không tham số (tải blob), IPC nhận đường dẫn.',
};

async function run() {
  const bridge = inv.bridgeLeaves();
  const client = inv.clientLeaves();
  const ipc = inv.ipcHandlers();

  const bridgeNames = new Set(bridge.map((b) => (b.ns ? `${b.ns}.${b.fn}` : b.fn)));
  const clientNames = new Set(client.map((c) => (c.ns ? `${c.ns}.${c.fn}` : c.fn)));
  const ipcChannels = new Set(ipc.map((i) => i.channel));

  group('P1 — Parity IPC ↔ REST');

  await t(
    'PAR-01',
    'Mọi hàm trong src/utils/api.js đều có bản IPC tương ứng trong preload.js',
    ['parity:client→bridge'],
    () => {
      const missing = [...clientNames].filter(
        (n) => !bridgeNames.has(n) && !ALLOWED_ASYMMETRY[n]
      );
      if (missing.length) {
        fail(
          `Thiếu ${missing.length} hàm ở phía IPC: ${missing.join(', ')}\n` +
            `      → gọi chúng trong bản Electron sẽ ném "is not a function"`
        );
      }
    },
    {
      knownFail:
        'savings.deleteTransaction và savings.updateTransactionDate có REST ' +
        '(api.js:114-115, routes.js:398/403) nhưng thiếu IPC; ' +
        'SavingsSection.jsx:178,193 gọi chúng.',
    }
  );

  await t(
    'PAR-02',
    'Mọi hàm trong preload.js đều có bản REST tương ứng trong api.js',
    ['parity:bridge→client'],
    () => {
      const missing = [...bridgeNames].filter(
        (n) => !clientNames.has(n) && !ALLOWED_ASYMMETRY[n]
      );
      if (missing.length) fail(`Thiếu ${missing.length} hàm ở phía REST: ${missing.join(', ')}`);
    }
  );

  await t(
    'PAR-03',
    'Mọi channel preload.js gọi đều có ipcMain.handle trong main.js',
    ['parity:bridge→ipc'],
    () => {
      const dangling = bridge
        .filter((b) => b.channel && !ipcChannels.has(b.channel))
        .map((b) => `${b.ns ? b.ns + '.' : ''}${b.fn} → '${b.channel}'`);
      if (dangling.length) {
        fail(`${dangling.length} channel không có handler: ${dangling.join(', ')}`);
      }
    }
  );

  await t(
    'PAR-04',
    'Không có ipcMain.handle nào bị bỏ rơi (không preload nào gọi tới)',
    ['parity:ipc→bridge'],
    () => {
      const used = new Set(bridge.map((b) => b.channel).filter(Boolean));
      const orphan = ipc.filter((i) => !used.has(i.channel)).map((i) => i.channel);
      if (orphan.length) {
        fail(`${orphan.length} handler không ai gọi: ${orphan.join(', ')}`);
      }
    }
  );

  await t(
    'PAR-05',
    'Mọi apiClient.<ns>.<fn> mà component gọi đều tồn tại ở CẢ hai transport',
    ['parity:ui→both'],
    () => {
      const ui = inv.uiUsages();
      const broken = [];
      for (const u of ui) {
        const name = u.ns ? `${u.ns}.${u.fn}` : u.fn;
        const inRest = clientNames.has(name) || ALLOWED_ASYMMETRY[name];
        const inIpc = bridgeNames.has(name) || ALLOWED_ASYMMETRY[name];
        if (!inRest) broken.push(`${name} (thiếu REST) ← ${u.files.join(', ')}`);
        else if (!inIpc) broken.push(`${name} (thiếu IPC) ← ${u.files.join(', ')}`);
      }
      if (broken.length) fail(`${broken.length} lời gọi hỏng:\n      ` + broken.join('\n      '));
    },
    {
      knownFail:
        'SavingsSection.jsx:178,193 gọi savings.deleteTransaction / ' +
        'savings.updateTransactionDate — chỉ có REST, không có IPC.',
    }
  );
}

module.exports = { run };
