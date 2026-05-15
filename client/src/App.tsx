import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from './components/ui/toaster';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import POSPage from './pages/POSPage';
import ProductsPage from './pages/ProductsPage';
import InventoryPage from './pages/InventoryPage';
import InventoryUpdatePage from './pages/InventoryUpdatePage';
import CustomersPage from './pages/CustomersPage';
import ExpensesPage from './pages/ExpensesPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import DeliveriesPage from './pages/DeliveriesPage';
import OrdersPage from './pages/OrdersPage';
import ReceiptsPage from './pages/ReceiptsPage';
import { AuthProvider } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import OfflineBanner from './components/OfflineBanner';
import { ROUTE_ACCESS } from './lib/access';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute allowRoles={ROUTE_ACCESS.dashboard}>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pos"
              element={
                <ProtectedRoute allowRoles={ROUTE_ACCESS.pos}>
                  <POSPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/products"
              element={
                <ProtectedRoute allowRoles={ROUTE_ACCESS.products}>
                  <ProductsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory"
              element={
                <ProtectedRoute allowRoles={ROUTE_ACCESS.inventory}>
                  <InventoryPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory/update"
              element={
                <ProtectedRoute allowRoles={ROUTE_ACCESS.inventoryUpdate}>
                  <InventoryUpdatePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers"
              element={
                <ProtectedRoute allowRoles={ROUTE_ACCESS.customers}>
                  <CustomersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/expenses"
              element={
                <ProtectedRoute allowRoles={ROUTE_ACCESS.expenses}>
                  <ExpensesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute allowRoles={ROUTE_ACCESS.reports}>
                  <ReportsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/deliveries"
              element={
                <ProtectedRoute allowRoles={ROUTE_ACCESS.deliveries}>
                  <DeliveriesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/receipts"
              element={
                <ProtectedRoute allowRoles={ROUTE_ACCESS.receipts}>
                  <ReceiptsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders"
              element={
                <ProtectedRoute allowRoles={ROUTE_ACCESS.orders}>
                  <OrdersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute allowRoles={ROUTE_ACCESS.settings}>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster />
        <OfflineBanner />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
