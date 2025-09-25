'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/services/api';
import JobDescriptionModal from '@/components/JobDescriptionModal';

interface Profile {
  id: string;
  student_id: string;
  candidate_name: string;
  email_id: string;
  contact_no: string;
  total_experience: number;
  relevant_experience: number;
  current_company: string;
  location: string;
  notice_period_days: number;
  ctc_current: number;
  ctc_expected: number;
  key_skills: string;
  education: string;
  source: string;
  candidate_email: string;
  oracle_id: string;
  offer_in_hand: string;
  availability: string;
  created_at: string;
  updated_at: string;
}

interface Requirement {
  request_id: string;
  job_title: string;
  department: string;
  location: string;
  shift: string;
  job_type: string;
  hiring_manager: string;
  experience_range: string;
  skills_required: string;
  minimum_qualification: string;
  number_of_positions: number;
  budget_ctc: string;
  priority: string;
  tentative_doj: string;
  additional_remarks: string;
  status: string;
  email_subject: string;
  sender_email: string;
  sender_name: string;
  company_name: string;
  received_datetime: string | null;
  created_at: string;
  updated_at: string;
  // Job Description fields
  job_description?: string;
  jd_path?: string;
  job_file_name?: string;
}

export default function ProfilesPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params.requestId as string;
  
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [requirement, setRequirement] = useState<Requirement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(new Set());
  const [rejectedProfiles, setRejectedProfiles] = useState<Set<string>>(new Set());
  const [authChecked, setAuthChecked] = useState(false);
  
  // Profile movement state
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movingProfile, setMovingProfile] = useState<Profile | null>(null);
  const [availableRequirements, setAvailableRequirements] = useState<any[]>([]);
  const [selectedTargetRequirement, setSelectedTargetRequirement] = useState<string>('');
  const [moveReason, setMoveReason] = useState<string>('');
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  
  // View JD Modal state
  const [showViewJDModal, setShowViewJDModal] = useState(false);

  useEffect(() => {
    // Check authentication first
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/login');
      return;
    }

    try {
      const userData = JSON.parse(storedUser);
      if (!userData.role || !['admin', 'recruiter'].includes(userData.role)) {
        router.push('/login');
        return;
      }
      setAuthChecked(true);
    } catch (error) {
      console.error('Error parsing user data:', error);
      localStorage.removeItem('user');
      router.push('/login');
    }
  }, [router]);

  useEffect(() => {
    if (authChecked && requestId) {
      fetchProfilesData();
      fetchRequirementData();
    }
  }, [requestId, authChecked]);

  const fetchProfilesData = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/tracker/${requestId}/profiles`);
      setProfiles(data.profiles || []);
    } catch (err) {
      setError('Failed to fetch profiles data');
      console.error('Error fetching profiles data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRequirementData = async () => {
    try {
      const data = await api.get(`/tracker/${requestId}`);
      setRequirement(data);
    } catch (err) {
      console.error('Error fetching requirement data:', err);
    }
  };

  const handleSelectProfile = (studentId: string) => {
    setSelectedProfiles(prev => {
      const newSet = new Set(prev);
      newSet.add(studentId);
      return newSet;
    });
    setRejectedProfiles(prev => {
      const newSet = new Set(prev);
      newSet.delete(studentId);
      return newSet;
    });
  };

  const handleRejectProfile = (studentId: string) => {
    setRejectedProfiles(prev => {
      const newSet = new Set(prev);
      newSet.add(studentId);
      return newSet;
    });
    setSelectedProfiles(prev => {
      const newSet = new Set(prev);
      newSet.delete(studentId);
      return newSet;
    });
  };

  // Profile movement functions
  const handleMoveProfile = async (profile: Profile) => {
    try {
      setMovingProfile(profile);
      setMoveError(null);
      
      // Fetch available requirements (excluding current one)
      const requirements = await api.get('/tracker/profiles-count');
      const availableReqs = requirements.requirements?.filter((req: any) => 
        req.request_id !== requestId && req.status !== 'Closed'
      ) || [];
      
      setAvailableRequirements(availableReqs);
      setShowMoveModal(true);
    } catch (error) {
      console.error('Error fetching requirements for move:', error);
      setMoveError('Failed to load available requirements');
    }
  };

  const handleMoveConfirm = async () => {
    if (!movingProfile || !selectedTargetRequirement) {
      setMoveError('Please select a target requirement');
      return;
    }

    try {
      setMoveLoading(true);
      setMoveError(null);

      const result = await api.moveProfile(
        movingProfile.id,
        requestId,
        selectedTargetRequirement,
        moveReason
      );

      if (result.success) {
        // Remove the moved profile from the current list
        setProfiles(prev => prev.filter(p => p.id !== movingProfile.id));
        
        // Close modal and reset state
        setShowMoveModal(false);
        setMovingProfile(null);
        setSelectedTargetRequirement('');
        setMoveReason('');
        
        // Show success message
        alert(`Profile ${movingProfile.candidate_name} successfully moved to ${selectedTargetRequirement}`);
      } else {
        setMoveError(result.error || 'Failed to move profile');
      }
    } catch (error: any) {
      console.error('Error moving profile:', error);
      setMoveError(error.message || 'Failed to move profile');
    } finally {
      setMoveLoading(false);
    }
  };

  const handleMoveCancel = () => {
    setShowMoveModal(false);
    setMovingProfile(null);
    setSelectedTargetRequirement('');
    setMoveReason('');
    setMoveError(null);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleBackClick = () => {
    router.push('/recruiter');
  };

  // Don't render anything until authentication is checked
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600 text-center">
          <p className="text-xl font-semibold mb-2">Error</p>
          <p>{error}</p>
          <button
            onClick={fetchProfilesData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-6">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <button
              onClick={handleBackClick}
              className="text-blue-600 hover:text-blue-800 mb-2 flex items-center"
            >
              ← Back to JD Tracker
            </button>
            <h1 className="text-3xl font-bold text-gray-900">
              Profiles for {requestId}
            </h1>
            {requirement && (
              <p className="text-gray-600 mt-2">
                {requirement.job_title} - {requirement.company_name}
              </p>
            )}
          </div>
          <div className="text-right">
            <span className="text-sm text-gray-500">Total Profiles: {profiles.length}</span>
          </div>
        </div>

        {/* Requirement Details */}
        {requirement && (
          <div className="bg-white shadow-md rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Requirement Details</h2>
              {requirement.jd_path && (
                <button
                  onClick={() => setShowViewJDModal(true)}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
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
                  View JD
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <span className="text-sm font-medium text-gray-500">Job Title:</span>
                <p className="text-gray-900">{requirement.job_title}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Department:</span>
                <p className="text-gray-900">{requirement.department || '-'}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Location:</span>
                <p className="text-gray-900">{requirement.location || '-'}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Experience Range:</span>
                <p className="text-gray-900">{requirement.experience_range || '-'}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Budget CTC:</span>
                <p className="text-gray-900">{requirement.budget_ctc || '-'}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Status:</span>
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                  ${requirement.status.toLowerCase() === 'open' ? 'bg-green-100 text-green-800' : 
                    'bg-gray-100 text-gray-800'}`}>
                  {requirement.status}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Profiles Table */}
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Candidate Profiles</h2>
          </div>
          
          {profiles.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p className="text-lg">No profiles found for this requirement.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Candidate Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {profiles.map((profile) => (
                    <tr key={profile.student_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {profile.candidate_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div>
                          <p>{profile.email_id || profile.candidate_email}</p>
                          <p className="text-xs text-gray-400">{profile.contact_no}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleSelectProfile(profile.student_id)}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                              selectedProfiles.has(profile.student_id)
                                ? 'bg-green-600 text-white'
                                : 'bg-green-100 text-green-700 hover:bg-green-200'
                            }`}
                          >
                            Selected
                          </button>
                          <button
                            onClick={() => handleRejectProfile(profile.student_id)}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                              rejectedProfiles.has(profile.student_id)
                                ? 'bg-red-600 text-white'
                                : 'bg-red-100 text-red-700 hover:bg-red-200'
                            }`}
                          >
                            Rejected
                          </button>
                          <button
                            onClick={() => handleMoveProfile(profile)}
                            className="px-3 py-1 text-xs font-medium rounded-md transition-colors bg-blue-100 text-blue-700 hover:bg-blue-200"
                            title="Move profile to another requirement"
                          >
                            Move
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Move Profile Modal */}
      {showMoveModal && movingProfile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                Move Profile: {movingProfile.candidate_name}
              </h2>
              <button
                onClick={handleMoveCancel}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="space-y-6">
                {/* Profile Info */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Profile Details</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Name:</span>
                      <p className="font-medium">{movingProfile.candidate_name}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Student ID:</span>
                      <p className="font-medium">{movingProfile.student_id}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Email:</span>
                      <p className="font-medium">{movingProfile.email_id || movingProfile.candidate_email}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Current Company:</span>
                      <p className="font-medium">{movingProfile.current_company || '-'}</p>
                    </div>
                  </div>
                </div>

                {/* Current Requirement */}
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Current Requirement</h3>
                  <div className="text-sm">
                    <span className="text-gray-500">From:</span>
                    <p className="font-medium">{requestId} - {requirement?.job_title}</p>
                    <p className="text-gray-600">{requirement?.company_name}</p>
                  </div>
                </div>

                {/* Target Requirement Selection */}
                <div>
                  <label htmlFor="targetRequirement" className="block text-sm font-medium text-gray-700 mb-2">
                    Select Target Requirement *
                  </label>
                  <select
                    id="targetRequirement"
                    value={selectedTargetRequirement}
                    onChange={(e) => setSelectedTargetRequirement(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Choose a requirement...</option>
                    {availableRequirements.map((req) => (
                      <option key={req.request_id} value={req.request_id}>
                        {req.request_id} - {req.job_title} ({req.company_name})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Reason */}
                <div>
                  <label htmlFor="moveReason" className="block text-sm font-medium text-gray-700 mb-2">
                    Reason for Moving (Optional)
                  </label>
                  <textarea
                    id="moveReason"
                    value={moveReason}
                    onChange={(e) => setMoveReason(e.target.value)}
                    rows={3}
                    placeholder="Enter reason for moving this profile..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Warning */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-yellow-800">
                        Important: Profile Movement Effects
                      </h3>
                      <div className="mt-2 text-sm text-yellow-700">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Profile will be moved to the selected requirement</li>
                          <li>Workflow progress will be reset to initial stage</li>
                          <li>Any existing meetings will be cancelled</li>
                          <li>All assigned recruiters will be notified</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Error Message */}
                {moveError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">Error</h3>
                        <div className="mt-2 text-sm text-red-700">
                          <p>{moveError}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={handleMoveCancel}
                disabled={moveLoading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleMoveConfirm}
                disabled={moveLoading || !selectedTargetRequirement}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {moveLoading ? (
                  <div className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Moving...
                  </div>
                ) : (
                  'Move Profile'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Job Description Modal */}
      {requirement && (
        <JobDescriptionModal
          isOpen={showViewJDModal}
          onClose={() => setShowViewJDModal(false)}
          jobTitle={requirement.job_title}
          companyName={requirement.company_name || 'Unknown Company'}
          fileName={requirement.job_file_name || 'Job Description'}
          filePath={requirement.jd_path || ''}
        />
      )}
    </div>
  );
} 