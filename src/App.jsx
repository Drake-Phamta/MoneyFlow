import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import CashFlowPage from './components/CashFlowPage';
import InvestmentsPage from './components/InvestmentsPage';
import Scenarios from './components/Scenarios';
import Settings from './components/Settings';
import { ThemeProvider, ConfirmProvider, ErrorBoundary } from './components/ui/index.jsx';

export default function App() {
  return (
    <ThemeProvider>
      <ConfirmProvider>
        <Layout>
          {/* Bọc theo TRANG, không bọc cả app: một trang hỏng thì bốn trang kia
              vẫn dùng được, và người dùng còn đường đi tiếp. */}
          <PageBoundary>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/cashflow" element={<CashFlowPage />} />
              <Route path="/investments" element={<InvestmentsPage />} />
              <Route path="/scenarios" element={<Scenarios />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </PageBoundary>
        </Layout>
      </ConfirmProvider>
    </ThemeProvider>
  );
}

/** Đổi trang là dựng lại hộp chắn, để lỗi của trang cũ không dính sang trang mới. */
function PageBoundary({ children }) {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
}
