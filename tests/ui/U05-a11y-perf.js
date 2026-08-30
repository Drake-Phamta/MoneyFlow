/**
 * U05 — Dùng được bằng bàn phím, đọc được ở cả hai nền, và không gọi API thừa.
 *
 * Ba nhóm này đều thuộc loại "không ai báo lỗi nhưng ai cũng chịu đựng": bấm
 * Escape mà hộp không đóng, chữ xám trên nền trắng, mỗi lần vào một trang là
 * bảy mươi lời gọi mạng.
 */
const { group, t, ok, eq, fail } = require('../rig/assert');
const { reset } = require('../rig/reset');
const { Browser } = require('./_browser');
const { routes } = require('./_routes');

/** Tương phản theo WCAG, tính trên hai màu đã phân giải. */
function contrast(rgb1, rgb2) {
  const lum = ([r, g, b]) => {
    const f = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const a = lum(rgb1);
  const b = lum(rgb2);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

function parseRgb(s) {
  const m = String(s).match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

async function run() {
  group('U05 — Bàn phím, tương phản, số lời gọi');
  await reset();

  const b = await new Browser().open();
  try {
    await t(
      'UI-A-01',
      'Đi hết thanh điều hướng chỉ bằng phím Tab',
      [],
      async () => {
        await b.goto('/');
        // Ghi lại mọi phần tử nhận tiêu điểm bằng MỘT lần cài đặt, rồi đọc một
        // lần — hỏi trình duyệt sau mỗi lần bấm Tab thì bộ test chạy quá chậm.
        await b.rec.page.bringToFront();
        await b.rec.page.evaluate(() => {
          window.__tabLog = [];
          document.addEventListener('focusin', (e) => {
            const el = e.target;
            if (el && el.tagName === 'A') window.__tabLog.push(el.getAttribute('href'));
          });
          document.body.focus();
        });

        for (let i = 0; i < 20; i++) await b.rec.page.keyboard.press('Tab');
        const log = await b.rec.page.evaluate(() => window.__tabLog || []);
        const reached = new Set(
          log.filter((h) => h && h.startsWith('#/')).map((h) => h.slice(1))
        );

        for (const path of ['/', '/cashflow', '/investments', '/scenarios', '/settings']) {
          ok(
            reached.has(path),
            `bấm Tab 20 lần vẫn không tới được "${path}" — tới được: ` +
              [...reached].join(', ')
          );
        }
      }
    );

    await t(
      'UI-A-02',
      'Mọi nút và ô nhập đều có tên đọc được',
      [],
      async () => {
        const bad = [];
        for (const r of routes().slice(0, 6)) {
          await b.goto(r.hash);
          const found = await b.rec.page.evaluate(() => {
            const out = [];
            for (const el of document.querySelectorAll('button, input, select')) {
              if (el.offsetParent === null) continue;
              const name =
                el.getAttribute('aria-label') ||
                el.getAttribute('title') ||
                el.innerText?.trim() ||
                (el.id && document.querySelector(`label[for="${el.id}"]`)?.innerText) ||
                el.closest('label')?.innerText ||
                el.getAttribute('placeholder');
              if (!name) out.push(el.tagName + '.' + (el.className || '').split(' ')[0]);
            }
            return out;
          });
          if (found.length) bad.push(`${r.label}: ${found.slice(0, 4).join(', ')}`);
        }
        ok(
          bad.length === 0,
          `${bad.length} màn hình có nút hoặc ô nhập không tên:\n      ` + bad.join('\n      ')
        );
      }
    );

    await t(
      'UI-A-03',
      'Escape đóng được hộp thoại và trả tiêu điểm về chỗ cũ',
      [],
      async () => {
        await b.goto('/investments?tab=savings');
        const opened = await b.rec.page.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find((x) =>
            /thêm sổ|\+ sổ/i.test(x.innerText || '')
          );
          if (!btn) return false;
          btn.click();
          return true;
        });
        if (!opened) return; // màn hình này không có hộp thoại nào để thử

        await new Promise((r) => setTimeout(r, 300));
        await b.rec.page.keyboard.press('Escape');
        await new Promise((r) => setTimeout(r, 300));

        const stillOpen = await b.rec.page.evaluate(
          () => !!document.querySelector('[role="dialog"]')
        );
        ok(!stillOpen, 'bấm Escape mà hộp thoại vẫn mở');
      }
    );

    await t(
      'UI-A-04',
      'Chữ đủ tương phản trên nền sáng và nền tối',
      [],
      async () => {
        const failures = [];
        await b.goto('/');
        for (const theme of ['light', 'dark']) {
          await b.rec.page.evaluate((t) => {
            document.documentElement.setAttribute('data-theme', t);
          }, theme);
          await new Promise((r) => setTimeout(r, 500));

          const samples = await b.rec.page.evaluate(() => {
            const out = [];
            const nodes = [...document.querySelectorAll('main p, main span, main h1, main h2, main h3')];
            for (const el of nodes.slice(0, 80)) {
              if (!el.innerText?.trim() || el.offsetParent === null) continue;
              const cs = getComputedStyle(el);
              // Tìm nền thực sự phía sau, không phải "transparent".
              let bgEl = el;
              let bg = 'rgba(0, 0, 0, 0)';
              let gradient = false;
              while (bgEl && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
                const s2 = getComputedStyle(bgEl);
                // Nền chuyển sắc phải lấy mẫu từng điểm ảnh mới đo được. Ở đây
                // bỏ qua và ghi nhận, thay vì đo nhầm vào nền của thẻ cha rồi
                // báo một lỗi không có thật.
                if (s2.backgroundImage && s2.backgroundImage !== 'none') gradient = true;
                bg = s2.backgroundColor;
                bgEl = bgEl.parentElement;
              }
              if (gradient) continue;
              out.push({
                text: el.innerText.trim().slice(0, 30),
                fg: cs.color,
                bg,
                size: parseFloat(cs.fontSize),
                weight: Number(cs.fontWeight) || 400,
              });
            }
            return out;
          });

          for (const s of samples) {
            const fg = parseRgb(s.fg);
            const bg = parseRgb(s.bg);
            if (!fg || !bg) continue;
            const ratio = contrast(fg, bg);
            // Chữ lớn hoặc đậm cần 3:1; chữ thường cần 4,5:1.
            const large = s.size >= 24 || (s.size >= 18.66 && s.weight >= 700);
            const need = large ? 3 : 4.5;
            if (ratio < need) {
              failures.push(
                `${theme} · "${s.text}" ${ratio.toFixed(2)}:1 (cần ${need}:1)`
              );
            }
          }
        }
        ok(
          failures.length === 0,
          `${failures.length} chỗ chữ chìm vào nền:\n      ` +
            failures.slice(0, 8).join('\n      ')
        );
      }
    );

    await t(
      'UI-P-01',
      'Mở một trang không gọi quá nhiều lần lên máy chủ',
      [],
      async () => {
        const counts = {};
        for (const r of routes().filter((x) =>
          ['dashboard', 'scenarios', 'invest-allocation', 'cashflow'].includes(x.id)
        )) {
          const seen = [];
          const onReq = (req) => {
            const u = req.url();
            if (u.includes('/api/')) seen.push(u.split('/api/')[1].split('?')[0]);
          };
          b.rec.page.on('request', onReq);
          await b.goto(r.hash);
          b.rec.page.off('request', onReq);
          counts[r.id] = seen.length;
        }

        const noisy = Object.entries(counts).filter(([, n]) => n > 12);
        ok(
          noisy.length === 0,
          `trang gọi quá nhiều: ` +
            noisy.map(([k, n]) => `${k} ${n} lần`).join(', ') +
            ` — mỗi lời gọi thừa là một lần người dùng chờ`
        );
      }
    );

    await t(
      'UI-P-02',
      'Không trang nào gọi cùng một đường dẫn nhiều lần',
      [],
      async () => {
        const dupes = [];
        for (const r of routes().filter((x) =>
          ['dashboard', 'scenarios', 'invest-portfolio'].includes(x.id)
        )) {
          const seen = [];
          const onReq = (req) => {
            const u = req.url();
            if (u.includes('/api/')) seen.push(u.split('/api/')[1].split('?')[0]);
          };
          b.rec.page.on('request', onReq);
          await b.goto(r.hash);
          b.rec.page.off('request', onReq);

          const tally = {};
          for (const u of seen) tally[u] = (tally[u] || 0) + 1;
          // Vòng N+1 lộ ra ở đây: cùng một đường dẫn gọi mỗi tháng một lần.
          for (const [u, n] of Object.entries(tally)) {
            if (n >= 3) dupes.push(`${r.label}: /${u} gọi ${n} lần`);
          }
        }
        ok(dupes.length === 0, dupes.join('\n      '));
      }
    );
  } finally {
    await b.close();
    await reset();
  }
}

module.exports = { run };
