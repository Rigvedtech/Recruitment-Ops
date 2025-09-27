'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

interface TrackerData {
  request_id: string;
  status: string;
  email_subject: string;
  received_datetime: string | null;
  student_count?: number;
  created_at?: string;
  updated_at?: string;
}

interface DashboardStats {
  totalProfiles: number;
  totalRequests: number;
  activeHiring: number;
}

interface StatusCount {
  status: string;
  count: number;
  percentage: number;
  color: string;
}

interface StatusDuration {
  status: string;
  average_duration_hours: number;
  average_duration_days: number;
  request_count: number;
  total_duration_hours: number;
  total_duration_days: number;
  color: string;
}

interface StatusAverage {
  status: string;
  average_duration_days: number;
  percentage: number;
  color: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1010/api';

const statusColors = {
  'New': '#3B82F6',
  'Candidate Submission': '#10B981',
  'Interview Scheduled': '#F59E0B',
  'Offer Recommendation': '#EF4444',
  'Closed': '#6B7280',
  'On boarding': '#EC4899',
  'On Hold': '#DC2626'
};

const TrackerDashboard: React.FC = () => {
  const router = useRouter();
  const [trackerData, setTrackerData] = useState<TrackerData[]>([]);
  const [statusCounts, setStatusCounts] = useState<StatusCount[]>([]);
  const [statusDurations, setStatusDurations] = useState<StatusDuration[]>([]);
  const [statusAverages, setStatusAverages] = useState<StatusAverage[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    totalProfiles: 0,
    totalRequests: 0,
    activeHiring: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [animateIn, setAnimateIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const fetchTrackerData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch tracker data
      const trackerResponse = await axios.get(`${API_BASE_URL}/api/tracker`);
      
      // Fetch profiles count from the API
      let profilesResponse;
      try {
        profilesResponse = await axios.get(`${API_BASE_URL}/api/profiles`);
      } catch (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        // Set a fallback value
        profilesResponse = { data: [] };
      }
      
      // Process the tracker data to get status counts
      const statusMap = new Map<string, number>();
      let totalCount = 0;

      trackerResponse.data.forEach((item: any) => {
        const status = item.status || 'New';
        statusMap.set(status, (statusMap.get(status) || 0) + 1);
        totalCount++;
      });

      // Convert to array and calculate percentages
      const statusCountsArray: StatusCount[] = Array.from(statusMap.entries()).map(([status, count]) => ({
        status,
        count,
        percentage: Math.round((count / totalCount) * 100),
        color: statusColors[status as keyof typeof statusColors] || '#6B7280'
      }));

      // Calculate status durations
      const durationData: StatusDuration[] = trackerResponse.data.map((item: any) => {
        const startDate = new Date(item.created_at || item.received_datetime);
        const endDate = new Date(item.updated_at || new Date());
        const durationMs = endDate.getTime() - startDate.getTime();
        const durationHours = durationMs / (1000 * 60 * 60);
        const durationDays = durationHours / 24;

        return {
          request_id: item.request_id,
          status: item.status || 'New',
          duration_hours: Math.round(durationHours * 100) / 100,
          duration_days: Math.round(durationDays * 100) / 100,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          email_subject: item.email_subject
        };
      });

      // Group by status and calculate averages
      const statusGroups = new Map<string, { durations: number[], count: number }>();
      
      trackerResponse.data.forEach((item: any) => {
        const startDate = new Date(item.created_at || item.received_datetime);
        const endDate = new Date(item.updated_at || new Date());
        const durationMs = endDate.getTime() - startDate.getTime();
        const durationDays = durationMs / (1000 * 60 * 60 * 24);
        const status = item.status || 'New';
        
        // Debug logging
        console.log(`Request ${item.request_id}:`, {
          status,
          created_at: item.created_at,
          updated_at: item.updated_at,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          durationMs,
          durationDays
        });
        
        if (!statusGroups.has(status)) {
          statusGroups.set(status, { durations: [], count: 0 });
        }
        
        const group = statusGroups.get(status)!;
        group.durations.push(durationDays);
        group.count++;
      });

      // Calculate averages for each status
      const averageDurationData: StatusDuration[] = Array.from(statusGroups.entries()).map(([status, data]) => {
        const totalDurationDays = data.durations.reduce((sum, d) => sum + d, 0);
        const averageDurationDays = totalDurationDays / data.count;
        const averageDurationHours = averageDurationDays * 24;
        
        console.log(`Status ${status}:`, {
          requestCount: data.count,
          durations: data.durations,
          totalDurationDays,
          averageDurationDays,
          averageDurationHours
        });
        
        return {
          status,
          average_duration_hours: Math.round(averageDurationHours * 100) / 100,
          average_duration_days: Math.round(averageDurationDays * 100) / 100,
          request_count: data.count,
          total_duration_hours: Math.round(totalDurationDays * 24 * 100) / 100,
          total_duration_days: Math.round(totalDurationDays * 100) / 100,
          color: statusColors[status as keyof typeof statusColors] || '#6B7280'
        };
      });

      // Create status averages for pie chart (showing email count distribution by status)
      // Use the statusCounts data which already has the correct count-based percentages
      const statusAveragesArray: StatusAverage[] = statusCountsArray.map((item) => ({
        status: item.status,
        average_duration_days: averageDurationData.find(d => d.status === item.status)?.average_duration_days || 0,
        percentage: item.percentage,
        color: item.color
      }));

      // Set dashboard stats
      setDashboardStats({
        totalProfiles: profilesResponse?.data?.length || 0,
        totalRequests: trackerResponse.data.length,
        activeHiring: new Set(trackerResponse.data.map((item: any) => item.request_id)).size
      });

      setStatusCounts(statusCountsArray);
      setStatusDurations(averageDurationData);
      setStatusAverages(statusAveragesArray);
      setTrackerData(trackerResponse.data);
    } catch (err) {
      console.error('Error fetching tracker data:', err);
      setError('Failed to fetch tracker data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check authentication first
    const checkAuth = () => {
      const storedUser = localStorage.getItem('user');
      
      // Also check for backward compatibility with recruiterUser key
      const userData = storedUser || localStorage.getItem('recruiterUser');
      
      if (!userData) {
        console.log('No user data found in localStorage');
        router.push('/login');
        return;
      }

      try {
        const parsedUser = JSON.parse(userData);
        console.log('Parsed user data:', parsedUser);
        
        if (!parsedUser.role || !['admin', 'recruiter'].includes(parsedUser.role)) {
          console.log('Invalid user role:', parsedUser.role);
          router.push('/login');
          return;
        }
        
        // If we found user in old key, migrate to new key
        if (!storedUser && localStorage.getItem('recruiterUser')) {
          localStorage.setItem('user', userData);
          localStorage.removeItem('recruiterUser');
        }
        
        setAuthChecked(true);
        fetchTrackerData();
        // Trigger animation after component mounts
        setTimeout(() => setAnimateIn(true), 100);
      } catch (error) {
        console.error('Error parsing user data:', error);
        console.error('Raw user data:', userData);
        localStorage.removeItem('user');
        localStorage.removeItem('recruiterUser');
        router.push('/login');
      }
    };

    // Add a small delay to ensure localStorage is available
    setTimeout(checkAuth, 100);
  }, [router]);

  // Don't render anything until authentication is checked
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const getPieChartPath = (startAngle: number, endAngle: number, radius: number) => {
    const x1 = radius * Math.cos(startAngle);
    const y1 = radius * Math.sin(startAngle);
    const x2 = radius * Math.cos(endAngle);
    const y2 = radius * Math.sin(endAngle);
    
    const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;
    
    return [
      `M ${radius} ${radius}`,
      `L ${radius + x1} ${radius + y1}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${radius + x2} ${radius + y2}`,
      'Z'
    ].join(' ');
  };

  const renderPieChart = () => {
    const radius = 120;
    const center = radius;
    let currentAngle = -Math.PI / 2; // Start from top

    return (
      <svg width={radius * 2} height={radius * 2} className="mx-auto">
        {statusAverages.map((item, index) => {
          const angle = (item.percentage / 100) * 2 * Math.PI;
          const startAngle = currentAngle;
          const endAngle = currentAngle + angle;
          
          const path = getPieChartPath(startAngle, endAngle, radius);
          
          currentAngle = endAngle;
          
          return (
            <g key={item.status}>
              <path
                d={path}
                fill={item.color}
                stroke="#fff"
                strokeWidth="2"
                className="hover:opacity-80 transition-all duration-300 cursor-pointer transform hover:scale-105"
                onClick={() => setSelectedStatus(selectedStatus === item.status ? null : item.status)}
                style={{ 
                  opacity: selectedStatus && selectedStatus !== item.status ? 0.3 : 1,
                  transformOrigin: 'center',
                  animation: `fadeInScale 0.6s ease-out ${index * 0.1}s both`
                }}
              />
              {/* Add percentage labels */}
              {item.percentage > 5 && (
                <text
                  key={`label-${item.status}`}
                  x={center + (radius * 0.7) * Math.cos(startAngle + angle / 2)}
                  y={center + (radius * 0.7) * Math.sin(startAngle + angle / 2)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-xs font-bold fill-white"
                  style={{ 
                    fontSize: '12px',
                    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                    animation: `fadeIn 0.8s ease-out ${index * 0.1 + 0.3}s both`
                  }}
                >
                  {item.percentage}%
                </text>
              )}
            </g>
          );
        })}
        {/* Center circle */}
        <circle
          cx={center}
          cy={center}
          r={radius * 0.3}
          fill="#fff"
          stroke="#e5e7eb"
          strokeWidth="2"
          style={{ animation: 'fadeInScale 0.8s ease-out 0.5s both' }}
        />
      </svg>
    );
  };

  const renderTimelineChart = () => {
    const maxDuration = Math.max(...statusDurations.map(d => d.average_duration_days), 1);
    const chartHeight = 400;
    const barHeight = 30;
    const spacing = 10;
    const totalHeight = statusDurations.length * (barHeight + spacing);
    const chartWidth = 800;
    
    // Use a minimum scale to ensure bars are visible even for very short durations
    const effectiveMaxDuration = Math.max(maxDuration, 0.1); // Minimum 0.1 days for scale
    const minBarWidth = 20; // Minimum bar width in pixels

    return (
      <div className="relative overflow-x-auto">
        <svg width={chartWidth} height={Math.max(chartHeight, totalHeight)} className="mx-auto">
          {/* Background grid */}
          <defs>
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#f3f4f6" strokeWidth="1"/>
            </pattern>
            {/* Gradient definitions for modern look */}
            <linearGradient id="gradient-blue" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="#1D4ED8" stopOpacity="1"/>
            </linearGradient>
            <linearGradient id="gradient-green" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="#059669" stopOpacity="1"/>
            </linearGradient>
            <linearGradient id="gradient-yellow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="#D97706" stopOpacity="1"/>
            </linearGradient>
            <linearGradient id="gradient-red" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#EF4444" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="#DC2626" stopOpacity="1"/>
            </linearGradient>
            <linearGradient id="gradient-purple" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="#7C3AED" stopOpacity="1"/>
            </linearGradient>
            <linearGradient id="gradient-pink" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#EC4899" stopOpacity="0.8"/>
              <stop offset="100%" stopColor="#DB2777" stopOpacity="1"/>
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          {/* Time scale */}
          {Array.from({ length: Math.ceil(effectiveMaxDuration) + 1 }, (_, i) => (
            <g key={`scale-${i}`}>
              <line
                x1={50 + (i * 100)}
                y1={0}
                x2={50 + (i * 100)}
                y2={totalHeight}
                stroke="#e5e7eb"
                strokeWidth="1"
                strokeDasharray="5,5"
              />
              <text
                x={50 + (i * 100)}
                y={totalHeight + 20}
                textAnchor="middle"
                className="text-xs text-gray-500"
              >
                {i} days
              </text>
            </g>
          ))}

          {/* Status bars */}
          {statusDurations.map((item, index) => {
            const y = index * (barHeight + spacing) + spacing;
            // Calculate width with minimum bar width and better scaling
            const calculatedWidth = (item.average_duration_days / effectiveMaxDuration) * 700;
            const width = Math.max(calculatedWidth, minBarWidth);
            const color = statusColors[item.status as keyof typeof statusColors] || '#6B7280';
            const gradientId = `gradient-${item.status.toLowerCase().replace(/\s+/g, '-')}`;
            
            return (
              <g key={`${item.status}-${index}`}>
                {/* Status label */}
                <text
                  x={0}
                  y={y + barHeight / 2}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="text-xs font-medium text-gray-700"
                  style={{ 
                    fontSize: '10px',
                    animation: `slideInLeft 0.6s ease-out ${index * 0.1}s both`
                  }}
                >
                  {item.status}
                </text>
                
                {/* Status bar with gradient */}
                <rect
                  x={50}
                  y={y}
                  width={width}
                  height={barHeight}
                  rx={6}
                  fill={`url(#${gradientId})`}
                  className="hover:opacity-90 transition-all duration-300 cursor-pointer transform hover:scale-105"
                  style={{
                    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))',
                    stroke: color,
                    strokeWidth: '1px',
                    animation: `slideInRight 0.8s ease-out ${index * 0.1 + 0.2}s both`
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.filter = 'drop-shadow(0 8px 12px rgba(0,0,0,0.2))';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.filter = 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))';
                  }}
                />
                
                {/* Average duration label */}
                <text
                  x={60}
                  y={y + barHeight / 2}
                  dominantBaseline="middle"
                  className="text-xs font-bold fill-white"
                  style={{ 
                    fontSize: '10px', 
                    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                    animation: `fadeIn 0.6s ease-out ${index * 0.1 + 0.4}s both`
                  }}
                >
                  {item.average_duration_days.toFixed(1)}d
                </text>
                
                {/* Request count label */}
                <text
                  x={width + 60}
                  y={y + barHeight / 2}
                  dominantBaseline="middle"
                  className="text-xs text-gray-600 font-medium"
                  style={{ 
                    fontSize: '10px',
                    animation: `fadeIn 0.6s ease-out ${index * 0.1 + 0.5}s both`
                  }}
                >
                  {item.request_count} requests
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 animate-pulse">Loading tracker data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="text-red-600 text-xl font-semibold mb-2 animate-bounce">Error</div>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={fetchTrackerData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-300 transform hover:scale-105"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeInScale {
          from { 
            opacity: 0; 
            transform: scale(0.8); 
          }
          to { 
            opacity: 1; 
            transform: scale(1); 
          }
        }
        @keyframes slideInLeft {
          from { 
            opacity: 0; 
            transform: translateX(-20px); 
          }
          to { 
            opacity: 1; 
            transform: translateX(0); 
          }
        }
        @keyframes slideInRight {
          from { 
            opacity: 0; 
            transform: translateX(20px); 
          }
          to { 
            opacity: 1; 
            transform: translateX(0); 
          }
        }
        @keyframes slideInUp {
          from { 
            opacity: 0; 
            transform: translateY(20px); 
          }
          to { 
            opacity: 1; 
            transform: translateY(0); 
          }
        }
        @keyframes bounceIn {
          0% { 
            opacity: 0; 
            transform: scale(0.3); 
          }
          50% { 
            opacity: 1; 
            transform: scale(1.05); 
          }
          70% { 
            transform: scale(0.9); 
          }
          100% { 
            opacity: 1; 
            transform: scale(1); 
          }
        }
      `}</style>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className={`mb-8 transition-all duration-1000 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Tracker Dashboard</h1>
          <p className="text-gray-600">Overview of average status durations across all request IDs</p>
        </div>

        {/* Stats Cards */}
        <div className={`grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 transition-all duration-1000 delay-200 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Profiles Submitted</p>
                <p className="text-2xl font-bold text-gray-900">{dashboardStats.totalProfiles}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m8 0V6a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2V6" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Active Hiring</p>
                <p className="text-2xl font-bold text-gray-900">{dashboardStats.activeHiring}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Active</p>
                <p className="text-2xl font-bold text-gray-900">
                  {statusCounts.filter(s => s.status !== 'Closed').reduce((sum, s) => sum + s.count, 0)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Completed</p>
                <p className="text-2xl font-bold text-gray-900">
                  {statusCounts.find(s => s.status === 'Closed')?.count || 0}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-8 transition-all duration-1000 delay-400 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {/* Pie Chart */}
          <div className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-all duration-300">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Status Distribution</h2>
            <div className="flex justify-center">
              {renderPieChart()}
            </div>
          </div>

          {/* Status Legend */}
          <div className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-all duration-300">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Status Distribution</h2>
            <div className="space-y-4">
              {statusAverages.map((item, index) => (
                <div
                  key={item.status}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all duration-300 transform hover:scale-105 ${
                    selectedStatus === item.status ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedStatus(selectedStatus === item.status ? null : item.status)}
                  style={{ animation: `slideInUp 0.6s ease-out ${index * 0.1}s both` }}
                >
                  <div className="flex items-center">
                    <div
                      className="w-4 h-4 rounded-full mr-3"
                      style={{ backgroundColor: item.color }}
                    ></div>
                    <span className="font-medium text-gray-900">{item.status}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-gray-900">{statusCounts.find(s => s.status === item.status)?.count || 0}</div>
                    <div className="text-sm text-gray-500">{item.percentage}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Timeline Chart */}
        <div className={`mt-8 bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-all duration-300 transition-all duration-1000 delay-600 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Average Status Duration</h2>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-500">
                Total Statuses: <span className="font-semibold text-gray-900">{statusDurations.length}</span>
              </div>
              <div className="text-sm text-gray-500">
                Overall Avg: <span className="font-semibold text-gray-900">
                  {(statusDurations.reduce((sum, d) => sum + d.average_duration_days, 0) / statusDurations.length || 0).toFixed(1)} days
                </span>
              </div>
            </div>
          </div>
          
          {/* Summary Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg">
            <div className="text-center transform hover:scale-105 transition-transform duration-300">
              <div className="text-2xl font-bold text-blue-600">
                {Math.max(...statusDurations.map(d => d.average_duration_days), 0).toFixed(1)}
              </div>
              <div className="text-xs text-gray-600">Longest Avg Status (days)</div>
            </div>
            <div className="text-center transform hover:scale-105 transition-transform duration-300">
              <div className="text-2xl font-bold text-green-600">
                {Math.min(...statusDurations.map(d => d.average_duration_days), Infinity).toFixed(1)}
              </div>
              <div className="text-xs text-gray-600">Shortest Avg Status (days)</div>
            </div>
            <div className="text-center transform hover:scale-105 transition-transform duration-300">
              <div className="text-2xl font-bold text-purple-600">
                {statusDurations.filter(d => d.average_duration_days > 7).length}
              </div>
              <div className="text-xs text-gray-600">Statuses &gt; 7 days avg</div>
            </div>
            <div className="text-center transform hover:scale-105 transition-transform duration-300">
              <div className="text-2xl font-bold text-orange-600">
                {statusDurations.filter(d => d.average_duration_days <= 1).length}
              </div>
              <div className="text-xs text-gray-600">Quick Statuses (&le;1 day avg)</div>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            {renderTimelineChart()}
          </div>
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-500">
              Chart shows average time spent in each status across all requests (from creation to last update)
            </p>
            {statusDurations.some(d => d.average_duration_days < 0.1) && (
              <p className="text-xs text-blue-600 mt-2">
                💡 Very short durations may indicate recent requests or same-day processing
              </p>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        {selectedStatus && (
          <div className={`mt-8 bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-all duration-300 ${animateIn ? 'opacity-100' : 'opacity-0'}`} style={{ animation: 'bounceIn 0.8s ease-out both' }}>
            <h2 className="text-xl font-semibold text-gray-900 mb-6">
              Recent Activity - {selectedStatus}
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Request ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Subject
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Students
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {trackerData
                    .filter(item => item.status === selectedStatus)
                    .slice(0, 10)
                    .map((item, index) => (
                      <tr 
                        key={index} 
                        className="hover:bg-gray-50 transition-colors duration-200 transform hover:scale-[1.01]"
                        style={{ animation: `slideInUp 0.4s ease-out ${index * 0.05}s both` }}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {item.request_id}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 truncate max-w-xs">
                          {item.email_subject}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {item.received_datetime ? new Date(item.received_datetime).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {item.student_count || 0}
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
};

export default TrackerDashboard; 