'use client';

import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import AppLayout from '@/components/layouts/AppLayout';
import AuthGuard from '@/components/AuthGuard';

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <LanguageProvider>
        <AuthGuard>
          <AppLayout>
            {children}
          </AppLayout>
        </AuthGuard>
      </LanguageProvider>
      <Toaster position="top-right" />
    </AuthProvider>
  );
} 