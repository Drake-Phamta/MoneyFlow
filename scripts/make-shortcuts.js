const { exec } = require('child_process');
const path = require('path');

/**
 * Dựng (hoặc sửa) lối tắt Money Flow trên Desktop và menu Start.
 * Electron gọi hàm này lúc khởi động.
 *
 * @returns {Promise<boolean>} true nếu lối tắt đã sẵn sàng
 */
function ensureShortcuts() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(false);

    const vbsPath = path.join(__dirname, 'make-shortcuts.vbs');
    exec(`cscript //nologo "${vbsPath}"`, { windowsHide: true }, (err) => {
      if (err) {
        console.warn('[Shortcuts] Không dựng được lối tắt:', err.message);
        resolve(false);
      } else {
        console.log('[Shortcuts] Lối tắt Desktop và menu Start đã đúng');
        resolve(true);
      }
    });
  });
}

module.exports = { ensureShortcuts };

// Chạy thẳng: node scripts/make-shortcuts.js
if (require.main === module) {
  ensureShortcuts().then((ok) => process.exit(ok ? 0 : 1));
}
