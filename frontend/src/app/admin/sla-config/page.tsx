'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface SLAConfig {
  id: number;
  step_name: string;
  step_display_name: string;
  sla_hours: number;
  sla_days: number;
  is_active: boolean;
  priority: number;
  description: string;
  created_at: string;
  updated_at: string;
}

const SLAConfigPage: React.FC = () => {
  const [configs, setConfigs] = useState<SLAConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<{ [key: string]: boolean }>({});
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [successMessages, setSuccessMessages] = useState<{ [key: string]: string }>({});
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    // Check authentication
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        if (userData.role === 'admin') {
          setUser(userData);
        } else {
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

    fetchSLAConfigs();
  }, [router]);

  const fetchSLAConfigs = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1010/api'}/sla/config`);
      if (response.ok) {
        const data = await response.json();
        setConfigs(data);
      } else {
        console.error('Failed to fetch SLA configs');
      }
    } catch (error) {
      console.error('Error fetching SLA configs:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async (stepName: string, updatedConfig: Partial<SLAConfig>) => {
    try {
      setSaving(prev => ({ ...prev, [stepName]: true }));
      setErrors(prev => ({ ...prev, [stepName]: '' }));

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1010/api'}/sla/config/${stepName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedConfig),
      });

      if (response.ok) {
        const updatedData = await response.json();
        setConfigs(prev => prev.map(config => 
          config.step_name === stepName ? updatedData : config
        ));
        setSuccessMessages(prev => ({ ...prev, [stepName]: 'Configuration updated successfully!' }));
        setErrors(prev => ({ ...prev, [stepName]: '' }));
        
        // Clear success message after 3 seconds
        setTimeout(() => {
          setSuccessMessages(prev => ({ ...prev, [stepName]: '' }));
        }, 3000);
      } else {
        const errorData = await response.json();
        setErrors(prev => ({ ...prev, [stepName]: errorData.error || 'Failed to update configuration' }));
        setSuccessMessages(prev => ({ ...prev, [stepName]: '' }));
      }
    } catch (error) {
      console.error('Error updating config:', error);
      setErrors(prev => ({ ...prev, [stepName]: 'Network error occurred' }));
    } finally {
      setSaving(prev => ({ ...prev, [stepName]: false }));
    }
  };

  const handleInputChange = (stepName: string, field: string, value: any) => {
    setConfigs(prev => prev.map(config => 
      config.step_name === stepName ? { ...config, [field]: value } : config
    ));
  };

  const handleSave = async (config: SLAConfig) => {
    const { sla_hours, sla_days, description } = config;
    
    // Validation
    if (sla_hours < 1 || sla_days < 1) {
      setErrors(prev => ({ ...prev, [config.step_name]: 'Time values must be at least 1' }));
      return;
    }

    await updateConfig(config.step_name, {
      sla_hours,
      sla_days,
      description
    });
  };

  const initializeDefaults = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1010/api'}/sla/config/initialize`, {
        method: 'POST',
      });
      
      if (response.ok) {
        await fetchSLAConfigs();
        // Show success message
        alert('SLA configurations have been reset to defaults successfully!');
      } else {
        console.error('Failed to initialize default configs');
        alert('Failed to reset configurations. Please try again.');
      }
    } catch (error) {
      console.error('Error initializing defaults:', error);
      alert('Error occurred while resetting configurations.');
    }
  };

  const formatTime = (hours: number, days: number) => {
    if (days > 1) {
      return `${days} days`;
    } else if (days === 1) {
      return `${hours} hours`;
    } else {
      return `${hours} hours`;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading SLA Configurations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">SLA & TAT Configuration</h1>
              <p className="text-gray-600 mt-2">Configure time limits for each workflow step</p>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={() => router.push('/admin')}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Back to Dashboard
              </button>
              <button
                onClick={initializeDefaults}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>

        {/* Configuration Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {configs.map((config) => (
            <div key={config.id} className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {config.step_display_name}
                  </h3>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Priority: {config.priority}
                  </span>
                </div>

                <div className="space-y-4">
                  {/* SLA Hours */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SLA Hours
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={config.sla_hours}
                      onChange={(e) => handleInputChange(config.step_name, 'sla_hours', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  {/* SLA Days */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SLA Days
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={config.sla_days}
                      onChange={(e) => handleInputChange(config.step_name, 'sla_days', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={config.description || ''}
                      onChange={(e) => handleInputChange(config.step_name, 'description', e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  {/* Current Time Limit Display */}
                  <div className="bg-gray-50 p-3 rounded-md">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Current Time Limit:</span> {formatTime(config.sla_hours, config.sla_days)}
                    </p>
                  </div>

                  {/* Success Message */}
                  {successMessages[config.step_name] && (
                    <div className="text-green-600 text-sm bg-green-50 p-2 rounded-md">
                      {successMessages[config.step_name]}
                    </div>
                  )}

                  {/* Error Message */}
                  {errors[config.step_name] && (
                    <div className="text-red-600 text-sm bg-red-50 p-2 rounded-md">
                      {errors[config.step_name]}
                    </div>
                  )}

                  {/* Save Button */}
                  <button
                    onClick={() => handleSave(config)}
                    disabled={saving[config.step_name]}
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving[config.step_name] ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-blue-900 mb-2">Configuration Guidelines</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• SLA Hours and Days should be at least 1</li>
            <li>• Changes take effect immediately across the system</li>
            <li>• Use "Reset to Defaults" to restore original time limits</li>
            <li>• Priority determines the order of steps in the workflow</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SLAConfigPage;
