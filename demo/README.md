# Demo video — Money Flow

Pipeline dựng video demo 3 phút, tiếng Việt, tái tạo được hoàn toàn.
Sửa một câu thoại → sửa `script.json` → chạy lại đúng scene đó, không phải quay lại từ đầu.

Kết quả nằm ở `demo/out/`:

| File | Nội dung |
|---|---|
| `MoneyFlow-Demo-vi-1080p.mp4` | **Bản chính** — 1920×1080 60fps, voiceover + phụ đề burn-in |
| `MoneyFlow-Demo-vi-1080p-nosub.mp4` | Có tiếng, không phụ đề |
| `MoneyFlow-Demo-vi-silent.mp4` | Không tiếng — để tự lồng nhạc hoặc giọng khác |
| `MoneyFlow-Demo-vi.srt` | Phụ đề rời (upload YouTube) |

---

## An toàn dữ liệu

**`data/financial.sqlite` không bao giờ bị đụng tới.** Toàn bộ demo chạy trên
`demo/build/demo.sqlite`, một file riêng do `demo/record/demo-server.js` tạo ra.

Ba lớp bảo vệ:

1. `demo-server.js` **từ chối khởi động** nếu đường dẫn DB trỏ vào `data/financial.sqlite`.
2. `seed-demo.js` **từ chối seed** nếu server không chạy trên DB demo.
3. `run-scene.js` **từ chối quay** nếu server không chạy trên DB demo.

Bản sao dự phòng của DB thật: `demo/build/backup/financial.REAL.*.sqlite`.

Không có file nguồn nào của app bị sửa. `FinancialDB` vốn đã nhận `dbPath` qua constructor
([electron/database.js](../electron/database.js)), nên `demo-server.js` chỉ cần truyền
đường dẫn khác thay vì phải vá `server.js`.

---

## Chạy lại từ đầu

```bash
# 1. Voiceover + phụ đề + bảng thời lượng  (cần: pip install edge-tts)
node demo/record/build-vo.js

# 2. Font Inter offline (chạy 1 lần, cần mạng)
node demo/record/build-fonts.js

# 3. Build frontend riêng cho demo (không đụng dist/ của project)
npx vite build --outDir demo/build/dist --emptyOutDir

# 4. Server demo — để chạy nền suốt quá trình quay
node demo/record/demo-server.js

# 5. Bơm dữ liệu demo, rồi chốt snapshot gốc
node demo/seed/seed-demo.js
cp demo/build/demo.sqlite demo/build/db-snapshots/after-00-seeded.sqlite

# 6. Quay từng scene (scene 05/06/07 có ghi DB nên phải đúng thứ tự)
node demo/record/restore-db.js seeded
for s in 02-dashboard 03-networth 04-cashflow 05-wizard 06-ledger 07-savings 08-sniper 09-allocation; do
  node demo/record/run-scene.js $s
done
node demo/record/run-scene.js 10-scenarios
node demo/record/run-scene.js 01-intro
node demo/record/run-scene.js 11-outro

# 7. Ghép hình + tiếng + phụ đề
node demo/record/assemble.js
```

Kiểm tra nhanh bố cục mọi màn hình mà không cần quay: `node demo/record/probe.js 1728 972`
→ ảnh tĩnh trong `demo/build/probe/`.

---

## Sửa nội dung

**Đổi lời thoại**: sửa trường `vo` trong [`script.json`](script.json), rồi:

```bash
node demo/record/build-vo.js          # sinh lại tiếng + timing
node demo/record/restore-db.js seeded # nếu scene đó có ghi DB
node demo/record/run-scene.js 04-cashflow
node demo/record/assemble.js
```

**Đổi giọng**: `node demo/record/build-vo.js --voice vi-VN-NamMinhNeural`
(hoặc sửa `voice` trong `script.json`). Phải quay lại tất cả scene vì độ dài đổi.

**Ghép nhạc nền** (khi có file nhạc, đã có ducking dưới lời thoại):

