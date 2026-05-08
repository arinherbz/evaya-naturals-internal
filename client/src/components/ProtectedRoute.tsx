import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permission?: string;
  allowRoles?: string[];
}

export default function ProtectedRoute({ children, permission, allowRoles }: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-evaya-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (permission && user) {
    // Admin has all permissions
    if (user.role.name === 'Admin') {
      return <>{children}</>;
    }

    if (allowRoles?.includes(user.role.name)) {
      return <>{children}</>;
    }

    const hasPermission = user.role.permissions.includes('*') || 
                          user.role.permissions.includes(permission);
    
    if (!hasPermission) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
          <div className="text-center">
            <p className="text-red-600 text-lg font-medium">Access Denied</p>
            <p className="mt-2 text-gray-600">You don't have permission to access this page.</p>
          </div>
        </div>
      );
    }
  }

  if (!permission && allowRoles && user && !allowRoles.includes(user.role.name) && user.role.name !== 'Admin') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 text-lg font-medium">Access Denied</p>
          <p className="mt-2 text-gray-600">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
