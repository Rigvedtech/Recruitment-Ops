'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/types/student';
import { updateUserProfile, forgotPassword, resetPassword } from '@/services/api';

type EditableField = 'full_name' | 'username' | 'phone_number' | 'password' | null;

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<EditableField>(null);
  const [editValues, setEditValues] = useState<{
    full_name?: string;
    username?: string;
    phone_number?: string;
    password?: string;
    current_password?: string;
  }>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordOtp, setForgotPasswordOtp] = useState('');
  const [forgotPasswordNewPassword, setForgotPasswordNewPassword] = useState('');
  const [forgotPasswordStep, setForgotPasswordStep] = useState<'email' | 'otp' | 'reset'>('email');
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordError, setForgotPasswordError] = useState<string | null>(null);
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState<string | null>(null);
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

  const startEditing = (field: EditableField) => {
    if (!user) return;
    setEditingField(field);
    setError(null);
    setSuccess(null);
    
    if (field === 'full_name') {
      setEditValues({ full_name: user.full_name || '' });
    } else if (field === 'username') {
      setEditValues({ username: user.username || '' });
    } else if (field === 'phone_number') {
      setEditValues({ phone_number: user.phone_number || '' });
    } else if (field === 'password') {
      setEditValues({ password: '', current_password: '' });
    }
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditValues({});
    setError(null);
    setSuccess(null);
    setShowCurrentPassword(false);
    setShowNewPassword(false);
  };

  const validateField = (field: EditableField, value: string): string | null => {
    if (field === 'phone_number') {
      const phoneStr = value.trim();
      if (phoneStr && (!/^\d{10}$/.test(phoneStr))) {
        return 'Phone number must be exactly 10 digits';
      }
    } else if (field === 'password') {
      if (!editValues.current_password) {
        return 'Current password is required';
      }
      if (value.length < 6) {
        return 'Password must be at least 6 characters long';
      }
    } else if (field === 'username') {
      if (!value.trim()) {
        return 'Username cannot be empty';
      }
    } else if (field === 'full_name') {
      if (!value.trim()) {
        return 'Full name cannot be empty';
      }
    }
    return null;
  };

  const handleSave = async () => {
    if (!editingField || !user) return;

    const value = editValues[editingField] || '';
    const validationError = validateField(editingField, value);
    
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updateData: any = {};
      
      if (editingField === 'password') {
        updateData.password = editValues.password;
        updateData.current_password = editValues.current_password;
      } else {
        updateData[editingField] = editingField === 'phone_number' && value ? value.trim() : value.trim();
      }

      const response = await updateUserProfile(updateData);
      
      if (response.status === 'success' && response.user) {
        // Update local storage with new user data
        localStorage.setItem('user', JSON.stringify(response.user));
        setUser(response.user);
        setEditingField(null);
        setEditValues({});
        setSuccess(`${editingField === 'full_name' ? 'Full name' : editingField === 'phone_number' ? 'Phone number' : editingField === 'password' ? 'Password' : 'Username'} updated successfully`);
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setEditValues(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleForgotPasswordEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) {
      setForgotPasswordError('Email not found in profile');
      return;
    }
    
    setForgotPasswordLoading(true);
    setForgotPasswordError(null);
    setForgotPasswordSuccess(null);
    setForgotPasswordEmail(user.email);

    try {
      const response = await forgotPassword(user.email);
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
        setForgotPasswordSuccess('Password reset successfully!');
        // Update local storage with new user data if available
        if (response.user) {
          localStorage.setItem('user', JSON.stringify(response.user));
          setUser(response.user);
        }
        // Close modal and reset password edit
        setTimeout(() => {
          setShowForgotPassword(false);
          setForgotPasswordStep('email');
          setForgotPasswordOtp('');
          setForgotPasswordNewPassword('');
          setEditingField(null);
          setEditValues({});
          setSuccess('Password reset successfully');
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
    setForgotPasswordOtp('');
    setForgotPasswordNewPassword('');
    setForgotPasswordError(null);
    setForgotPasswordSuccess(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) return null;

  const renderField = (
    label: string,
    field: EditableField,
    value: string | undefined,
    isEditable: boolean = true
  ) => {
    const isEditing = editingField === field;
    const displayValue = value || 'Not set';

    return (
      <div className="py-4 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
              {label}
            </div>
            {isEditing && field !== null ? (
              <div className="space-y-3">
                {field === 'password' ? (
                  <>
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Current Password
                      </label>
                      <div className="relative">
                        <input
                          type={showCurrentPassword ? 'text' : 'password'}
                          value={editValues.current_password || ''}
                          onChange={(e) => handleInputChange('current_password', e.target.value)}
                          className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          placeholder="Enter current password"
                          disabled={saving}
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
                          tabIndex={-1}
                        >
                          {showCurrentPassword ? (
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="text-right">
                      <button
                        type="button"
                        onClick={() => {
                          if (user?.email) {
                            setForgotPasswordEmail(user.email);
                            setShowForgotPassword(true);
                            setForgotPasswordStep('email');
                            // Auto-send OTP when opening modal
                            const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
                            handleForgotPasswordEmail(fakeEvent);
                          }
                        }}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        disabled={forgotPasswordLoading || saving}
                      >
                        Forgot Password?
                      </button>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        New Password
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          value={editValues.password || ''}
                          onChange={(e) => handleInputChange('password', e.target.value)}
                          className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          placeholder="Enter new password"
                          disabled={saving}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
                          tabIndex={-1}
                        >
                          {showNewPassword ? (
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                ) : field ? (
                  <input
                    type={field === 'phone_number' ? 'tel' : 'text'}
                    value={editValues[field] || ''}
                    onChange={(e) => handleInputChange(field, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder={`Enter ${label.toLowerCase()}`}
                    disabled={saving}
                    maxLength={field === 'phone_number' ? 10 : undefined}
                  />
                ) : null}
                {error && (
                  <div className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</div>
                )}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={cancelEditing}
                    disabled={saving}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="text-gray-900 dark:text-gray-100 font-medium">
                  {field === 'password' ? '••••••••' : displayValue}
                </div>
                {isEditable && (
                  <button
                    onClick={() => startEditing(field)}
                    className="ml-4 p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    title={`Edit ${label.toLowerCase()}`}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:bg-gray-900 dark:bg-none">
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-8">
            <h1 className="text-3xl font-bold text-white mb-2">Profile</h1>
            <p className="text-blue-100">Manage your account information</p>
          </div>

          {/* Success Message */}
          {success && (
            <div className="mx-6 mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center">
                <svg
                  className="w-5 h-5 text-green-600 dark:text-green-400 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-green-800 dark:text-green-200 font-medium">{success}</span>
              </div>
            </div>
          )}

          {/* Profile Fields */}
          <div className="p-6">
            {renderField('Full Name', 'full_name', user.full_name)}
            {renderField('Username', 'username', user.username)}
            {renderField('Email', null, user.email, false)}
            {renderField('Phone Number', 'phone_number', user.phone_number)}
            {renderField('Password', 'password', undefined)}
            <div className="py-4 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Role
                  </div>
                  <div className="text-gray-900 dark:text-gray-100 font-medium capitalize">
                    {user.role}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
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
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={forgotPasswordEmail}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">OTP will be sent to this email</p>
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
                  onClick={handleForgotPasswordEmail}
                  disabled={forgotPasswordLoading}
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {forgotPasswordLoading ? 'Sending...' : 'Send OTP'}
                </button>
              </div>
            )}

            {forgotPasswordStep === 'otp' && (
              <form onSubmit={handleForgotPasswordReset} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Enter OTP
                  </label>
                  <input
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    New Password
                  </label>
                  <input
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
}
