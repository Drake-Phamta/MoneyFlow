# Cau truc thu muc

## Root

```
Money_Flow/
├── package.json          Dependencies, scripts, electron-builder config
├── index.html            SPA entry point (Vite mount vao day)
├── vite.config.js        Vite: React plugin, proxy /api → localhost:3001
├── tailwind.config.js    Tailwind: primary palette, Inter font
├── postcss.config.js     PostCSS: tailwind + autoprefixer
├── server.js             Express server standalone (browser mode)
├── data/                 SQLite database (gitignored)
├── public/               Static assets (icon.ico, icon.png)
├── src/                  Frontend React
├── electron/             Electron backend
├── docs/                 Tai lieu
├── scripts/              Utility scripts (tao icon, shortcut)
├── tests/                Test files
└── release/              electron-builder output (gitignored)
```

## `src/` — Frontend

```
src/
├── main.jsx              Entry: HashRouter + React.StrictMode + App
├── App.jsx               Route definitions (5 routes → 5 pages)
├── styles/
│   └── global.css        Tailwind directives + custom classes (.card, .btn-primary, .input, .table, .kpi, .badge, ...)
├── utils/
│   ├── api.js            REST client: fetch wrapper + all endpoint methods
│   ├── apiClient.js      Unified client: auto-detect Electron vs Browser
│   ├── formatters.js     formatVND, formatNumber, formatCompact, formatDate
│   ├── numberFormat.js   formatNumberInput (dots), parseNumberInput (strip dots)
│   └── iconMap.jsx       Emoji/name → Phosphor icon mapping + AppIcon component
├── components/
│   ├── Layout.jsx        Sidebar nav (5 items) + main content area
│   ├── Dashboard.jsx     Trang tong quan: KPI, portfolio, pie, phase, activity
│   ├── CashFlowPage.jsx  Dong tien: bieu do + so cai
│   ├── InvestmentsPage.jsx Dau tu: 4 tabs (Portfolio / Savings / Sniper / Allocation)
│   ├── MonthlyEntry.jsx  Wizard nhap lieu 4 buoc
│   ├── MasterLedger.jsx  Bang toan bo monthly entries
│   ├── ExecutionLog.jsx  Nhat ky giao dich mua/ban + canh bao chenh lech
│   ├── SniperPlaybook.jsx Chien luoc Ban Tia: watchlist, alerts, deploy
│   ├── SavingsSection.jsx Tiet kiem: so, bom von, dao han, tich luy vang
│   ├── Scenarios.jsx     Lo trinh tai chinh, kien thuc, du phong FI
│   ├── Settings.jsx      Cai dat: chi tieu, import/export, quan ly du lieu
│   ├── FormattedInput.jsx Input so co dau cham (reusable)
│   ├── charts/
│   │   ├── AllocationPie.jsx Bieu do tron phan bo
│   │   └── AssetGrowth.jsx   Bieu do tang truong tai san (bear/base/bull)
│   └── dashboard/
│       ├── AllocationGoals.jsx Phan bo hien tai vs muc tieu + risk metrics
│       ├── CashFlow.jsx        Bieu do dong tien (standalone, cu)
│       └── Overview.jsx        Tong quan standalone (cu, khong dung)
```

## `electron/` — Backend

```
electron/
├── main.js           Electron main process + Express embed + IPC handlers (~50 handlers)
├── preload.js        contextBridge: expose window.api cho renderer
├── database.js       FinancialDB class: sql.js, tables, migrations, CRUD (~60 methods)
├── priceService.js   PriceService: VNDIRECT stocks, SJC gold, alerts
└── routes.js         Express REST API routes
```

## Routes (App.jsx)

| Path | Component | Mo ta |
|------|-----------|-------|
| `/` | Dashboard | Tong quan tai chinh |
| `/cashflow` | CashFlowPage | Phan tich dong tien |
| `/investments` | InvestmentsPage | Danh muc dau tu (4 tabs) |
| `/scenarios` | Scenarios | Lo trinh & du phong |
| `/settings` | Settings | Cai dat he thong |

## Page → Component tree

```
Dashboard
├── KPI cards (6)
├── Portfolio table (inline price edit)
├── Mini cash flow chart
├── AllocationPie
├── Phase allocation targets
└── Activity feed

CashFlowPage
├── KPI cards (5)
├── Bar chart (income/expense/net)
├── Savings rate line chart
├── MasterLedger (toggle)
└── MonthlyEntry (wizard)

InvestmentsPage
├── Tab: Portfolio → ExecutionLog
│   ├── Available-to-invest banner
│   ├── Discrepancy warning
│   └── Transaction table
├── Tab: Savings → SavingsSection
│   ├── Savings overview
│   ├── Type breakdown + Gold tracker
│   └── Savings accounts table (edit/deposit/delete)
├── Tab: Sniper → SniperPlaybook
│   ├── Watchlist radar
│   ├── Deploy rules
│   └── Alert panel
└── Tab: Allocation → AllocationGoals
    ├── Pie chart
    ├── Target vs current bars
    └── Risk metrics

Scenarios
├── Phase roadmap (expandable + checklists)
├── Knowledge base
├── Allocation targets
└── FI projections (3 scenarios)

Settings
├── Expense target config
├── Excel import/export
├── Timeline presets
├── Phase display
├── Category/asset management
└── Data management (clear)
```
