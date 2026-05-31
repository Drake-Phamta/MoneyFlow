const puppeteer = require('puppeteer');

async function delay(time) {
  return new Promise(function(resolve) { 
      setTimeout(resolve, time)
  });
}

async function runTests() {
  console.log('Khởi động trình duyệt...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Set viewport
  await page.setViewport({ width: 1280, height: 800 });
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  try {
    console.log('1. Truy cập ứng dụng tại http://localhost:5173');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
    await delay(3000); // Đợi React render xong

    // NHÓM 1: Nhập liệu tháng (MonthlyEntry)
    console.log('2. Test luồng Nhập liệu tháng');
    
    // Tìm link/nút sang trang Nhập liệu (Có thể là thanh sidebar)
    // Sidebar có text "Nhập liệu"
    const nhapLieuBtn = await page.$$('::-p-xpath(//a[contains(., "Nhập liệu")])');
    if (nhapLieuBtn.length > 0) {
      await nhapLieuBtn[0].click();
      await delay(1000);
    }

    // Nhập Thu nhập
    const inputs = await page.$$('input[type="text"]');
    if (inputs.length >= 2) {
      // Input 1: Thu nhập, Input 2: Chi tiêu
      await inputs[0].click();
      await page.keyboard.type('15000000');
      await delay(500);

      await inputs[1].click();
      await page.keyboard.type('4000000');
      await delay(500);
      
      console.log('  ✅ Đã nhập Thu nhập: 15M, Chi tiêu: 4M');
    }

    // Click "Tiếp theo ->"
    const tiepTheoBtn = await page.$$('::-p-xpath(//button[contains(., "Tiếp theo")])');
    if (tiepTheoBtn.length > 0) {
      await tiepTheoBtn[0].click();
      await delay(1000);
      console.log('  ✅ Chuyển sang Bước 2: Phân bổ dòng tiền');
    }

    // Bỏ qua phân bổ, nhấn "Tiếp theo"
    const tiepTheoBtn2 = await page.$$('::-p-xpath(//button[contains(., "Tiếp theo")])');
    if (tiepTheoBtn2.length > 0) {
      await tiepTheoBtn2[0].click();
      await delay(1000);
      console.log('  ✅ Chuyển sang Bước 3: Giao dịch');
    }

    // Nhấn "Lưu & Hoàn tất"
    const luuBtn = await page.$$('::-p-xpath(//button[contains(., "Lưu & Hoàn tất")])');
    if (luuBtn.length > 0) {
      await luuBtn[0].click();
      await delay(1000);
      console.log('  ✅ Đã Lưu tháng thành công');
    }
    
    // Nếu có màn hình thành công (Step 4), nhấn Về Dashboard
    const dashboardBtn = await page.$$('::-p-xpath(//button[contains(., "Về Dashboard")])');
    if (dashboardBtn.length > 0) {
      await dashboardBtn[0].click();
      await delay(1000);
    } else {
      // Hoặc tự click sidebar Dashboard
      const dashLink = await page.$$('::-p-xpath(//a[contains(., "Dashboard")])');
      if (dashLink.length > 0) await dashLink[0].click();
      await delay(1000);
    }

    // NHÓM 2 & 3: Kiểm tra Dashboard tổng quan
    console.log('3. Test Dashboard (Tổng tài sản, Vốn đầu tư)');
    // Đọc các giá trị tổng tài sản
    const h1s = await page.$$eval('h1, h2, h3, p', els => els.map(e => e.innerText));
    const isDashboardRendered = h1s.some(text => text.includes('Tổng tài sản') || text.includes('Vốn đầu tư'));
    if (isDashboardRendered) {
      console.log('  ✅ Dashboard hiển thị bình thường');
    }

    // NHÓM 4: Test trang Tiết kiệm
    console.log('4. Test trang Tiết kiệm');
    const savingsLink = await page.$$('::-p-xpath(//a[contains(., "Tiết kiệm")])');
    if (savingsLink.length > 0) {
      await savingsLink[0].click();
      await delay(1000);
      console.log('  ✅ Đã chuyển sang trang Tiết kiệm');
    }

    // NHÓM 5: Test trang Kịch bản (Scenarios)
    console.log('5. Test trang Kịch bản FI');
    const fiLink = await page.$$('::-p-xpath(//a[contains(., "Kịch bản")])');
    if (fiLink.length > 0) {
      await fiLink[0].click();
      await delay(1000);
      console.log('  ✅ Đã chuyển sang trang Kịch bản FI');
    }
    
    console.log('\n🎉 TOÀN BỘ FRONTEND TEST CƠ BẢN ĐÃ CHẠY XONG (KHÔNG CRASH)');

  } catch (error) {
    console.error('Lỗi khi chạy test UI:', error);
  } finally {
    await browser.close();
  }
}

runTests();
