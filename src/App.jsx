import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { ThemeProvider, ConfirmProvider, ErrorBoundary, Skeleton } from './components/ui/index.jsx';

/**
 * Nạp từng trang khi người dùng thực sự mở nó.
 *
 * Thư viện biểu đồ nặng 434KB và thư viện đọc Excel chỉ dùng ở Cài đặt. Gộp
 * hết vào một gói thì mở Tổng quan cũng phải tải cả hai, mà phần lớn lần mở
 * app người dùng chỉ xem đúng một trang.
 */
const Dashboard = lazy(() => import('./components/Dashboard'));
const CashFlowPage = lazy(() => import('./components/CashFlowPage'));
const InvestmentsPage = lazy(() => import('./components/InvestmentsPage'));
const Scenarios = lazy(() => import('./components/Scenarios'));
const Settings = lazy(() => import('./components/Settings'));

export default function App() {
  return (
    <ThemeProvider>
      <ConfirmProvider>
        <Layout>
          {/* Bọc theo TRANG, không bọc cả app: một trang hỏng thì bốn trang kia
              vẫn dùng được, và người dùng còn đường đi tiếp. */}
          <PageBoundary>
            <Suspense fallback={<PageSkeleton />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/cashflow" element={<CashFlowPage />} />
                <Route path="/investments" element={<InvestmentsPage />} />
                <Route path="/scenarios" element={<Scenarios />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </Suspense>
          </PageBoundary>
        </Layout>
      </ConfirmProvider>
    </ThemeProvider>
  );
}

/** Khung chờ giữ đúng chiều cao để trang không nhảy khi nạp xong. */
function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="card">
        <Skeleton rows={3} />
      </div>
      <div className="card">
        <Skeleton rows={4} />
      </div>
    </div>
  );
}

/** Đổi trang là dựng lại hộp chắn, để lỗi của trang cũ không dính sang trang mới. */
function PageBoundary({ children }) {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
}
