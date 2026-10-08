'use client';

import { useAuth } from '@/contexts/AuthContext';
import { usePathname } from 'next/navigation';

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthChecked, isAuthenticated } = useAuth();
  const pathname = usePathname();

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/forgot-password'];
  const isPublicRoute = publicRoutes.includes(pathname) || pathname.startsWith('/set-password');

  // Show nothing until authentication status is checked
  if (!isAuthChecked) {
    return null;
  }

  // If user is not authenticated and trying to access protected route, show nothing
  // (the AuthContext will handle the redirect)
  if (!isAuthenticated && !isPublicRoute) {
    return null;
  }

  // Show content for authenticated users or public routes
  return <>{children}</>;
}
