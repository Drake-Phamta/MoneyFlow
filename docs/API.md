# API Reference

## Dual-Transport

Tất cả methods có sẵn qua `apiClient.xxx.yyy()` — tự động chọn IPC (Electron) hoặc REST (Browser).

## Parameters

| Method | IPC Channel | REST | Mô tả |
|--------|-------------|------|-------|
| `params.get()` | `params:get` | `GET /api/params` | Lấy tất cả tham số |
| `params.update(key, value)` | `params:update` | `PUT /api/params` | Cập nhật 1 tham số |
| `params.avgExpense()` | `params:avgExpense` | `GET /api/params/avg-expense` | Chi tiêu TB |
| `params.recalcGoals()` | `params:recalcGoals` | `POST /api/params/recalc-goals` | Tính lại mục tiêu |

## Timeline

| Method | IPC Channel | REST | Mô tả |
|--------|-------------|------|-------|
| `timeline.regenerate(total, startM, startY)` | `timeline:regenerate` | `POST /api/timeline/regenerate` | Tạo lại timeline |

## Assets

| Method | IPC Channel | REST | Mô tả |
|--------|-------------|------|-------|
| `assets.get()` | `assets:get` | `GET /api/assets` | Lấy danh sách tài sản |
| `assets.add(data)` | `assets:add` | `POST /api/assets` | Thêm tài sản |
| `assets.updatePrice(id, price)` | `assets:updatePrice` | `PUT /api/assets/:id/price` | Cập nhật giá |
| `assets.setTracked(id, tracked)` | `assets:setTracked` | `PUT /api/assets/:id/tracked` | Bật/tắt theo dõi |
| `assets.delete(id)` | `assets:delete` | `DELETE /api/assets/:id` | Xóa tài sản |

## Catalog

| Method | IPC Channel | REST | Mô tả |
|--------|-------------|------|-------|
| `catalog.get(assetClass, search)` | `catalog:get` | `GET /api/catalog?class=&search=` | Tìm tài sản trong catalog |

## Categories

| Method | IPC Channel | REST | Mô tả |
|--------|-------------|------|-------|
| `categories.get()` | `categories:get` | `GET /api/categories` | Lấy danh mục phân bổ |

## Phases

| Method | IPC Channel | REST | Mô tả |
|--------|-------------|------|-------|
| `phases.get()` | `phases:get` | `GET /api/phases` | Lấy tất cả phases |
| `phases.active()` | `phases:active` | `GET /api/phases/active` | Phase đang active |
| `phases.setActive(id)` | `phases:setActive` | `POST /api/phases/:id/active` | Chọn phase |
| `phases.allocations(phaseId)` | `phases:allocations` | `GET /api/phases/:id/allocations` | Tỷ lệ phân bổ phase |
| `phases.updateAllocations(phaseId, allocs)` | `phases:updateAllocations` | `POST /api/phases/:id/allocations` | Cập nhật tỷ lệ |

## Monthly Entries

| Method | IPC Channel | REST | Mô tả |
|--------|-------------|------|-------|
| `monthly.getAll()` | `monthly:getAll` | `GET /api/monthly` | Tất cả entries |
| `monthly.get(idx)` | `monthly:get` | `GET /api/monthly/:idx` | Entry theo tháng |
| `monthly.filled()` | `monthly:filled` | `GET /api/monthly/filled` | Các tháng đã nhập |
| `monthly.next()` | `monthly:next` | `GET /api/monthly/next` | Tháng tiếp theo |
| `monthly.save(data)` | `monthly:save` | `POST /api/monthly` | Lưu entry |
| `monthly.delete(idx)` | `monthly:delete` | `DELETE /api/monthly/:idx` | Xóa entry |

## Allocations

| Method | IPC Channel | REST | Mô tả |
|--------|-------------|------|-------|
| `allocations.get(entryId)` | `allocations:get` | `GET /api/allocations/:entryId` | Phân bổ 1 tháng |
| `allocations.save(entryId, allocs)` | `allocations:save` | `POST /api/allocations/:entryId` | Lưu phân bổ |
| `allocations.adjust(amount)` | `allocations:adjust` | `POST /api/allocations/adjust` | Điều chỉnh phân bổ ĐT |

## Transactions

| Method | IPC Channel | REST | Mô tả |
|--------|-------------|------|-------|
| `transactions.get()` | `transactions:get` | `GET /api/transactions` | Tất cả giao dịch |
| `transactions.add(data)` | `transactions:add` | `POST /api/transactions` | Thêm giao dịch |
| `transactions.delete(id)` | `transactions:delete` | `DELETE /api/transactions/:id` | Xóa giao dịch |

## Portfolio

| Method | IPC Channel | REST | Mô tả |
|--------|-------------|------|-------|
| `portfolio.get()` | `portfolio:get` | `GET /api/portfolio` | Portfolio chi tiết |
| `portfolio.summary()` | `portfolio:summary` | `GET /api/portfolio/summary` | Tổng hợp |

## Savings

| Method | IPC Channel | REST | Mô tả |
|--------|-------------|------|-------|
| `savings.get()` | `savings:get` | `GET /api/savings` | Tất cả sổ |
| `savings.getById(id)` | `savings:getById` | `GET /api/savings/:id` | 1 sổ chi tiết |
| `savings.add(data)` | `savings:add` | `POST /api/savings` | Thêm sổ |
| `savings.update(id, data)` | `savings:update` | `PUT /api/savings/:id` | Sửa sổ |
| `savings.delete(id)` | `savings:delete` | `DELETE /api/savings/:id` | Xóa sổ |
| `savings.addTransaction(id, type, amount, date, note)` | `savings:addTransaction` | `POST /api/savings/:id/transactions` | Bơm/rút vốn |
| `savings.summary()` | `savings:summary` | `GET /api/savings/summary` | Tổng hợp |
| `savings.overview()` | `savings:overview` | `GET /api/savings/overview` | Dòng tiền TK |
| `savings.maturities(days)` | `savings:maturities` | `GET /api/savings/maturities?days=` | Sắp đáo hạn |
| `savings.processMatured()` | `savings:processMatured` | `POST /api/savings/process-matured` | Xử lý đáo hạn |

