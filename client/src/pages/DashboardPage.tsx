import { useAuth } from '../hooks/useAuth';
import Sidebar from '../components/Sidebar';

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-semibold text-gray-900 mb-6">
            Welcome back, {user?.firstName}
          </h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <DashboardCard
              title="Today's Sales"
              value="UGX 0"
              icon="dollar"
              color="green"
            />
            <DashboardCard
              title="Orders"
              value="0"
              icon="shopping-cart"
              color="blue"
            />
            <DashboardCard
              title="Low Stock Items"
              value="0"
              icon="alert-triangle"
              color="yellow"
            />
            <DashboardCard
              title="Pending Deliveries"
              value="0"
              icon="truck"
              color="purple"
            />
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <QuickAction label="New Sale" href="/pos" />
              <QuickAction label="View Products" href="/products" />
              <QuickAction label="Inventory" href="/inventory" />
              <QuickAction label="Reports" href="/reports" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function DashboardCard({ title, value }: { title: string; value: string; icon: string; color: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-sm text-gray-500 mb-1">{title}</p>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function QuickAction({ label, href }: { label: string; href: string }) {
  return (
    <a href={href} className="block p-4 bg-evaya-green-50 rounded-lg text-center hover:bg-evaya-green-100 transition">
      <span className="text-evaya-green-700 font-medium">{label}</span>
    </a>
  );
}
