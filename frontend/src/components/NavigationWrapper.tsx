'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { User } from '@/types/student';
import NotificationBell from './NotificationBell';
import { useTheme } from '@/context/ThemeContext';

interface NavigationWrapperProps {
  children: React.ReactNode;
}

const NavigationWrapper: React.FC<NavigationWrapperProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { theme, toggleTheme } = useTheme();

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

  useEffect(() => {
    // Listen for global session-expired events triggered by API layer
    const handleSessionExpired = () => {
      setSessionExpired(true);
    };
    window.addEventListener('session-expired', handleSessionExpired as EventListener);
    return () => {
      window.removeEventListener('session-expired', handleSessionExpired as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('recruiterUser'); // Clean up old key too
    localStorage.removeItem('access_token');
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
    <div className={`min-h-screen ${user ? 'bg-gradient-to-br from-blue-50 to-indigo-100 dark:bg-gray-900 dark:bg-none' : 'bg-transparent dark:bg-gray-900'}`}>
      {sessionExpired && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-xl">
          <div className="flex items-start justify-between rounded-md border border-red-300 bg-red-50 px-4 py-3 shadow">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-700">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10A8 8 0 11.001 9.999 8 8 0 0118 10zM9 13a1 1 0 102 0 1 1 0 00-2 0zm1-8a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
              </span>
              <div>
                <p className="text-sm font-medium text-red-800">Invalid or expired token</p>
                <p className="text-xs text-red-700">Your session has expired. Please log in again.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleLogout}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Logout
              </button>
              <button
                onClick={() => setSessionExpired(false)}
                className="text-red-700 hover:text-red-800"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Only show navigation if user is logged in */}
      {user && (
        <nav className="bg-white dark:bg-gray-800 shadow-lg border-b border-gray-200 dark:border-gray-700">
          <div className="w-full px-4 sm:px-6 lg:px-8">
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
                          className="text-gray-700 dark:text-gray-200 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-700 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                        >
                          Dashboard
                        </Link>
                        <Link
                          href="/recruiter"
                          className="text-gray-700 dark:text-gray-200 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-700 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                        >
                          Recruiter
                        </Link>
                        <Link
                          href="/tracker"
                          className="text-gray-700 dark:text-gray-200 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-700 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
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
                        className="text-gray-700 dark:text-gray-200 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-700 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                      >
                        JD Tracker
                      </Link>
                      <Link
                        href="/recruiter/profiles"
                        className="text-gray-700 dark:text-gray-200 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-700 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                      >
                        Profiles
                      </Link>
                    </>
                  )}
                </div>
              </div>
              
              {/* Theme, Notifications and Profile Menu */}
              <div className="flex items-center space-x-3">
                {/* Theme Toggle */}
                <button
                  aria-label="Toggle theme"
                  onClick={toggleTheme}
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                  title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {theme === 'dark' ? (
                    // Sun icon for dark mode
                    <svg className="h-5 w-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 3.5a1 1 0 011 1V6a1 1 0 11-2 0V4.5a1 1 0 011-1zM10 14a4 4 0 100-8 4 4 0 000 8zM4.636 5.636a1 1 0 011.414 0l1.06 1.06A1 1 0 015.636 8.11l-1.06-1.06a1 1 0 010-1.414zM3.5 10a1 1 0 011-1H6a1 1 0 110 2H4.5a1 1 0 01-1-1zm11.5-1a1 1 0 100 2h1.5a1 1 0 100-2H15zM4.636 14.364a1 1 0 010-1.414l1.06-1.06a1 1 0 111.415 1.414l-1.06 1.06a1 1 0 01-1.415 0zM10 14a1 1 0 011 1v1.5a1 1 0 11-2 0V15a1 1 0 011-1zm3.889-7.303l1.06-1.06a1 1 0 011.415 1.414l-1.06 1.06A1 1 0 1113.89 6.697z" />
                    </svg>
                  ) : (
                    // Moon icon for light mode
                    <svg className="h-5 w-5 text-gray-700" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z" />
                    </svg>
                  )}
                </button>
                {/* Notifications */}
                <NotificationBell user={user} />
                
                {/* Profile Dropdown */}
                <div className="relative" ref={menuRef}>
                  <button
                    aria-label="User menu"
                    onClick={() => setMenuOpen((v) => !v)}
                    className="inline-flex items-center gap-2 px-2 h-10 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100">
                      <svg className="h-5 w-5 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </span>
                    <svg className={`h-4 w-4 text-gray-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-lg bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none border border-gray-100 dark:border-gray-700 z-50">
                      <div className="px-4 py-3">
                        <p className="text-sm text-gray-500 dark:text-gray-300">Signed in as</p>
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{user.username}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-300 capitalize">{user.role}</p>
                      </div>
                      <div className="py-1">
                        <button
                          onClick={() => { setMenuOpen(false); router.push('/profile'); }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          Profile
                        </button>
                      </div>
                      <div className="py-1 border-t border-gray-100">
                        <button
                          onClick={() => { setMenuOpen(false); handleLogout(); }}
                          className="w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-red-50 dark:hover:bg-gray-700"
                        >
                          Logout
                        </button>
                      </div>
                    </div>
                  )}
                </div>
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