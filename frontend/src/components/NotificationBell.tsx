'use client';

import React, { useState, useEffect, useRef } from 'react';
import { User } from '@/types/student';

interface NotificationData {
  request_id?: string;
  job_title?: string;
  company_name?: string;
  step_name?: string;
  breach_time_display?: string;
  alert_type?: string;
  [key: string]: any;
}

interface Notification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  data: NotificationData | null;
  is_read: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface UserNotificationGroup {
  user: {
    id: number;
    username: string;
    role: string;
  };
  notifications: Notification[];
  unread_count: number;
}

interface NotificationBellProps {
  user: User | null;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ user }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [userNotificationGroups, setUserNotificationGroups] = useState<UserNotificationGroup[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Don't render anything if user is not available or user_id is not set
  if (!user || !user.user_id) {
    return null;
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Get API base URL
  const getApiBaseUrl = () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://20.188.122.171:1976';
    // Ensure the base URL includes /api prefix if not already present
    return baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;
  };

  // Fetch notifications
  const fetchNotifications = async () => {
    // Safety check: ensure user and user_id are available
    if (!user || !user.user_id) {
      console.warn('Cannot fetch notifications: user or user_id is not available');
      return;
    }

    try {
      setLoading(true);
      
      // Get authentication headers
      const token = localStorage.getItem('access_token');
      const domain = window.location.host;
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'X-Original-Domain': domain,
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      if (user.role === 'admin') {
        // Admin sees all notifications from all users
        const response = await fetch(`${getApiBaseUrl()}/notifications/admin/all?user_id=${user.user_id}&limit=50`, {
          headers
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setUserNotificationGroups(data.user_notifications);
            
            // Calculate total unread count for admin
            const totalUnread = data.user_notifications.reduce((total: number, group: UserNotificationGroup) => {
              return total + group.unread_count;
            }, 0);
            setUnreadCount(totalUnread);
            
            // Flatten all notifications for display
            const allNotifications = data.user_notifications.flatMap((group: UserNotificationGroup) => 
              group.notifications
            );
            setNotifications(allNotifications);
          }
        } else {
          console.error('Failed to fetch admin notifications:', response.status, response.statusText);
        }
      } else {
        // Regular user sees only their notifications
        const response = await fetch(`${getApiBaseUrl()}/notifications?user_id=${user.user_id}&limit=10`, {
          headers
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setNotifications(data.notifications);
            setUnreadCount(data.unread_count);
          }
        } else {
          console.error('Failed to fetch notifications:', response.status, response.statusText);
        }
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch unread count only
  const fetchUnreadCount = async () => {
    // Safety check: ensure user and user_id are available
    if (!user || !user.user_id) {
      console.warn('Cannot fetch unread count: user or user_id is not available');
      return;
    }

    try {
      // Get authentication headers
      const token = localStorage.getItem('access_token');
      const domain = window.location.host;
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'X-Original-Domain': domain,
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      if (user.role === 'admin') {
        // Admin needs to get unread count from all users
        const response = await fetch(`${getApiBaseUrl()}/notifications/admin/all?user_id=${user.user_id}&limit=1`, {
          headers
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            const totalUnread = data.user_notifications.reduce((total: number, group: UserNotificationGroup) => {
              return total + group.unread_count;
            }, 0);
            setUnreadCount(totalUnread);
          }
        } else {
          console.error('Failed to fetch admin unread count:', response.status, response.statusText);
        }
      } else {
        // Regular user unread count
          const response = await fetch(`${getApiBaseUrl()}/notifications/unread-count?user_id=${user.user_id}`, {
          headers
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setUnreadCount(data.unread_count);
          }
        } else {
          console.error('Failed to fetch unread count:', response.status, response.statusText);
        }
      }
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  // Mark notification as read
  const markAsRead = async (notificationId: number) => {
    // Safety check: ensure user and user_id are available
    if (!user || !user.user_id) {
      console.warn('Cannot mark notification as read: user or user_id is not available');
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const domain = window.location.host;
      
      const response = await fetch(`${getApiBaseUrl()}/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Original-Domain': domain,
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify({ user_id: user.user_id }),
      });

      if (response.ok) {
        // Update local state
        setNotifications(prev => 
          prev.map(notif => 
            notif.id === notificationId 
              ? { ...notif, is_read: true }
              : notif
          )
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      } else {
        console.error('Failed to mark notification as read:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    // Safety check: ensure user and user_id are available
    if (!user || !user.user_id) {
      console.warn('Cannot mark all notifications as read: user or user_id is not available');
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const domain = window.location.host;
      
      const response = await fetch(`${getApiBaseUrl()}/notifications/mark-all-read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Original-Domain': domain,
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify({ user_id: user.user_id }),
      });

      if (response.ok) {
        // Update local state
        setNotifications(prev => 
          prev.map(notif => ({ ...notif, is_read: true }))
        );
        setUnreadCount(0);
      } else {
        console.error('Failed to mark all notifications as read:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  // Initial fetch and periodic updates
  useEffect(() => {
    fetchUnreadCount();
    
    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    
    return () => clearInterval(interval);
  }, [user.user_id]);

  // Fetch full notifications when dropdown opens
  useEffect(() => {
    if (isOpen && notifications.length === 0) {
      fetchNotifications();
    }
  }, [isOpen]);

  const formatRelativeTime = (dateString: string) => {
    // Parse the date (backend now sends IST timestamps with timezone info)
    const date = new Date(dateString);
    const now = new Date();
    
    // Calculate time difference in seconds
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return 'Just now';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h ago`;
    } else {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days}d ago`;
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'sla_breach':
        return '⚠️';
      case 'new_assignment':
        return '📋';
      case 'recruiter_activity':
        return '👤';
      case 'recruiter_inactivity':
        return '😴';
      default:
        return '📢';
    }
  };

  const getNotificationColor = (type: string, isRead: boolean) => {
    if (isRead) return 'text-gray-500 bg-gray-50';
    
    switch (type) {
      case 'sla_breach':
        return 'text-red-800 bg-red-50';
      case 'new_assignment':
        return 'text-blue-800 bg-blue-50';
      case 'recruiter_activity':
        return 'text-green-800 bg-green-50';
      case 'recruiter_inactivity':
        return 'text-orange-800 bg-orange-50';
      default:
        return 'text-gray-800 bg-gray-50';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Notification Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-lg transition-colors"
        aria-label="Notifications"
      >
        {unreadCount > 0 ? (
          <svg className="h-6 w-6 text-blue-600 fill-current" fill="currentColor" viewBox="0 0 24 24" stroke="currentColor">
            <path d="M12 2a7 7 0 00-7 7v3.5l-1.6 1.6c-.4.4-.4 1 0 1.4.2.2.4.3.7.3h15.8c.3 0 .5-.1.7-.3.4-.4.4-1 0-1.4L19 12.5V9a7 7 0 00-7-7z"/>
            <path d="M10.5 18c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5"/>
          </svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        )}
        
        {/* Unread Count Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-medium rounded-full h-5 w-5 flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-500">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2">Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <svg className="h-12 w-12 mx-auto text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <p>No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                      !notification.is_read ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                    }`}
                    onClick={() => !notification.is_read && markAsRead(notification.id)}
                  >
                    <div className="flex items-start space-x-3">
                      <span className="text-lg flex-shrink-0 mt-0.5">
                        {getNotificationIcon(notification.type)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className={`text-sm font-medium ${
                            notification.is_read ? 'text-gray-600' : 'text-gray-900'
                          }`}>
                            {notification.title}
                          </p>
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            {formatRelativeTime(notification.created_at)}
                          </span>
                        </div>
                        
                        {/* Show user info for admin */}
                        {user.role === 'admin' && (
                          <div className="flex items-center mt-1">
                            <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full font-medium">
                              {userNotificationGroups.find(group => 
                                group.notifications.some(n => n.id === notification.id)
                              )?.user.username || 'Unknown User'}
                            </span>
                          </div>
                        )}
                        <p className={`text-sm mt-1 ${
                          notification.is_read ? 'text-gray-500' : 'text-gray-700'
                        }`}>
                          {notification.message}
                        </p>
                        
                        {/* Additional data for specific notification types */}
                        {notification.data && notification.data.request_id && (
                          <div className="mt-2">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              getNotificationColor(notification.type, notification.is_read)
                            }`}>
                              {notification.data.request_id}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {/* Unread indicator */}
                      {!notification.is_read && (
                        <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-2"></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-200 text-center">
              <button
                onClick={fetchNotifications}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Refresh
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
