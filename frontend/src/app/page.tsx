'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/types/student';
import Link from 'next/link';

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const userData: User = JSON.parse(storedUser);
        setUser(userData);
        
        // Redirect based on role
        if (userData.role === 'admin') {
          router.push('/admin');
        } else if (userData.role === 'recruiter') {
          router.push('/recruiter');
        }
      } catch (err) {
        console.error('Error parsing stored user data:', err);
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // If user is logged in, show loading while redirecting
  if (user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-lg text-gray-600">Redirecting...</p>
        </div>
      </div>
    );
  }

  // Show home page for non-logged in users
  return (
    <div className="relative min-h-screen flex items-center justify-center">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('/Images/12084798_20943953.svg')",
        }}
      >
        {/* Overlay for better text readability */}
        <div className="absolute inset-0 bg-black bg-opacity-40"></div>
      </div>
      
      {/* Content */}
      <div className="relative z-10 text-center">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Main Heading */}
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-8 leading-tight">
            Recruitment Ops
          </h1>
          
          {/* Subtitle */}
          <p className="text-xl md:text-2xl text-white mb-12 opacity-90 max-w-2xl mx-auto">
            Streamline your recruitment process with intelligent email tracking and management
          </p>
          
          {/* Sign In Button */}
          <div className="space-y-4">
            <Link
              href="/login"
              className="inline-flex items-center px-8 py-4 text-lg font-semibold text-white bg-blue-600 border-2 border-blue-600 rounded-lg hover:bg-blue-700 hover:border-blue-700 transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
            >
              Get Started
            </Link>
            
            {/* Additional Info */}
            <div className="mt-8 text-white opacity-80">
              <p className="text-sm">
              Accelerate Hiring. Illuminate Talent.
              </p>
            </div>``
          </div>
        </div>
      </div>
      
      {/* Decorative elements */}
      {/* <div className="absolute bottom-8 left-8 text-white opacity-60">
        <div className="text-sm">© 2024 Email Tracker</div>
      </div>
      
      <div className="absolute bottom-8 right-8 text-white opacity-60">
        <div className="text-sm">Powered by A.I </div>
      </div> */}
    </div>
  );
} 