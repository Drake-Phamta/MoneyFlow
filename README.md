# Money Flow

Quản lý tài chính cá nhân — theo dõi thu chi, đầu tư, tiết kiệm và đạt mục tiêu tài chính.

![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Electron](https://img.shields.io/badge/electron-25.x-47848F)
![React](https://img.shields.io/badge/react-18.x-61DAFB)
![SQLite](https://img.shields.io/badge/sqlite-3.x-003B57)

## Tính năng

- **Dashboard** — Tổng quan tài chính, KPI, portfolio
- **Quản lý thu chi** — Nhập liệu hàng tháng, phân bổ tự động
- **Theo dõi đầu tư** — Portfolio chứng khoán, ETF, vàng
- **Tiết kiệm** — Sổ tiết kiệm, lãi suất, đáo hạn
- **Mục tiêu** — Thiết lập và theo dõi tiến độ
- **Scenario Planning** — Mô phỏng các kịch bản tài chính
- **Sniper Playbook** — Chiến lược đầu tư, watchlist, cảnh báo giá
- **Import Excel** — Nhập dữ liệu từ file Excel

## Cài đặt

### Yêu cầu
- Node.js >= 18.x
- npm >= 9.x
- Windows 10/11

### Bước 1: Clone repository
```bash
git clone https://github.com/Drake-Phamta/MoneyFlow.git
cd MoneyFlow
```

### Bước 2: Cài đặt dependencies
```bash
npm install
```

### Bước 3: Chạy ứng dụng

**Desktop (Electron):**
```bash
npm run dev
```
Hoặc chạy file `MoneyFlow_Desktop.bat`

**Web (Browser):**
```bash
npm run dev:web
```
Hoặc chạy file `MoneyFlow_Web.bat`

## Cấu trúc thư mục

```
Money_Flow/
├── data/                    SQLite databases
├── docs/                    Tài liệu dự án
├── electron/                Electron main process
│   ├── main.js              Entry point
│   ├── database.js          Database operations
│   ├── priceService.js      Giá vàng/tiền tệ
│   ├── routes.js            API routes
│   └── preload.js           Preload script
├── public/                  Static assets
├── scripts/                 Utility scripts
├── src/                     React source code
│   ├── components/          React components
│   │   ├── charts/          Chart components
│   │   └── dashboard/       Dashboard widgets
│   ├── styles/              CSS styles
│   └── utils/               Utilities
├── tests/                   Test files
├── index.html               HTML entry
├── server.js                Express server
├── package.json             Dependencies
├── vite.config.js           Vite config
└── tailwind.config.js       Tailwind config
```

## Công nghệ sử dụng

| Layer | Technology |
|-------|------------|
| Desktop | Electron 25.x |
| Frontend | React 18, Vite 5, TailwindCSS 3 |
| Backend | Express.js, Node.js |
| Database | SQLite (sql.js) |
| Charts | Recharts |
| Icons | Phosphor Icons |

## Scripts

| Script | Mô tả |
|--------|-------|
| `npm run dev` | Chạy đầy đủ (Vite + Server + Electron) |
| `npm run dev:web` | Chạy web mode (Vite + Server) |
| `npm run dev:server` | Chỉ chạy server |
| `npm run build` | Build cho production |

## Tài liệu

- [API Documentation](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database Schema](docs/DATABASE.md)
- [Project Structure](docs/STRUCTURE.md)

## Đóng góp

1. Fork repository
2. Tạo feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Tạo Pull Request

## License

Dự án này dành cho mục đích sử dụng cá nhân.

---

Phát triển bởi Drake-Phamta
