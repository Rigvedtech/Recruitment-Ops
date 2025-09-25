'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/types/student';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: ('admin' | 'recruiter')[];
  fallbackPath?: string;
}

const RoleGuard: React.FC<RoleGuardProps> = ({ 
  children, 
  allowedRoles, 
  fallbackPath = '/login' 
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = () => {
      const storedUser = localStorage.getItem('user');
      
      if (!storedUser) {
        router.push(fallbackPath);
        return;
      }

      try {
        const userData: User = JSON.parse(storedUser);
        setUser(userData);

        if (allowedRoles.includes(userData.role)) {
          setAuthorized(true);
        } else {
          // Redirect based on user's role
          if (userData.role === 'admin') {
            router.push('/admin');
          } else {
            router.push('/recruiter');
          }
        }
      } catch (err) {
        console.error('Error parsing user data:', err);
        localStorage.removeItem('user');
        router.push(fallbackPath);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [allowedRoles, fallbackPath, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!authorized) {
    return null; // Will redirect
  }

  return <>{children}</>;
};

export default RoleGuard; 