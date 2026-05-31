# Money_Flow - Agent Guide

## Project Overview
Personal finance management app built with Electron + React + SQLite.

## Architecture
- **Frontend**: React 18 + Vite + TailwindCSS + Recharts
- **Backend**: Express (port 3001) + sql.js (WASM SQLite)
- **Desktop**: Electron 31
- **Dual transport**: REST API (browser) or IPC (Electron)

## Key Files
- `electron/database.js` — FinancialDB class, 15 tables, ~60 methods
- `electron/main.js` — Electron main process, IPC handlers
- `electron/preload.js` — contextBridge exposing window.api
- `electron/priceService.js` — VNDIRECT price fetching
- `server.js` — Express REST API (~40 endpoints)
- `src/utils/apiClient.js` — Auto-selects IPC or REST

## Database
- 15 tables: parameters, asset_types, categories, phases, phase_allocations, monthly_entries, allocations, transactions, portfolio_snapshots, activity_log, savings_accounts, savings_transactions, watchlist, alerts, price_history
- Path: `data/money_flow.sqlite` (standalone) or `userData/money_flow.sqlite` (Electron)

## Commands
- `npm run dev:web` — Vite + Express (browser mode)
- `npm run dev` — Vite + Express + Electron (desktop mode)
- `npm run build` — Build for production

## Safety Rules
- NEVER use `rm -rf` or destructive commands
- ALWAYS use PowerShell on Windows
- ALWAYS backup before modifying critical files
- NEVER delete files without user confirmation

## Known Issues
- VNDIRECT API returns 403 (network/external issue)
- `D:\browserslist` file causes Vite errors (overwrite with `# empty`)
