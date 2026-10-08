'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    router.push('/accounts');
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 bg-gray-900">
      <main className="py-6 px-4 sm:px-6 lg:px-8 bg-gray-900">
      </main>
    </div>
  )
} 