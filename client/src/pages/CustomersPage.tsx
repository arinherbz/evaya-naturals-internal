import Sidebar from '../components/Sidebar';

export default function CustomersPage() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-semibold text-gray-900 mb-6">Customers</h1>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <p className="text-gray-500">Customers module coming soon...</p>
          </div>
        </div>
      </main>
    </div>
  );
}