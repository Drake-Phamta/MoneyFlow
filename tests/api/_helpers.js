/**
 * _helpers.js — Tiện ích dùng chung cho bộ test API.
 *
 * Nguyên tắc của cả thư mục này: **khẳng định hợp đồng và bất biến, không
 * khẳng định những con số đang tranh cãi.** Các bước sau của kế hoạch sẽ đổi
 * vị từ của checklist và gom sáu định nghĩa "Tổng tài sản" về một — test ở đây
 * phải sống sót qua những thay đổi đó. Con số nào đang mâu thuẫn thì đã có bộ
 * tests/consistency/ lo.
 */
const { get, post, put, del, getOk } = require('../rig/http');
const { reset } = require('../rig/reset');
const { ok, eq, fail, fmt } = require('../rig/assert');

/** Bắt đầu mỗi file test bằng một trạng thái fixture sạch. */
async function fresh() {
  await reset();
}

/** Trạng thái 2xx, kèm thông tin đủ để lần ra lỗi. */
function expectOk(res, what) {
  if (res.status < 200 || res.status >= 300) {
    fail(`${what} → ${res.status}: ${String(res.raw).slice(0, 200)}`);
  }
  return res.data;
}

/** Trạng thái phải nằm trong danh sách cho phép (dùng cho route chấp nhận nhiều mã). */
function expectStatus(res, allowed, what) {
  if (!allowed.includes(res.status)) {
    fail(`${what} → ${res.status}, mong đợi một trong [${allowed.join(', ')}]`);
  }
  return res.data;
}

/** Mọi phần tử của mảng phải có đủ các khoá này. */
function expectShape(rows, keys, what) {
  ok(Array.isArray(rows), `${what} phải trả về mảng, nhận ${typeof rows}`);
  if (!rows.length) return;
  const missing = keys.filter((k) => !(k in rows[0]));
  if (missing.length) {
    fail(
      `${what}: bản ghi đầu thiếu khoá [${missing.join(', ')}]. ` +
        `Có: [${Object.keys(rows[0]).join(', ')}]`
    );
  }
}

/** Mọi giá trị của object phải là boolean — dùng cho checklist. */
function expectAllBoolean(obj, what) {
  ok(obj && typeof obj === 'object', `${what} phải là object`);
  const bad = Object.entries(obj).filter(([, v]) => typeof v !== 'boolean');
  if (bad.length) {
    fail(
      `${what}: ${bad.length} khoá không phải boolean — ` +
        bad.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')
    );
  }
}

// ───────────────────────── tra cứu nhanh ─────────────────────────

async function categories() {
  return getOk('/api/categories');
}

async function categoryByName(fragment) {
  const cats = await categories();
  const c = cats.find((x) => x.name.includes(fragment));
  ok(c, `không tìm thấy danh mục chứa "${fragment}" trong [${cats.map((x) => x.name).join(', ')}]`);
  return c;
}

async function anyStock() {
  const items = await getOk('/api/catalog?class=stock');
  ok(items.length, 'catalog không có cổ phiếu nào');
  return items[0];
}

async function anyAsset(assetClass) {
  const items = await getOk(`/api/catalog?class=${assetClass}`);
  ok(items.length, `catalog không có tài sản loại ${assetClass}`);
  return items[0];
}

/** Một tháng chưa có dữ liệu, để test ghi mà không đụng tháng đã seed. */
async function emptyMonth() {
  const months = await getOk('/api/monthly');
  const m = months.find((x) => x.total_inflow === 0);
  ok(m, 'fixture không còn tháng trống nào');
  return m;
}

/** Một tháng đã có dữ liệu. */
async function filledMonth() {
  const months = await getOk('/api/monthly/filled');
  ok(months.length, 'fixture không có tháng nào đã ghi nhận');
  return months[months.length - 1];
}

// ───────────────────────── dựng dữ liệu ─────────────────────────

async function createMonth({ monthIndex, income = 10000000, expense = 4000000, bonus = 0, note = null }) {
  const months = await getOk('/api/monthly');
  const target = monthIndex
    ? months.find((m) => m.month_index === monthIndex)
    : months.find((m) => m.total_inflow === 0);
  ok(target, 'không tìm được tháng để ghi');
  const r = await post('/api/monthly', {
    month_index: target.month_index,
    month_label: target.month_label,
    income,
    expense,
    bonus,
    note,
  });
  expectOk(r, 'POST /api/monthly');
  return getOk(`/api/monthly/${target.month_index}`);
}

async function createTxn({ assetId, type = 'BUY', quantity = 10, price = 50000, fee = 0, strategy = '', note = '' }) {
  const asset = assetId ? { id: assetId } : await anyStock();
  const r = await post('/api/transactions', {
    date: new Date().toISOString().slice(0, 10),
    asset_type_id: asset.id,
    type,
    quantity,
    price,
    total_amount: quantity * price,
    fee,
    strategy,
    note,
  });
  expectOk(r, 'POST /api/transactions');
  return r.data;
}

async function createSavings({ name = 'Sổ test', bank = 'Test Bank', type = 'term', principal = 5000000, rate = 5, term = 6, categoryId = null } = {}) {
  const r = await post('/api/savings', {
    name,
    bank,
    type,
    principal,
    interest_rate: rate,
    term_months: term,
    start_date: new Date().toISOString().slice(0, 10),
    category_id: categoryId,
  });
  expectOk(r, 'POST /api/savings');
  return r.data;
}

module.exports = {
  get,
  post,
  put,
  del,
  getOk,
  fresh,
  expectOk,
  expectStatus,
  expectShape,
  expectAllBoolean,
  categories,
  categoryByName,
  anyStock,
  anyAsset,
  emptyMonth,
  filledMonth,
  createMonth,
  createTxn,
  createSavings,
  fmt,
  ok,
  eq,
  fail,
};
