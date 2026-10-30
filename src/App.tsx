import { Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Sidebar } from './components/Sidebar';
import { ToastProvider } from './components/Toast';
import { useTheme } from './hooks/useTheme';
import { BudgetsPage } from './pages/Budgets';
import { DashboardPage } from './pages/Dashboard';
import { ImportPage } from './pages/Import';
import { RulesPage } from './pages/Rules';
import { SettingsPage } from './pages/Settings';
import { SubscriptionsPage } from './pages/Subscriptions';
import { TransactionsPage } from './pages/Transactions';

export default function App() {
  useTheme();
  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col md:flex-row">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-7xl p-4 md:p-8">
            <ErrorBoundary>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/transactions" element={<TransactionsPage />} />
              <Route path="/budgets" element={<BudgetsPage />} />
              <Route path="/subscriptions" element={<SubscriptionsPage />} />
              <Route path="/rules" element={<RulesPage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
