import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permission?: string;
  allowRoles?: string[];
}

const STAFF_ROLES = ['Cashier', 'Delivery Rider'];

export default function ProtectedRoute({ children, permission, allowRoles }: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f5f5f7]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const roleName = user?.role.name ?? '';

  // Admin bypasses all checks
  if (roleName === 'Admin') {
    return <>{children}</>;
  }

  const hasRoleAccess = !allowRoles || allowRoles.length === 0 || allowRoles.includes(roleName);
  const hasPermission = !permission || (user?.role.permissions.includes('*') ?? false) || (user?.role.permissions.includes(permission) ?? false);

  if (!hasRoleAccess || !hasPermission) {
    // Staff roles redirect to POS instead of "Access Denied"
    if (STAFF_ROLES.includes(roleName)) {
      return <Navigate to="/pos" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
