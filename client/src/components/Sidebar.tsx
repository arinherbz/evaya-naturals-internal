import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import BrandMark from './BrandMark';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { label: 'Dashboard', href: '/', icon: 'home', permission: 'view_dashboard', allowRoles: ['Branch Manager', 'Cashier', 'Inventory Officer', 'Accountant'] },
    { label: 'POS', href: '/pos', icon: 'shopping-cart', permission: 'process_sales', allowRoles: ['Branch Manager'] },
    { label: 'Products', href: '/products', icon: 'package', permission: null, allowRoles: ['Branch Manager'] },
    { label: 'Inventory', href: '/inventory', icon: 'database', permission: 'manage_inventory', allowRoles: ['Cashier'] },
    { label: 'Customers', href: '/customers', icon: 'users', permission: null, allowRoles: ['Branch Manager', 'Cashier'] },
    { label: 'Expenses', href: '/expenses', icon: 'wallet', permission: 'view_reports', allowRoles: ['Branch Manager'] },
    { label: 'Deliveries', href: '/deliveries', icon: 'map-pin', permission: null, allowRoles: ['Branch Manager', 'Delivery Rider'] },
    { label: 'Reports', href: '/reports', icon: 'bar-chart', permission: 'view_reports' },
    { label: 'Settings', href: '/settings', icon: 'settings', permission: null, allowRoles: ['Admin'] },
  ];

  const canShowItem = (permission: string | null, allowRoles?: string[]) => {
    if (!user) return false;
    if (user.role.name === 'Admin') return true;
    if (allowRoles?.includes(user.role.name)) return true;
    if (!permission) return !allowRoles || allowRoles.length === 0;
    return user.role.permissions.includes(permission);
  };

  const visibleItems = navItems.filter((item) => canShowItem(item.permission, item.allowRoles));

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-white/80 bg-[linear-gradient(180deg,#fcfbf7,#f3f6f1)] px-4 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)] lg:hidden">
        <BrandMark compact />
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:bg-slate-50"
          aria-label="Open navigation"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm"
            aria-label="Close navigation"
          />
          <aside className="relative flex h-full w-[min(18rem,86vw)] flex-col border-r border-white/80 bg-[linear-gradient(180deg,#fcfbf7,#f3f6f1)] shadow-[0_18px_60px_rgba(15,23,42,0.14)]">
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div>
                <BrandMark compact />
                <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-400">Evaya Naturals only</p>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:bg-slate-50"
                aria-label="Close navigation"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-4">
              <ul className="space-y-1.5">
                {visibleItems.map((item) => (
                  <li key={item.href}>
                    <NavLink
                      to={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center rounded-2xl px-4 py-3.5 transition ${
                          isActive
                            ? 'bg-white text-evaya-green-700 font-medium shadow-[0_10px_30px_rgba(15,23,42,0.06)]'
                            : 'text-gray-700 hover:bg-white/80'
                        }`
                      }
                    >
                      <SidebarIcon name={item.icon} />
                      <span className="ml-3">{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="border-t border-slate-100 p-4">
              <div className="flex items-center rounded-2xl bg-white/70 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="truncate text-xs text-gray-500">{user?.role.name}</p>
                </div>
                <button
                  onClick={logout}
                  className="ml-2 rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                  title="Logout"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      <aside className="hidden min-h-screen w-72 flex-col border-r border-white/70 bg-[linear-gradient(180deg,#fcfbf7,#f3f6f1)] shadow-[0_12px_40px_rgba(15,23,42,0.05)] lg:flex">
        <div className="border-b border-slate-100 p-6">
          <BrandMark compact />
          <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-400">Evaya Naturals only</p>
        </div>

        <nav className="flex-1 overflow-y-auto p-5">
          <ul className="space-y-1.5">
            {visibleItems.map((item) => (
              <li key={item.href}>
                <NavLink
                  to={item.href}
                  className={({ isActive }) =>
                    `flex items-center px-4 py-3.5 rounded-2xl transition ${
                      isActive
                        ? 'bg-white text-evaya-green-700 font-medium shadow-[0_10px_30px_rgba(15,23,42,0.06)]'
                        : 'text-gray-700 hover:bg-white/80'
                    }`
                  }
                >
                  <SidebarIcon name={item.icon} />
                  <span className="ml-3">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-slate-100 p-4">
          <div className="flex items-center px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="truncate text-xs text-gray-500">{user?.role.name}</p>
            </div>
            <button
              onClick={logout}
              className="ml-2 rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
              title="Logout"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function SidebarIcon({ name }: { name: string }) {
  const icons: Record<string, JSX.Element> = {
    home: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" /></svg>,
    'shopping-cart': <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
    package: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
    database: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>,
    users: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
    wallet: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H6a2 2 0 00-2 2v10a2 2 0 002 2h11a2 2 0 002-2V9m-2 0h2a1 1 0 011 1v4a1 1 0 01-1 1h-2m-2-6h4" /></svg>,
    'map-pin': <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    'bar-chart': <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
    settings: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  };

  return <span className="flex-shrink-0">{icons[name] || null}</span>;
}
