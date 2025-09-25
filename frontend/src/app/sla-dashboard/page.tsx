'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface SLAMetrics {
  total_requests: number;
  on_time_requests: number;
  breached_requests: number;
  compliance_percentage: number;
  average_tat_hours: number;
  average_tat_days: number;
}

interface StepWiseMetrics {
  step_name: string;
  step_display_name: string;
  total_requests: number;
  on_time_requests: number;
  breached_requests: number;
  compliance_percentage: number;
  average_duration_hours: number;
  average_duration_days: number;
}

interface SLAAlert {
  request_id: string;
  job_title: string | null;
  company_name: string | null;
  step_name: string;
  step_display_name: string;
  breach_hours: number;
  breach_days: number;
  breach_time_display: string;
  assigned_recruiter: string;
  created_at: string;
}

interface BreachingRequest {
  request_id: string;
  step_name: string;
  step_display_name: string;
  breach_hours: number;
  breach_days: number;
  breach_time_display: string;
  assigned_recruiter: string;
  step_started_at: string;
}

interface SLATrend {
  date: string;
  compliance_percentage: number;
  average_tat_hours: number;
  total_requests: number;
}

export default function SLADashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Data states
  const [globalMetrics, setGlobalMetrics] = useState<SLAMetrics | null>(null);
  const [stepWiseMetrics, setStepWiseMetrics] = useState<StepWiseMetrics[]>([]);
  const [alerts, setAlerts] = useState<SLAAlert[]>([]);
  const [breachingRequests, setBreachingRequests] = useState<BreachingRequest[]>([]);
  const [trends, setTrends] = useState<SLATrend[]>([]);
  const [recruiterMetrics, setRecruiterMetrics] = useState<any[]>([]);

  useEffect(() => {
    // Check authentication
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setUser(userData);
        
        // Check if user is admin
        if (userData.role !== 'admin') {
          router.push('/login');
          return;
        }
      } catch (error) {
        console.error('Error parsing user data:', error);
        router.push('/login');
        return;
      }
    } else {
      router.push('/login');
      return;
    }

    // Load dashboard data
    loadDashboardData();
  }, [router]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load global metrics
      const globalResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sla/dashboard/global-metrics`);
      if (globalResponse.ok) {
        const globalData = await globalResponse.json();
        setGlobalMetrics(globalData);
      }

      // Load step-wise metrics
      const stepResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sla/dashboard/step-wise-metrics`);
      if (stepResponse.ok) {
        const stepData = await stepResponse.json();
        setStepWiseMetrics(stepData);
      }

      // Load alerts
      const alertsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sla/dashboard/alerts`);
      if (alertsResponse.ok) {
        const alertsData = await alertsResponse.json();
        setAlerts(alertsData);
      }

      // Load breaching requests
      const breachingResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sla/dashboard/breaching-requests`);
      if (breachingResponse.ok) {
        const breachingData = await breachingResponse.json();
        setBreachingRequests(breachingData);
      }

      // Load trends
      const trendsResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sla/dashboard/trends`);
      if (trendsResponse.ok) {
        const trendsData = await trendsResponse.json();
        setTrends(trendsData.trends || []);
      }

      // Load recruiter metrics
      const recruiterResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sla/dashboard/recruiter-metrics`);
      if (recruiterResponse.ok) {
        const recruiterData = await recruiterResponse.json();
        setRecruiterMetrics(recruiterData);
      }

    } catch (error) {
      console.error('Error loading SLA dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (hours: number) => {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    
    if (days > 0) {
      return `${days}d ${remainingHours}h`;
    }
    return `${remainingHours}h`;
  };

  const getStatusColor = (percentage: number) => {
    if (percentage >= 90) return 'text-green-600';
    if (percentage >= 75) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusBgColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-green-100';
    if (percentage >= 75) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading SLA Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">SLA Dashboard</h1>
              <p className="mt-1 text-sm text-gray-500">
                Monitor Service Level Agreement compliance and turnaround times
              </p>
            </div>
            <button
              onClick={loadDashboardData}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              Refresh Data
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', name: 'Overview' },
              { id: 'step-wise', name: 'Step-wise Performance' },
              { id: 'alerts', name: 'Alerts' },
              { id: 'breaching', name: 'Breaching Requests' },
              { id: 'trends', name: 'Trends' },
              { id: 'recruiters', name: 'Recruiter Performance' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Global Metrics Cards */}
            {globalMetrics && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-blue-100 rounded-md flex items-center justify-center">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-500">Total Requests</p>
                      <p className="text-2xl font-semibold text-gray-900">{globalMetrics.total_requests}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-500">On Time</p>
                      <p className="text-2xl font-semibold text-gray-900">{globalMetrics.on_time_requests}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-red-100 rounded-md flex items-center justify-center">
                        <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-500">Breached</p>
                      <p className="text-2xl font-semibold text-gray-900">{globalMetrics.breached_requests}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className={`w-8 h-8 ${getStatusBgColor(globalMetrics.compliance_percentage)} rounded-md flex items-center justify-center`}>
                        <svg className={`w-5 h-5 ${getStatusColor(globalMetrics.compliance_percentage)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-500">Compliance %</p>
                      <p className={`text-2xl font-semibold ${getStatusColor(globalMetrics.compliance_percentage)}`}>
                        {globalMetrics.compliance_percentage.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Average TAT */}
            {globalMetrics && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Average Turnaround Time</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-gray-500">Average TAT (Hours)</p>
                    <p className="text-3xl font-bold text-gray-900">{globalMetrics.average_tat_hours.toFixed(1)}h</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Average TAT (Days)</p>
                    <p className="text-3xl font-bold text-gray-900">{globalMetrics.average_tat_days.toFixed(1)}d</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'step-wise' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Step-wise Performance</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Step</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">On Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Breached</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Compliance %</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Duration</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {stepWiseMetrics.map((step, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {step.step_display_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {step.total_requests}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                        {step.on_time_requests}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                        {step.breached_requests}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={getStatusColor(step.compliance_percentage)}>
                          {step.compliance_percentage.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDuration(step.average_duration_hours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">SLA Alerts</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Request ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job Title</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Step</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Breach Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned To</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {alerts.map((alert, index) => (
                    <tr key={index} className="bg-red-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {alert.request_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {alert.job_title || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {alert.company_name || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {alert.step_display_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">
                        {alert.breach_time_display}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {alert.assigned_recruiter || 'Unassigned'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(alert.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'breaching' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Currently Breaching Requests</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Request ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Step</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Breach Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Started At</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned To</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {breachingRequests.map((request, index) => (
                    <tr key={index} className="bg-red-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {request.request_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {request.step_display_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">
                        {request.breach_time_display}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(request.step_started_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {request.assigned_recruiter || 'Unassigned'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'trends' && (
          <div className="space-y-6">
            {/* Performance Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-100 rounded-md flex items-center justify-center">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">Avg Compliance (30d)</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {trends && trends.length > 0 
                        ? (trends.reduce((sum, t) => sum + t.compliance_percentage, 0) / trends.length).toFixed(1)
                        : '0.0'}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">Avg TAT (30d)</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {trends && trends.length > 0 
                        ? (trends.reduce((sum, t) => sum + t.average_tat_hours, 0) / trends.length).toFixed(1)
                        : '0.0'}h
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-purple-100 rounded-md flex items-center justify-center">
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">Total Requests (30d)</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {trends && trends.length > 0 
                        ? trends.reduce((sum, t) => sum + t.total_requests, 0)
                        : '0'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-orange-100 rounded-md flex items-center justify-center">
                      <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">Trend Status</p>
                    <p className="text-2xl font-semibold text-green-600">
                      {trends && trends.length >= 2 
                        ? trends[trends.length - 1].compliance_percentage > trends[trends.length - 2].compliance_percentage 
                          ? '↗ Improving' 
                          : '↘ Declining'
                        : '→ Stable'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Trend Analysis */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Compliance Trend Chart */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Compliance Rate Trend</h3>
                <div className="h-64">
                  {trends && trends.length > 0 ? (
                    <div className="h-full flex items-end justify-between space-x-1">
                      {trends.slice(-14).map((trend, index) => (
                        <div key={index} className="flex flex-col items-center flex-1">
                          <div className="relative w-full">
                            <div 
                              className="bg-gradient-to-t from-blue-500 to-blue-300 rounded-t w-full transition-all duration-300 hover:from-blue-600 hover:to-blue-400"
                              style={{ height: `${(trend.compliance_percentage / 100) * 200}px` }}
                              title={`${trend.compliance_percentage.toFixed(1)}% on ${new Date(trend.date).toLocaleDateString()}`}
                            ></div>
                            {index > 0 && (
                              <div className="absolute top-0 left-0 w-full h-full">
                                <svg className="w-full h-full" viewBox="0 0 100 200">
                                  <line 
                                    x1="50%" y1={`${200 - (trends[index - 1].compliance_percentage / 100) * 200}`}
                                    x2="50%" y2={`${200 - (trend.compliance_percentage / 100) * 200}`}
                                    stroke="#3B82F6" 
                                    strokeWidth="2" 
                                    fill="none"
                                  />
                                </svg>
                              </div>
                            )}
                          </div>
                          <span className="text-xs text-gray-500 mt-1 text-center">
                            {new Date(trend.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-gray-500">No trends data available</p>
                    </div>
                  )}
                </div>
                <div className="mt-4 text-sm text-gray-600">
                  <p>Target: 95% | Current: {trends && trends.length > 0 ? trends[trends.length - 1].compliance_percentage.toFixed(1) : '0'}%</p>
                </div>
              </div>

              {/* TAT Trend Chart */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Turnaround Time Trend</h3>
                <div className="h-64">
                  {trends && trends.length > 0 ? (
                    <div className="h-full flex items-end justify-between space-x-1">
                      {trends.slice(-14).map((trend, index) => (
                        <div key={index} className="flex flex-col items-center flex-1">
                          <div className="relative w-full">
                            <div 
                              className="bg-gradient-to-t from-green-500 to-green-300 rounded-t w-full transition-all duration-300 hover:from-green-600 hover:to-green-400"
                              style={{ height: `${Math.min((trend.average_tat_hours / 168) * 200, 200)}px` }}
                              title={`${trend.average_tat_hours.toFixed(1)}h on ${new Date(trend.date).toLocaleDateString()}`}
                            ></div>
                          </div>
                          <span className="text-xs text-gray-500 mt-1 text-center">
                            {new Date(trend.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-gray-500">No trends data available</p>
                    </div>
                  )}
                </div>
                <div className="mt-4 text-sm text-gray-600">
                  <p>Target: &lt;72h | Current: {trends && trends.length > 0 ? trends[trends.length - 1].average_tat_hours.toFixed(1) : '0'}h</p>
                </div>
              </div>
            </div>

            {/* Comparative Analysis */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Week-over-Week Comparison</h3>
                {trends && trends.length >= 14 ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">This Week</span>
                      <span className="text-sm font-medium text-gray-900">
                        {(trends.slice(-7).reduce((sum, t) => sum + t.compliance_percentage, 0) / 7).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Last Week</span>
                      <span className="text-sm font-medium text-gray-900">
                        {(trends.slice(-14, -7).reduce((sum, t) => sum + t.compliance_percentage, 0) / 7).toFixed(1)}%
                      </span>
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Change</span>
                        <span className={`text-sm font-medium ${
                          (trends.slice(-7).reduce((sum, t) => sum + t.compliance_percentage, 0) / 7) >
                          (trends.slice(-14, -7).reduce((sum, t) => sum + t.compliance_percentage, 0) / 7)
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}>
                          {((trends.slice(-7).reduce((sum, t) => sum + t.compliance_percentage, 0) / 7) -
                            (trends.slice(-14, -7).reduce((sum, t) => sum + t.compliance_percentage, 0) / 7)).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500">Insufficient data for comparison</p>
                )}
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Monthly Performance</h3>
                {trends && trends.length >= 30 ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">This Month</span>
                      <span className="text-sm font-medium text-gray-900">
                        {(trends.slice(-30).reduce((sum, t) => sum + t.compliance_percentage, 0) / 30).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Last Month</span>
                      <span className="text-sm font-medium text-gray-900">
                        {(trends.slice(-60, -30).reduce((sum, t) => sum + t.compliance_percentage, 0) / 30).toFixed(1)}%
                      </span>
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Monthly Change</span>
                        <span className={`text-sm font-medium ${
                          (trends.slice(-30).reduce((sum, t) => sum + t.compliance_percentage, 0) / 30) >
                          (trends.slice(-60, -30).reduce((sum, t) => sum + t.compliance_percentage, 0) / 30)
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}>
                          {((trends.slice(-30).reduce((sum, t) => sum + t.compliance_percentage, 0) / 30) -
                            (trends.slice(-60, -30).reduce((sum, t) => sum + t.compliance_percentage, 0) / 30)).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500">Insufficient data for monthly comparison</p>
                )}
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Insights</h3>
                <div className="space-y-3">
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                    <span className="text-sm text-gray-700">Best Day: {trends && trends.length > 0 
                      ? new Date(trends.reduce((max, t) => t.compliance_percentage > max.compliance_percentage ? t : max).date).toLocaleDateString('en-US', { weekday: 'long' })
                      : 'N/A'}</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-red-500 rounded-full mr-3"></div>
                    <span className="text-sm text-gray-700">Peak Hours: {trends && trends.length > 0 
                      ? `${Math.floor(trends.reduce((max, t) => t.average_tat_hours > max.average_tat_hours ? t : max).average_tat_hours)}h`
                      : 'N/A'}</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                    <span className="text-sm text-gray-700">Avg Daily Requests: {trends && trends.length > 0 
                      ? Math.round(trends.reduce((sum, t) => sum + t.total_requests, 0) / trends.length)
                      : '0'}</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-purple-500 rounded-full mr-3"></div>
                    <span className="text-sm text-gray-700">Trend Direction: {trends && trends.length >= 7 
                      ? (trends.slice(-7).reduce((sum, t) => sum + t.compliance_percentage, 0) / 7) >
                        (trends.slice(-14, -7).reduce((sum, t) => sum + t.compliance_percentage, 0) / 7)
                          ? '↗ Improving'
                          : '↘ Declining'
                      : '→ Stable'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Forecasting Section */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Forecast & Recommendations</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-md font-medium text-gray-800 mb-3">Next Week Forecast</h4>
                  {trends && trends.length >= 7 ? (
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Expected Compliance:</span>
                        <span className="text-sm font-medium text-gray-900">
                          {Math.max(0, Math.min(100, (trends.slice(-7).reduce((sum, t) => sum + t.compliance_percentage, 0) / 7) + 
                            ((trends[trends.length - 1].compliance_percentage - trends[trends.length - 7].compliance_percentage) / 7))).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Expected TAT:</span>
                        <span className="text-sm font-medium text-gray-900">
                          {Math.max(0, (trends.slice(-7).reduce((sum, t) => sum + t.average_tat_hours, 0) / 7) + 
                            ((trends[trends.length - 1].average_tat_hours - trends[trends.length - 7].average_tat_hours) / 7)).toFixed(1)}h
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500">Insufficient data for forecasting</p>
                  )}
                </div>
                <div>
                  <h4 className="text-md font-medium text-gray-800 mb-3">Recommendations</h4>
                  <div className="space-y-2">
                    {trends && trends.length > 0 && trends[trends.length - 1].compliance_percentage < 90 && (
                      <div className="flex items-start">
                        <div className="w-2 h-2 bg-red-500 rounded-full mr-3 mt-2"></div>
                        <span className="text-sm text-gray-700">Focus on reducing breach rates in critical steps</span>
                      </div>
                    )}
                    {trends && trends.length > 0 && trends[trends.length - 1].average_tat_hours > 72 && (
                      <div className="flex items-start">
                        <div className="w-2 h-2 bg-orange-500 rounded-full mr-3 mt-2"></div>
                        <span className="text-sm text-gray-700">Optimize workflow to reduce turnaround time</span>
                      </div>
                    )}
                    {trends && trends.length >= 7 && 
                     (trends.slice(-7).reduce((sum, t) => sum + t.compliance_percentage, 0) / 7) < 
                     (trends.slice(-14, -7).reduce((sum, t) => sum + t.compliance_percentage, 0) / 7) && (
                      <div className="flex items-start">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full mr-3 mt-2"></div>
                        <span className="text-sm text-gray-700">Performance declining - review recent process changes</span>
                      </div>
                    )}
                    <div className="flex items-start">
                      <div className="w-2 h-2 bg-green-500 rounded-full mr-3 mt-2"></div>
                      <span className="text-sm text-gray-700">Continue monitoring daily metrics for early intervention</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'recruiters' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Recruiter Performance</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recruiter</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Requests</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">On Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Breached</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Compliance %</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg TAT</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {recruiterMetrics.map((recruiter, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {recruiter.assigned_recruiter || 'Unassigned'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {recruiter.total_requests}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                        {recruiter.on_time_requests}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                        {recruiter.breached_requests}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={getStatusColor(recruiter.compliance_percentage)}>
                          {recruiter.compliance_percentage.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDuration(recruiter.average_tat_hours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
