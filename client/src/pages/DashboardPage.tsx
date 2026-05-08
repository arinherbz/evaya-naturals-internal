import { useQuery } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';

const currencyFormatter = new Intl.NumberFormat('en-UG', {
  style: 'currency',
  currency: 'UGX',
  maximumFractionDigits: 0,
});

export default function DashboardPage() {
  const { user } = useAuth();
  const canViewSales = ['Admin', 'Cashier', 'Branch Manager', 'Accountant'].includes(user?.role.name ?? '');
  const isCashier = user?.role.name === 'Cashier';

  const todayQuery = useQuery({
    queryKey: ['pos-today-summary'],
    queryFn: () => api.pos.today(),
    enabled: canViewSales,
  });

  const totalSales = todayQuery.data?.totalSales ?? 0;
  const salesCount = todayQuery.data?.salesCount ?? 0;
  const pendingCashUp = todayQuery.data?.pendingCashUp ?? false;

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] text-slate-900">
      <Sidebar />
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700/70">Evaya Naturals</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Welcome back, {user?.firstName}</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Today is anchored to the Evaya Naturals branch only, with a faster cashier flow and simpler daily operations.
            </p>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DashboardCard title="Today's sales" value={currencyFormatter.format(totalSales)} hint="Completed POS sales today" />
            <DashboardCard title="Sales count" value={String(salesCount)} hint="Receipts issued today" />
            <DashboardCard title="POS access" value={canViewSales ? 'Open' : 'Restricted'} hint={canViewSales ? 'Cashier-ready checkout flow' : 'No POS access for your role'} />
            <DashboardCard
              title="Cash-up"
              value={pendingCashUp ? 'Pending' : 'Clear'}
              hint={pendingCashUp ? 'Cash-up reminder is active for today' : 'No cash-up reminder yet'}
              tone={pendingCashUp ? 'amber' : 'emerald'}
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Quick actions</h2>
                  <p className="mt-1 text-sm text-slate-500">Jump into the flows staff use most during the day.</p>
                </div>
                {isCashier && (
                  <a
                    href="/pos"
                    className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    Start POS
                  </a>
                )}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <QuickAction label="Open POS" href="/pos" tone="dark" />
                <QuickAction label="Products" href="/products" tone="light" />
                <QuickAction label="Inventory" href="/inventory" tone="light" />
                <QuickAction label="Reports" href="/reports" tone="light" />
              </div>
            </div>

            <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)]">
              <h2 className="text-xl font-semibold">Cashier focus</h2>
              <p className="mt-1 text-sm text-slate-500">A tight summary for the current shift without cross-branch noise.</p>
              <div className="mt-5 space-y-3">
                <StatusRow label="Branch" value="Evaya Naturals" />
                <StatusRow label="Today's total" value={currencyFormatter.format(totalSales)} />
                <StatusRow label="Sales today" value={String(salesCount)} />
                <StatusRow label="Cash-up reminder" value={pendingCashUp ? 'Pending before close' : 'Not triggered yet'} />
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function DashboardCard({
  title,
  value,
  hint,
  tone = 'slate',
}: {
  title: string;
  value: string;
  hint: string;
  tone?: 'slate' | 'emerald' | 'amber';
}) {
  const toneClasses = {
    slate: 'bg-white/90',
    emerald: 'bg-emerald-50',
    amber: 'bg-amber-50',
  };

  return (
    <div className={`rounded-[24px] border border-white/70 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.04)] ${toneClasses[tone]}`}>
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-2 text-xs text-slate-400">{hint}</p>
    </div>
  );
}

function QuickAction({ label, href, tone }: { label: string; href: string; tone: 'dark' | 'light' }) {
  const className = tone === 'dark'
    ? 'bg-slate-900 text-white hover:bg-slate-800'
    : 'bg-slate-50 text-slate-700 hover:bg-slate-100';

  return (
    <a href={href} className={`block rounded-2xl px-4 py-4 text-center text-sm font-medium transition ${className}`}>
      {label}
    </a>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}
