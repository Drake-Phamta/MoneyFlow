/**
 * http.js — HTTP client cho bộ test.
 * Nâng từ tests/test-42-cases.js:16-49, thêm base URL cấu hình được + timeout.
 */
const http = require('http');
const { BASE } = require('./env');

function request(method, apiPath, body, { timeout = 30000, base = BASE } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}${apiPath}`);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {},
    };
    let payload;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw), raw });
        } catch {
          resolve({ status: res.statusCode, data: raw, raw });
        }
      });
    });
    req.setTimeout(timeout, () => {
      req.destroy(new Error(`Timeout ${timeout}ms: ${method} ${apiPath}`));
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

const get = (p, o) => request('GET', p, undefined, o);
const post = (p, b, o) => request('POST', p, b, o);
const put = (p, b, o) => request('PUT', p, b, o);
const del = (p, o) => request('DELETE', p, undefined, o);

/** Như get() nhưng ném lỗi nếu status không phải 2xx, và trả thẳng .data. */
async function getOk(p, o) {
  const r = await get(p, o);
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`GET ${p} → ${r.status}: ${String(r.raw).slice(0, 200)}`);
  }
  return r.data;
}

module.exports = { request, get, post, put, del, getOk };
