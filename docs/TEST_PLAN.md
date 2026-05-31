# Money_Flow - KẾ HOẠCH TEST TOÀN DIỆN

## Mục tiêu
Test toàn bộ hệ thống với vai trò khách hàng thực tế, đảm bảo:
1. ✅ Chức năng hoạt động đúng
2. ✅ Số liệu hiển thị đúng nghiệp vụ tài chính
3. ✅ Số liệu đồng bộ giữa các giao diện
4. ✅ Giao diện hiển thị đúng, không lỗi
5. ✅ Xử lý lỗi graceful

## Kịch bản test

### Phase 1: Nhập liệu tháng 1 (T6/2026)
1. Vào Dòng Tiền → Thêm tháng mới
2. Nhập: Thu nhập 15,000,000 | Chi tiêu 6,000,000 | Thưởng 2,000,000
3. Kiểm tra "Tiền nhàn rỗi" = 15,000,000 + 2,000,000 - 6,000,000 = 11,000,000
4. Chuyển sang phân bổ → Kiểm tra tự động phân bổ theo phase
5. Lưu và kiểm tra dữ liệu đã lưu

### Phase 2: Nhập liệu tháng 2 (T7/2026)
1. Thêm tháng mới
2. Nhập: Thu nhập 16,000,000 | Chi tiêu 5,500,000 | Thưởng 0
3. Kiểm tra "Tiền nhàn rỗi" = 10,500,000
4. Phân bổ và lưu

### Phase 3: Giao dịch chứng khoán
1. Vào Đầu Tư → Danh mục
2. Mua VN30 ETF: 100 CCQ × 35,000 = 3,500,000
3. Mua FPT: 50 CP × 120,000 = 6,000,000
4. Kiểm tra Portfolio cập nhật đúng

### Phase 4: Tiết kiệm
1. Vào Đầu Tư → Tiết kiệm
2. Tạo sổ: Vietcombank 6T, lãi 6%, 10,000,000
3. Bơm vốn: 5,000,000
4. Kiểm tra lãi tính đúng

### Phase 5: Kiểm tra Dashboard
1. Tổng quan: KPI cards hiển thị đúng
2. Phase progress: Đúng % đạt mục tiêu
3. Phân bổ mục tiêu: Đúng số tiền và tỷ lệ
4. Biểu đồ: Dữ liệu chính xác

### Phase 6: Kiểm tra Scenarios
1. Lộ trình giai đoạn: Hiển thị đúng tiến độ
2. Phân bổ hiện tại vs mục tiêu
3. Dự phóng tài chính

### Phase 7: Kiểm tra Import/Export
1. Export Excel
2. Import lại
3. Kiểm tra dữ liệu không mất

## Tiêu chí đánh giá
- [ ] Mọi chức năng CRUD hoạt động
- [ ] Số liệu tính toán chính xác
- [ ] Dữ liệu đồng bộ giữa các trang
- [ ] Giao diện hiển thị đúng, không lỗi encoding
- [ ] Xử lý lỗi hiển thị thông báo rõ ràng
- [ ] Không có dữ liệu rác hoặc trùng lặp
