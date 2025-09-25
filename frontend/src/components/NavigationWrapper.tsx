'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { User } from '@/types/student';
import NotificationBell from './NotificationBell';

interface NavigationWrapperProps {
  children: React.ReactNode;
}

const NavigationWrapper: React.FC<NavigationWrapperProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkUser = () => {
      // Check for user data in localStorage (primary key)
      let storedUser = localStorage.getItem('user');
      
      // If not found, check for backward compatibility with recruiterUser key
      if (!storedUser) {
        storedUser = localStorage.getItem('recruiterUser');
        // If found in old key, migrate to new key
        if (storedUser) {
          localStorage.setItem('user', storedUser);
          localStorage.removeItem('recruiterUser');
        }
      }
      
      if (storedUser) {
        try {
          const userData: User = JSON.parse(storedUser);
          setUser(userData);
        } catch (err) {
          console.error('Error parsing stored user data:', err);
          localStorage.removeItem('user');
          localStorage.removeItem('recruiterUser');
        }
      }
      setLoading(false);
    };

    checkUser();

    // Listen for storage changes to update navbar when user logs in/out
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'user' || e.key === 'recruiterUser') {
        checkUser();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Also listen for custom events for same-origin changes
    const handleUserChange = () => {
      checkUser();
    };
    
    window.addEventListener('userStateChanged', handleUserChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('userStateChanged', handleUserChange);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('recruiterUser'); // Clean up old key too
    setUser(null);
    
    // Dispatch custom event to notify other components
    window.dispatchEvent(new Event('userStateChanged'));
    
    window.location.href = '/login';
  };

  const handleLogoClick = () => {
    if (user) {
      if (user.role === 'admin') {
        router.push('/admin');
      } else if (user.role === 'recruiter') {
        router.push('/recruiter');
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${user ? 'bg-gradient-to-br from-blue-50 to-indigo-100' : 'bg-transparent'}`}>
      {/* Only show navigation if user is logged in */}
      {user && (
        <nav className="bg-white shadow-lg border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                {/* Logo/Brand */}
                <div className="flex-shrink-0 flex items-center">
                  <button
                    onClick={handleLogoClick}
                    className="flex items-center cursor-pointer hover:opacity-80 transition-opacity duration-200"
                  >
                    <Image
                      src="/Images/Recruitment Logo.png"
                      alt="Recruitment Ops Logo"
                      width={180}
                      height={60}
                      className="h-50 w-auto"
                    />
                  </button>
                </div>
                
                {/* Navigation Links - Different for admin vs recruiter */}
                <div className="hidden lg:ml-8 lg:flex lg:space-x-1">
                  {user.role === 'admin' ? (
                    // Admin Navigation - Organized by priority
                    <>
                      {/* Primary Navigation */}
                      <div className="flex items-center space-x-1">
                        <Link
                          href="/admin"
                          className="text-gray-700 hover:text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                        >
                          Dashboard
                        </Link>
                        <Link
                          href="/recruiter"
                          className="text-gray-700 hover:text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                        >
                          Recruiter
                        </Link>
                        <Link
                          href="/tracker"
                          className="text-gray-700 hover:text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                        >
                          Tracker
                        </Link>
                      </div>
                      

                    </>
                  ) : (
                    // Recruiter Navigation - Only recruiter-related links
                    <>
                      <Link
                        href="/recruiter"
                        className="text-gray-700 hover:text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                      >
                        JD Tracker
                      </Link>
                      <Link
                        href="/recruiter/profiles"
                        className="text-gray-700 hover:text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                      >
                        Profiles
                      </Link>
                    </>
                  )}
                </div>
              </div>
              
              {/* User Info, Notifications and Logout */}
              <div className="flex items-center space-x-4">
                {/* Notifications */}
                <NotificationBell user={user} />
                
                <div className="hidden md:flex items-center space-x-3">
                  <div className="bg-blue-100 rounded-full p-2">
                    <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="text-sm">
                    <div className="text-gray-900 font-medium">{user.username}</div>
                    <div className="text-gray-500 capitalize">{user.role}</div>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="bg-red-50 text-red-700 px-4 py-2 rounded-lg hover:bg-red-100 transition-colors duration-200 text-sm font-medium border border-red-200"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </nav>
      )}
      
      {/* Main Content */}
      <main className={!user ? 'bg-transparent' : ''}>
        {children}
      </main>
    </div>
  );
};

export default NavigationWrapper; 