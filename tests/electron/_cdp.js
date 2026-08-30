/**
 * _cdp.js — Nói thẳng giao thức gỡ lỗi của Chrome, không qua Puppeteer.
 *
 * Puppeteer 25 không thấy được cửa sổ của Electron: /json/list báo có một
 * target kiểu "page" nhưng browser.targets() trả về mảng rỗng, vì Chrome bên
 * trong Electron là bản 114 còn Puppeteer đã đổi cách dò target. Nói thẳng
 * CDP thì không có chỗ nào để lệch phiên bản.
 *
 * Chỉ cần đúng một lệnh: Runtime.evaluate với awaitPromise.
 */

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message || 'lỗi CDP'));
      else p.resolve(msg.result);
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} quá hạn`));
      }, 30000);
    });
  }

  /** Chạy một biểu thức trong trang và trả về giá trị đã tuần tự hoá. */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(d.exception?.description || d.text || 'lỗi khi chạy trong trang');
    }
    return r.result?.value;
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // đóng rồi thì thôi
    }
  }
}

/** Nối vào cửa sổ đầu tiên kiểu "page" của một tiến trình Electron đang chạy. */
async function attach(port, { timeout = 45000 } = {}) {
  const started = Date.now();
  let wsUrl = null;

  while (Date.now() - started < timeout) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const target = list.find(
        (t) => t.type === 'page' && !String(t.url).startsWith('devtools://')
      );
      if (target?.webSocketDebuggerUrl) {
        wsUrl = target.webSocketDebuggerUrl;
        break;
      }
    } catch {
      // chưa mở xong
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!wsUrl) throw new Error(`không thấy cửa sổ nào ở cổng gỡ lỗi ${port}`);

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('không mở được WebSocket gỡ lỗi')), {
      once: true,
    });
    setTimeout(() => reject(new Error('WebSocket gỡ lỗi quá hạn')), 15000);
  });

  const cdp = new CDP(ws);
  await cdp.send('Runtime.enable');
  return cdp;
}

module.exports = { attach, CDP };
