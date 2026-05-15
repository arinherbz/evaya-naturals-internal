export const ROUTE_ACCESS = {
  dashboard: ['Admin', 'Branch Manager', 'Cashier'],
  pos: ['Admin', 'Branch Manager', 'Cashier'],
  products: ['Admin', 'Branch Manager'],
  inventory: ['Admin', 'Branch Manager', 'Cashier'],
  inventoryUpdate: ['Admin', 'Branch Manager'],
  customers: ['Admin', 'Branch Manager', 'Cashier'],
  expenses: ['Admin', 'Branch Manager'],
  reports: ['Admin', 'Branch Manager'],
  deliveries: ['Admin', 'Branch Manager'],
  receipts: ['Admin', 'Branch Manager', 'Cashier'],
  orders: ['Admin', 'Branch Manager'],
  settings: ['Admin'],
} as const;

export type AllowedRole = (typeof ROUTE_ACCESS)[keyof typeof ROUTE_ACCESS][number];
export type AllowedRoleList = readonly AllowedRole[];

export function canAccessRoute(roleName: string | null | undefined, allowRoles?: readonly AllowedRole[]) {
  if (!roleName) return false;
  if (roleName === 'Admin') return true;
  if (!allowRoles || allowRoles.length === 0) return true;
  return allowRoles.includes(roleName as AllowedRole);
}

export function getDefaultRoute(roleName: string | null | undefined) {
  switch (roleName) {
    case 'Cashier':
      return '/pos';
    case 'Branch Manager':
    case 'Admin':
    default:
      return '/';
  }
}
