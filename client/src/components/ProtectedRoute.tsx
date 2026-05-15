import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { canAccessRoute, getDefaultRoute, type AllowedRoleList } from '../lib/access';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permission?: string;
  allowRoles?: AllowedRoleList;
}

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

  const hasRoleAccess = canAccessRoute(roleName, allowRoles);
  const hasPermission = !permission || (user?.role.permissions.includes('*') ?? false) || (user?.role.permissions.includes(permission) ?? false);

  if (!hasRoleAccess || !hasPermission) {
    return <Navigate to={getDefaultRoute(roleName)} replace />;
  }

  return <>{children}</>;
}
