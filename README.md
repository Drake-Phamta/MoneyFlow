# Money Flow

Ứng dụng quản lý tài chính cá nhân chạy trên máy, cho một người dùng. Ghi thu
chi hàng tháng, chia tiền nhàn rỗi vào các danh mục theo giai đoạn, theo dõi
danh mục đầu tư và sổ tiết kiệm, rồi tính xem bao giờ thì tài sản đủ để sống
bằng lợi nhuận.

Toàn bộ dữ liệu nằm trên máy bạn, trong một tệp SQLite. Không có máy chủ nào ở
ngoài, không tài khoản, không đồng bộ.

## Chạy

Cần Node.js 18 trở lên và Windows 10/11.

```bash
npm install
npm run dev        # bản desktop: Vite + máy chủ + Electron
npm run dev:web    # bản web: mở http://localhost:5173
```

Hoặc bấm thẳng vào `launchers/money-flow-desktop.vbs` (bản app) hay
`launchers/money-flow-web.vbs` (bản trình duyệt). Hai tệp này dựng lại giao
diện trước khi mở — gọi thẳng `node server.js` thì máy chủ phục vụ bản `dist/`
cũ mà không báo gì.

Lần đầu chạy bản Electron, app tự tạo lối tắt trên Desktop và trong menu Start.

## Cấu trúc

```
brand/          logo gốc và các bản dựng ra từ nó
build/          icon.ico cho bộ cài — electron-builder đọc thư mục này
data/           financial.sqlite, dữ liệu thật. Không lên git.
demo/           bộ dựng video giới thiệu; bộ test dùng chung hạ tầng ở đây
docs/           tài liệu kiến trúc, cơ sở dữ liệu, API
electron/       tiến trình chính, preload, tuyến REST, truy cập dữ liệu
launchers/      bốn tệp bấm-là-chạy cho Windows
public/         favicon và icon cho trang web
scripts/        sinh icon, dựng lối tắt
src/            giao diện React
tests/          bộ kiểm thử, xem phần dưới
index.html      điểm vào của Vite
server.js       máy chủ Express cho bản web
```

Trong `src/`:

```
components/     màn hình và khối dùng chung (components/ui/)
content/        mọi chữ sinh từ dữ liệu: từ điển, hướng dẫn giai đoạn, kiến thức
lib/            projection.mjs — mô hình dự phóng tài sản
styles/         token màu, kiểu chung, phông chữ nhúng sẵn
utils/          định dạng số, bản đồ icon, hai lớp gọi API
```

## Kiến trúc: hai đường truyền

Giao diện không gọi thẳng cơ sở dữ liệu. Nó gọi `src/utils/apiClient.js`, và
lớp này chọn một trong hai đường:

- **Electron** — qua IPC: `preload.js` phơi `window.api`, `main.js` xử lý.
- **Trình duyệt** — qua REST: `server.js` dựng Express, `electron/routes.js`
  đăng ký tuyến.

Cả hai đường cùng đi tới `electron/database.js`.

**Thêm một endpoint là phải sửa đủ bốn lớp**: `routes.js`, `main.js`,
`preload.js`, `src/utils/api.js`. Thiếu một lớp thì bản này chạy bản kia hỏng,
và người dùng chỉ biết khi bấm vào. Hai bộ test `parity` canh đúng chuyện đó —
chúng đọc cả bốn tệp và so danh sách.

Cơ sở dữ liệu là SQLite qua `sql.js`, chạy trong bộ nhớ rồi ghi cả tệp xuống
đĩa mỗi lần lưu. Hai điều dễ vấp: `last_insert_rowid()` phải đọc **trước**
`save()`, và `sql.js` ném ra chuỗi chứ không ném `Error`.

## Kiểm thử và an toàn dữ liệu

`data/financial.sqlite` là sổ tiền thật. Bộ test **không bao giờ** chạm vào nó:

- Test chạy trên một cơ sở dữ liệu riêng ở `%LOCALAPPDATA%\MoneyFlowTest`.
  `demo/record/demo-server.js` tự từ chối khởi động nếu bị trỏ vào tệp thật.
- `tests/rig/guard.js` băm sha256 tệp thật trước và sau mỗi nhóm test. Lệch một
  byte là dừng toàn bộ và thoát mã 2.
- `data/` nằm trong `.gitignore`, và bộ cài không đóng gói nó.

```bash
npm test                  # chạy hết, in độ phủ
npm run test:guard        # chế độ nghiêm: lỗi đã biết cũng tính là hỏng
npm run test:api          # chỉ một nhóm — còn có ui, content, parity,
                          # consistency, electron, projection
npm run test:matrix       # sinh lại ma trận độ phủ từ mã nguồn
npm run test:rig:up       # giữ máy chủ test chạy để tự thử tay
```

Độ phủ không phải danh sách viết tay: `tests/rig/gen-matrix.js` đọc mã nguồn,
liệt kê từng endpoint ở từng lớp, rồi đối chiếu với những gì test khai báo.

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Vite + máy chủ + Electron |
| `npm run dev:web` | Vite + máy chủ, mở bằng trình duyệt |
| `npm run dev:server` | chỉ máy chủ Express |
| `npm start` | dựng rồi phục vụ `dist/` |
| `npm run build` | dựng và đóng gói bộ cài Windows |
| `npm run lint` | ESLint |
| `npm run icons` | sinh lại bộ icon từ `brand/logo-master.png` |
| `npm test` | toàn bộ kiểm thử |

## Công nghệ

Electron 25 · React 18 · Vite 5 · Tailwind 3 · Express · SQLite qua sql.js ·
Recharts · Phosphor Icons.

## Tài liệu

- [Kiến trúc](docs/ARCHITECTURE.md)
- [Cơ sở dữ liệu](docs/DATABASE.md)
- [API](docs/API.md)
- [Dựng video giới thiệu](demo/README.md)

## Giấy phép

Dùng cho mục đích cá nhân.
