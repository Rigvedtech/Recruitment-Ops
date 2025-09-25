'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/types/student';
import { api } from '@/services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface RecruiterActivity {
  username: string;
  profiles_submitted: number;
  is_active: boolean;
}

interface DailyActivity {
  date: string;
  total_profiles_submitted: number;
  active_recruiters_count: number;
  recruiters: RecruiterActivity[];
}

interface RecruiterPerformance {
  recruiter_name: string;
  total_profiles_submitted: number;
  onboarded_profiles: number;
  success_rate: number;
}

interface CompanyData {
  [companyName: string]: RecruiterPerformance[];
}

interface ActivityData {
  date_range: {
    start_date: string;
    end_date: string;
  };
  overall_stats: {
    total_recruiters: number;
    today_active_recruiters: number;
    today_profiles_submitted: number;
    weekly_active_recruiters: number;
    weekly_profiles_submitted: number;
  };
  daily_activity: DailyActivity[];
  recruiter_list: string[];
  company_performance: CompanyData;
}

const RecruiterActivityPage: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activityData, setActivityData] = useState<ActivityData | null>(null);

  const [dataLoading, setDataLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'histogram'>('histogram');
  const [histogramPeriod, setHistogramPeriod] = useState<'today' | 'this_week' | 'last_week'>('today');
  const [selectedRecruiter, setSelectedRecruiter] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in and has admin role
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const userData: User = JSON.parse(storedUser);
        if (userData.role === 'admin') {
          setUser(userData);
        } else {
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

  useEffect(() => {
    if (user) {
      fetchActivityData();
    }
  }, [user]);

  // Reset selected recruiter when switching to table mode
  useEffect(() => {
    if (viewMode === 'table') {
      setSelectedRecruiter(null);
    }
  }, [viewMode]);

  const fetchActivityData = async () => {
    try {
      setDataLoading(true);
      const response = await api.getRecruiterActivity(30); // Default to 30 days to ensure we have enough data for filtering
      if (response.success) {
        setActivityData(response.data);
      }
    } catch (error) {
      console.error('Error fetching recruiter activity:', error);
    } finally {
      setDataLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  const getActivityColor = (profilesSubmitted: number) => {
    if (profilesSubmitted === 0) return 'text-gray-400';
    if (profilesSubmitted <= 2) return 'text-yellow-600';
    if (profilesSubmitted <= 5) return 'text-orange-600';
    return 'text-green-600';
  };

  const getActivityIcon = (profilesSubmitted: number) => {
    if (profilesSubmitted === 0) return '⚪';
    if (profilesSubmitted <= 2) return '🟡';
    if (profilesSubmitted <= 5) return '🟠';
    return '🟢';
  };

  // Helper function to get histogram data for a specific recruiter
  const getHistogramData = (recruiterName: string) => {
    if (!activityData) return [];
    
    return activityData.daily_activity.map(day => {
      const recruiterData = day.recruiters
        .filter(r => r.username.toLowerCase() !== 'admin')
        .find(r => r.username === recruiterName);
      return {
        date: formatDate(day.date),
        profiles: recruiterData?.profiles_submitted || 0,
        fullDate: day.date
      };
    });
  };

  // Helper function to filter data based on period
  const getFilteredData = () => {
    if (!activityData) return [];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to midnight for proper comparison
    
    // Calculate current week (Monday to Friday)
    const currentWeekStart = new Date(today);
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert to Monday = 0
    currentWeekStart.setDate(today.getDate() - daysToMonday);
    currentWeekStart.setHours(0, 0, 0, 0); // Set to midnight for proper comparison
    
    const currentWeekEnd = new Date(currentWeekStart);
    currentWeekEnd.setDate(currentWeekStart.getDate() + 4); // Friday (Monday + 4 days)
    currentWeekEnd.setHours(23, 59, 59, 999); // Set to end of day
    
    // Calculate last week (Monday to Friday)
    const lastWeekStart = new Date(currentWeekStart);
    lastWeekStart.setDate(currentWeekStart.getDate() - 7);
    
    const lastWeekEnd = new Date(lastWeekStart);
    lastWeekEnd.setDate(lastWeekStart.getDate() + 4); // Friday
    lastWeekEnd.setHours(23, 59, 59, 999); // Set to end of day
    
    let filteredDays = activityData.daily_activity;
    
    if (histogramPeriod === 'today') {
      filteredDays = activityData.daily_activity.filter(day => {
        const dayDate = new Date(day.date);
        dayDate.setHours(0, 0, 0, 0); // Normalize to midnight for comparison
        return dayDate.getTime() === today.getTime();
      });
    } else if (histogramPeriod === 'this_week') {
      filteredDays = activityData.daily_activity.filter(day => {
        const dayDate = new Date(day.date);
        dayDate.setHours(0, 0, 0, 0); // Normalize to midnight for comparison
        const dayOfWeek = dayDate.getDay();
        const isInRange = dayDate >= currentWeekStart && dayDate <= currentWeekEnd;
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
        
        // Only include Monday (1) to Friday (5), exclude Saturday (6) and Sunday (0)
        return isInRange && isWeekday;
      });
    } else if (histogramPeriod === 'last_week') {
      filteredDays = activityData.daily_activity.filter(day => {
        const dayDate = new Date(day.date);
        dayDate.setHours(0, 0, 0, 0); // Normalize to midnight for comparison
        const dayOfWeek = dayDate.getDay();
        const isInRange = dayDate >= lastWeekStart && dayDate <= lastWeekEnd;
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
        
        // Only include Monday (1) to Friday (5), exclude Saturday (6) and Sunday (0)
        return isInRange && isWeekday;
      });
    }
    
    return filteredDays;
  };

  // Helper function to get histogram data for a specific recruiter
  const getFilteredHistogramData = (recruiterName: string) => {
    const filteredDays = getFilteredData();
    
    return filteredDays.map(day => {
      const recruiterData = day.recruiters.find(r => r.username === recruiterName);
      return {
        date: formatDate(day.date),
        profiles: recruiterData?.profiles_submitted || 0,
        fullDate: day.date
      };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `
      }} />
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Recruiter Activity Dashboard</h1>
              <p className="text-lg text-gray-600">Track daily recruiter performance and profile submissions</p>
            </div>
            <button
              onClick={() => router.push('/admin')}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors duration-200"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 mb-8">
          {/* View Mode Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-gray-700">View Mode:</label>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
                    viewMode === 'table'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Daily Activity Table
                </button>
                <button
                  onClick={() => setViewMode('histogram')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
                    viewMode === 'histogram'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Recruiter Histograms
                </button>
              </div>
            </div>
            
            {/* Period Controls - Show for both table and histogram modes */}
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-gray-700">Period:</label>
              <select
                value={histogramPeriod}
                onChange={(e) => setHistogramPeriod(e.target.value as 'today' | 'this_week' | 'last_week')}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="today">Today</option>
                <option value="this_week">This Week</option>
                <option value="last_week">Last Week</option>
              </select>
            </div>
          </div>
        </div>

        {dataLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : activityData ? (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
                <div className="flex items-center">
                  <div className="bg-blue-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Recruiters</p>
                    <p className="text-2xl font-bold text-gray-900">{activityData.overall_stats.total_recruiters}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
                <div className="flex items-center">
                  <div className="bg-green-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Today's Active</p>
                    <p className="text-2xl font-bold text-gray-900">{activityData.overall_stats.today_active_recruiters}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
                <div className="flex items-center">
                  <div className="bg-orange-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Today's Submissions</p>
                    <p className="text-2xl font-bold text-gray-900">{activityData.overall_stats.today_profiles_submitted}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
                <div className="flex items-center">
                  <div className="bg-purple-100 rounded-lg p-3">
                    <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Weekly Submissions</p>
                    <p className="text-2xl font-bold text-gray-900">{activityData.overall_stats.weekly_profiles_submitted}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Conditional Rendering based on View Mode */}
            {viewMode === 'table' ? (
              /* Daily Activity Table */
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900">Daily Activity Breakdown</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {histogramPeriod === 'today' ? 'Today' : histogramPeriod === 'this_week' ? 'This Week' : 'Last Week'} - Profile Submissions by Day
                  </p>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Active Recruiters
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Profiles
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Recruiter Activity
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {getFilteredData().map((day, index) => (
                        <tr key={day.date} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {formatDate(day.date)}
                            </div>
                            <div className="text-sm text-gray-500">
                              {new Date(day.date).toLocaleDateString('en-US', { weekday: 'long' })}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {day.active_recruiters_count} / {activityData.overall_stats.total_recruiters}
                            </div>
                            <div className="text-sm text-gray-500">
                              {((day.active_recruiters_count / activityData.overall_stats.total_recruiters) * 100).toFixed(1)}% active
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {day.total_profiles_submitted}
                            </div>
                            <div className="text-sm text-gray-500">
                              profiles submitted
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-2">
                      {day.recruiters
                                .filter(recruiter => recruiter.is_active && recruiter.username.toLowerCase() !== 'admin')
                                .slice(0, 5)
                                .map((recruiter) => (
                                  <div
                                    key={recruiter.username}
                                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                                    title={`${recruiter.username}: ${recruiter.profiles_submitted} profiles`}
                                  >
                                    <span className="mr-1">{getActivityIcon(recruiter.profiles_submitted)}</span>
                                    {recruiter.username} ({recruiter.profiles_submitted})
                                  </div>
                                ))}
                              {day.recruiters.filter(recruiter => recruiter.is_active && recruiter.username.toLowerCase() !== 'admin').length > 5 && (
                                <div className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                  +{day.recruiters.filter(recruiter => recruiter.is_active && recruiter.username.toLowerCase() !== 'admin').length - 5} more
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* Recruiter Histogram View */
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900">Recruiter Performance Histograms</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {histogramPeriod === 'today' ? 'Today' : histogramPeriod === 'this_week' ? 'This Week' : 'Last Week'} - Profile Submissions by Day
                  </p>
                </div>
                
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {activityData.recruiter_list.filter(r => r.toLowerCase() !== 'admin').map((recruiter, index) => {
                      const histogramData = getFilteredHistogramData(recruiter);
                      const totalProfiles = histogramData.reduce((sum, day) => sum + day.profiles, 0);
                      const activeDays = histogramData.filter(day => day.profiles > 0).length;
                      const avgPerDay = histogramData.length > 0 ? (totalProfiles / histogramData.length).toFixed(1) : '0';
                      
                      return (
                        <div 
                          key={recruiter} 
                          className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:shadow-md transition-all duration-300 transform hover:scale-105"
                          style={{
                            animationDelay: `${index * 100}ms`,
                            animation: 'fadeInUp 0.6s ease-out forwards'
                          }}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-900 truncate">{recruiter}</h3>
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              activeDays > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {activeDays > 0 ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          
                          {/* Compact Histogram */}
                          <div className="h-32 mb-3">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={histogramData}>
                                <CartesianGrid strokeDasharray="2 2" stroke="#e5e7eb" />
                                <XAxis 
                                  dataKey="date" 
                                  tick={{ fontSize: 10 }}
                                  angle={-45}
                                  textAnchor="end"
                                  height={50}
                                  axisLine={false}
                                  tickLine={false}
                                />
                                                                 <YAxis 
                                   tick={{ fontSize: 10 }}
                                   axisLine={false}
                                   tickLine={false}
                                   width={30}
                                   allowDecimals={false}
                                   tickFormatter={(value) => Math.round(value).toString()}
                                 />
                                <Tooltip 
                                  formatter={(value: any) => [`${value} profiles`, 'Submissions']}
                                  labelFormatter={(label) => `Date: ${label}`}
                                  contentStyle={{
                                    backgroundColor: 'white',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px',
                                    fontSize: '12px'
                                  }}
                                />
                                <Bar 
                                  dataKey="profiles" 
                                  fill="#3B82F6" 
                                  radius={[2, 2, 0, 0]}
                                  animationDuration={1000}
                                  animationBegin={index * 200}
                                />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          
                          {/* Compact Stats */}
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="text-center">
                              <div className="font-semibold text-blue-600">{totalProfiles}</div>
                              <div className="text-gray-500">Total</div>
                            </div>
                            <div className="text-center">
                              <div className="font-semibold text-green-600">{activeDays}/{histogramData.length}</div>
                              <div className="text-gray-500">Active</div>
                            </div>
                            <div className="text-center">
                              <div className="font-semibold text-purple-600">{avgPerDay}</div>
                              <div className="text-gray-500">Avg/Day</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Recruiter Performance Summary */}
            <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Recruiter Performance Summary</h2>
                <p className="text-sm text-gray-600 mt-1">Overall activity across all recruiters</p>
              </div>
              
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activityData.recruiter_list.filter(r => r.toLowerCase() !== 'admin').map((recruiter) => {
                    const filteredData = getFilteredData();
                    const totalProfiles = filteredData.reduce((total, day) => {
                      const recruiterData = day.recruiters.filter(r => r.username.toLowerCase() !== 'admin').find(r => r.username === recruiter);
                      return total + (recruiterData?.profiles_submitted || 0);
                    }, 0);
                    
                    const activeDays = filteredData.filter(day => {
                      const recruiterData = day.recruiters.filter(r => r.username.toLowerCase() !== 'admin').find(r => r.username === recruiter);
                      return recruiterData?.is_active || false;
                    }).length;
                 
                   return (
                     <div key={recruiter} className="border border-gray-200 rounded-lg p-4">
                       <div className="flex items-center justify-between mb-2">
                         <h3 className="text-sm font-medium text-gray-900">{recruiter}</h3>
                         <span className={`text-xs px-2 py-1 rounded-full ${
                           activeDays > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                         }`}>
                           {activeDays > 0 ? 'Active' : 'Inactive'}
                         </span>
                       </div>
                       <div className="space-y-1">
                         <div className="flex justify-between text-xs">
                           <span className="text-gray-600">Total Profiles:</span>
                           <span className="font-medium">{totalProfiles}</span>
                         </div>
                         <div className="flex justify-between text-xs">
                           <span className="text-gray-600">Active Days:</span>
                           <span className="font-medium">{activeDays} / {filteredData.length}</span>
                         </div>
                         <div className="flex justify-between text-xs">
                           <span className="text-gray-600">Avg/Day:</span>
                           <span className="font-medium">
                             {filteredData.length > 0 
                               ? (totalProfiles / filteredData.length).toFixed(1) 
                               : '0'
                             }
                           </span>
                         </div>
                       </div>
                     </div>
                   );
                 })}
               </div>
             </div>
           </div>

           {/* Company-wise Recruiter Performance */}
           <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
             <div className="px-6 py-4 border-b border-gray-200">
               <h2 className="text-xl font-semibold text-gray-900">Company-wise Recruiter Performance</h2>
               <p className="text-sm text-gray-600 mt-1">Performance metrics by company and recruiter (profiles created after implementation date)</p>
             </div>

             <div className="p-6">
               {/* Data Coverage Notice */}
               <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                 <div className="flex items-center">
                   <div className="flex-shrink-0">
                     <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                       <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                     </svg>
                   </div>
                   <div className="ml-3">
                     <p className="text-sm text-blue-700">
                       <strong>Note:</strong> This section tracks recruiter performance for profiles created after the implementation date. 
                       Historical profiles are not included in these metrics.
                     </p>
                   </div>
                 </div>
               </div>

                                                               {/* Company Performance Table - Recruiters as Columns, Companies as Rows */}
                 {activityData.company_performance && Object.keys(activityData.company_performance).length > 0 ? (
                   <div className="overflow-x-auto">
                     <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
                       <thead className="bg-gray-50">
                         <tr>
                           <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                             Company
                           </th>
                           {(() => {
                             // Get all unique recruiters across all companies
                             const allRecruiters = new Set<string>();
                             Object.values(activityData.company_performance).forEach(recruiters => {
                               recruiters.forEach(recruiter => {
                                 if (recruiter.recruiter_name.toLowerCase() !== 'admin') {
                                   allRecruiters.add(recruiter.recruiter_name);
                                 }
                               });
                             });
                             
                             return Array.from(allRecruiters).sort().map((recruiterName) => (
                               <th key={recruiterName} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 last:border-r-0">
                                 <div className="text-center">
                                   <div className="font-semibold text-gray-900">{recruiterName}</div>
                                   {/* <div className="text-xs text-gray-500 mt-1">Onboarded</div> */}
                                 </div>
                               </th>
                             ));
                           })()}
                         </tr>
                       </thead>
                       <tbody className="bg-white divide-y divide-gray-200">
                         {Object.keys(activityData.company_performance).map((companyName) => (
                           <tr key={companyName} className="hover:bg-gray-50">
                             <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-200">
                               {companyName}
                             </td>
                             {(() => {
                               // Get all unique recruiters across all companies
                               const allRecruiters = new Set<string>();
                               Object.values(activityData.company_performance).forEach(recruiters => {
                                 recruiters.forEach(recruiter => {
                                   if (recruiter.recruiter_name.toLowerCase() !== 'admin') {
                                     allRecruiters.add(recruiter.recruiter_name);
                                   }
                                 });
                               });
                               
                               return Array.from(allRecruiters).sort().map((recruiterName) => {
                                 const recruiterData = activityData.company_performance[companyName].find(
                                   r => r.recruiter_name === recruiterName
                                 );
                                 
                                 if (!recruiterData) {
                                   return (
                                     <td key={recruiterName} className="px-4 py-3 text-center text-sm text-gray-400 border-r border-gray-200 last:border-r-0">
                                       <div className="text-center">
                                         <div className="text-gray-400">-</div>
                                       </div>
                                     </td>
                                   );
                                 }
                                 
                                 return (
                                   <td key={recruiterName} className="px-4 py-3 text-center text-sm border-r border-gray-200 last:border-r-0">
                                     <div className="text-center">
                                       <div className="font-medium text-green-600 text-lg">
                                         {recruiterData.onboarded_profiles}
                                       </div>
                                     </div>
                                   </td>
                                 );
                               });
                             })()}
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
               ) : (
                 <div className="text-center py-8">
                   <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                   </svg>
                   <h3 className="mt-2 text-sm font-medium text-gray-900">No company performance data</h3>
                   <p className="mt-1 text-sm text-gray-500">
                     Company-wise recruiter performance data will appear here once profiles are created with recruiter attribution.
                   </p>
                 </div>
               )}
             </div>
           </div>
          </>
        ) : (
          <div className="text-center py-12">
            <div className="text-gray-500">No activity data available</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecruiterActivityPage;
