# Database Schema

Sử dụng **sql.js** (SQLite compiled to WASM). File: `data/financial.sqlite`.

## Bảng dữ liệu

### `parameters` — Cấu hình hệ thống
| Column | Type | Mô tả |
|--------|------|-------|
| key | TEXT PK | Tên tham số |
| value | REAL | Giá trị |
| description | TEXT | Mô tả |

**Giá trị mặc định:**
- `TOTAL_MONTHS` = 120 (10 năm)
- `START_MONTH`, `START_YEAR` = tháng/năm hiện tại
- `FI_MONTHLY_EXPENSE` = 4,000,000 (chi tiêu mục tiêu)
- `DEFAULT_INFLOW` = 3,700,000
- `SCHEMA_VERSION` = 4

---

### `categories` — Danh mục phân bổ (5 buckets)
| Column | Type | Mô tả |
|--------|------|-------|
| id | INTEGER PK | |
| name | TEXT | Tên danh mục |
| description | TEXT | |
| color | TEXT | Mã màu hex |
| icon | TEXT | Tên icon (shield-check, trend-up, ...) |
| sort_order | INTEGER | Thứ tự hiển thị |

**Dữ liệu mặc định:**
1. Dự Phòng — `#10b981` — `shield-check`
2. Chứng Khoán — `#3b82f6` — `trend-up` (hiển thị là "Đầu tư")
3. Vàng — `#f59e0b` — `gem`
4. Bắn Tỉa — `#ef4444` — `crosshair`
5. Tiết kiệm & Trái phiếu — `#8b5cf6` — `bank`

---

### `phases` — Giai đoạn tài chính (4 phases)
| Column | Type | Mô tả |
|--------|------|-------|
| id | INTEGER PK | |
| name | TEXT | Tên phase |
| sort_order | INTEGER | 1-4 |
| goal_amount | REAL | Mục tiêu cố định (VND) |
| goal_multiplier | REAL | Hệ số mục tiêu (× chi tiêu) |
| goal_description | TEXT | Mô tả mục tiêu |
| entry_condition | TEXT | Điều kiện vào phase |
| guidance | TEXT | Hướng dẫn chi tiết |
| is_active | INTEGER | 1 = đang active |

**4 Phases:**
1. **Nền tảng** (×3 chi tiêu) — Xây quỹ dự phòng
2. **Tăng tốc** (×6 chi tiêu) — Đa dạng hóa
3. **Tích lũy** (×24 chi tiêu) — Tăng trưởng mạnh
4. **Tự do tài chính** — FI reached

---

### `phase_allocations` — Tỷ lệ phân bổ theo phase
| Column | Type | Mô tả |
|--------|------|-------|
| id | INTEGER PK | |
| phase_id | INTEGER FK → phases | |
| category_id | INTEGER FK → categories | |
| ratio | REAL | Tỷ lệ (0.0 - 1.0) |

VD: Phase 1 → Dự Phòng 0.70, Chứng Khoán 0.30

---

### `asset_types` — Loại tài sản
| Column | Type | Mô tả |
|--------|------|-------|
| id | INTEGER PK | |
| name | TEXT | Tên hiển thị |
| category | TEXT | Nhóm: stock, etf, gold, savings, bond |
| ticker | TEXT | Mã CK (null = parent category) |
| unit | TEXT | Đơn vị (cổ, chỉ, ...) |
| color | TEXT | Mã màu |
| icon | TEXT | Tên icon |
| active | INTEGER | 1 = đang dùng |
| sort_order | INTEGER | |
| current_price | REAL | Giá hiện tại (tự động cập nhật) |
| is_tracked | INTEGER | 1 = theo dõi giá tự động |
| peak_price | REAL | Giá đỉnh (để tính drawdown) |
| asset_class | TEXT | Phân loại: stock, etf, gold, savings, bond, crypto |

**Cấu trúc:** Parent rows (ticker=NULL) là danh mục lớn. Child rows có ticker cụ thể.
- Parent "Chứng Khoán" → Children: VNM, FPT, VCB, ... (30 VN30 stocks)
- Parent "ETF" → Children: E1VFVN30, FUEVN100
- Parent "Vàng" → Children: SJC

---

### `monthly_entries` — Nhập liệu hàng tháng
| Column | Type | Mô tả |
|--------|------|-------|
| id | INTEGER PK | |
| month_index | INTEGER UNIQUE | Thứ tự tháng (1, 2, 3, ...) |
| month_label | TEXT | "T5/2026" |
| income | REAL | Thu nhập |
| expense | REAL | Chi tiêu |
| bonus | REAL | Thưởng |
| total_inflow | REAL | = income - expense + bonus |
| note | TEXT | Ghi chú |
| phase_id | INTEGER FK → phases | Phase tại thời điểm nhập |
| status | TEXT | 'draft' / 'confirmed' |
| created_at | TEXT | ISO timestamp |

---