```bash
ffmpeg -i demo/out/MoneyFlow-Demo-vi-1080p.mp4 -i nhac.mp3 -filter_complex \
  "[1:a]aloop=loop=-1:size=2e9,volume=0.22[m];\
   [m][0:a]sidechaincompress=threshold=0.03:ratio=8:attack=25:release=350[duck];\
   [0:a][duck]amix=inputs=2:duration=first[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k demo/out/MoneyFlow-Demo-vi-nhac.mp4
```

---

## Vì sao pipeline làm như vậy

**Dàn nhịp theo lời thoại.** `edge-tts --write-subtitles` trả SRT có mốc của từng câu.
`run-scene.js` biến chúng thành `ctx.atCue(n)` — scene chờ đúng lúc câu n bắt đầu mới
thao tác. Hành động trên màn hình khớp với những gì đang được đọc, không phải canh tay.

**Offset tiếng lấy từ độ dài THẬT.** `assemble.js` đo lại từng file scene bằng ffprobe
thay vì tin vào độ dài dự kiến. Mỗi scene lệch vài chục ms do làm tròn CFR; cộng dồn
11 scene là gần nửa giây. Đo thật thì độ lệch tiếng cố định ở **0,17–0,18s trên cả 11 scene**
(biên độ dao động 17ms) — không trôi dần.

**Chuột thật đi kèm chuột giả.** Con trỏ vẽ bằng DOM, nhưng CDP cũng bắn `mousemove` thật
theo cùng quỹ đạo. Không có phần này thì tooltip biểu đồ và hiệu ứng hover không kích hoạt —
nhìn như chuột lướt qua mà giao diện trơ ra, lộ ngay là video dựng.

**Zoom bằng CSS transform trên `#root`.** Chrome vẽ lại chữ ở tỉ lệ mới nên zoom vẫn sắc nét,
khác hẳn phóng to pixel bằng `zoompan` của ffmpeg.

**Quay ở 1536×864 @ dsf 1.5** (frame gốc 2304×1296, downscale về 1080p): chữ trong app to hơn
~25% so với quay thẳng 1920 nên đọc được trên điện thoại, và dư pixel để zoom không vỡ.

**Encode 2 bước.** Hai yêu cầu xung khắc trong một filter chain: filter `fps=60` đọc timebase
1/25 của concat demuxer và thổi phồng độ dài (8,5s → 14,8s), còn filter `fade` chạy trước bước
dựng frame CFR nên với scene đứng yên lúc mở đầu chỉ có 1 frame để tô (ra khung đen rồi nhảy
phựt sang sáng). Bước 1 dựng CFR đúng độ dài, bước 2 fade trên stream đã đủ 60 frame/giây.

**Snapshot DB theo scene.** Scene 05 (wizard), 06 (sổ cái), 07 (mua vàng) ghi vào DB.
Mỗi scene xong lưu `db-snapshots/after-<id>.sqlite`, `restore-db.js` đưa về đúng mốc rồi gọi
`/api/demo/reload-db` để server nạp lại — không có bước này thì lần `save()` kế tiếp sẽ ghi đè
bằng bản cũ đang nằm trong RAM.

---

## Dữ liệu demo

18 tháng T3/2025 → T8/2026, tích luỹ 201,9 triệu, triển khai 82,5% (phần dư là "kho đạn" Bắn Tỉa).
Số liệu được chọn để **bật đúng những panel chỉ hiện khi có dữ liệu**:

- Sổ VCB đáo hạn sau 20 ngày → banner hổ phách `Sắp đáo hạn`
- T9/2026 để trống → banner xanh `Nhắc nhở nhập liệu`, và là tháng scene 05 nhập trên camera
- Quỹ dự phòng 35tr (≥ 3× chi tiêu mục tiêu 11tr) → app tự đẩy lên `Giai đoạn 3: Tích lũy`
- VNM −25,6% / HPG −18,8% / SSI −18,2% → bật thẻ `Cơ hội bắn tỉa!`
- Quỹ vàng 13,1tr > giá 1 chỉ 11,5tr → bật nút `Ghi nhận mua 1 chỉ vàng SJC`
- Lịch sử giá 3.246 phiên → biểu đồ quỹ đạo tài sản trong modal có dữ liệu thật để vẽ
