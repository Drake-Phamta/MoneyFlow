/**
 * inventory.js — Trích danh sách "tính năng" trực tiếp từ mã nguồn.
 *
 * Ma trận coverage phải được SUY RA từ source, không phải gõ tay, nếu không nó
 * sẽ lỗi thời ngay lần thêm endpoint kế tiếp mà không ai biết.
 *
 * Bốn lớp transport được trích riêng để phát hiện lệch parity:
 *   rest:    electron/routes.js       app.get('/api/...')
 *   ipc:     electron/main.js         ipcMain.handle('ns:fn')
 *   bridge:  electron/preload.js      ns: { fn: () => ipcRenderer.invoke('ns:fn') }
 *   client:  src/utils/api.js         ns: { fn: ... }
 *   ui:      src/**\/*.jsx            apiClient.ns.fn(...)
 */
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./env');

const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** REST: mọi app.<verb>('<path>' trong electron/routes.js */
function restRoutes() {
  const src = read('electron/routes.js');
  const out = [];
  const re = /app\.(get|post|put|delete|patch)\(\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src))) {
    out.push({
      id: `rest:${m[1].toUpperCase()} ${m[2]}`,
      verb: m[1].toUpperCase(),
      route: m[2],
      mutating: m[1] !== 'get',
    });
  }
  return out;
}

/** IPC handler: ipcMain.handle('ns:fn' trong electron/main.js */
function ipcHandlers() {
  const src = read('electron/main.js');
  const out = [];
  const re = /ipcMain\.handle\(\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src))) out.push({ id: `ipc:${m[1]}`, channel: m[1] });
  return out;
}

/** contextBridge: các leaf trong electron/preload.js, kèm channel nó gọi. */
function bridgeLeaves() {
  const src = read('electron/preload.js');
  const out = [];
  let ns = null;
  for (const line of src.split('\n')) {
    let m = line.match(/^\s{2}([a-zA-Z]+):\s*\{/);
    if (m) { ns = m[1]; continue; }
    if (/^\s{2}\},?\s*$/.test(line)) { ns = null; continue; }
    m = line.match(/^\s{4}([a-zA-Z]+):/);
    if (m && ns) {
      const ch = line.match(/invoke\(\s*'([^']+)'/);
      out.push({ id: `bridge:${ns}.${m[1]}`, ns, fn: m[1], channel: ch ? ch[1] : null });
      continue;
    }
    // leaf cấp 1 (openFile / saveFile / importExcel …)
    m = line.match(/^\s{2}([a-zA-Z]+):\s*\(/);
    if (m) {
      const ch = line.match(/invoke\(\s*'([^']+)'/);
      out.push({ id: `bridge:${m[1]}`, ns: null, fn: m[1], channel: ch ? ch[1] : null });
    }
  }
  return out;
}

/** REST client: các leaf trong src/utils/api.js */
function clientLeaves() {
  const src = read('src/utils/api.js');
  const out = [];
  let ns = null;
  let depth = 0;
  for (const line of src.split('\n')) {
    if (/^export const api = \{/.test(line)) { depth = 1; continue; }
    if (depth === 0) continue;

    // namespace mở trên một dòng: `  params: {`
    let m = line.match(/^\s{2}([a-zA-Z]+):\s*\{\s*$/);
    if (m) { ns = m[1]; continue; }
    // namespace một dòng: `  categories: { get: () => get('/categories') },`
    m = line.match(/^\s{2}([a-zA-Z]+):\s*\{(.+)\},?\s*$/);
    if (m) {
      const inner = m[2];
      const re2 = /([a-zA-Z]+):\s*\(/g;
      let m2;
      while ((m2 = re2.exec(inner))) out.push({ id: `client:${m[1]}.${m2[1]}`, ns: m[1], fn: m2[1] });
      continue;
    }
    if (/^\s{2}\},?\s*$/.test(line)) { ns = null; continue; }

    m = line.match(/^\s{4}([a-zA-Z]+):/);
    if (m && ns) { out.push({ id: `client:${ns}.${m[1]}`, ns, fn: m[1] }); continue; }

    m = line.match(/^\s{2}([a-zA-Z]+):\s*(async\s*)?\(/);
    if (m) out.push({ id: `client:${m[1]}`, ns: null, fn: m[1] });
  }
  return out;
}

/** UI: mọi apiClient.<ns>.<fn> trong src/, kèm file gọi. */
function uiUsages() {
  const out = new Map();
  for (const file of walk(path.join(REPO_ROOT, 'src'))) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
    const re = /apiClient\.([a-zA-Z]+)\.([a-zA-Z]+)\s*\(/g;
    let m;
    while ((m = re.exec(src))) {
      const id = `ui:${m[1]}.${m[2]}`;
      if (!out.has(id)) out.set(id, { id, ns: m[1], fn: m[2], files: new Set() });
      out.get(id).files.add(rel);
    }
    const re2 = /apiClient\.(importExcel|exportExcel)\s*\(/g;
    while ((m = re2.exec(src))) {
      const id = `ui:${m[1]}`;
      if (!out.has(id)) out.set(id, { id, ns: null, fn: m[1], files: new Set() });
      out.get(id).files.add(rel);
    }
  }
  return [...out.values()].map((u) => ({ ...u, files: [...u.files] }));
}

function inventory() {
  return {
    rest: restRoutes(),
    ipc: ipcHandlers(),
    bridge: bridgeLeaves(),
    client: clientLeaves(),
    ui: uiUsages(),
  };
}

/** Tất cả feature id, phẳng. */
function allFeatureIds(inv = inventory()) {
  return [
    ...inv.rest.map((x) => x.id),
    ...inv.ipc.map((x) => x.id),
    ...inv.bridge.map((x) => x.id),
    ...inv.client.map((x) => x.id),
    ...inv.ui.map((x) => x.id),
  ];
}

module.exports = {
  inventory,
  allFeatureIds,
  restRoutes,
  ipcHandlers,
  bridgeLeaves,
  clientLeaves,
  uiUsages,
};

if (require.main === module) {
  const inv = inventory();
  console.log(`rest   : ${inv.rest.length} route (${inv.rest.filter((r) => r.mutating).length} ghi)`);
  console.log(`ipc    : ${inv.ipc.length} handler`);
  console.log(`bridge : ${inv.bridge.length} leaf`);
  console.log(`client : ${inv.client.length} leaf`);
  console.log(`ui     : ${inv.ui.length} lời gọi khác nhau`);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(inv, null, 2));
  }
}
