'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/services/api';
import { SignupFormData, User } from '@/types/student';

const Signup: React.FC = () => {
  const [formData, setFormData] = useState<SignupFormData>({
    username: '',
    full_name: '',
    password: '',
    confirmPassword: '',
    email: '',
    phone_number: '',
    role: 'recruiter'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [passwordValidation, setPasswordValidation] = useState({
    length: false,
    uppercase: false,
    number: false,
    special: false
  });
  const router = useRouter();

  useEffect(() => {
    // Load current user from localStorage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('user');
      if (stored) {
        try {
          const parsed: User = JSON.parse(stored);
          setCurrentUser(parsed);
        } catch {
          localStorage.removeItem('user');
        }
      }
    }
  }, []);

  useEffect(() => {
    // If admin, fetch users list
    const fetchUsers = async () => {
      try {
        setUsersLoading(true);
        const resp = await api.get('/users');
        setUsers(resp || []);
      } catch (e) {
        // Silently ignore on signup page
      } finally {
        setUsersLoading(false);
      }
    };
    if (currentUser?.role === 'admin') {
      fetchUsers();
    }
  }, [currentUser]);

  const validatePassword = (password: string) => {
    const validation = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      number: /\d/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };
    setPasswordValidation(validation);
    return validation.length && validation.uppercase && validation.number && validation.special;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (name === 'password') {
      validatePassword(value);
    }

    // Reset email verification when email changes
    if (name === 'email' && emailVerified) {
      setEmailVerified(false);
      setOtpSent(false);
      setOtp('');
    }
  };

  const sendOTP = async () => {
    if (!formData.email) {
      setError('Please enter an email address first');
      return;
    }

    setOtpLoading(true);
    setError(null);

    try {
      const response = await api.post('/auth/send-otp', {
        email: formData.email
      });

      if (response.status === 'success') {
        setOtpSent(true);
        setSuccess('OTP sent to your email address');
      } else {
        setError(response.message || 'Failed to send OTP');
      }
    } catch (err: any) {
      console.error('OTP send error:', err);
      setError(err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOTP = async () => {
    if (!otp) {
      setError('Please enter the OTP');
      return;
    }

    setOtpLoading(true);
    setError(null);

    try {
      const response = await api.post('/auth/verify-otp', {
        email: formData.email,
        otp: otp
      });

      if (response.status === 'success') {
        setEmailVerified(true);
        setSuccess('Email verified successfully');
        setOtp('');
      } else {
        setError(response.message || 'Invalid OTP');
      }
    } catch (err: any) {
      console.error('OTP verification error:', err);
      setError(err.response?.data?.message || 'Invalid OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    // Validate form
    if (!formData.username || !formData.password || !formData.full_name || !formData.email) {
      setError('Full name, username, email, and password are required');
      setLoading(false);
      return;
    }

    if (!emailVerified) {
      setError('Please verify your email address first');
      setLoading(false);
      return;
    }

    if (!validatePassword(formData.password)) {
      setError('Password must contain at least 8 characters, one uppercase letter, one number, and one special character');
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (formData.phone_number && !/^\d{10}$/.test(formData.phone_number)) {
      setError('Phone number must be 10 digits');
      setLoading(false);
      return;
    }

    try {
      const response = await api.post('/signup', {
        username: formData.username,
        full_name: formData.full_name,
        password: formData.password,
        email: formData.email,
        phone_number: formData.phone_number || undefined,
        role: formData.role
      });

      if (response.status === 'success') {
        setSuccess('Account created successfully!');
        setFormData({
          username: '',
          full_name: '',
          password: '',
          confirmPassword: '',
          email: '',
          phone_number: '',
          role: 'recruiter'
        });
        // Reset email verification state
        setEmailVerified(false);
        setOtpSent(false);
        setOtp('');
        // Refresh users list if admin is viewing
        if (currentUser?.role === 'admin') {
          try {
            const updated = await api.get('/users');
            setUsers(updated || []);
          } catch {}
        }
      } else {
        setError(response.message || 'Failed to create account');
      }
    } catch (err: any) {
      console.error('Signup error:', err);
      setError(err.response?.data?.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-4xl mx-auto space-y-8">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="px-6 pt-6">
            <h2 className="text-2xl font-semibold text-gray-900">Create Account</h2>
            <p className="mt-1 text-sm text-gray-600">Sign up for a new account</p>
          </div>

          <form className="px-6 pb-6 mt-6 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-gray-700">
                Full Name
              </label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-600 focus:border-blue-600 sm:text-sm bg-white"
                placeholder="Enter full name"
                value={formData.full_name}
                onChange={handleInputChange}
              />
            </div>

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-600 focus:border-blue-600 sm:text-sm bg-white"
                placeholder="Enter username"
                value={formData.username}
                onChange={handleInputChange}
              />
            </div>
            
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <div className="relative">
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="mt-1 appearance-none relative block w-full px-3 py-2 pr-20 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-600 focus:border-blue-600 sm:text-sm bg-white"
                  placeholder="Enter email"
                  value={formData.email}
                  onChange={handleInputChange}
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 top-1">
                  {emailVerified ? (
                    <span className="text-green-600 text-sm">✓ Verified</span>
                  ) : (
                    <button
                      type="button"
                      onClick={sendOTP}
                      disabled={otpLoading || !formData.email}
                      className="text-blue-600 hover:text-blue-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {otpLoading ? 'Sending...' : 'Verify'}
                    </button>
                  )}
                </div>
              </div>
              
              {otpSent && !emailVerified && (
                <div className="mt-2 flex space-x-2">
                  <input
                    type="text"
                    placeholder="Enter OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="flex-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-600 focus:border-blue-600 sm:text-sm bg-white"
                    maxLength={6}
                  />
                  <button
                    type="button"
                    onClick={verifyOTP}
                    disabled={otpLoading || !otp}
                    className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {otpLoading ? 'Verifying...' : 'Verify OTP'}
                  </button>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="phone_number" className="block text-sm font-medium text-gray-700">
                Phone Number (optional)
              </label>
              <input
                id="phone_number"
                name="phone_number"
                type="tel"
                pattern="\d{10}"
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-600 focus:border-blue-600 sm:text-sm bg-white"
                placeholder="10-digit phone number"
                value={formData.phone_number}
                onChange={handleInputChange}
              />
            </div>
            
            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                Role
              </label>
              <select
                id="role"
                name="role"
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-600 focus:border-blue-600 sm:text-sm"
                value={formData.role}
                onChange={handleInputChange}
              >
                <option value="recruiter">Recruiter</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  className="mt-1 appearance-none relative block w-full px-3 py-2 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-600 focus:border-blue-600 sm:text-sm bg-white"
                  placeholder="Enter password"
                  value={formData.password}
                  onChange={handleInputChange}
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 top-1">
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L8.464 8.464M9.878 9.878L12 12m-2.122-2.122l2.122 2.122M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
            
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  className="mt-1 appearance-none relative block w-full px-3 py-2 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-600 focus:border-blue-600 sm:text-sm bg-white"
                  placeholder="Confirm password"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 top-1">
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPassword ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L8.464 8.464M9.878 9.878L12 12m-2.122-2.122l2.122 2.122M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Password Requirements */}
          {formData.password && (
            <div className="bg-gray-50 p-4 rounded-md">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Password Requirements:</h4>
              <ul className="space-y-1 text-sm">
                <li className={`flex items-center ${passwordValidation.length ? 'text-green-600' : 'text-red-600'}`}>
                  <span className="mr-2">{passwordValidation.length ? '✓' : '✗'}</span>
                  At least 8 characters
                </li>
                <li className={`flex items-center ${passwordValidation.uppercase ? 'text-green-600' : 'text-red-600'}`}>
                  <span className="mr-2">{passwordValidation.uppercase ? '✓' : '✗'}</span>
                  One uppercase letter
                </li>
                <li className={`flex items-center ${passwordValidation.number ? 'text-green-600' : 'text-red-600'}`}>
                  <span className="mr-2">{passwordValidation.number ? '✓' : '✗'}</span>
                  One number
                </li>
                <li className={`flex items-center ${passwordValidation.special ? 'text-green-600' : 'text-red-600'}`}>
                  <span className="mr-2">{passwordValidation.special ? '✓' : '✗'}</span>
                  One special character
                </li>
              </ul>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          {success && (
            <div className="rounded-md bg-green-50 p-4">
              <div className="text-sm text-green-700">{success}</div>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading || !emailVerified}
              className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating Account...' : emailVerified ? 'Create Account' : 'Verify Email First'}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="font-medium text-blue-600 hover:text-blue-500"
              >
                Sign in
              </button>
            </p>
          </div>
        </form>
        </div>

        {currentUser?.role === 'admin' && (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="px-6 pt-6 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Users</h3>
                <p className="text-xs text-gray-500 mt-0.5">Manage users and roles</p>
              </div>
              {usersLoading && (
                <span className="text-sm text-gray-500">Loading...</span>
              )}
            </div>
            <div className="mt-4 max-h-[28rem] overflow-y-auto">
              <table className="min-w-full table-fixed">
                <thead className="bg-gray-50 border-t border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide w-2/6">Full Name</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide w-1/6">Username</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide w-2/6">Email</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide w-1/6">Phone</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide w-1/6">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((u) => (
                    <tr key={u.user_id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-sm text-gray-900 truncate">{u.full_name || '-'}</td>
                      <td className="px-5 py-3 text-sm text-gray-700 truncate">{u.username}</td>
                      <td className="px-5 py-3 text-sm text-gray-700 truncate">{u.email || '-'}</td>
                      <td className="px-5 py-3 text-sm text-gray-700 truncate">{u.phone_number || '-'}</td>
                      <td className="px-5 py-3 text-sm">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                          {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && !usersLoading && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-500">No users found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Signup; 