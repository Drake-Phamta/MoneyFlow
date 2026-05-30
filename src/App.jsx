import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import CashFlowPage from './components/CashFlowPage';
import InvestmentsPage from './components/InvestmentsPage';
import Scenarios from './components/Scenarios';
import Settings from './components/Settings';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/cashflow" element={<CashFlowPage />} />
        <Route path="/investments" element={<InvestmentsPage />} />
        <Route path="/scenarios" element={<Scenarios />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}