### `allocations` — Phân bổ mỗi tháng
| Column | Type | Mô tả |
|--------|------|-------|
| id | INTEGER PK | |
| monthly_entry_id | INTEGER FK → monthly_entries | |
| category_id | INTEGER FK → categories | |
| planned_amount | REAL | Số tiền dự kiến |
| actual_amount | REAL | Số tiền thực tế |

Mỗi monthly_entry có 1 allocation cho mỗi category (tối đa 5).

---

### `transactions` — Giao dịch mua/bán
| Column | Type | Mô tả |
|--------|------|-------|
| id | INTEGER PK | |
| date | TEXT | YYYY-MM-DD |
| asset_type_id | INTEGER FK → asset_types | |
| asset_name | TEXT | Tên/mã tài sản |
| type | TEXT | 'BUY' / 'SELL' |
| quantity | REAL | Số lượng |
| price | REAL | Đơn giá |
| total_amount | REAL | = quantity × price |
| fee | REAL | Phí giao dịch |
| note | TEXT | |
| monthly_entry_id | INTEGER FK | Liên kết tháng (nullable) |

---

### `savings_accounts` — Sổ tiết kiệm
| Column | Type | Mô tả |
|--------|------|-------|
| id | INTEGER PK | |
| name | TEXT | Tên sổ |
| bank | TEXT | Ngân hàng |
| account_number | TEXT | Số tài khoản |
| type | TEXT | 'liquid' (KKH) / 'term' (có kỳ hạn) |
| principal | REAL | Vốn gốc hiện tại |
| interest_rate | REAL | Lãi suất (%/năm) |
| term_months | INTEGER | Kỳ hạn (tháng) |
| start_date | TEXT | Ngày gửi |
| maturity_date | TEXT | Ngày đáo hạn |
| auto_renew | INTEGER | 1 = tự tái tục |
| category_id | INTEGER FK → categories | Dự Phòng hoặc Tiết kiệm |
| note | TEXT | |
| status | TEXT | 'active' / 'matured' |

---

### `savings_transactions` — Giao dịch tiết kiệm
| Column | Type | Mô tả |
|--------|------|-------|
| id | INTEGER PK | |
| savings_account_id | INTEGER FK → savings_accounts | |
| type | TEXT | 'deposit' / 'withdraw' / 'interest' |
| amount | REAL | Số tiền |
| date | TEXT | Ngày giao dịch |
| note | TEXT | |

---

### `portfolio_snapshots` — Snapshot danh mục
| Column | Type | Mô tả |
|--------|------|-------|
| id | INTEGER PK | |
| month_index | INTEGER | |
| asset_type_id | INTEGER FK | |
| quantity | REAL | Số lượng nắm giữ |
| avg_cost | REAL | Giá vốn TB |
| market_value | REAL | Giá trị thị trường |

---

### `activity_log` — Nhật ký hoạt động
| Column | Type | Mô tả |
|--------|------|-------|
| id | INTEGER PK | |
| date | TEXT | |
| type | TEXT | MONTHLY_ENTRY, BUY, SELL, SAVINGS, CLEAR, DELETE_ENTRY |
| description | TEXT | |
| amount | REAL | |
| metadata | TEXT | JSON |

---

### `price_snapshots` — Lịch sử giá
| Column | Type | Mô tả |
|--------|------|-------|
| id | INTEGER PK | |
| asset_type_id | INTEGER FK | |
| date | TEXT | YYYY-MM-DD |
| open, high, low, close | REAL | OHLC |
| volume | INTEGER | |
| source | TEXT | 'vndirect' / 'manual' |
| fetched_at | TEXT | |

UNIQUE(asset_type_id, date)

---

### `alerts` — Cảnh báo tự động
| Column | Type | Mô tả |
|--------|------|-------|
| id | INTEGER PK | |
| asset_type_id | INTEGER FK | |
| type | TEXT | price_drop, price_recovery, take_profit, stop_loss |
| message | TEXT | |
| data | TEXT | JSON |
| read | INTEGER | 0/1 |
| created_at | TEXT | |

---

## Relationships

```
phases ──1:N──→ phase_allocations ──N:1──→ categories
monthly_entries ──1:N──→ allocations ──N:1──→ categories
monthly_entries ──1:N──→ transactions ──N:1──→ asset_types
savings_accounts ──1:N──→ savings_transactions
savings_accounts ──N:1──→ categories
asset_types ──1:N──→ price_snapshots
asset_types ──1:N──→ alerts
asset_types ──1:N──→ portfolio_snapshots
```

## Migrations

| Version | Method | Thay đổi |
|---------|--------|----------|
| V1 | `createTables()` | Tạo tất cả bảng |
| V2 | `migrateToV2()` | Phân loại lại asset_types, seed VN30 + ETF + SJC |
| V3 | `migrateToV3()` | Cập nhật phase_allocations + guidance |
| V4 | `migrateToV4()` | Thêm savings_accounts + savings_transactions |
| V5 | `migrateToV5()` | Nhất quán đơn vị "chỉ" cho tài sản Vàng và cập nhật kịch bản phase |
