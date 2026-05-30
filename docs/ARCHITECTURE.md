# Money_Flow — Kiến trúc tổng thể

## Tổng quan

Money_Flow là ứng dụng quản lý tài chính cá nhân, chạy được trên 2 nền tảng:
- **Desktop** (Electron) — IPC trực tiếp đến SQLite
- **Web** (Browser) — REST API đến Express server

Cùng 1 codebase frontend, cùng 1 database, khác nhau ở transport layer.

```
┌─────────────────────────────────────────────────┐
│                  React Frontend                  │
│  (Dashboard, CashFlow, Investments, Scenarios,   │
│   Settings, MonthlyEntry, ExecutionLog, ...)     │
└──────────────────┬──────────────────────────────┘
                   │
           ┌───────┴───────┐
           │  apiClient.js │  ← tự động chọn transport
           └───────┬───────┘
        ┌──────────┴──────────┐
        │                     │
  ┌─────┴─────┐        ┌─────┴─────┐
  │ window.api│        │  REST API │
  │  (IPC)    │        │  (fetch)  │
  └─────┬─────┘        └─────┬─────┘
        │                     │
  ┌─────┴─────┐        ┌─────┴─────┐
  │  preload  │        │ server.js │
  │    .js    │        │  Express  │
  └─────┬─────┘        └─────┬─────┘
        │                     │
        └──────────┬──────────┘
                   │
           ┌───────┴───────┐
           │ database.js   │
           │ (FinancialDB) │
           │   sql.js      │
           └───────┬───────┘
                   │
           ┌───────┴───────┐
           │   financial   │
           │   .sqlite     │
           └───────────────┘
```

## Dual-Transport Pattern

File `src/utils/apiClient.js` quyết định transport:

```js
const isElectron = typeof window !== 'undefined' && window.api;
export const apiClient = isElectron ? window.api : restApi;
```

- **Electron**: `apiClient.savings.get()` → `window.api.savings.get()` → `ipcRenderer.invoke('savings:get')` → `ipcMain.handle(...)` → `db.getSavingsAccounts()`
- **Browser**: `apiClient.savings.get()` → `fetch('/api/savings')` → Express route → `db.getSavingsAccounts()`

Cả 2 trả về cùng data shape. Component không cần biết đang chạy mode nào.

## Thêm endpoint mới

Khi thêm API mới, phải cập nhật **4 nơi**:

| # | File | Ví dụ |
|---|------|-------|
| 1 | `electron/database.js` | `myNewMethod(data) { ... }` |
| 2 | `electron/main.js` | `ipcMain.handle('mymodule:myMethod', ...)` |
| 3 | `electron/preload.js` | `myMethod: (data) => ipcRenderer.invoke('mymodule:myMethod', data)` |
| 4 | `server.js` | `app.post('/api/mymodule', (req, res) => { ... })` |
| 5 | `src/utils/api.js` | `myMethod: (data) => post('/mymodule', data)` |

Sau đó dùng `apiClient.myMethod(data)` trong component.

## Cron Jobs

Cả Electron và Express đều chạy cron job tự động lấy giá:

```
*/30 9-14 * * 1-5  (Asia/Ho_Chi_Minh)
```

- Mỗi 30 phút, từ 9h-14h, thứ 2-6
- Gọi `priceService.fetchAllWatchlistPrices()`
- Cập nhật `asset_types.current_price`, `asset_types.peak_price`
- Tạo alert nếu giá giảm >=15% từ đỉnh

## Phát triển

```bash
# Web mode (browser, port 5173 + 3001)
npm run dev:web

# Electron mode (desktop)
npm run dev

# Build production
npm run build
```

- Dev web: Vite (5173) + Express (3001), proxy `/api` → 3001
- Dev Electron: Vite + Express + Electron, Electron load từ 5173
- Production: `vite build` → `dist/`, Electron embed Express load từ `dist/`
