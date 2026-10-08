'use client';

import { ReactNode } from 'react';
import Navigation from '@/components/layouts/Navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname } from 'next/navigation';
import Footer from '@/components/Footer';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, isAuthenticated, isAuthChecked } = useAuth();
  const pathname = usePathname();

  // Don't show navigation on login and forgot-password pages
  const isPublicPage = pathname === '/login' || pathname === '/forgot-password' || pathname.startsWith('/set-password');
  
  // Don't show navigation if user is not authenticated (will be redirected)
  const shouldShowNavigation = isAuthChecked && isAuthenticated && !isPublicPage;

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {shouldShowNavigation && <Navigation user={user} />}
      {shouldShowNavigation ? (
        <main className="bg-gray-900 pt-4 md:pt-4 flex-grow">
          <div className="max-w-7xl mx-auto py-4 md:py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      ) : (
        <main className="flex-grow bg-gray-900">
          {children}
        </main>
      )}
      {shouldShowNavigation && <Footer />}
    </div>
  );
} 