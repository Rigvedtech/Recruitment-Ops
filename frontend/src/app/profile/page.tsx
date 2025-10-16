'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/types/student';

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (!stored) {
      router.push('/login');
      return;
    }
    try {
      const data: User = JSON.parse(stored);
      setUser(data);
    } catch {
      localStorage.removeItem('user');
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:bg-gray-900 dark:bg-none">
      <div className="max-w-3xl mx-auto p-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 p-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Profile</h1>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-300">Username</div>
              <div className="text-gray-900 dark:text-gray-100 font-medium">{user.username}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-300">Role</div>
              <div className="text-gray-900 dark:text-gray-100 font-medium capitalize">{user.role}</div>
            </div>
            {user.email && (
              <div>
                <div className="text-sm text-gray-500 dark:text-gray-300">Email</div>
                <div className="text-gray-900 dark:text-gray-100 font-medium">{user.email}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