## Watchlist

| Method | IPC Channel | REST | Mô tả |
|--------|-------------|------|-------|
| `watchlist.get()` | `watchlist:get` | `GET /api/watchlist` | Danh sách theo dõi |
| `watchlist.add(data)` | `watchlist:add` | `POST /api/watchlist` | Thêm |
| `watchlist.update(id, data)` | `watchlist:update` | `PUT /api/watchlist/:id` | Sửa |
| `watchlist.remove(id)` | `watchlist:remove` | `DELETE /api/watchlist/:id` | Xóa |

## Alerts

| Method | IPC Channel | REST | Mô tả |
|--------|-------------|------|-------|
| `alerts.get(unreadOnly)` | `alerts:get` | `GET /api/alerts?unread=` | Cảnh báo |
| `alerts.count()` | `alerts:count` | `GET /api/alerts/count` | Số cảnh báo chưa đọc |
| `alerts.markRead(id)` | `alerts:markRead` | `PUT /api/alerts/:id/read` | Đánh dấu đã đọc |
| `alerts.markAllRead()` | `alerts:markAllRead` | `PUT /api/alerts/read-all` | Đọc tất cả |

## Prices

| Method | IPC Channel | REST | Mô tả |
|--------|-------------|------|-------|
| `prices.refresh()` | `prices:refresh` | `POST /api/prices/refresh` | Đồng bộ giá |
| `priceHistory.get(assetId, days)` | `priceHistory:get` | `GET /api/price-history/:id?days=` | Lịch sử giá |

## Activity

| Method | IPC Channel | REST | Mô tả |
|--------|-------------|------|-------|
| `activity.get(limit)` | `activity:get` | `GET /api/activity?limit=` | Nhật ký hoạt động |

## Snapshot

Một lời gọi trả về mọi con số tài chính của app. Trước khi có nó, sáu màn hình
tự cộng "tổng tài sản" theo sáu cách và ra sáu kết quả khác nhau.

| Method | IPC Channel | REST | Mô tả |
|--------|-------------|------|-------|
| `snapshot.get()` | `snapshot:get` | `GET /api/snapshot` | Tổng tài sản, thanh khoản, tiền mặt, tiết kiệm, danh mục, giai đoạn, dòng tiền, kế hoạch |

## Net Worth

| Method | IPC Channel | REST | Mô tả |
|--------|-------------|------|-------|
| `networth.history()` | `networth:history` | `GET /api/networth/history` | Tổng tài sản theo từng tháng, tính xuôi thời gian từ bản ghi thật |

## Price History

| Method | IPC Channel | REST | Mô tả |
|--------|-------------|------|-------|
| `priceHistory.get(assetId, days)` | `priceHistory:get` | `GET /api/price-history/:assetId?days=` | Giá lịch sử một tài sản |
| `priceHistory.fetch(assetId)` | `priceHistory:fetch` | `POST /api/price-history/:assetId/fetch` | Kéo giá lịch sử về |

## Cash Ledger

Sổ quỹ tiền mặt: tiền về từ rút sổ / đáo hạn / bán tài sản, và tiền rời khỏi
tài sản khi tiêu.

| Method | IPC Channel | REST | Mô tả |
|--------|-------------|------|-------|
| `cash.ledger()` | `cash:ledger` | `GET /api/cash/ledger` | Các lần tiền ra vào, mới nhất trước |
| `cash.spend(amount, date, note)` | `cash:spend` | `POST /api/cash/spend` | Ghi một khoản đã tiêu |
| `cash.updateMovement(id, patch)` | `cash:updateMovement` | `PUT /api/cash/ledger/:id` | Sửa một khoản đã tiêu. Chỉ dòng `source = 'spend'`; dòng khác là bóng của một bản ghi khác nên bị từ chối |
| `cash.deleteMovement(id)` | `cash:deleteMovement` | `DELETE /api/cash/ledger/:id` | Xoá một dòng ghi nhầm |

## Data Management

| Method | IPC Channel | REST | Mô tả |
|--------|-------------|------|-------|
| `data.stats()` | `data:stats` | `GET /api/data/stats` | Thống kê dữ liệu |
| `data.clearTransactions()` | `data:clearTransactions` | `DELETE /api/data/transactions` | Xóa giao dịch |
| `data.clearMonthly()` | `data:clearMonthly` | `DELETE /api/data/monthly` | Xóa nhập liệu |
| `data.clearSavings()` | `data:clearSavings` | `DELETE /api/data/savings` | Xóa tiết kiệm |
| `data.clearAll()` | `data:clearAll` | `DELETE /api/data/all` | Xóa tất cả |

## Import/Export

| Method | IPC Channel | REST | Mô tả |
|--------|-------------|------|-------|
| `importExcel(filePath)` | `import:excel` | `POST /api/import/excel` | Import Excel |
| `exportExcel(filePath)` | `export:excel` | `GET /api/export/excel` | Export Excel |
| `openFile()` | `dialog:openFile` | — | Chọn file (Electron only) |
| `saveFile()` | `dialog:saveFile` | — | Chọn nơi lưu (Electron only) |
