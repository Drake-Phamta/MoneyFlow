const { exec } = require('child_process');
const path = require('path');

/**
 * Ensures Money Flow shortcuts exist on Windows Desktop.
 * Called from Electron main process on startup.
 * @returns {Promise<boolean>} true if shortcuts are present (created or already exist)
 */
function ensureShortcuts() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(false);

    const vbsPath = path.join(__dirname, 'ensure_shortcuts.vbs');
    exec(`cscript //nologo "${vbsPath}"`, { windowsHide: true }, (err) => {
      if (err) {
        console.warn('[Shortcuts] Auto-repair failed:', err.message);
        resolve(false);
      } else {
        console.log('[Shortcuts] Desktop shortcuts verified/created');
        resolve(true);
      }
    });
  });
}

module.exports = { ensureShortcuts };

// Allow direct execution: node scripts/ensure-shortcuts.js
if (require.main === module) {
  ensureShortcuts().then(ok => {
    process.exit(ok ? 0 : 1);
  });
}
