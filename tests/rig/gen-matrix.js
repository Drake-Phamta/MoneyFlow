/**
 * gen-matrix.js — Sinh lại tests/coverage-matrix.json từ mã nguồn.
 *
 *   node tests/rig/gen-matrix.js
 *
 * Ma trận phải được SUY RA từ source chứ không gõ tay, nếu không nó lỗi thời
 * ngay lần thêm endpoint kế tiếp mà không ai biết. Chạy lại lệnh này mỗi khi
 * thêm/bớt endpoint; các waiver đã có được giữ nguyên.
 */
const fs = require('fs');
const path = require('path');
const inv = require('./inventory');

const MATRIX = path.join(__dirname, '..', 'coverage-matrix.json');

/** Ngoại lệ có lý do — mỗi mục phải nói rõ vì sao không test được. */
const WAIVERS = {
  'rest:GET *': 'Catch-all phục vụ trang SPA, không phải endpoint dữ liệu.',
  'ipc:dialog:openFile':
    'Hộp thoại chọn file của hệ điều hành — cần tiến trình Electron thật, rig Express không chạm tới được.',
  'ipc:dialog:saveFile':
    'Hộp thoại lưu file của hệ điều hành — cần tiến trình Electron thật.',
  'bridge:openFile': 'Cầu nối tới hộp thoại Electron, xem ipc:dialog:openFile.',
  'bridge:saveFile': 'Cầu nối tới hộp thoại Electron, xem ipc:dialog:saveFile.',
};

function build() {
  const inventory = inv.inventory();
  const prev = fs.existsSync(MATRIX) ? JSON.parse(fs.readFileSync(MATRIX, 'utf8')) : { features: [] };
  const prevById = new Map((prev.features || []).map((f) => [f.id, f]));

  const rows = [];
  const push = (id, kind, extra = {}) => {
    const old = prevById.get(id) || {};
    rows.push({
      id,
      kind,
      ...extra,
      waiver: WAIVERS[id] || old.waiver || null,
    });
  };

  for (const r of inventory.rest) push(r.id, 'rest', { route: r.route, verb: r.verb, mutating: r.mutating });
  for (const i of inventory.ipc) push(i.id, 'ipc', { channel: i.channel });
  for (const b of inventory.bridge) push(b.id, 'bridge', { channel: b.channel });
  for (const c of inventory.client) push(c.id, 'client');
  for (const u of inventory.ui) push(u.id, 'ui', { files: u.files });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    note: 'Sinh bằng: node tests/rig/gen-matrix.js — đừng sửa tay ngoài phần waiver trong file đó.',
    counts: {
      rest: inventory.rest.length,
      ipc: inventory.ipc.length,
      bridge: inventory.bridge.length,
      client: inventory.client.length,
      ui: inventory.ui.length,
      total: rows.length,
      waived: rows.filter((r) => r.waiver).length,
    },
    features: rows,
  };
}

if (require.main === module) {
  const m = build();
  fs.writeFileSync(MATRIX, JSON.stringify(m, null, 2) + '\n', 'utf8');
  console.log(
    `Đã ghi tests/coverage-matrix.json — ${m.counts.total} tính năng ` +
      `(${m.counts.waived} được miễn có lý do)`
  );
}

module.exports = { build, WAIVERS };
