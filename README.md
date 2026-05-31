# Money Flow

Quan ly tai chinh ca nhan — theo doi thu chi, dau tu, tiet kiem va dat muc tieu tai chinh.

![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Electron](https://img.shields.io/badge/electron-25.x-47848F)
![React](https://img.shields.io/badge/react-18.x-61DAFB)
![SQLite](https://img.shields.io/badge/sqlite-3.x-003B57)

## Tinh nang

- **Dashboard** — Tong quan tai chinh, KPI, portfolio
- **Quan ly thu chi** — Nhap lieu hang thang, phan bo tu dong
- **Theo doi dau tu** — Portfolio chung khoan, ETF, vang
- **Tiet kiem** — So tiet kiem, lai suat, dao han
- **Muc tieu** — Thiet lap va theo doi tien do
- **Scenario Planning** — Mo phong cac kich ban tai chinh
- **Sniper Playbook** — Chien luoc dau tu, watchlist, canh bao gia
- **Import Excel** — Nhap du lieu tu file Excel

## Cai dat

### Yeu cau
- Node.js >= 18.x
- npm >= 9.x
- Windows 10/11

### Buoc 1: Clone repository
```bash
git clone https://github.com/your-username/money-flow.git
cd money-flow
```

### Buoc 2: Cai dat dependencies
```bash
npm install
```

### Buoc 3: Chay ung dung

**Desktop (Electron):**
```bash
npm run dev
```
Hoac chay file `MoneyFlow_Desktop.bat`

**Web (Browser):**
```bash
npm run dev:web
```
Hoac chay file `MoneyFlow_Web.bat`

## Cau truc thu muc

```
Money_Flow/
├── data/                    SQLite databases
├── docs/                    Tai lieu du an
├── electron/                Electron main process
│   ├── main.js              Entry point
│   ├── database.js          Database operations
│   ├── priceService.js      Gia vang/tien te
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

## Cong nghe su dung

| Layer | Technology |
|-------|------------|
| Desktop | Electron 25.x |
| Frontend | React 18, Vite 5, TailwindCSS 3 |
| Backend | Express.js, Node.js |
| Database | SQLite (sql.js) |
| Charts | Recharts |
| Icons | Phosphor Icons |

## Scripts

| Script | Mo ta |
|--------|-------|
| `npm run dev` | Chay day du (Vite + Server + Electron) |
| `npm run dev:web` | Chay web mode (Vite + Server) |
| `npm run dev:server` | Chi chay server |
| `npm run build` | Build cho production |

## Tai lieu

- [API Documentation](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database Schema](docs/DATABASE.md)
- [Project Structure](docs/STRUCTURE.md)

## Dong gop

1. Fork repository
2. Tao feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Tao Pull Request

## License

Du an nay danh cho muc dich su dung ca nhan.

---

Phat trien boi Drake-Phamta
