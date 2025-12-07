'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/types/student';
import { api, fetchTrackerRequirements } from '@/services/api';
import { getStatusDisplayName } from '@/utils/statusFormatter';

interface Requirement {
  id: string;
  request_id: string;
  job_title: string;
  department: string;
  location: string;
  status: string;
  job_description?: string;
  jd_path?: string;
  job_file_name?: string;
  created_at: string;
}

const UpdateJD: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [selectedRequirement, setSelectedRequirement] = useState<Requirement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in and has admin role
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const userData: User = JSON.parse(storedUser);
        if (userData.role === 'admin') {
          setUser(userData);
          fetchRequirements();
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

  const fetchRequirements = async () => {
    try {
      const response = await fetchTrackerRequirements();
      // The tracker endpoint returns data in format: { items: [...], pagination: {...} }
      // Handle both new format (with items) and old format (direct array) for backward compatibility
      let requirementsArray: Requirement[] = [];
      if (Array.isArray(response)) {
        // Old format: direct array
        requirementsArray = response;
      } else if (response && Array.isArray(response.items)) {
        // New format: object with items property
        requirementsArray = response.items;
      } else if (response && Array.isArray(response.requirements)) {
        // Alternative format: object with requirements property
        requirementsArray = response.requirements;
      }
      
      // Filter out closed requirements and only show open/active ones
      const activeRequirements = requirementsArray.filter(req => req.status !== 'Closed');
      setRequirements(activeRequirements);
    } catch (error) {
      console.error('Error fetching requirements:', error);
      setUploadMessage({ type: 'error', text: 'Failed to fetch requirements' });
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file type
      const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedTypes.includes(file.type)) {
        setUploadMessage({ type: 'error', text: 'Please select a PDF or DOCX file' });
        return;
      }
      
      // Check file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        setUploadMessage({ type: 'error', text: 'File size too large. Maximum size is 10MB' });
        return;
      }
      
      setSelectedFile(file);
      setUploadMessage(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedRequirement || !selectedFile) {
      setUploadMessage({ type: 'error', text: 'Please select a requirement and a file' });
      return;
    }

    setUploading(true);
    setUploadMessage(null);

    try {
      const result = await api.updateRequirementJD(selectedFile, selectedRequirement.request_id);

      if (result.success) {
        setUploadMessage({ type: 'success', text: 'Job description updated successfully!' });
        setSelectedFile(null);
        setSelectedRequirement(null);
        // Reset file input
        const fileInput = document.getElementById('jd-file') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        // Refresh requirements list
        fetchRequirements();
      } else {
        setUploadMessage({ type: 'error', text: result.error || 'Failed to update job description' });
      }
    } catch (error) {
      console.error('Error uploading job description:', error);
      setUploadMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to update job description' });
    } finally {
      setUploading(false);
    }
  };

  const filteredRequirements = requirements.filter(req => {
    const matchesStatus = filterStatus === 'all' || 
      (filterStatus === 'no-jd' && !req.jd_path) ||
      (filterStatus === 'has-jd' && req.jd_path);
    
    const matchesSearch = searchTerm === '' || 
      req.request_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.job_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.department?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesStatus && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 dark:border-blue-400"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">Update Job Description</h1>
              <p className="text-lg text-gray-600 dark:text-gray-300">Upload job descriptions for existing requirements</p>
            </div>
            <button
              onClick={() => router.push('/admin')}
              className="bg-gray-600 dark:bg-gray-700 text-white px-4 py-2 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors duration-200"
            >
              Back to Admin
            </button>
          </div>
        </div>

        {/* Upload Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-8 border border-gray-100 dark:border-gray-700">
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100 mb-6">Upload Job Description</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Requirement Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Requirement
              </label>
              <select
                value={selectedRequirement?.request_id || ''}
                onChange={(e) => {
                  const req = requirements.find(r => r.request_id === e.target.value);
                  setSelectedRequirement(req || null);
                }}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="">Choose a requirement...</option>
                {requirements.map((req) => (
                  <option key={req.request_id} value={req.request_id}>
                    {req.request_id} - {req.job_title || 'No Title'} 
                    {req.jd_path && ' (Has JD)'}
                  </option>
                ))}
              </select>
            </div>

            {/* File Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Job Description File
              </label>
              <input
                id="jd-file"
                type="file"
                accept=".pdf,.docx"
                onChange={handleFileSelect}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-gray-600 dark:file:text-gray-200"
              />
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Supported formats: PDF, DOCX (Max size: 10MB)
              </p>
            </div>
          </div>

          {/* Upload Button */}
          <div className="mt-6">
            <button
              onClick={handleUpload}
              disabled={!selectedRequirement || !selectedFile || uploading}
              className="bg-blue-600 dark:bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-200 font-medium"
            >
              {uploading ? 'Uploading...' : 'Upload Job Description'}
            </button>
          </div>

          {/* Upload Message */}
          {uploadMessage && (
            <div className={`mt-4 p-4 rounded-lg ${
              uploadMessage.type === 'success' 
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800' 
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
            }`}>
              {uploadMessage.text}
            </div>
          )}
        </div>

        {/* Requirements List */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">Requirements List</h2>
            
            {/* Filters */}
            <div className="flex gap-4">
              <input
                type="text"
                placeholder="Search requirements..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
              />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="all">All Requirements</option>
                <option value="no-jd">Missing JD</option>
                <option value="has-jd">Has JD</option>
              </select>
            </div>
          </div>

          {/* Requirements Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Request ID</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Job Title</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Department</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Location</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">JD Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequirements.map((req) => (
                  <tr 
                    key={req.request_id} 
                    className={`border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors ${
                      selectedRequirement?.request_id === req.request_id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                    onClick={() => setSelectedRequirement(req)}
                  >
                    <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">{req.request_id}</td>
                    <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{req.job_title || 'N/A'}</td>
                    <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{req.department || 'N/A'}</td>
                    <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{req.location || 'N/A'}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        req.status === 'Open' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                        req.status === 'Closed' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' :
                        'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                      }`}>
                        {getStatusDisplayName(req.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {req.jd_path ? (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                          Has JD
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
                          Missing JD
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-sm">
                      {new Date(req.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {filteredRequirements.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No requirements found matching your criteria.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdateJD;
