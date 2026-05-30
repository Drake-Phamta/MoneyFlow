# Cấu trúc thư mục

## Root

```
financial-command-center/
├── package.json          # Dependencies, scripts, electron-builder config
├── index.html            # SPA entry point (Vite mount vào đây)
├── vite.config.js        # Vite: React plugin, proxy /api → localhost:3001
├── tailwind.config.js    # Tailwind: primary palette, Inter font
├── postcss.config.js     # PostCSS: tailwind + autoprefixer
├── server.js             # Express server standalone (browser mode)
├── icon.ico              # App icon
├── Money_Flow.bat        # Launcher script (web mode)
├── Money_Flow.vbs        # Launcher script (silent)
├── data/                 # SQLite database
│   └── financial.sqlite
├── src/                  # Frontend React
├── electron/             # Electron backend
├── docs/                 # Tài liệu (này)
└── release/              # electron-builder output
```

## `src/` — Frontend

```
src/
├── main.jsx              # Entry: HashRouter + React.StrictMode + App
├── App.jsx               # Route definitions (5 routes → 5 pages)
├── styles/
│   └── global.css        # Tailwind directives + custom classes (.card, .btn-primary, .input, .table, .kpi, .badge, ...)
├── utils/
│   ├── api.js            # REST client: fetch wrapper + all endpoint methods
│   ├── apiClient.js      # Unified client: auto-detect Electron vs Browser
│   ├── formatters.js     # formatVND, formatNumber, formatCompact, formatDate
│   ├── numberFormat.js   # formatNumberInput (dots), parseNumberInput (strip dots)
│   └── iconMap.jsx       # Emoji/name → Phosphor icon mapping + AppIcon component
├── components/
│   ├── Layout.jsx        # Sidebar nav (5 items) + main content area
│   ├── Dashboard.jsx     # Trang tổng quan: KPI, portfolio, pie, phase, activity
│   ├── CashFlowPage.jsx  # Dòng tiền: biểu đồ + sổ cái
│   ├── InvestmentsPage.jsx # Đầu tư: 4 tabs (Portfolio / Savings / Sniper / Allocation)
│   ├── MonthlyEntry.jsx  # Wizard nhập liệu 4 bước
│   ├── MasterLedger.jsx  # Bảng toàn bộ monthly entries
│   ├── ExecutionLog.jsx  # Nhật ký giao dịch mua/bán + cảnh báo chênh lệch
│   ├── SniperPlaybook.jsx # Chiến lược Bắn Tỉa: watchlist, alerts, deploy
│   ├── SavingsSection.jsx # Tiết kiệm: sổ, bơm vốn, đáo hạn, tích lũy vàng
│   ├── Scenarios.jsx     # Lộ trình tài chính, kiến thức, dự phóng FI
│   ├── Settings.jsx      # Cài đặt: chi tiêu, import/export, quản lý dữ liệu
│   ├── FormattedInput.jsx # Input số có dấu chấm (reusable)
│   ├── charts/
│   │   ├── AllocationPie.jsx # Biểu đồ tròn phân bổ
│   │   └── AssetGrowth.jsx   # Biểu đồ tăng trưởng tài sản (bear/base/bull)
│   └── dashboard/
│       ├── AllocationGoals.jsx # Phân bổ hiện tại vs mục tiêu + risk metrics
│       ├── CashFlow.jsx        # Biểu đồ dòng tiền (standalone, cũ)
│       └── Overview.jsx        # Tổng quan standalone (cũ, không dùng)
```

## `electron/` — Backend

```
electron/
├── main.js           # Electron main process + Express embed + IPC handlers (~50 handlers)
├── preload.js        # contextBridge: expose window.api cho renderer
├── database.js       # FinancialDB class: sql.js, tables, migrations, CRUD (~60 methods)
└── priceService.js   # PriceService: VNDIRECT stocks, SJC gold, alerts
```

## Routes (App.jsx)

| Path | Component | Mô tả |
|------|-----------|-------|
| `/` | Dashboard | Tổng quan tài chính |
| `/cashflow` | CashFlowPage | Phân tích dòng tiền |
| `/investments` | InvestmentsPage | Danh mục đầu tư (4 tabs) |
| `/scenarios` | Scenarios | Lộ trình & dự phóng |
| `/settings` | Settings | Cài đặt hệ thống |

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
│   ├── Money_Flow overview
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
