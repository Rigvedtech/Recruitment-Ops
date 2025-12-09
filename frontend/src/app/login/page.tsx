'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { login, verifyLoginOTP, forgotPassword, resetPassword } from '@/services/api';
import { LoginFormData, User } from '@/types/student';

const Login: React.FC = () => {
  const [formData, setFormData] = useState<LoginFormData>({
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
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordOtp, setForgotPasswordOtp] = useState('');
  const [forgotPasswordNewPassword, setForgotPasswordNewPassword] = useState('');
  const [forgotPasswordStep, setForgotPasswordStep] = useState<'email' | 'otp' | 'reset'>('email');
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordError, setForgotPasswordError] = useState<string | null>(null);
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState<string | null>(null);
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
      const response = await login(formData.username, formData.password);

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
          const user: User = response.user;
          
          // Store user data and JWT token in localStorage
          localStorage.setItem('user', JSON.stringify(user));
          if (response.access_token) {
            localStorage.setItem('access_token', response.access_token);
          }
          
          // Dispatch custom event to notify NavigationWrapper
          window.dispatchEvent(new Event('userStateChanged'));
          
          // Redirect based on role
          if (user.role === 'admin') {
            router.push('/admin');
          } else {
            router.push('/recruiter');
          }
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
        const user: User = response.user;
        
        // Store user data and JWT token in localStorage
        localStorage.setItem('user', JSON.stringify(user));
        if (response.access_token) {
          localStorage.setItem('access_token', response.access_token);
        }
        
        // Dispatch custom event to notify NavigationWrapper
        window.dispatchEvent(new Event('userStateChanged'));
        
        // Redirect based on role
        if (user.role === 'admin') {
          router.push('/admin');
        } else {
          router.push('/recruiter');
        }
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

  const handleForgotPasswordEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotPasswordLoading(true);
    setForgotPasswordError(null);
    setForgotPasswordSuccess(null);

    if (!forgotPasswordEmail) {
      setForgotPasswordError('Email is required');
      setForgotPasswordLoading(false);
      return;
    }

    try {
      const response = await forgotPassword(forgotPasswordEmail);
      if (response.status === 'success') {
        setForgotPasswordSuccess('OTP has been sent to your email');
        setForgotPasswordStep('otp');
      }
    } catch (err: any) {
      setForgotPasswordError(err.message || 'Failed to send OTP');
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleForgotPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotPasswordLoading(true);
    setForgotPasswordError(null);
    setForgotPasswordSuccess(null);

    if (!forgotPasswordOtp || !forgotPasswordNewPassword) {
      setForgotPasswordError('OTP and new password are required');
      setForgotPasswordLoading(false);
      return;
    }

    if (forgotPasswordNewPassword.length < 6) {
      setForgotPasswordError('Password must be at least 6 characters long');
      setForgotPasswordLoading(false);
      return;
    }

    try {
      const response = await resetPassword(forgotPasswordEmail, forgotPasswordOtp, forgotPasswordNewPassword);
      if (response.status === 'success') {
        setForgotPasswordSuccess('Password reset successfully! You can now login.');
        setTimeout(() => {
          setShowForgotPassword(false);
          setForgotPasswordStep('email');
          setForgotPasswordEmail('');
          setForgotPasswordOtp('');
          setForgotPasswordNewPassword('');
        }, 2000);
      }
    } catch (err: any) {
      setForgotPasswordError(err.message || 'Failed to reset password');
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const closeForgotPassword = () => {
    setShowForgotPassword(false);
    setForgotPasswordStep('email');
    setForgotPasswordEmail('');
    setForgotPasswordOtp('');
    setForgotPasswordNewPassword('');
    setForgotPasswordError(null);
    setForgotPasswordSuccess(null);
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Video Background */}
      <div className="absolute inset-0 overflow-hidden">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src="/Images/Login page.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        {/* Overlay for better readability */}
        <div className="absolute inset-0 bg-black bg-opacity-50"></div>
      </div>
      
      {/* Login Form */}
      <div className="relative z-10 max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            {loginStep === 'credentials' ? 'Sign In' : 'Verify OTP'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-200">
            {loginStep === 'credentials' ? 'Access your dashboard' : 'Enter the code sent to your email'}
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
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm bg-white bg-opacity-90 backdrop-blur-sm"
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
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm bg-white bg-opacity-90 backdrop-blur-sm"
                  placeholder="Password"
                  value={formData.password}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-900 bg-opacity-80 backdrop-blur-sm p-4 border border-red-500">
                <div className="text-sm text-red-200">{error}</div>
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
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-blue-300 hover:text-blue-200 underline"
              >
                Forgot Password?
              </button>
            </div>
          </form>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleOTPSubmit}>
            <div className="rounded-md shadow-sm">
              <div className="mb-4 text-center">
                <p className="text-sm text-gray-200 mb-2">
                  We've sent a verification code to
                </p>
                <p className="text-sm font-semibold text-white">
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
                  className="appearance-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm bg-white bg-opacity-90 backdrop-blur-sm text-center text-2xl tracking-widest"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoFocus
                />
                <p className="mt-2 text-xs text-center text-gray-300">
                  Enter the 6-digit code
                </p>
                {otpRemainingMinutes !== null && (
                  <p className="mt-1 text-xs text-center text-gray-400">
                    {otpRemainingMinutes > 0 ? (
                      `Code expires in ${otpRemainingMinutes} minute${otpRemainingMinutes !== 1 ? 's' : ''}`
                    ) : (
                      <span className="text-red-400">Code has expired. Please go back and try again.</span>
                    )}
                  </p>
                )}
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-900 bg-opacity-80 backdrop-blur-sm p-4 border border-red-500">
                <div className="text-sm text-red-200">{error}</div>
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
                className="text-sm text-blue-300 hover:text-blue-200 underline"
              >
                Back to Login
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 relative">
            <button
              onClick={closeForgotPassword}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Reset Password</h2>

            {forgotPasswordStep === 'email' && (
              <form onSubmit={handleForgotPasswordEmail} className="space-y-4">
                <div>
                  <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email Address
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    value={forgotPasswordEmail}
                    onChange={(e) => setForgotPasswordEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="Enter your email"
                    required
                  />
                </div>

                {forgotPasswordError && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                    <p className="text-sm text-red-600 dark:text-red-400">{forgotPasswordError}</p>
                  </div>
                )}

                {forgotPasswordSuccess && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                    <p className="text-sm text-green-600 dark:text-green-400">{forgotPasswordSuccess}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={forgotPasswordLoading}
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {forgotPasswordLoading ? 'Sending...' : 'Send OTP'}
                </button>
              </form>
            )}

            {forgotPasswordStep === 'otp' && (
              <form onSubmit={handleForgotPasswordReset} className="space-y-4">
                <div>
                  <label htmlFor="reset-otp" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Enter OTP
                  </label>
                  <input
                    id="reset-otp"
                    type="text"
                    value={forgotPasswordOtp}
                    onChange={(e) => setForgotPasswordOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-center text-2xl tracking-widest"
                    placeholder="000000"
                    maxLength={6}
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Enter the 6-digit code sent to your email</p>
                </div>

                <div>
                  <label htmlFor="reset-new-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    New Password
                  </label>
                  <input
                    id="reset-new-password"
                    type="password"
                    value={forgotPasswordNewPassword}
                    onChange={(e) => setForgotPasswordNewPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="Enter new password"
                    required
                    minLength={6}
                  />
                </div>

                {forgotPasswordError && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                    <p className="text-sm text-red-600 dark:text-red-400">{forgotPasswordError}</p>
                  </div>
                )}

                {forgotPasswordSuccess && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                    <p className="text-sm text-green-600 dark:text-green-400">{forgotPasswordSuccess}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotPasswordStep('email');
                      setForgotPasswordOtp('');
                      setForgotPasswordNewPassword('');
                      setForgotPasswordError(null);
                      setForgotPasswordSuccess(null);
                    }}
                    className="flex-1 py-2 px-4 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={forgotPasswordLoading}
                    className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {forgotPasswordLoading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Login; 