'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { recruiterLogin, verifyLoginOTP } from '@/services/api';

const RecruiterLogin: React.FC = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginStep, setLoginStep] = useState<'credentials' | 'otp'>('credentials');
  const [otp, setOtp] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otpExpiryTime, setOtpExpiryTime] = useState<Date | null>(null);
  const [otpRemainingMinutes, setOtpRemainingMinutes] = useState<number | null>(null);
  const router = useRouter();

  // Countdown timer for OTP expiry
  useEffect(() => {
    if (otpExpiryTime && loginStep === 'otp') {
      const updateTimer = () => {
        const now = new Date();
        const diff = otpExpiryTime.getTime() - now.getTime();
        const minutes = Math.max(0, Math.floor(diff / 60000));
        setOtpRemainingMinutes(minutes);
        
        if (diff <= 0) {
          setOtpRemainingMinutes(0);
        }
      };

      updateTimer();
      const interval = setInterval(updateTimer, 1000);

      return () => clearInterval(interval);
    }
  }, [otpExpiryTime, loginStep]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate form
    if (!formData.username || !formData.password) {
      setError('Username and password are required');
      setLoading(false);
      return;
    }

    try {
      const response = await recruiterLogin(formData.username, formData.password);

      if (response.status === 'success') {
        // Check if OTP is required (2FA)
        if (response.requires_otp) {
          setMaskedEmail(response.email || 'your email');
          setLoginStep('otp');
          // Set OTP expiry time (10 minutes from now)
          const expiry = new Date();
          expiry.setMinutes(expiry.getMinutes() + 10);
          setOtpExpiryTime(expiry);
        } else {
          // Legacy flow (if OTP not required)
          // Store user data and JWT token in localStorage
          localStorage.setItem('user', JSON.stringify(response.user));
          if (response.access_token) {
            localStorage.setItem('access_token', response.access_token);
          }
          
          // Dispatch custom event to notify NavigationWrapper
          window.dispatchEvent(new Event('userStateChanged'));
          
          // Redirect to recruiter dashboard
          router.push('/recruiter');
        }
      } else {
        setError(response.message || 'Login failed');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate OTP
    if (!otp || otp.length !== 6) {
      setError('Please enter a valid 6-digit OTP');
      setLoading(false);
      return;
    }

    try {
      const response = await verifyLoginOTP(formData.username, formData.password, otp);

      if (response.status === 'success') {
        // Store user data and JWT token in localStorage
        localStorage.setItem('user', JSON.stringify(response.user));
        if (response.access_token) {
          localStorage.setItem('access_token', response.access_token);
        }
        
        // Dispatch custom event to notify NavigationWrapper
        window.dispatchEvent(new Event('userStateChanged'));
        
        // Redirect to recruiter dashboard
        router.push('/recruiter');
      } else {
        setError(response.message || 'OTP verification failed');
      }
    } catch (err: any) {
      console.error('OTP verification error:', err);
      setError(err.message || 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToCredentials = () => {
    setLoginStep('credentials');
    setOtp('');
    setError(null);
    setOtpExpiryTime(null);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            {loginStep === 'credentials' ? 'Recruiter Login' : 'Verify OTP'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-300">
            {loginStep === 'credentials' ? 'Sign in to access the recruiter dashboard' : 'Enter the code sent to your email'}
          </p>
        </div>
        
        {loginStep === 'credentials' ? (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="rounded-md shadow-sm -space-y-px">
              <div>
                <label htmlFor="username" className="sr-only">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm bg-white dark:bg-gray-700"
                  placeholder="Username"
                  value={formData.username}
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <label htmlFor="password" className="sr-only">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm bg-white dark:bg-gray-700"
                  placeholder="Password"
                  value={formData.password}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4 border border-red-200 dark:border-red-800">
                <div className="text-sm text-red-700 dark:text-red-400">{error}</div>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </button>
            </div>

            <div className="text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => router.push('/signup')}
                  className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500"
                >
                  Sign up
                </button>
              </p>
            </div>
          </form>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleOTPSubmit}>
            <div className="rounded-md shadow-sm">
              <div className="mb-4 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                  We've sent a verification code to
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {maskedEmail}
                </p>
              </div>
              <div>
                <label htmlFor="otp" className="sr-only">
                  OTP
                </label>
                <input
                  id="otp"
                  name="otp"
                  type="text"
                  required
                  maxLength={6}
                  className="appearance-none relative block w-full px-3 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm bg-white dark:bg-gray-700 text-center text-2xl tracking-widest"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoFocus
                />
                <p className="mt-2 text-xs text-center text-gray-500 dark:text-gray-400">
                  Enter the 6-digit code
                </p>
                {otpRemainingMinutes !== null && (
                  <p className="mt-1 text-xs text-center text-gray-500 dark:text-gray-400">
                    {otpRemainingMinutes > 0 ? (
                      `Code expires in ${otpRemainingMinutes} minute${otpRemainingMinutes !== 1 ? 's' : ''}`
                    ) : (
                      <span className="text-red-500 dark:text-red-400">Code has expired. Please go back and try again.</span>
                    )}
                  </p>
                )}
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4 border border-red-200 dark:border-red-800">
                <div className="text-sm text-red-700 dark:text-red-400">{error}</div>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Verifying...' : 'Verify OTP'}
              </button>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={handleBackToCredentials}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 underline"
              >
                Back to Login
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default RecruiterLogin; 