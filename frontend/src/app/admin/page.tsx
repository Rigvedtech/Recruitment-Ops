'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/types/student';
import { api } from '@/services/api';

const AdminDashboard: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [recruiterActivity, setRecruiterActivity] = useState<any>(null);
  const [requirementsActivity, setRequirementsActivity] = useState<any>(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in and has admin role
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const userData: User = JSON.parse(storedUser);
        if (userData.role === 'admin') {
          setUser(userData);
          // Fetch activity data
          fetchRecruiterActivity();
          fetchRequirementsActivity();
        } else {
          // Redirect non-admin users
          router.push('/login');
        }
      } catch (err) {
        console.error('Error parsing stored user data:', err);
        localStorage.removeItem('user');
        router.push('/login');
      }
    } else {
      router.push('/login');
    }
    setLoading(false);
  }, [router]);

  const fetchRecruiterActivity = async () => {
    try {
      setActivityLoading(true);
      const response = await api.getRecruiterActivity(7); // Last 7 days
      if (response.success) {
        setRecruiterActivity(response.data);
      }
    } catch (error) {
      console.error('Error fetching recruiter activity:', error);
    } finally {
      setActivityLoading(false);
    }
  };

  const fetchRequirementsActivity = async () => {
    try {
      const response = await api.getRequirementsActivity();
      if (response.success) {
        setRequirementsActivity(response.data);
      }
    } catch (error) {
      console.error('Error fetching requirements activity:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:bg-gray-900 dark:bg-none">
      <div className="container mx-auto px-6 py-8">
        {/* Header Section */}
        <div className="mb-12">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
              <p className="text-lg text-gray-600">Welcome back, {user.username}! Here's what's happening today.</p>
            </div>
            {/* <div className="hidden md:block">
              <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
                <div className="text-sm text-gray-500">Quick Stats</div>
                <div className="text-2xl font-bold text-blue-600">Active</div>
              </div>
            </div> */}
          </div>
        </div>

        {/* Primary Features Section - Most Used */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100 mb-6 flex items-center">
            <svg className="w-6 h-6 text-blue-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Daily Operations
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Recruiter Activity - Prominent */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="bg-white bg-opacity-20 rounded-lg p-3">
                      <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-xl font-bold text-white">Recruiter Activity</h3>
                      <p className="text-blue-100">Daily profile submission tracking</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {activityLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    </div>
                  ) : recruiterActivity ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-300">Today's Active Recruiters</span>
                        <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {recruiterActivity.overall_stats.today_active_recruiters}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-300">Profiles Submitted Today</span>
                        <span className="text-lg font-semibold text-green-600">
                          {recruiterActivity.overall_stats.today_profiles_submitted}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-300">This Week's Activity</span>
                        <span className="text-lg font-semibold text-blue-600">
                          {recruiterActivity.overall_stats.weekly_profiles_submitted} profiles
                        </span>
                      </div>
                      <button
                        onClick={() => router.push('/admin/recruiter-activity')}
                        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium"
                      >
                        View Detailed Activity
                      </button>
                    </>
                  ) : (
                    <div className="text-center text-gray-500 py-4">
                      No activity data available
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Requirements Activity - Prominent */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="bg-gradient-to-r from-green-600 to-green-700 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="bg-white bg-opacity-20 rounded-lg p-3">
                      <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-xl font-bold text-white">Requirements Activity</h3>
                      <p className="text-green-100">Monitor RFH and active requirements</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {requirementsActivity ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-300">Total RFH</span>
                        <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {requirementsActivity.total_rfh}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-300">Today's Active Requirements</span>
                        <span className="text-lg font-semibold text-green-600">
                          {requirementsActivity.today_active_requirements}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-300">This Week's Activity</span>
                        <span className="text-lg font-semibold text-blue-600">
                          {requirementsActivity.weekly_active_requirements} requirements
                        </span>
                      </div>
                      <button
                        onClick={() => router.push('/tracker')}
                        className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors duration-200 font-medium"
                      >
                        View Requirements
                      </button>
                    </>
                  ) : (
                    <div className="text-center text-gray-500 py-4">
                      Loading requirements data...
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Secondary Features Section - Less Frequently Used */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100 mb-6 flex items-center">
            <svg className="w-6 h-6 text-gray-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Management Tools
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* RFH Management */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 border border-gray-100 dark:border-gray-700">
              <div className="p-6">
                <div className="flex items-center mb-4">
                  <div className="bg-blue-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Assign Requirement</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Assign and Manage requests</p>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/admin/rfh')}
                  className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors duration-200 text-sm font-medium dark:bg-gray-700/60 dark:text-gray-200 dark:hover:bg-gray-600 dark:border dark:border-gray-500"
                >
                  View RFH
                </button>
              </div>
            </div>

            {/* Add Requirement */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 border border-gray-100 dark:border-gray-700">
              <div className="p-6">
                <div className="flex items-center mb-4">
                  <div className="bg-green-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Add Requirement</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Create new job</p>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/admin/add-requirement')}
                  className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors duration-200 text-sm font-medium dark:bg-gray-700/60 dark:text-gray-200 dark:hover:bg-gray-600 dark:border dark:border-gray-500"
                >
                  Create Requirement
                </button>
              </div>
            </div>

            {/* Email Processing */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 border border-gray-100 dark:border-gray-700">
              <div className="p-6">
                <div className="flex items-center mb-4">
                  <div className="bg-purple-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Email Processing</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Monitor emails</p>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/email-dashboard')}
                  className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors duration-200 text-sm font-medium dark:bg-gray-700/60 dark:text-gray-200 dark:hover:bg-gray-600 dark:border dark:border-gray-500"
                >
                  View Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>



        {/* Requirement Tables Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100 mb-6 flex items-center">
            <svg className="w-6 h-6 text-indigo-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Requirement Tables
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Requirements Tracker */}
            <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-300 border border-gray-100">
              <div className="p-6">
                <div className="flex items-center mb-4">
                  <div className="bg-indigo-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">Requirements Tracker</h3>
                    <p className="text-sm text-gray-600">Track all requirements</p>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/tracker')}
                  className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors duration-200 text-sm font-medium dark:bg-gray-700/60 dark:text-gray-200 dark:hover:bg-gray-600 dark:border dark:border-gray-500"
                >
                  View Tracker
                </button>
              </div>
            </div>

            {/* Recruiter Table */}
            <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-300 border border-gray-100">
              <div className="p-6">
                <div className="flex items-center mb-4">
                  <div className="bg-purple-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">Recruiter Table</h3>
                    <p className="text-sm text-gray-600">Manage recruiters</p>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/recruiter')}
                  className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors duration-200 text-sm font-medium dark:bg-gray-700/60 dark:text-gray-200 dark:hover:bg-gray-600 dark:border dark:border-gray-500"
                >
                  View Recruiters
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Configuration Section - Least Frequently Used */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6 flex items-center">
            <svg className="w-6 h-6 text-gray-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            System Configuration
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* SLA Configuration */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 dark:border-gray-700">
              <div className="p-5">
                <div className="flex items-center mb-3">
                  <div className="bg-orange-100 rounded-lg p-2">
                    <svg className="h-5 w-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-base font-medium text-gray-900 dark:text-gray-100">SLA Configuration</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-300">Time limits</p>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/admin/sla-config')}
                  className="w-full bg-gray-50 text-gray-600 py-2 px-3 rounded-md hover:bg-gray-100 transition-colors duration-200 text-sm dark:bg-gray-700/60 dark:text-gray-200 dark:hover:bg-gray-600 dark:border dark:border-gray-500"
                >
                  Configure SLA
                </button>
              </div>
            </div>

            {/* Analytics */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 dark:border-gray-700">
              <div className="p-5">
                <div className="flex items-center mb-3">
                  <div className="bg-yellow-100 rounded-lg p-2">
                    <svg className="h-5 w-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-base font-medium text-gray-900 dark:text-gray-100">Analytics</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-300">Reports</p>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/admin/analytics')}
                  className="w-full bg-gray-50 text-gray-600 py-2 px-3 rounded-md hover:bg-gray-100 transition-colors duration-200 text-sm dark:bg-gray-700/60 dark:text-gray-200 dark:hover:bg-gray-600 dark:border dark:border-gray-500"
                >
                  View Reports
                </button>
              </div>
            </div>

            {/* SLA Dashboard */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 dark:border-gray-700">
              <div className="p-5">
                <div className="flex items-center mb-3">
                  <div className="bg-red-100 rounded-lg p-2">
                    <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-base font-medium text-gray-900 dark:text-gray-100">SLA Dashboard</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-300">Performance</p>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/sla-dashboard')}
                  className="w-full bg-gray-50 text-gray-600 py-2 px-3 rounded-md hover:bg-gray-100 transition-colors duration-200 text-sm dark:bg-gray-700/60 dark:text-gray-200 dark:hover:bg-gray-600 dark:border dark:border-gray-500"
                >
                  View SLA
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions Footer */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Miscellaneous</h3>
          <div className="flex flex-wrap gap-3">
            {/* <button
              onClick={() => router.push('/tracker')}
              className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-200 transition-colors duration-200 text-sm font-medium"
            >
              View Tracker
            </button> */}
            <button
              onClick={() => router.push('/tracker-dashboard')}
              className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-200 transition-colors duration-200 text-sm font-medium"
            >
              Tracker Dashboard
            </button>
            <button
              onClick={() => router.push('/hiring-data')}
              className="bg-green-100 text-green-700 px-4 py-2 rounded-lg hover:bg-green-200 transition-colors duration-200 text-sm font-medium"
            >
              Hiring Data
            </button>
            <button
              onClick={() => router.push('/signup')}
              className="bg-purple-100 text-purple-700 px-4 py-2 rounded-lg hover:bg-purple-200 transition-colors duration-200 text-sm font-medium"
            >
              Add User
            </button>
            <button
              onClick={() => router.push('/admin/update-jd')}
              className="bg-orange-100 text-orange-700 px-4 py-2 rounded-lg hover:bg-orange-200 transition-colors duration-200 text-sm font-medium"
            >
              Update JD
            </button>
            {/* <button
              onClick={() => router.push('/recruiter')}
              className="bg-purple-100 text-purple-700 px-4 py-2 rounded-lg hover:bg-purple-200 transition-colors duration-200 text-sm font-medium"
            >
              Recruiter View
            </button> */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard; 