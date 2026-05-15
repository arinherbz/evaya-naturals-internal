import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, ShoppingCart, Receipt, ClipboardList, Users,
  Package, Database, CreditCard, Truck, BarChart3, Settings,
  LogOut, X, Menu, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { formatUGX as ugx } from '../lib/currency';
import BrandMark from './BrandMark';
import { canAccessRoute, getDefaultRoute, ROUTE_ACCESS, type AllowedRoleList } from '../lib/access';

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  allowRoles?: AllowedRoleList;
};

type NavGroup = {
  label: string | null;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard, allowRoles: ROUTE_ACCESS.dashboard },
      { label: 'POS', href: '/pos', icon: ShoppingCart, allowRoles: ROUTE_ACCESS.pos },
    ],
  },
  {
    label: 'Sales',
    items: [
      { label: 'Receipts', href: '/receipts', icon: Receipt, allowRoles: ROUTE_ACCESS.receipts },
      { label: 'Orders', href: '/orders', icon: ClipboardList, allowRoles: ROUTE_ACCESS.orders },
      { label: 'Customers', href: '/customers', icon: Users, allowRoles: ROUTE_ACCESS.customers },
    ],
  },
  {
    label: 'Stock',
    items: [
      { label: 'Products', href: '/products', icon: Package, allowRoles: ROUTE_ACCESS.products },
      { label: 'Inventory', href: '/inventory', icon: Database, allowRoles: ROUTE_ACCESS.inventory },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Expenses', href: '/expenses', icon: CreditCard, allowRoles: ROUTE_ACCESS.expenses },
      { label: 'Deliveries', href: '/deliveries', icon: Truck, allowRoles: ROUTE_ACCESS.deliveries },
      { label: 'Reports', href: '/reports', icon: BarChart3, allowRoles: ROUTE_ACCESS.reports },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Settings', href: '/settings', icon: Settings, allowRoles: ROUTE_ACCESS.settings },
    ],
  },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const shiftQuery = useQuery({
    queryKey: ['pos-current-shift'],
    queryFn: () => api.pos.currentShift(),
    refetchInterval: 60_000,
  });
  const currentShift = shiftQuery.data?.shift ?? null;

  const logoHref = getDefaultRoute(user?.role.name);

  const canShowItem = (allowRoles?: AllowedRoleList) => canAccessRoute(user?.role.name, allowRoles);

  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => canShowItem(item.allowRoles)),
  })).filter((g) => g.items.length > 0);

  const allVisibleItems = visibleGroups.flatMap((g) => g.items);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-sm font-medium transition-colors ${
      isActive
        ? 'bg-[#1B4332]/10 text-[#1B4332]'
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
    }`;

  const iconNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center justify-center rounded-lg p-2 transition-colors ${
      isActive
        ? 'bg-[#1B4332]/10 text-[#1B4332]'
        : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
    }`;

  const ShiftBadge = () =>
    currentShift ? (
      <div className="mx-3 mb-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
        <div className="mb-1 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-700">
            Shift Active
          </span>
        </div>
        <p className="text-[11px] text-slate-500">
          {currentShift.saleCount ?? 0} {(currentShift.saleCount ?? 0) === 1 ? 'sale' : 'sales'}
        </p>
        <p className="text-sm font-bold text-[#1B4332]">
          {ugx(currentShift.salesTotal ?? 0)}
        </p>
      </div>
    ) : null;

  const SidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Brand */}
      <div className="flex h-[60px] shrink-0 items-center gap-3 border-b border-slate-100 px-4">
        <button
          type="button"
          onClick={() => { navigate(logoHref); onNav?.(); }}
          className="flex items-center gap-2.5 min-w-0"
        >
          <BrandMark compact />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {visibleGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-5' : ''}>
            {group.label && (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink
                    to={item.href}
                    onClick={onNav}
                    className={navLinkClass}
                    end={item.href === '/'}
                  >
                    <item.icon size={16} strokeWidth={1.75} />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Shift badge */}
      <ShiftBadge />

      {/* User footer */}
      <div className="shrink-0 border-t border-slate-100 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1B4332]/10 text-[13px] font-bold text-[#1B4332]">
            {user?.firstName?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="truncate text-[11px] text-slate-400">{user?.role.name}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Log out"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <LogOut size={15} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile topbar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-[60px] items-center justify-between border-b border-slate-100 bg-white px-4 md:hidden">
        <button type="button" onClick={() => navigate(logoHref)}>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: '#1B4332' }}
          >
            <span className="text-sm font-bold leading-none text-white">E</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
          aria-label="Open navigation"
        >
          <Menu size={20} strokeWidth={1.75} />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/40"
            aria-label="Close navigation"
          />
          <aside className="relative flex h-full w-[min(17rem,86vw)] flex-col border-r border-slate-100 bg-white">
            <div className="absolute right-0 top-3 translate-x-full">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="m-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-md text-slate-600"
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
            <SidebarContent onNav={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Icon-only sidebar (md–lg) */}
      <aside className="hidden min-h-screen w-[52px] shrink-0 flex-col border-r border-slate-100 bg-white md:flex lg:hidden">
        <div className="flex h-[60px] items-center justify-center border-b border-slate-100">
          <button type="button" onClick={() => navigate(logoHref)}>
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: '#1B4332' }}
            >
              <span className="text-sm font-bold leading-none text-white">E</span>
            </div>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          <ul className="flex flex-col items-center gap-0.5 px-1">
            {allVisibleItems.map((item) => (
              <li key={item.href} className="w-full">
                <NavLink
                  to={item.href}
                  className={iconNavLinkClass}
                  end={item.href === '/'}
                  title={item.label}
                >
                  <item.icon size={18} strokeWidth={1.75} />
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {currentShift && (
          <div className="flex justify-center pb-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" title="Shift active" />
          </div>
        )}

        <div className="shrink-0 border-t border-slate-100 py-3 flex flex-col items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1B4332]/10 text-xs font-bold text-[#1B4332]">
            {user?.firstName?.[0]?.toUpperCase() ?? '?'}
          </div>
          <button
            type="button"
            onClick={logout}
            title="Log out"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <LogOut size={15} strokeWidth={1.75} />
          </button>
        </div>
      </aside>

      {/* Desktop sidebar (lg+) */}
      <aside className="hidden min-h-screen w-56 shrink-0 flex-col border-r border-slate-100 bg-white lg:flex">
        <SidebarContent />
      </aside>
    </>
  );
}
