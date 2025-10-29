'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/services/api';
import { getStatusDisplayName } from '@/utils/statusFormatter';
import JobDescriptionModal from '@/components/JobDescriptionModal';

interface Profile {
  id?: string;
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

  created_at: string;
  updated_at: string;
  resume_file_path?: string;
  resume_file_name?: string;
  resume_file?: File; // For file upload during creation
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

type WorkflowStep = 'candidate_submission' | 'submitted_profiles' | 'screening' | 'interview_scheduled' | 'interview_round_1' | 'interview_round_2' | 'offered' | 'onboarding';

// Utility function to safely check if a value is in a Set
// Prevents "s.has is not a function" errors when Sets are accidentally converted to arrays
const safeHas = (set: Set<string> | any, value: string): boolean => {
  if (!set) return false;
  if (set instanceof Set) return set.has(value);
  if (Array.isArray(set)) return set.includes(value);
  return false;
};

// Utility function to safely convert arrays to Sets
const ensureSet = (value: any): Set<string> => {
  if (value instanceof Set) return value;
  if (Array.isArray(value)) return new Set(value);
  return new Set();
};

export default function RecruiterWorkflowPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params.requestId as string;
  
  // Get current user role for admin access
  const [currentUser, setCurrentUser] = useState<{ role: 'admin' | 'recruiter'; user_id?: string; username?: string } | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('candidate_submission');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [requirement, setRequirement] = useState<Requirement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(new Set());
  const [rejectedProfiles, setRejectedProfiles] = useState<Set<string>>(new Set());
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [workflowStateLoaded, setWorkflowStateLoaded] = useState(false);
  
  // Workflow step states
  const [screeningSelected, setScreeningSelected] = useState<Set<string>>(new Set());
  const [screeningRejected, setScreeningRejected] = useState<Set<string>>(new Set());
  const [interviewScheduled, setInterviewScheduled] = useState<Set<string>>(new Set());
  const [interviewRescheduled, setInterviewRescheduled] = useState<Set<string>>(new Set());
  const [round1Selected, setRound1Selected] = useState<Set<string>>(new Set());
  const [round1Rejected, setRound1Rejected] = useState<Set<string>>(new Set());
  const [round1Rescheduled, setRound1Rescheduled] = useState<Set<string>>(new Set());
  const [round2Selected, setRound2Selected] = useState<Set<string>>(new Set());
  const [round2Rejected, setRound2Rejected] = useState<Set<string>>(new Set());
  const [round2Rescheduled, setRound2Rescheduled] = useState<Set<string>>(new Set());
  const [offered, setOffered] = useState<Set<string>>(new Set());
  const [onboarding, setOnboarding] = useState<Set<string>>(new Set());
  
  // View JD Modal state
  const [showViewJDModal, setShowViewJDModal] = useState(false);
  
  // Step timestamps tracking
  const [stepTimestamps, setStepTimestamps] = useState<{[key: string]: {[studentId: string]: string}}>({
    screening_selected: {},
    screening_rejected: {},
    interview_scheduled: {},
    interview_rescheduled: {},
    round1_selected: {},
    round1_rejected: {},
    round1_rescheduled: {},
    round2_selected: {},
    round2_rejected: {},
    round2_rescheduled: {},
    offered: {},
    onboarding: {}
  });
  
  // Blocked profiles state for action button blocking
  const [blockedProfiles, setBlockedProfiles] = useState<{[key: string]: Set<string>}>({
    screening: new Set(),
    interview_scheduled: new Set(),
    interview_round_1: new Set(),
    interview_round_2: new Set(),
    offered: new Set(),
    onboarding: new Set()
  });
  
  // Editable table state
  const [tableData, setTableData] = useState<Profile[]>([]);
  const [editingCell, setEditingCell] = useState<{rowIndex: number, columnId: string} | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sending, setSending] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showColumnSelectionModal, setShowColumnSelectionModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [emailData, setEmailData] = useState({
    recipient_email: '',
    recipient_name: '',
    cc_email: '',
    subject: ''
  });
  const [emailAttachments, setEmailAttachments] = useState<File[]>([]);
  
  // Profile movement state
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movingProfile, setMovingProfile] = useState<Profile | null>(null);
  const [availableRequirements, setAvailableRequirements] = useState<any[]>([]);
  const [selectedTargetRequirement, setSelectedTargetRequirement] = useState<string>('');
  const [moveReason, setMoveReason] = useState<string>('');
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  
  // Available columns for selection
  const availableColumns = [
    { id: 'candidate_name', label: 'Candidate Name', required: true },
    { id: 'contact_no', label: 'Contact Number', required: false },
    { id: 'email_id', label: 'Email Address', required: false },
    { id: 'total_experience', label: 'Total Experience (Yrs)', required: false },
    { id: 'relevant_experience', label: 'Relevant Experience (Yrs)', required: false },
    { id: 'current_company', label: 'Current Company', required: false },
    { id: 'location', label: 'Location', required: false },
    { id: 'ctc_current', label: 'Current CTC (LPA)', required: false },
    { id: 'ctc_expected', label: 'Expected CTC (LPA)', required: false },
    { id: 'notice_period_days', label: 'Notice Period (Days)', required: false },
    { id: 'key_skills', label: 'Key Skills', required: false },
    { id: 'education', label: 'Education', required: false },
    { id: 'source', label: 'Source', required: false }
  ];
  
  const [selectedColumns, setSelectedColumns] = useState<string[]>(['candidate_name', 'contact_no', 'total_experience', 'relevant_experience', 'current_company', 'location', 'ctc_current', 'ctc_expected', 'key_skills']);
  const [selectedProfilesForEmail, setSelectedProfilesForEmail] = useState<Set<string>>(new Set());
  
  // Interview email states
  const [showInterviewEmailModal, setShowInterviewEmailModal] = useState(false);
  const [showTeamsMeetingModal, setShowTeamsMeetingModal] = useState(false);
  const [showInterviewEmailForm, setShowInterviewEmailForm] = useState(false);
  const [creatingMeeting, setCreatingMeeting] = useState(false);
  const [sendingInterviewEmail, setSendingInterviewEmail] = useState(false);
  const [teamsMeetingData, setTeamsMeetingData] = useState({
    subject: '',
    start_time: '',
    end_time: '',
    attendees: [] as string[],
    meeting_type: 'interview_scheduled'
  });
  const [interviewEmailData, setInterviewEmailData] = useState({
    recipient_email: '',
    recipient_name: '',
    cc_email: '',
    subject: '',
    body: ''
  });
  const [interviewEmailAttachments, setInterviewEmailAttachments] = useState<File[]>([]);
  const [teamsMeetingLink, setTeamsMeetingLink] = useState('');
  const [currentInterviewStep, setCurrentInterviewStep] = useState<'interview_scheduled' | 'interview_round_1' | 'interview_round_2'>('interview_scheduled');
  
  // Meet link states
  const [meetLinks, setMeetLinks] = useState<{[key: string]: any}>({});
  const [loadingMeetLinks, setLoadingMeetLinks] = useState(false);
  
  // Removed completed steps tracking - all steps are now accessible

  // Track newly added profiles that should remain accessible in previous steps
  const [newlyAddedProfiles, setNewlyAddedProfiles] = useState<Set<string>>(new Set());
  const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now());

  // Helper function to check if a profile is newly added in this session
  const isNewlyAddedProfile = (profile: Profile): boolean => {
    // Check if profile was created after session start
    if (profile.created_at) {
      const profileCreatedTime = new Date(profile.created_at).getTime();
      return profileCreatedTime >= sessionStartTime;
    }
    // Fallback: check if it's in our newly added set
    return newlyAddedProfiles.has(profile.student_id);
  };

  // Helper function to check if a profile should be accessible in a completed step
  const isProfileAccessibleInCompletedStep = (profile: Profile, step: WorkflowStep): boolean => {
    // All profiles are now accessible in all steps
    return true;
  };

  // Helper function to check if a profile's action should be blocked for a specific step
  const isProfileActionBlocked = (profile: Profile, step: WorkflowStep): boolean => {
    // Only apply blocking for recruiters and from step 3 (screening) onwards
    if (currentUser?.role !== 'recruiter') {
      return false;
    }
    
    // No blocking for steps before screening
    if (step === 'candidate_submission' || step === 'submitted_profiles') {
      return false;
    }
    
    // Check if this profile is in the blocked list for this step
    // The blockedProfiles[step] contains profiles that have progressed beyond this step
    return blockedProfiles[step]?.has(profile.student_id) || false;
  };

  // Helper function to check if a step is accessible - now always returns true
  const isStepAccessible = (step: WorkflowStep): boolean => {
    // All steps are now accessible
    return true;
  };

  // Helper function to check if a step is completed - now always returns false
  const isStepCompleted = (step: WorkflowStep): boolean => {
    // No steps are considered completed for visual purposes
    return false;
  };

  // Helper functions for validation
  const isValidEmail = (email: string): boolean => {
    if (!email || !email.trim()) return true; // Empty is valid (optional field)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  const isValidPhone = (phone: string): boolean => {
    if (!phone || !phone.trim()) return true; // Empty is valid (optional field)
    const phoneRegex = /^[\+]?[1-9][\d]{9}$/; // Exactly 10 digits (with optional +)
    const cleanedPhone = phone.replace(/[\s\-\(\)]/g, '');
    return phoneRegex.test(cleanedPhone);
  };

  useEffect(() => {
    // Get current user from localStorage
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setCurrentUser(userData);
        setUserLoaded(true);
      } catch (error) {
        console.error('Error parsing user data:', error);
        setUserLoaded(true);
      }
    } else {
      setUserLoaded(true);
    }
  }, []);

  // Start SLA tracking when workflow page loads
  useEffect(() => {
    if (userLoaded && requestId) {
      const startSLATracking = async () => {
        try {
          // Use the api helper for SLA auto-start
          const response = await api.post(`/sla/tracking/auto-start/${requestId}`, {});
          
          if (response) {
            console.log('SLA tracking auto-started for workflow:', response);
          }
        } catch (error) {
          // Silently handle error - SLA auto-start is optional
          console.warn('SLA tracking auto-start skipped:', error);
        }
      };
      
      startSLATracking();
    }
  }, [userLoaded, requestId]);

  useEffect(() => {
    if (requestId) {
      fetchWorkflowData();
    }
  }, [requestId]);

  // Fetch meet links when step changes to interview steps
  useEffect(() => {
    if (requestId && ['interview_scheduled', 'interview_round_1', 'interview_round_2'].includes(currentStep)) {
      fetchMeetLinks(currentStep);
    }
  }, [requestId, currentStep]);



  // Save workflow state whenever currentStep, onboarding, or newlyAddedProfiles changes, but only after workflow state is loaded
  useEffect(() => {
    if (requestId && workflowStateLoaded) {
      saveWorkflowState().catch(error => {
        console.error('Error saving workflow state:', error);
      });
    }
  }, [currentStep, onboarding, newlyAddedProfiles, requestId, workflowStateLoaded]);

  // Recalculate blocked profiles whenever workflow state changes
  useEffect(() => {
    if (requestId && workflowStateLoaded) {
      // Recalculate blocked profiles based on current workflow state
      const recalculateBlockedProfiles = async () => {
        try {
          const response = await api.get(`/workflow-progress/${requestId}`);
          if (response && response.success && response.data && response.data.blocked_profiles) {
            const blockedProfilesData: {[key: string]: Set<string>} = {};
            Object.keys(response.data.blocked_profiles).forEach(step => {
              blockedProfilesData[step] = new Set(response.data.blocked_profiles[step] || []);
            });
            setBlockedProfiles(blockedProfilesData);
            console.log('Blocked profiles recalculated:', blockedProfilesData);
          }
        } catch (error) {
          console.error('Error recalculating blocked profiles:', error);
        }
      };
      
      recalculateBlockedProfiles();
    }
  }, [
    screeningSelected, screeningRejected, 
    interviewScheduled, interviewRescheduled,
    round1Selected, round1Rejected, round1Rescheduled,
    round2Selected, round2Rejected, round2Rescheduled,
    offered, onboarding,
    requestId, workflowStateLoaded
  ]);

  // Function to update tracker status based on workflow step
  const updateTrackerStatusForStep = async (step: WorkflowStep) => {
    let status = '';
    switch (step) {
      case 'screening':
        status = 'Candidate Submission';
        break;
      case 'interview_scheduled':
      case 'interview_round_1':
      case 'interview_round_2':
        status = 'Interview Scheduled';
        break;
      case 'offered':
        status = 'Offer Recommendation';
        break;
      case 'onboarding':
        status = 'On boarding';
        break;
      default:
        return; // Don't update for other steps
    }
    
    if (status && requirement?.status !== status) {
      await updateRequirementStatus(status);
    }
  };

  // Function to complete SLA tracking for a workflow step
  const completeSLAStep = async (stepName: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://20.188.122.171:1976/api'}/sla/tracking/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request_id: requestId,
          step_name: stepName,
          completion_time: new Date().toISOString()
        })
      });
      
      if (response.ok) {
        console.log(`SLA tracking completed for step: ${stepName}`);
      } else {
        console.error(`Failed to complete SLA tracking for step: ${stepName}`);
      }
    } catch (error) {
      console.error(`Error completing SLA tracking for step ${stepName}:`, error);
    }
  };

  // Helper function to calculate profile counts for each step
  const getStepProfileCounts = () => {
    return {
      candidate_submission: newlyAddedProfiles.size,
      submitted_profiles: profiles.length,
      screening: screeningSelected.size + screeningRejected.size,
      interview_scheduled: interviewScheduled.size + interviewRescheduled.size,
      interview_round_1: round1Selected.size + round1Rejected.size + round1Rescheduled.size,
      interview_round_2: round2Selected.size + round2Rejected.size + round2Rescheduled.size,
      offered: offered.size,
      onboarding: onboarding.size
    };
  };

  // Helper functions for localStorage persistence
  const saveWorkflowState = async () => {
    const workflowData = {
      screening_selected: Array.from(screeningSelected),
      screening_rejected: Array.from(screeningRejected),
      interview_scheduled: Array.from(interviewScheduled),
      interview_rescheduled: Array.from(interviewRescheduled),
      round1_selected: Array.from(round1Selected),
      round1_rejected: Array.from(round1Rejected),
      round1_rescheduled: Array.from(round1Rescheduled),
      round2_selected: Array.from(round2Selected),
      round2_rejected: Array.from(round2Rejected),
      round2_rescheduled: Array.from(round2Rescheduled),
      offered: Array.from(offered),
      onboarding: Array.from(onboarding),
      current_step: currentStep,
      newly_added_profiles: Array.from(newlyAddedProfiles),
      session_start_time: sessionStartTime,
      last_updated: new Date().toISOString(),
      blocked_profiles: Object.keys(blockedProfiles).reduce((acc, step) => {
        acc[step] = Array.from(blockedProfiles[step]);
        return acc;
      }, {} as {[key: string]: string[]}),
      step_timestamps: stepTimestamps
    };
    
    try {
      // PRIMARY: Save to backend first
      await api.post(`/workflow-progress/${requestId}`, workflowData);
      console.log('Workflow state saved to backend successfully');
    } catch (error) {
      console.error('Backend save failed, using localStorage backup:', error);
      // FALLBACK: Save to localStorage if backend fails
      try {
        localStorage.setItem(`workflow_${requestId}`, JSON.stringify(workflowData));
        console.log('Workflow state saved to localStorage backup');
      } catch (localStorageError) {
        console.error('Both backend and localStorage save failed:', localStorageError);
      }
    }
  };

  const loadWorkflowState = async () => {
    try {
      // PRIMARY: Try to load from backend first
      const response = await api.get(`/workflow-progress/${requestId}`);
      if (response && response.success && response.data) {
        console.log('Workflow state loaded from backend');
        // Set all workflow states from backend data using ensureSet for safety
        setScreeningSelected(ensureSet(response.data.screening_selected));
        setScreeningRejected(ensureSet(response.data.screening_rejected));
        setInterviewScheduled(ensureSet(response.data.interview_scheduled));
        setInterviewRescheduled(ensureSet(response.data.interview_rescheduled));
        setRound1Selected(ensureSet(response.data.round1_selected));
        setRound1Rejected(ensureSet(response.data.round1_rejected));
        setRound1Rescheduled(ensureSet(response.data.round1_rescheduled));
        setRound2Selected(ensureSet(response.data.round2_selected));
        setRound2Rejected(ensureSet(response.data.round2_rejected));
        setRound2Rescheduled(ensureSet(response.data.round2_rescheduled));
        setOffered(ensureSet(response.data.offered));
        setOnboarding(ensureSet(response.data.onboarding));
        setNewlyAddedProfiles(ensureSet(response.data.newly_added_profiles));
        setSessionStartTime(response.data.session_start_time || Date.now());
        
        // Load blocked profiles information
        if (response.data.blocked_profiles) {
          const blockedProfilesData: {[key: string]: Set<string>} = {};
          Object.keys(response.data.blocked_profiles).forEach(step => {
            blockedProfilesData[step] = ensureSet(response.data.blocked_profiles[step]);
          });
          setBlockedProfiles(blockedProfilesData);
        }
        
        // Load step timestamps
        if (response.data.step_timestamps) {
          setStepTimestamps(response.data.step_timestamps);
        }
        
        return response.data.current_step;
      }
    } catch (error) {
      console.log('Backend load failed, trying localStorage backup:', error);
      // FALLBACK: Load from localStorage if backend fails
      return loadFromLocalStorage();
    }
    return null;
  };

  const loadFromLocalStorage = () => {
    try {
      const savedState = localStorage.getItem(`workflow_${requestId}`);
      if (savedState) {
        const workflowState = JSON.parse(savedState);
        console.log('Workflow state loaded from localStorage backup');
        
        // Validate and set all workflow states using ensureSet for safety
        setScreeningSelected(ensureSet(workflowState.screening_selected));
        setScreeningRejected(ensureSet(workflowState.screening_rejected));
        setInterviewScheduled(ensureSet(workflowState.interview_scheduled));
        setInterviewRescheduled(ensureSet(workflowState.interview_rescheduled));
        setRound1Selected(ensureSet(workflowState.round1_selected));
        setRound1Rejected(ensureSet(workflowState.round1_rejected));
        setRound1Rescheduled(ensureSet(workflowState.round1_rescheduled));
        setRound2Selected(ensureSet(workflowState.round2_selected));
        setRound2Rejected(ensureSet(workflowState.round2_rejected));
        setRound2Rescheduled(ensureSet(workflowState.round2_rescheduled));
        setOffered(ensureSet(workflowState.offered));
        setOnboarding(ensureSet(workflowState.onboarding));
        setNewlyAddedProfiles(ensureSet(workflowState.newly_added_profiles));
        setSessionStartTime(workflowState.session_start_time || Date.now());
        
        // Load blocked profiles from localStorage if available
        if (workflowState.blocked_profiles) {
          const blockedProfilesData: {[key: string]: Set<string>} = {};
          Object.keys(workflowState.blocked_profiles).forEach(step => {
            blockedProfilesData[step] = ensureSet(workflowState.blocked_profiles[step]);
          });
          setBlockedProfiles(blockedProfilesData);
        }
        
        // Load step timestamps from localStorage if available
        if (workflowState.step_timestamps) {
          setStepTimestamps(workflowState.step_timestamps);
        }
        
        return workflowState.current_step;
      }
    } catch (error) {
      console.error('Error loading workflow state from localStorage:', error);
      // Clear corrupted data
      localStorage.removeItem(`workflow_${requestId}`);
    }
    return null;
  };

  const fetchWorkflowData = async () => {
    try {
      setLoading(true);
      
      const [profilesResponse, requirementResponse, workflowResponse] = await Promise.all([
        api.get(`/tracker/${requestId}/profiles`),
        api.get(`/tracker/${requestId}`),
        api.get(`/workflow-progress/${requestId}`)
      ]);
      
      // The custom api object returns parsed JSON directly, not axios response
      const profiles = profilesResponse?.profiles || [];
      const requirement = requirementResponse || null;
      const workflowData = workflowResponse?.success ? workflowResponse.data : null;
      
      // Check if requirement is on hold and user is a recruiter
      if (requirement?.status === 'On Hold' && currentUser?.role === 'recruiter') {
        setError('This requirement is currently on hold. Only administrators can access on-hold requirements.');
        setLoading(false);
        return;
      }
      
      setProfiles(profiles);
      setRequirement(requirement);
      
      // Load workflow state from new API using ensureSet for safety
      if (workflowData) {
        setScreeningSelected(ensureSet(workflowData.screening_selected));
        setScreeningRejected(ensureSet(workflowData.screening_rejected));
        setInterviewScheduled(ensureSet(workflowData.interview_scheduled));
        setInterviewRescheduled(ensureSet(workflowData.interview_rescheduled));
        setRound1Selected(ensureSet(workflowData.round1_selected));
        setRound1Rejected(ensureSet(workflowData.round1_rejected));
        setRound1Rescheduled(ensureSet(workflowData.round1_rescheduled));
        setRound2Selected(ensureSet(workflowData.round2_selected));
        setRound2Rejected(ensureSet(workflowData.round2_rejected));
        setRound2Rescheduled(ensureSet(workflowData.round2_rescheduled));
        setOffered(ensureSet(workflowData.offered));
        setOnboarding(ensureSet(workflowData.onboarding));
        setCurrentStep(workflowData.current_step || 'candidate_submission');
        setNewlyAddedProfiles(ensureSet(workflowData.newly_added_profiles));
        setSessionStartTime(workflowData.session_start_time || Date.now());
        setStepTimestamps(workflowData.step_timestamps || {});
        
        // Ensure blocked profiles are Sets
        const blockedProfilesData = workflowData.blocked_profiles || {};
        setBlockedProfiles({
          screening: ensureSet(blockedProfilesData.screening),
          interview_scheduled: ensureSet(blockedProfilesData.interview_scheduled),
          interview_round_1: ensureSet(blockedProfilesData.interview_round_1),
          interview_round_2: ensureSet(blockedProfilesData.interview_round_2),
          offered: ensureSet(blockedProfilesData.offered),
          onboarding: ensureSet(blockedProfilesData.onboarding)
        });
      } else {
        // Fallback to localStorage if API fails
        const localStorageData = loadFromLocalStorage();
        if (localStorageData) {
          setScreeningSelected(ensureSet(localStorageData.screening_selected));
          setScreeningRejected(ensureSet(localStorageData.screening_rejected));
          setInterviewScheduled(ensureSet(localStorageData.interview_scheduled));
          setInterviewRescheduled(ensureSet(localStorageData.interview_rescheduled));
          setRound1Selected(ensureSet(localStorageData.round1_selected));
          setRound1Rejected(ensureSet(localStorageData.round1_rejected));
          setRound1Rescheduled(ensureSet(localStorageData.round1_rescheduled));
          setRound2Selected(ensureSet(localStorageData.round2_selected));
          setRound2Rejected(ensureSet(localStorageData.round2_rejected));
          setRound2Rescheduled(ensureSet(localStorageData.round2_rescheduled));
          setOffered(ensureSet(localStorageData.offered));
          setOnboarding(ensureSet(localStorageData.onboarding));
          setCurrentStep(localStorageData.current_step);
          setNewlyAddedProfiles(ensureSet(localStorageData.newly_added_profiles));
          setSessionStartTime(localStorageData.session_start_time);
          setStepTimestamps(localStorageData.step_timestamps || {});
          
          // Ensure blocked profiles are Sets
          const blockedProfilesData = localStorageData.blocked_profiles || {};
          setBlockedProfiles({
            screening: ensureSet(blockedProfilesData.screening),
            interview_scheduled: ensureSet(blockedProfilesData.interview_scheduled),
            interview_round_1: ensureSet(blockedProfilesData.interview_round_1),
            interview_round_2: ensureSet(blockedProfilesData.interview_round_2),
            offered: ensureSet(blockedProfilesData.offered),
            onboarding: ensureSet(blockedProfilesData.onboarding)
          });
        }
      }
      
      // Determine the correct workflow step based on profiles and requirement status
      if (profiles && profiles.length > 0) {
        if (workflowData && workflowData.current_step) {
          setCurrentStep(workflowData.current_step);
        } else if (requirement?.status) {
          // Fall back to database status if no workflow data
          switch (requirement.status) {
            case 'Candidate Submission':
              setCurrentStep('submitted_profiles');
              break;
            case 'Interview Scheduled':
              setCurrentStep('interview_scheduled');
              break;
            case 'Offer Recommendation':
              setCurrentStep('offered');
              break;
            case 'On boarding':
              setCurrentStep('onboarding');
              break;
            default:
              setCurrentStep('submitted_profiles');
              break;
          }
        } else {
          setCurrentStep('submitted_profiles');
        }
      } else {
        setCurrentStep('candidate_submission');
      }
      
      // Mark initial load as complete
      setIsInitialLoad(false);
      
      // Mark workflow state as loaded after all data is processed
      setWorkflowStateLoaded(true);
    } catch (err) {
      setError('Failed to fetch workflow data');
      console.error('Error fetching workflow data:', err);
      // Set empty arrays/objects on error to prevent further issues
      setProfiles([]);
      setRequirement(null);
      setWorkflowStateLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProfile = (studentId: string) => {
    if (selectedProfiles.has(studentId)) {
      // If already selected, remove from selection (undo)
      setSelectedProfiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
    } else {
      // If not selected, add to selection and remove from rejected
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
    }
  };

  const handleRejectProfile = (studentId: string) => {
    if (rejectedProfiles.has(studentId)) {
      // If already rejected, remove from rejection (undo)
      setRejectedProfiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
    } else {
      // If not rejected, add to rejection and remove from selected
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
    }
  };

  // Workflow step handlers
  const handleScreeningSelect = async (studentId: string) => {
    if (screeningSelected.has(studentId)) {
      // If already selected, remove from selection (undo)
      setScreeningSelected(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      removeStepTimestamp(studentId, 'screening_selected');
    } else {
      // If not selected, add to selection and remove from rejected
      setScreeningSelected(prev => {
        const newSet = new Set(prev);
        newSet.add(studentId);
        return newSet;
      });
      setScreeningRejected(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      
      // Update API
      try {
        await api.post('/workflow-step', {
          request_id: requestId,
          step: 'screening',
          profile_ids: [studentId],
          status: 'selected',
          user_id: currentUser?.user_id
        });
      } catch (error) {
        console.error('Failed to update screening status:', error);
      }
      
      updateStepTimestamp(studentId, 'screening_selected');
      removeStepTimestamp(studentId, 'screening_rejected');
    }
    // Save state after a short delay to ensure state is updated
    setTimeout(() => {
      saveWorkflowState().catch(error => {
        console.error('Error saving workflow state:', error);
      });
    }, 100);
  };

  const handleScreeningReject = async (studentId: string) => {
    if (screeningRejected.has(studentId)) {
      // If already rejected, remove from rejection (undo)
      setScreeningRejected(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      removeStepTimestamp(studentId, 'screening_rejected');
    } else {
      // If not rejected, add to rejection and remove from selected
      setScreeningRejected(prev => {
        const newSet = new Set(prev);
        newSet.add(studentId);
        return newSet;
      });
      setScreeningSelected(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      
      // Update API
      try {
        await api.post('/workflow-step', {
          request_id: requestId,
          step: 'screening',
          profile_ids: [studentId],
          status: 'rejected',
          user_id: currentUser?.user_id
        });
      } catch (error) {
        console.error('Failed to update screening status:', error);
      }
      
      updateStepTimestamp(studentId, 'screening_rejected');
      removeStepTimestamp(studentId, 'screening_selected');
    }
  };

  const handleInterviewScheduled = async (studentId: string) => {
    if (interviewScheduled.has(studentId)) {
      // If already scheduled, remove from scheduled (undo)
      setInterviewScheduled(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      removeStepTimestamp(studentId, 'interview_scheduled');
    } else {
      // If not scheduled, add to scheduled and remove from rescheduled
      setInterviewScheduled(prev => {
        const newSet = new Set(prev);
        newSet.add(studentId);
        return newSet;
      });
      setInterviewRescheduled(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      
      // Update API
      try {
        await api.post('/workflow-step', {
          request_id: requestId,
          step: 'interview_scheduled',
          profile_ids: [studentId],
          status: 'scheduled',
          user_id: currentUser?.user_id
        });
      } catch (error) {
        console.error('Failed to update interview scheduled status:', error);
      }
      
      updateStepTimestamp(studentId, 'interview_scheduled');
      removeStepTimestamp(studentId, 'interview_rescheduled');
    }
    // Save state after a short delay to ensure state is updated
    setTimeout(() => {
      saveWorkflowState().catch(error => {
        console.error('Error saving workflow state:', error);
      });
    }, 100);
  };

  const handleRound1Select = async (studentId: string) => {
    if (round1Selected.has(studentId)) {
      // If already selected, remove from selection (undo)
      setRound1Selected(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      removeStepTimestamp(studentId, 'round1_selected');
    } else {
      // If not selected, add to selection and remove from rejected and rescheduled
      setRound1Selected(prev => {
        const newSet = new Set(prev);
        newSet.add(studentId);
        return newSet;
      });
      setRound1Rejected(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      setRound1Rescheduled(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      
      // Update API
      try {
        await api.post('/workflow-step', {
          request_id: requestId,
          step: 'interview_round_1',
          profile_ids: [studentId],
          status: 'select',
          user_id: currentUser?.user_id
        });
      } catch (error) {
        console.error('Failed to update round 1 status:', error);
      }
      
      updateStepTimestamp(studentId, 'round1_selected');
      removeStepTimestamp(studentId, 'round1_rejected');
      removeStepTimestamp(studentId, 'round1_rescheduled');
    }
  };

  const handleRound1Reject = async (studentId: string) => {
    if (round1Rejected.has(studentId)) {
      // If already rejected, remove from rejection (undo)
      setRound1Rejected(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      removeStepTimestamp(studentId, 'round1_rejected');
    } else {
      // If not rejected, add to rejection and remove from selected and rescheduled
      setRound1Rejected(prev => {
        const newSet = new Set(prev);
        newSet.add(studentId);
        return newSet;
      });
      setRound1Selected(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      setRound1Rescheduled(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      
      // Update API
      try {
        await api.post('/workflow-step', {
          request_id: requestId,
          step: 'interview_round_1',
          profile_ids: [studentId],
          status: 'reject',
          user_id: currentUser?.user_id
        });
      } catch (error) {
        console.error('Failed to update round 1 status:', error);
      }
      
      updateStepTimestamp(studentId, 'round1_rejected');
      removeStepTimestamp(studentId, 'round1_selected');
      removeStepTimestamp(studentId, 'round1_rescheduled');
    }
  };

  const handleRound2Select = async (studentId: string) => {
    if (round2Selected.has(studentId)) {
      // If already selected, remove from selection (undo)
      setRound2Selected(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      removeStepTimestamp(studentId, 'round2_selected');
    } else {
      // If not selected, add to selection and remove from rejected and rescheduled
      setRound2Selected(prev => {
        const newSet = new Set(prev);
        newSet.add(studentId);
        return newSet;
      });
      setRound2Rejected(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      setRound2Rescheduled(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      
      // Update API
      try {
        await api.post('/workflow-step', {
          request_id: requestId,
          step: 'interview_round_2',
          profile_ids: [studentId],
          status: 'select',
          user_id: currentUser?.user_id
        });
      } catch (error) {
        console.error('Failed to update round 2 status:', error);
      }
      
      updateStepTimestamp(studentId, 'round2_selected');
      removeStepTimestamp(studentId, 'round2_rejected');
      removeStepTimestamp(studentId, 'round2_rescheduled');
    }
  };

  const handleRound2Reject = async (studentId: string) => {
    if (round2Rejected.has(studentId)) {
      // If already rejected, remove from rejection (undo)
      setRound2Rejected(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      removeStepTimestamp(studentId, 'round2_rejected');
    } else {
      // If not rejected, add to rejection and remove from selected and rescheduled
      setRound2Rejected(prev => {
        const newSet = new Set(prev);
        newSet.add(studentId);
        return newSet;
      });
      setRound2Selected(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      setRound2Rescheduled(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      
      // Update API
      try {
        await api.post('/workflow-step', {
          request_id: requestId,
          step: 'interview_round_2',
          profile_ids: [studentId],
          status: 'reject',
          user_id: currentUser?.user_id
        });
      } catch (error) {
        console.error('Failed to update round 2 status:', error);
      }
      
      updateStepTimestamp(studentId, 'round2_rejected');
      removeStepTimestamp(studentId, 'round2_selected');
      removeStepTimestamp(studentId, 'round2_rescheduled');
    }
  };

  // Re-scheduled handlers
  const handleInterviewRescheduled = (studentId: string) => {
    if (interviewRescheduled.has(studentId)) {
      // If already rescheduled, remove from rescheduled (undo)
      setInterviewRescheduled(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      removeStepTimestamp(studentId, 'interview_rescheduled');
    } else {
      // If not rescheduled, add to rescheduled and remove from scheduled
      setInterviewRescheduled(prev => {
        const newSet = new Set(prev);
        newSet.add(studentId);
        return newSet;
      });
      setInterviewScheduled(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      updateStepTimestamp(studentId, 'interview_rescheduled');
      removeStepTimestamp(studentId, 'interview_scheduled');
    }
    // Save state after a short delay to ensure state is updated
    setTimeout(() => {
      saveWorkflowState().catch(error => {
        console.error('Error saving workflow state:', error);
      });
    }, 100);
  };

  const handleRound1Rescheduled = (studentId: string) => {
    if (round1Rescheduled.has(studentId)) {
      // If already rescheduled, remove from rescheduled (undo)
      setRound1Rescheduled(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      removeStepTimestamp(studentId, 'round1_rescheduled');
    } else {
      // If not rescheduled, add to rescheduled and remove from selected
      setRound1Rescheduled(prev => {
        const newSet = new Set(prev);
        newSet.add(studentId);
        return newSet;
      });
      setRound1Selected(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      updateStepTimestamp(studentId, 'round1_rescheduled');
      removeStepTimestamp(studentId, 'round1_selected');
    }
    // Save state after a short delay to ensure state is updated
    setTimeout(() => {
      saveWorkflowState().catch(error => {
        console.error('Error saving workflow state:', error);
      });
    }, 100);
  };

  const handleRound2Rescheduled = (studentId: string) => {
    if (round2Rescheduled.has(studentId)) {
      // If already rescheduled, remove from rescheduled (undo)
      setRound2Rescheduled(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      removeStepTimestamp(studentId, 'round2_rescheduled');
    } else {
      // If not rescheduled, add to rescheduled and remove from selected
      setRound2Rescheduled(prev => {
        const newSet = new Set(prev);
        newSet.add(studentId);
        return newSet;
      });
      setRound2Selected(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      updateStepTimestamp(studentId, 'round2_rescheduled');
      removeStepTimestamp(studentId, 'round2_selected');
    }
    // Save state after a short delay to ensure state is updated
    setTimeout(saveWorkflowState, 100);
  };

  const handleOffered = async (studentId: string) => {
    if (offered.has(studentId)) {
      // If already offered, remove from offered (undo)
      setOffered(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      removeStepTimestamp(studentId, 'offered');
    } else {
      // If not offered, add to offered
      setOffered(prev => {
        const newSet = new Set(prev);
        newSet.add(studentId);
        return newSet;
      });
      
      // Update API
      try {
        await api.post('/workflow-step', {
          request_id: requestId,
          step: 'offered',
          profile_ids: [studentId],
          status: 'offered',
          user_id: currentUser?.user_id
        });
      } catch (error) {
        console.error('Failed to update offered status:', error);
      }
      
      updateStepTimestamp(studentId, 'offered');
    }
  };

  const saveOnboardingStatus = async (onboardedIds: string[]) => {
    try {
      // Save to both endpoints for consistency
      await Promise.all([
        api.post('/tracker/onboarding-status', {
          request_id: requestId,
          onboarded_student_ids: onboardedIds
        }),
        // Also update the workflow progress to keep it in sync
        saveWorkflowState()
      ]);
    } catch (error) {
      console.error('Error saving onboarding status:', error);
      // Still try to save workflow state even if onboarding status fails
      try {
        await saveWorkflowState();
      } catch (workflowError) {
        console.error('Error saving workflow state:', workflowError);
      }
    }
  };

  const handleOnboarding = async (studentId: string) => {
    if (onboarding.has(studentId)) {
      // If already onboarding, remove from onboarding (undo)
      setOnboarding(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      removeStepTimestamp(studentId, 'onboarding');
    } else {
      // If not onboarding, add to onboarding
      setOnboarding(prev => {
        const newSet = new Set(prev);
        newSet.add(studentId);
        return newSet;
      });
      
      // Update API
      try {
        await api.post('/workflow-step', {
          request_id: requestId,
          step: 'onboarding',
          profile_ids: [studentId],
          status: 'onboarded',
          user_id: currentUser?.user_id
        });
      } catch (error) {
        console.error('Failed to update onboarding status:', error);
      }
      
      updateStepTimestamp(studentId, 'onboarding');
    }
  };

  // Reset functions for each step
  const resetCandidateSubmission = () => {
    setSelectedProfiles(new Set());
    setRejectedProfiles(new Set());
  };

  const resetScreening = () => {
    setScreeningSelected(new Set());
    setScreeningRejected(new Set());
  };

  const resetInterviewScheduled = () => {
    setInterviewScheduled(new Set());
    setInterviewRescheduled(new Set());
  };

  const resetRound1 = () => {
    setRound1Selected(new Set());
    setRound1Rejected(new Set());
    setRound1Rescheduled(new Set());
  };

  const resetRound2 = () => {
    setRound2Selected(new Set());
    setRound2Rejected(new Set());
    setRound2Rescheduled(new Set());
  };

  const resetOffered = () => {
    setOffered(new Set());
  };

  const resetOnboarding = () => {
    setOnboarding(new Set());
    saveOnboardingStatus([]);
  };

  // Table management functions
  const addNewRow = () => {
    const newProfile: Profile = {
      id: `temp_${Date.now()}`,
      student_id: `temp_${Date.now()}`,
      candidate_name: '',
      email_id: '',
      contact_no: '',
      total_experience: 0,
      relevant_experience: 0,
      current_company: '',
      location: '',
      notice_period_days: 0,
      ctc_current: 0,
      ctc_expected: 0,
      key_skills: '',
      education: '', // Ensure education is initialized as empty string
      source: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setTableData(prev => [...prev, newProfile]);
  };

  const removeRow = (index: number) => {
    setTableData(prev => prev.filter((_, i) => i !== index));
  };

  const updateCell = (rowIndex: number, columnId: string, value: any) => {
    setTableData(prev => prev.map((row, index) => {
      if (index === rowIndex) {
        return { ...row, [columnId]: value };
      }
      return row;
    }));
  };

  const handleFileUpload = (rowIndex: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file type
      const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedTypes.includes(file.type)) {
        alert('Please select a PDF or DOCX file');
        return;
      }
      
      // Check file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('File size should be less than 10MB');
        return;
      }
      
      // Store file reference and name in the row data
      updateCell(rowIndex, 'resume_file', file);
      updateCell(rowIndex, 'resume_file_name', file.name);
    }
  };

  const validateRow = (row: Profile): string[] => {
    const errors: string[] = [];
    
    if (!row.candidate_name?.trim()) {
      errors.push('Candidate Name is required');
    }
    
    // Email validation
    if (row.email_id && row.email_id.trim()) {
      if (!isValidEmail(row.email_id)) {
        errors.push('Please enter a valid email address');
      }
    }
    
    // Contact number validation
    if (row.contact_no && row.contact_no.trim()) {
      if (!isValidPhone(row.contact_no)) {
        errors.push('Please enter a valid contact number (exactly 10 digits)');
      }
    }
    
    if (row.total_experience < 0) {
      errors.push('Total Experience must be non-negative');
    }
    
    if (row.relevant_experience < 0) {
      errors.push('Relevant Experience must be non-negative');
    }
    
    if (row.ctc_current < 0) {
      errors.push('Current CTC must be non-negative');
    }
    
    if (row.ctc_expected < 0) {
      errors.push('Expected CTC must be non-negative');
    }
    
    if (row.notice_period_days < 0) {
      errors.push('Notice Period must be non-negative');
    }
    
    // Education validation (optional but if provided, should be meaningful)
    if (row.education && row.education.trim() && row.education.trim().length < 2) {
      errors.push('Education should be at least 2 characters long');
    }
    
    return errors;
  };

  const handleSaveProfiles = async () => {
    // Validate all rows
    const allErrors: string[] = [];
    tableData.forEach((row, index) => {
      const rowErrors = validateRow(row);
      if (rowErrors.length > 0) {
        allErrors.push(`Row ${index + 1}: ${rowErrors.join(', ')}`);
      }
    });

    if (allErrors.length > 0) {
      alert('Please fix the following errors:\n' + allErrors.join('\n'));
      return;
    }

    if (tableData.length === 0) {
      alert('Please add at least one candidate profile');
      return;
    }

    try {
      setSaving(true);
      
      // First, save profiles without resume files
      const profilesData = tableData.map(row => {
        return {
          candidate_name: row.candidate_name,
          email_id: row.email_id,
          contact_no: row.contact_no,
          total_experience: row.total_experience,
          relevant_experience: row.relevant_experience,
          current_company: row.current_company,
          location: row.location,
          notice_period_days: row.notice_period_days,
          ctc_current: row.ctc_current,
          ctc_expected: row.ctc_expected,
          key_skills: row.key_skills,
          education: row.education || '', // Ensure education is always included
          source: row.source,
          request_id: requestId
        };
      });

      const response = await api.post('/tracker/profiles', {
        profiles: profilesData,
        request_id: requestId
      });

      // If profiles were created successfully, upload resume files
      if (response.success && response.profiles_created > 0 && response.created_profiles) {
        console.log('Profiles created successfully, checking for resume files...');
        console.log('Created profiles:', response.created_profiles);
        console.log('Table data:', tableData);
        
        // Create a map of candidate names to created profiles for easier lookup
        const createdProfilesMap = new Map();
        response.created_profiles.forEach(profile => {
          createdProfilesMap.set(profile.candidate_name, profile);
        });
        
        // Upload resume files for profiles that have them
        for (let i = 0; i < tableData.length; i++) {
          const row = tableData[i];
          const resumeFile = row.resume_file;
          const createdProfile = createdProfilesMap.get(row.candidate_name);
          
          console.log(`Profile ${i + 1}:`, { 
            hasResumeFile: !!resumeFile, 
            resumeFileName: resumeFile?.name,
            candidateName: row.candidate_name,
            createdProfile: createdProfile
          });
          
          if (resumeFile && createdProfile) {
            const studentId = createdProfile.student_id;
            console.log(`Uploading resume for student ${studentId}:`, resumeFile.name);
            
            try {
              const formData = new FormData();
              formData.append('resume', resumeFile);
              
              // Use fetch directly for file upload to avoid axios header conflicts
              const resumeResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://20.188.122.171:1976/api'}/profiles/${studentId}/resume`, {
                method: 'POST',
                body: formData,
                // Don't set Content-Type - let browser set it automatically
              });
              
              if (!resumeResponse.ok) {
                throw new Error(`Resume upload failed: ${resumeResponse.statusText}`);
              }
              
              const resumeData = await resumeResponse.json();
              console.log('Resume upload successful:', resumeData);
            } catch (error) {
              console.error(`Error uploading resume for profile ${i + 1}:`, error);
              // Continue with other uploads even if one fails
            }
          }
        }
      }

      // Handle different response scenarios
      if (response.success) {
        if (response.has_duplicates) {
          if (response.all_duplicates) {
            // All profiles were duplicates
            alert(`⚠️ Duplicate profile Added. Saved Profile already exists.\n\n${response.message}`);
          } else {
            // Some profiles were created, some were duplicates
            alert(`✅ ${response.message}\n\nCreated: ${response.profiles_created} profile(s)\nSkipped: ${response.duplicates_skipped} duplicate(s)`);
            
            // Track newly created profiles
            if (response.created_profiles) {
              const newProfileIds = response.created_profiles.map((profile: any) => profile.student_id);
              setNewlyAddedProfiles(prev => new Set([...Array.from(prev), ...newProfileIds]));
            }
            
            setTableData([]);
            fetchWorkflowData(); // Refresh data
          }
        } else {
          // All profiles were created successfully
          alert('✅ Profiles saved successfully!');
          
          // Track newly created profiles
          if (response.created_profiles) {
            const newProfileIds = response.created_profiles.map((profile: any) => profile.student_id);
            setNewlyAddedProfiles(prev => new Set([...Array.from(prev), ...newProfileIds]));
          }
          
          setTableData([]);
          fetchWorkflowData(); // Refresh data
        }
      } else {
        // Handle error cases
        if (response.has_duplicates && response.all_duplicates) {
          alert(`⚠️ ${response.message}`);
        } else {
          alert('❌ Failed to save profiles: ' + response.message);
        }
      }
    } catch (error) {
      console.error('Error saving profiles:', error);
      
      if (error.message) {
        alert(`❌ Error: ${error.message}`);
      } else {
        alert('❌ An unexpected error occurred. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const updateRequirementStatus = async (newStatus: string) => {
    try {
      const response = await api.put(`/tracker/${requestId}`, {
        status: newStatus
      });
      
      // Update local requirement state
      setRequirement(prev => prev ? { ...prev, status: newStatus } : null);
      console.log(`Status updated to: ${newStatus}`);
    } catch (error) {
      console.error('Error updating requirement status:', error);
    }
  };

  const handleMoveToScreening = async () => {
    await updateRequirementStatus('Candidate_Submission');
    setCurrentStep('screening');
    // Don't mark steps 1 and 2 as completed since they should remain accessible
    setTimeout(() => {
      saveWorkflowState().catch(error => {
        console.error('Error saving workflow state:', error);
      });
    }, 100);
  };

  const handleMoveToInterviewScheduled = async () => {
    await updateRequirementStatus('Interview_Scheduled');
    setCurrentStep('interview_scheduled');
    setTimeout(() => {
      saveWorkflowState().catch(error => {
        console.error('Error saving workflow state:', error);
      });
    }, 100);
  };

  const handleMoveToRound1 = async () => {
    // Filter out rescheduled profiles from moving to next step
    const eligibleProfiles = Array.from(interviewScheduled).filter(
      studentId => !interviewRescheduled.has(studentId)
    );
    
    if (eligibleProfiles.length === 0) {
      alert('No eligible candidates to move to Round 1. Please ensure candidates are not marked as re-scheduled.');
      return;
    }
    
    // Status will be auto-updated by backend when profiles move to interview_round_1
    setCurrentStep('interview_round_1');
    setTimeout(() => {
      saveWorkflowState().catch(error => {
        console.error('Error saving workflow state:', error);
      });
    }, 100);
  };

  const handleMoveToRound2 = async () => {
    // Filter out rescheduled profiles from moving to next step
    const eligibleProfiles = Array.from(round1Selected).filter(
      studentId => !round1Rescheduled.has(studentId)
    );
    
    if (eligibleProfiles.length === 0) {
      alert('No eligible candidates to move to Round 2. Please ensure candidates are not marked as re-scheduled.');
      return;
    }
    
    // Status will be auto-updated by backend when profiles move to interview_round_2
    setCurrentStep('interview_round_2');
    setTimeout(() => {
      saveWorkflowState().catch(error => {
        console.error('Error saving workflow state:', error);
      });
    }, 100);
  };

  const handleMoveToOffered = async () => {
    // Filter out rescheduled profiles from moving to next step
    const eligibleProfiles = Array.from(round2Selected).filter(
      studentId => !round2Rescheduled.has(studentId)
    );
    
    if (eligibleProfiles.length === 0) {
      alert('No eligible candidates to move to Offered. Please ensure candidates are not marked as re-scheduled.');
      return;
    }
    
    await updateRequirementStatus('Offer_Recommendation');
    setCurrentStep('offered');
    setTimeout(() => {
      saveWorkflowState().catch(error => {
        console.error('Error saving workflow state:', error);
      });
    }, 100);
  };

  const handleMoveToOnboarding = async () => {
    await updateRequirementStatus('On_Boarding');
    setCurrentStep('onboarding');
    setTimeout(() => {
      saveWorkflowState().catch(error => {
        console.error('Error saving workflow state:', error);
      });
    }, 100);
  };

  const handleCompleteWorkflow = async () => {
    const confirmed = window.confirm('Do you really want to close the requirement?');
    if (confirmed) {
      try {
        const response = await api.post(`/tracker/${requestId}/close`, {});
        if (response.success) {
          alert('Requirement closed successfully!');
          router.push('/recruiter');
        } else {
          alert('Error closing requirement: ' + response.message);
        }
      } catch (error) {
        console.error('Error closing requirement:', error);
        alert('Error closing requirement. Please try again.');
      }
    }
  };

  const handleBackClick = () => {
    // Check source page to determine where to navigate back to
    const source = sessionStorage.getItem('workflow_source');

    if (source === 'recruiter') {
      // Came from recruiter page, go back to recruiter
      router.push('/recruiter');
    } else if (source === 'tracker') {
      // Came from tracker page, go back to tracker if admin, otherwise recruiter
      if (currentUser?.role === 'admin') {
        router.push('/tracker');
      } else {
        router.push('/recruiter');
      }
    } else {
      // No source stored, use default logic
      if (currentUser?.role === 'admin') {
        router.push('/tracker');
      } else {
        router.push('/recruiter');
      }
    }
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

  // Helper function to get timestamp for a profile in a specific step
  const getProfileStepTimestamp = (studentId: string, stepKey: string): string => {
    return stepTimestamps[stepKey]?.[studentId] || '';
  };

  // Helper function to format step timestamp
  const formatStepTimestamp = (studentId: string, stepKey: string): string => {
    const timestamp = getProfileStepTimestamp(studentId, stepKey);
    if (!timestamp) return '—';
    
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Helper function to get the appropriate date for display in each step
  const getStepDisplayDate = (profile: Profile, currentStepName: string): { date: string; label: string; color: string } => {
    const studentId = profile.student_id;
    
    switch (currentStepName) {
      case 'screening':
        if (screeningSelected.has(studentId)) {
          return {
            date: formatStepTimestamp(studentId, 'screening_selected'),
            label: 'Selected',
            color: 'text-green-600'
          };
        }
        if (screeningRejected.has(studentId)) {
          return {
            date: formatStepTimestamp(studentId, 'screening_rejected'),
            label: 'Rejected',
            color: 'text-red-600'
          };
        }
        // For profiles not yet selected/rejected, show when they were added to this step
        return {
          date: formatDate(profile.created_at),
          label: 'Added',
          color: 'text-gray-600'
        };
        
      case 'interview_scheduled':
        if (interviewScheduled.has(studentId)) {
          return {
            date: formatStepTimestamp(studentId, 'interview_scheduled'),
            label: 'Scheduled',
            color: 'text-blue-600'
          };
        }
        if (interviewRescheduled.has(studentId)) {
          return {
            date: formatStepTimestamp(studentId, 'interview_rescheduled'),
            label: 'Rescheduled',
            color: 'text-orange-600'
          };
        }
        // Show when they were selected for screening (moved to this step)
        return {
          date: formatStepTimestamp(studentId, 'screening_selected') || formatDate(profile.created_at),
          label: 'Available',
          color: 'text-gray-600'
        };
        
      case 'interview_round_1':
        if (round1Selected.has(studentId)) {
          return {
            date: formatStepTimestamp(studentId, 'round1_selected'),
            label: 'Selected',
            color: 'text-green-600'
          };
        }
        if (round1Rejected.has(studentId)) {
          return {
            date: formatStepTimestamp(studentId, 'round1_rejected'),
            label: 'Rejected',
            color: 'text-red-600'
          };
        }
        if (round1Rescheduled.has(studentId)) {
          return {
            date: formatStepTimestamp(studentId, 'round1_rescheduled'),
            label: 'Rescheduled',
            color: 'text-orange-600'
          };
        }
        // Show when they were scheduled for interview (moved to this step)
        return {
          date: formatStepTimestamp(studentId, 'interview_scheduled') || formatStepTimestamp(studentId, 'screening_selected') || formatDate(profile.created_at),
          label: 'Available',
          color: 'text-gray-600'
        };
        
      case 'interview_round_2':
        if (round2Selected.has(studentId)) {
          return {
            date: formatStepTimestamp(studentId, 'round2_selected'),
            label: 'Selected',
            color: 'text-green-600'
          };
        }
        if (round2Rejected.has(studentId)) {
          return {
            date: formatStepTimestamp(studentId, 'round2_rejected'),
            label: 'Rejected',
            color: 'text-red-600'
          };
        }
        if (round2Rescheduled.has(studentId)) {
          return {
            date: formatStepTimestamp(studentId, 'round2_rescheduled'),
            label: 'Rescheduled',
            color: 'text-orange-600'
          };
        }
        // Show when they were selected for Round 1 (moved to this step)
        return {
          date: formatStepTimestamp(studentId, 'round1_selected') || formatStepTimestamp(studentId, 'interview_scheduled') || formatDate(profile.created_at),
          label: 'Available',
          color: 'text-gray-600'
        };
        
      case 'offered':
        if (offered.has(studentId)) {
          return {
            date: formatStepTimestamp(studentId, 'offered'),
            label: 'Offered',
            color: 'text-green-600'
          };
        }
        // Show when they were selected for Round 2 (moved to this step)
        return {
          date: formatStepTimestamp(studentId, 'round2_selected') || formatStepTimestamp(studentId, 'round1_selected') || formatDate(profile.created_at),
          label: 'Available',
          color: 'text-gray-600'
        };
        
      case 'onboarding':
        if (onboarding.has(studentId)) {
          return {
            date: formatStepTimestamp(studentId, 'onboarding'),
            label: 'OnBoarded',
            color: 'text-pink-600'
          };
        }
        // Show when they were offered (moved to this step)
        return {
          date: formatStepTimestamp(studentId, 'offered') || formatStepTimestamp(studentId, 'round2_selected') || formatDate(profile.created_at),
          label: 'Available',
          color: 'text-gray-600'
        };
        
      default:
        return {
          date: '—',
          label: '',
          color: 'text-gray-400'
        };
    }
  };

  // Helper function to update step timestamps
  const updateStepTimestamp = (studentId: string, stepKey: string, timestamp?: string) => {
    const currentTimestamp = timestamp || new Date().toISOString();
    setStepTimestamps(prev => ({
      ...prev,
      [stepKey]: {
        ...prev[stepKey],
        [studentId]: currentTimestamp
      }
    }));
  };

  // Helper function to remove step timestamp
  const removeStepTimestamp = (studentId: string, stepKey: string) => {
    setStepTimestamps(prev => {
      const newTimestamps = { ...prev };
      if (newTimestamps[stepKey]) {
        const { [studentId]: removed, ...rest } = newTimestamps[stepKey];
        newTimestamps[stepKey] = rest;
      }
      return newTimestamps;
    });
  };

  const exportProfilesToDocument = async () => {
    try {
      if (profiles.length === 0) {
        alert('No profiles to export');
        return;
      }

      setExporting(true);

      // Call backend API to export profiles
      const response = await api.get(`/export-profiles/${requestId}`);
      
      if (response.success) {
        // Download the file using full API URL
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://20.188.122.171:1976/api';
        const downloadUrl = `${API_BASE_URL}${response.download_url}`;
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = response.filename;
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        alert(`Word document generated successfully! ${response.message}`);
      } else {
        alert('Error generating Word document: ' + response.message);
      }
    } catch (error) {
      console.error('Error generating Word document:', error);
      alert('Error generating Word document. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleSendMail = async () => {
    if (profiles.length === 0) {
      alert('No profiles to send');
      return;
    }

    // Initialize selected profiles for email with all profiles
    setSelectedProfilesForEmail(new Set(profiles.map(p => p.student_id)));

    // Show column selection modal first
    setShowColumnSelectionModal(true);
  };

  const handleSendEmail = async () => {
    try {
      // Validate email
      if (!emailData.recipient_email) {
        alert('Please enter recipient email address');
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailData.recipient_email)) {
        alert('Please enter a valid recipient email address');
        return;
      }

      // Validate Cc email if provided
      if (emailData.cc_email && emailData.cc_email.trim()) {
        const ccEmails = emailData.cc_email.split(',').map(email => email.trim());
        for (const email of ccEmails) {
          if (!emailRegex.test(email)) {
            alert('Please enter valid Cc email address(es)');
            return;
          }
        }
      }

      setSending(true);

      // Create FormData for file uploads
      const formData = new FormData();
      formData.append('recipient_email', emailData.recipient_email);
      formData.append('recipient_name', emailData.recipient_name);
      formData.append('cc_email', emailData.cc_email || '');
      formData.append('subject', emailData.subject);
      formData.append('selected_columns', JSON.stringify(selectedColumns));
      formData.append('selected_profiles', JSON.stringify(Array.from(selectedProfilesForEmail)));
      
      // Add attachments to FormData
      emailAttachments.forEach((file, index) => {
        formData.append(`attachments`, file);
      });

      // Call backend API to send email
      const response = await api.post(`/send-profiles-email/${requestId}`, formData);
      
      if (response.success) {
        alert(`Email sent successfully! ${response.message}`);
        setShowEmailModal(false);
        setEmailData({
          recipient_email: '',
          recipient_name: '',
          cc_email: '',
          subject: ''
        });
        setEmailAttachments([]);
      } else {
        alert('Error sending email: ' + response.message);
      }
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Error sending email. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleEmailInputChange = (field: string, value: string) => {
    setEmailData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleEmailAttachmentUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const validFiles = Array.from(files).filter(file => {
        const fileType = file.type;
        const fileName = file.name.toLowerCase();
        return (fileType === 'application/pdf' || 
                fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                fileName.endsWith('.pdf') || 
                fileName.endsWith('.docx'));
      });
      
      if (validFiles.length !== files.length) {
        alert('Only PDF and DOCX files are allowed');
      }
      
      setEmailAttachments(prev => [...prev, ...validFiles]);
    }
  };

  const handleEmailAttachmentRemove = (index: number) => {
    setEmailAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleColumnToggle = (columnId: string) => {
    setSelectedColumns(prev => {
      if (prev.includes(columnId)) {
        return prev.filter(id => id !== columnId);
      } else {
        return [...prev, columnId];
      }
    });
  };

  const handleSelectAllColumns = () => {
    setSelectedColumns(availableColumns.map(col => col.id));
  };

  const handleDeselectAllColumns = () => {
    setSelectedColumns(availableColumns.filter(col => col.required).map(col => col.id));
  };

  const handleProfileToggleForEmail = (studentId: string) => {
    setSelectedProfilesForEmail(prev => {
      const newSet = new Set(prev);
      if (newSet.has(studentId)) {
        newSet.delete(studentId);
      } else {
        newSet.add(studentId);
      }
      return newSet;
    });
  };

  const handleSelectAllProfilesForEmail = () => {
    setSelectedProfilesForEmail(new Set(profiles.map(p => p.student_id)));
  };

  const handleDeselectAllProfilesForEmail = () => {
    setSelectedProfilesForEmail(new Set());
  };

  const handleProceedToEmail = () => {
    // Check if any profiles are selected
    if (selectedProfilesForEmail.size === 0) {
      alert('Please select at least one profile to send');
      return;
    }

    // Ensure required columns are always selected
    const requiredColumns = availableColumns.filter(col => col.required).map(col => col.id);
    const finalSelectedColumns = Array.from(new Set([...selectedColumns, ...requiredColumns]));
    setSelectedColumns(finalSelectedColumns);

    // Set default email data
    const defaultSubject = requirement ? `Candidate Profiles for ${requirement.job_title} - ${requestId}` : `Candidate Profiles - ${requestId}`;
    setEmailData({
      recipient_email: '',
      recipient_name: requirement?.hiring_manager || 'Hiring Manager',
      cc_email: '',
      subject: defaultSubject
    });
    setEmailAttachments([]);
    
    setShowColumnSelectionModal(false);
    setShowEmailModal(true);
  };

  // Interview email functions
  const handleInitiateInterviewEmail = (step: 'interview_scheduled' | 'interview_round_1' | 'interview_round_2') => {
    setCurrentInterviewStep(step);
    
    // Get profiles for the current step (excluding re-scheduled profiles)
    let stepProfiles: Profile[] = [];
    switch (step) {
      case 'interview_scheduled':
        stepProfiles = profiles.filter(p => 
          interviewScheduled.has(p.student_id) && !interviewRescheduled.has(p.student_id)
        );
        break;
      case 'interview_round_1':
        stepProfiles = profiles.filter(p => 
          round1Selected.has(p.student_id) && !round1Rescheduled.has(p.student_id)
        );
        break;
      case 'interview_round_2':
        stepProfiles = profiles.filter(p => 
          round2Selected.has(p.student_id) && !round2Rescheduled.has(p.student_id)
        );
        break;
    }
    
    if (stepProfiles.length === 0) {
      alert(`No candidates selected for ${step.replace('_', ' ')}`);
      return;
    }
    
    // Initialize selected profiles for email
    setSelectedProfilesForEmail(new Set(stepProfiles.map(p => p.student_id)));
    
    // Set default meeting data
    const stepLabel = step.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    const defaultSubject = requirement ? `${stepLabel} - ${requirement.job_title} - ${requestId}` : `${stepLabel} - ${requestId}`;
    
    setTeamsMeetingData({
      subject: defaultSubject,
      start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16), // Tomorrow, format for datetime-local
      end_time: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString().slice(0, 16), // Tomorrow + 1 hour
      attendees: stepProfiles.map(p => p.email_id),
      meeting_type: step
    });
    
    setShowTeamsMeetingModal(true);
  };

  const handleCreateTeamsMeeting = async () => {
    try {
      if (!teamsMeetingData.subject || !teamsMeetingData.start_time || !teamsMeetingData.end_time) {
        alert('Please fill in all required meeting fields');
        return;
      }

      setCreatingMeeting(true);

      // Convert datetime-local format to ISO string
      const startTime = new Date(teamsMeetingData.start_time).toISOString();
      const endTime = new Date(teamsMeetingData.end_time).toISOString();

      // Get candidate_id from the first attendee (usually the candidate)
      let candidate_id = null;
      if (teamsMeetingData.attendees && teamsMeetingData.attendees.length > 0) {
        const candidateProfile = profiles.find(p => p.email_id === teamsMeetingData.attendees[0]);
        if (candidateProfile) {
          candidate_id = candidateProfile.student_id;
        }
      }

      const meetingData = {
        subject: teamsMeetingData.subject,
        start_time: startTime,
        end_time: endTime,
        attendees: teamsMeetingData.attendees,
        request_id: requestId,
        meeting_type: teamsMeetingData.meeting_type,
        candidate_id: candidate_id
      };

      const response = await api.post('/teams-meeting', meetingData);

      if (response.success) {
        setTeamsMeetingLink(response.teams_meeting_link);
        setShowTeamsMeetingModal(false);
        setShowInterviewEmailForm(true);
        
        // Generate email template
        const emailTemplate = generateInterviewEmailTemplate(
          teamsMeetingData.subject,
          response.teams_meeting_link,
          startTime,
          endTime,
          currentInterviewStep
        );
        
        setInterviewEmailData({
          recipient_email: '',
          recipient_name: '',
          cc_email: '',
          subject: teamsMeetingData.subject,
          body: emailTemplate
        });
      } else {
        alert(`Failed to create Teams meeting: ${response.error}`);
      }
    } catch (error) {
      console.error('Error creating Teams meeting:', error);
      alert('Failed to create Teams meeting. Please try again.');
    } finally {
      setCreatingMeeting(false);
    }
  };

  const generateInterviewEmailTemplate = (
    subject: string, 
    meetingLink: string, 
    startTime: string, 
    endTime: string, 
    step: string
  ): string => {
    const jobTitle = requirement?.job_title || 'Position';
    const startDate = new Date(startTime).toLocaleDateString();
    const startTimeFormatted = new Date(startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endTimeFormatted = new Date(endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Interview Invitation</h2>
        
        <p>Dear Candidate,</p>
        
        <p>We are pleased to invite you for your <strong>${jobTitle}</strong> interview.</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Interview Details:</h3>
          <ul style="list-style: none; padding: 0;">
            <li style="margin: 10px 0;"><strong>Date:</strong> ${startDate}</li>
            <li style="margin: 10px 0;"><strong>Time:</strong> ${startTimeFormatted} - ${endTimeFormatted}</li>
            <li style="margin: 10px 0;"><strong>Platform:</strong> Microsoft Teams</li>
            <li style="margin: 10px 0;"><strong>Meeting Link:</strong> <a href="${meetingLink}" style="color: #2563eb;">Join Teams Meeting</a></li>
          </ul>
        </div>
        
        <p><strong>Instructions:</strong></p>
        <ul>
          <li>Please join the meeting 5 minutes before the scheduled time</li>
          <li>Ensure you have a stable internet connection</li>
          <li>Test your microphone and camera before joining</li>
          <li>Have your resume and any relevant documents ready</li>
        </ul>
        
        <p>If you have any questions or need to reschedule, please contact us as soon as possible.</p>
        
        <p>We look forward to meeting you!</p>
        
        <p>Best regards,<br>
        Recruitment Team</p>
      </div>
    `;
  };

  const handleSendInterviewEmail = async () => {
    try {
      if (!interviewEmailData.recipient_email || !interviewEmailData.subject || !interviewEmailData.body) {
        alert('Please fill in all required email fields');
        return;
      }

      setSendingInterviewEmail(true);

      // Create FormData for file uploads
      const formData = new FormData();
      formData.append('recipient_email', interviewEmailData.recipient_email);
      formData.append('recipient_name', interviewEmailData.recipient_name);
      formData.append('cc_email', interviewEmailData.cc_email || '');
      formData.append('subject', interviewEmailData.subject);
      formData.append('body', interviewEmailData.body);
      formData.append('teams_meeting_link', teamsMeetingLink);
      formData.append('meeting_details', JSON.stringify({
        subject: teamsMeetingData.subject,
        start_time: teamsMeetingData.start_time,
        end_time: teamsMeetingData.end_time
      }));
      formData.append('selected_profiles', JSON.stringify(Array.from(selectedProfilesForEmail)));
      formData.append('interview_step', currentInterviewStep);
      
      // Add attachments to FormData
      interviewEmailAttachments.forEach((file, index) => {
        formData.append(`attachments`, file);
      });

      const response = await api.post(`/send-interview-email/${requestId}`, formData);

      if (response.success) {
        alert('Interview email sent successfully!');
        setShowInterviewEmailForm(false);
        setTeamsMeetingLink('');
        setInterviewEmailData({
          recipient_email: '',
          recipient_name: '',
          cc_email: '',
          subject: '',
          body: ''
        });
        setInterviewEmailAttachments([]);
        
        // Refresh meet links for the current step
        fetchMeetLinks(currentInterviewStep);
      } else {
        alert(`Failed to send interview email: ${response.error}`);
      }
    } catch (error) {
      console.error('Error sending interview email:', error);
      alert('Failed to send interview email. Please try again.');
    } finally {
      setSendingInterviewEmail(false);
    }
  };

  const handleInterviewEmailInputChange = (field: string, value: string) => {
    setInterviewEmailData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleInterviewEmailAttachmentUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const validFiles = Array.from(files).filter(file => {
        const fileType = file.type;
        const fileName = file.name.toLowerCase();
        return (fileType === 'application/pdf' || 
                fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                fileName.endsWith('.pdf') || 
                fileName.endsWith('.docx'));
      });
      
      if (validFiles.length !== files.length) {
        alert('Only PDF and DOCX files are allowed');
      }
      
      setInterviewEmailAttachments(prev => [...prev, ...validFiles]);
    }
  };

  const handleInterviewEmailAttachmentRemove = (index: number) => {
    setInterviewEmailAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleTeamsMeetingInputChange = (field: string, value: any) => {
    setTeamsMeetingData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const fetchMeetLinks = async (roundType: string) => {
    try {
      setLoadingMeetLinks(true);
      const response = await api.get(`/meet-links/${requestId}?round_type=${roundType}`);
      
      if (response.success) {
        setMeetLinks(prev => ({
          ...prev,
          [roundType]: response.meet_links || {}
        }));
      }
    } catch (error) {
      console.error('Error fetching meet links:', error);
    } finally {
      setLoadingMeetLinks(false);
    }
  };

  const getMeetLinkForCandidate = (candidateId: string, roundType: string) => {
    const roundLinks = meetLinks[roundType] || {};
    return roundLinks[candidateId] || null;
  };

  const formatMeetingTime = (startTime: string, endTime: string, timezone: string) => {
    try {
      const start = new Date(startTime);
      const end = new Date(endTime);
      
      const startStr = start.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      }) + ' · ' + start.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      const endStr = end.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      return `${startStr}–${endStr} (${timezone})`;
    } catch (error) {
      return 'Time not available';
    }
  };

  const handleEditProfile = (profile: Profile) => {
    setEditingProfile(profile);
    setShowEditModal(true);
  };

  const handleUpdateProfile = async () => {
    if (!editingProfile) return;

    // Validate the profile before updating
    const errors: string[] = [];
    
    if (!editingProfile.candidate_name?.trim()) {
      errors.push('Candidate Name is required');
    }
    
    // Email validation
    if (editingProfile.email_id && editingProfile.email_id.trim()) {
      if (!isValidEmail(editingProfile.email_id)) {
        errors.push('Please enter a valid email address');
      }
    }
    
    // Contact number validation
    if (editingProfile.contact_no && editingProfile.contact_no.trim()) {
      if (!isValidPhone(editingProfile.contact_no)) {
        errors.push('Please enter a valid contact number (exactly 10 digits)');
      }
    }
    
    // Education validation
    if (editingProfile.education && editingProfile.education.trim() && editingProfile.education.trim().length < 2) {
      errors.push('Education should be at least 2 characters long');
    }
    
    if (errors.length > 0) {
      alert('Please fix the following errors:\n' + errors.join('\n'));
      return;
    }

    try {
      const result = await api.put(`/profiles/${editingProfile.student_id}`, editingProfile);
      
      if (result.success) {
        // Update the profile in the local state
        setProfiles(prev => prev.map(p => 
          p.student_id === editingProfile.student_id ? (result.profile ?? editingProfile) : p
        ));
        
        setShowEditModal(false);
        setEditingProfile(null);
        alert('Profile updated successfully! Education and other fields have been updated.');
      } else {
        alert('Failed to update profile');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Error updating profile');
    }
  };

  const handleEditInputChange = (field: string, value: any) => {
    if (!editingProfile) return;
    
    setEditingProfile(prev => ({
      ...prev!,
      [field]: value
    }));
  };

  const handleResumeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!editingProfile || !event.target.files || event.target.files.length === 0) return;
    
    const file = event.target.files[0];
    
    // Check file type
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      alert('Please select a PDF or DOCX file');
      return;
    }
    
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size should be less than 10MB');
      return;
    }
    
    try {
      const formData = new FormData();
      formData.append('resume', file);
      
      // Use fetch directly for file upload to avoid axios header conflicts
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://20.188.122.171:1976/api'}/profiles/${editingProfile.student_id}/resume`, {
        method: 'POST',
        body: formData,
        // Don't set Content-Type - let browser set it automatically
      });
      
      if (!response.ok) {
        throw new Error(`Resume upload failed: ${response.statusText}`);
      }
      
      const responseData = await response.json();
      
      if (responseData.success) {
        // Update the editing profile with new resume info
        setEditingProfile(prev => ({
          ...prev!,
          resume_file_path: responseData.resume_file_path,
          resume_file_name: responseData.resume_file_name
        }));
        
        // Update the profile in the main profiles list
        setProfiles(prev => prev.map(p => 
          p.student_id === editingProfile.student_id 
            ? { ...p, resume_file_path: responseData.resume_file_path, resume_file_name: responseData.resume_file_name }
            : p
        ));
        
        alert('Resume uploaded successfully!');
      } else {
        alert('Failed to upload resume');
      }
    } catch (error) {
      console.error('Error uploading resume:', error);
      alert('Error uploading resume');
    }
  };

  const handleDownloadResume = async (studentId: string) => {
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://20.188.122.171:1976/api';
      const response = await fetch(`${API_BASE_URL}/profiles/${studentId}/resume`, {
        headers: {
          'Authorization': `Bearer ${JSON.parse(localStorage.getItem('user') || '{}').username || ''}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to download resume');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `resume_${studentId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading resume:', error);
      alert('Error downloading resume');
    }
  };

  const handleDeleteProfile = async (studentId: string, candidateName: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete the profile for "${candidateName}"? This action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    try {
      const result = await api.delete(`/profiles/${studentId}`);

      if (result.success) {
        // Remove the profile from the local state
        setProfiles(prev => prev.filter(p => p.student_id !== studentId));

        // Remove from newly added profiles if it was there
        setNewlyAddedProfiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(studentId);
          return newSet;
        });

        alert('Profile deleted successfully!');
      } else {
        alert('Failed to delete profile: ' + (result.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error deleting profile:', error);
      alert('Error deleting profile. Please try again.');
    }
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
        movingProfile.id || movingProfile.student_id,
        requestId,
        selectedTargetRequirement,
        moveReason
      );

      if (result.success) {
        // Remove the moved profile from the current list
        setProfiles(prev => prev.filter(p => (p.id || p.student_id) !== (movingProfile.id || movingProfile.student_id)));
        
        // Remove from newly added profiles if it was there
        setNewlyAddedProfiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(movingProfile.student_id);
          return newSet;
        });
        
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

  if (loading || !workflowStateLoaded) {
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
            onClick={fetchWorkflowData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 py-6">
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
              Workflow for {requestId}
            </h1>
            {requirement && (
              <p className="text-gray-600 mt-2">
                {requirement.job_title} - {requirement.company_name}
              </p>
            )}
          </div>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-center flex-wrap gap-2">
            <button
              onClick={() => setCurrentStep('candidate_submission')}
              disabled={!isStepAccessible('candidate_submission')}
              className={`flex items-center transition-opacity ${
                isStepAccessible('candidate_submission') 
                  ? 'cursor-pointer hover:opacity-80' 
                  : 'cursor-not-allowed opacity-50'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep === 'candidate_submission' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                1
              </div>
              <div className={`ml-2 text-sm font-medium ${
                currentStep === 'candidate_submission' ? 'text-blue-600' : 'text-gray-500'
              }`}>
                Candidate Submission
              </div>
            </button>
            <div className="w-8 h-0.5 bg-gray-300"></div>
            <button
              onClick={() => setCurrentStep('submitted_profiles')}
              disabled={!isStepAccessible('submitted_profiles')}
              className={`flex items-center transition-opacity ${
                isStepAccessible('submitted_profiles') 
                  ? 'cursor-pointer hover:opacity-80' 
                  : 'cursor-not-allowed opacity-50'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep === 'submitted_profiles' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                2
              </div>
              <div className={`ml-2 text-sm font-medium ${
                currentStep === 'submitted_profiles' ? 'text-blue-600' : 'text-gray-500'
              }`}>
                Submitted Profiles
              </div>
            </button>
            <div className="w-8 h-0.5 bg-gray-300"></div>
            <button
              onClick={() => setCurrentStep('screening')}
              disabled={!isStepAccessible('screening')}
              className={`flex items-center transition-opacity ${
                isStepAccessible('screening') 
                  ? 'cursor-pointer hover:opacity-80' 
                  : 'cursor-not-allowed opacity-50'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep === 'screening' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                3
              </div>
              <div className={`ml-2 text-sm font-medium ${
                currentStep === 'screening' ? 'text-blue-600' : 'text-gray-500'
              }`}>
                Screening
              </div>
              <div className={`ml-1 px-2 py-0.5 text-xs rounded-full ${
                currentStep === 'screening' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {getStepProfileCounts().screening}
              </div>
            </button>
            <div className="w-8 h-0.5 bg-gray-300"></div>
            <button
              onClick={() => setCurrentStep('interview_scheduled')}
              disabled={!isStepAccessible('interview_scheduled')}
              className={`flex items-center transition-opacity ${
                isStepAccessible('interview_scheduled') 
                  ? 'cursor-pointer hover:opacity-80' 
                  : 'cursor-not-allowed opacity-50'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep === 'interview_scheduled' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                4
              </div>
              <div className={`ml-2 text-sm font-medium ${
                currentStep === 'interview_scheduled' ? 'text-blue-600' : 'text-gray-500'
              }`}>
                Interview Scheduled
              </div>
              <div className={`ml-1 px-2 py-0.5 text-xs rounded-full ${
                currentStep === 'interview_scheduled' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {getStepProfileCounts().interview_scheduled}
              </div>
            </button>
            <div className="w-8 h-0.5 bg-gray-300"></div>
            <button
              onClick={() => setCurrentStep('interview_round_1')}
              disabled={!isStepAccessible('interview_round_1')}
              className={`flex items-center transition-opacity ${
                isStepAccessible('interview_round_1') 
                  ? 'cursor-pointer hover:opacity-80' 
                  : 'cursor-not-allowed opacity-50'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep === 'interview_round_1' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                5
              </div>
              <div className={`ml-2 text-sm font-medium ${
                currentStep === 'interview_round_1' ? 'text-blue-600' : 'text-gray-500'
              }`}>
                Round 1
              </div>
              <div className={`ml-1 px-2 py-0.5 text-xs rounded-full ${
                currentStep === 'interview_round_1' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {getStepProfileCounts().interview_round_1}
              </div>
            </button>
            <div className="w-8 h-0.5 bg-gray-300"></div>
            <button
              onClick={() => setCurrentStep('interview_round_2')}
              disabled={!isStepAccessible('interview_round_2')}
              className={`flex items-center transition-opacity ${
                isStepAccessible('interview_round_2') 
                  ? 'cursor-pointer hover:opacity-80' 
                  : 'cursor-not-allowed opacity-50'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep === 'interview_round_2' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                6
              </div>
              <div className={`ml-2 text-sm font-medium ${
                currentStep === 'interview_round_2' ? 'text-blue-600' : 'text-gray-500'
              }`}>
                Round 2
              </div>
              <div className={`ml-1 px-2 py-0.5 text-xs rounded-full ${
                currentStep === 'interview_round_2' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {getStepProfileCounts().interview_round_2}
              </div>
            </button>
            <div className="w-8 h-0.5 bg-gray-300"></div>
            <button
              onClick={() => setCurrentStep('offered')}
              disabled={!isStepAccessible('offered')}
              className={`flex items-center transition-opacity ${
                isStepAccessible('offered') 
                  ? 'cursor-pointer hover:opacity-80' 
                  : 'cursor-not-allowed opacity-50'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep === 'offered' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                7
              </div>
              <div className={`ml-2 text-sm font-medium ${
                currentStep === 'offered' ? 'text-blue-600' : 'text-gray-500'
              }`}>
                Offered
              </div>
              <div className={`ml-1 px-2 py-0.5 text-xs rounded-full ${
                currentStep === 'offered' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {getStepProfileCounts().offered}
              </div>
            </button>
            <div className="w-8 h-0.5 bg-gray-300"></div>
            <button
              onClick={() => setCurrentStep('onboarding')}
              disabled={!isStepAccessible('onboarding')}
              className={`flex items-center transition-opacity ${
                isStepAccessible('onboarding') 
                  ? 'cursor-pointer hover:opacity-80' 
                  : 'cursor-not-allowed opacity-50'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep === 'onboarding' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                8
              </div>
              <div className={`ml-2 text-sm font-medium ${
                currentStep === 'onboarding' ? 'text-blue-600' : 'text-gray-500'
              }`}>
                OnBoarding
              </div>
              <div className={`ml-1 px-2 py-0.5 text-xs rounded-full ${
                currentStep === 'onboarding' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {getStepProfileCounts().onboarding}
              </div>
            </button>
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
                  {getStatusDisplayName(requirement.status)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Candidate Submission */}
        {currentStep === 'candidate_submission' && (
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Step 1: Candidate Submission</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Add candidate profiles manually for this requirement
                  </p>
                </div>
                <button
                  onClick={() => setCurrentStep('submitted_profiles')}
                  disabled={tableData.length === 0}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Next Step
                </button>
              </div>
            </div>
            
            <div className="p-6">
              {/* Controls */}
              <div className="flex justify-between items-center mb-6">
                <div className="flex space-x-3">
                  <button
                    onClick={addNewRow}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Add Candidate
                  </button>
                </div>
                <div className="text-sm text-gray-600">
                  {tableData.length} candidate{tableData.length !== 1 ? 's' : ''} added
                </div>
              </div>

              {/* Candidate Forms */}
              {tableData.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-gray-400 mb-4">
                    <svg className="w-16 h-16 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <p className="text-lg text-gray-700 mb-4">
                    No candidates added yet
                  </p>
                  <p className="text-gray-600 mb-6">
                    Click "Add Candidate" to start adding candidate profiles
                  </p>
                  <button
                    onClick={addNewRow}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Add First Candidate
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {tableData.map((row, rowIndex) => (
                    <div key={row.student_id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-gray-50 dark:bg-gray-700/40">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-medium text-gray-900">
                          Candidate {rowIndex + 1}
                        </h3>
                        <button
                          onClick={() => removeRow(rowIndex)}
                          className="text-red-600 hover:text-red-800 transition-colors p-1"
                          title="Remove candidate"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Basic Information */}
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Candidate Name *
                            </label>
                            <input
                              type="text"
                              value={row.candidate_name}
                              onChange={(e) => updateCell(rowIndex, 'candidate_name', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="Enter full name"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Email Address
                            </label>
                            <input
                              type="email"
                              value={row.email_id || ''}
                              onChange={(e) => updateCell(rowIndex, 'email_id', e.target.value)}
                              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                row.email_id && row.email_id.trim() && !isValidEmail(row.email_id)
                                  ? 'border-red-500 focus:ring-red-500'
                                  : 'border-gray-300'
                              }`}
                              placeholder="Enter email address"
                            />
                            {row.email_id && row.email_id.trim() && !isValidEmail(row.email_id) && (
                              <p className="text-red-500 text-xs mt-1">Please enter a valid email address</p>
                            )}
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Contact Number
                            </label>
                            <input
                              type="text"
                              value={row.contact_no || ''}
                              onChange={(e) => updateCell(rowIndex, 'contact_no', e.target.value)}
                              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                row.contact_no && row.contact_no.trim() && !isValidPhone(row.contact_no)
                                  ? 'border-red-500 focus:ring-red-500'
                                  : 'border-gray-300'
                              }`}
                              placeholder="Enter contact number"
                            />
                            {row.contact_no && row.contact_no.trim() && !isValidPhone(row.contact_no) && (
                              <p className="text-red-500 text-xs mt-1">Please enter a valid contact number (exactly 10 digits)</p>
                            )}
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Location
                            </label>
                            <input
                              type="text"
                              value={row.location || ''}
                              onChange={(e) => updateCell(rowIndex, 'location', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="Enter current location"
                            />
                          </div>
                        </div>
                        
                        {/* Experience & Company */}
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Total Experience (Years)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={row.total_experience || ''}
                              onChange={(e) => updateCell(rowIndex, 'total_experience', parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="0"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Relevant Experience (Years)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={row.relevant_experience || ''}
                              onChange={(e) => updateCell(rowIndex, 'relevant_experience', parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="0"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Current Company
                            </label>
                            <input
                              type="text"
                              value={row.current_company || ''}
                              onChange={(e) => updateCell(rowIndex, 'current_company', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="Enter current company"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Notice Period (Days)
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={row.notice_period_days || ''}
                              onChange={(e) => updateCell(rowIndex, 'notice_period_days', parseInt(e.target.value) || 0)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="0"
                            />
                          </div>
                        </div>
                        
                        {/* CTC & Additional Info */}
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Current CTC (LPA)
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={row.ctc_current || ''}
                              onChange={(e) => updateCell(rowIndex, 'ctc_current', parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="0"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Expected CTC (LPA)
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={row.ctc_expected || ''}
                              onChange={(e) => updateCell(rowIndex, 'ctc_expected', parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="0"
                            />
                          </div>
                            
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Source
                            </label>
                            <select
                              value={row.source || ''}
                              onChange={(e) => updateCell(rowIndex, 'source', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">Select Source</option>
                              <option value="naukri_com">Naukri.com</option>
                              <option value="monster_india">Monster India</option>
                              <option value="timesjobs">TimesJobs</option>
                              <option value="shine_com">Shine.com</option>
                              <option value="freshersworld">FreshersWorld</option>
                              <option value="github_stackoverflow">GitHub/StackOverflow</option>
                              <option value="internshala">Internshala</option>
                              <option value="LinkedIn">LinkedIn</option>
                              <option value="Referral">Referral</option>
                            </select>
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Education
                            </label>
                            <input
                              type="text"
                              value={row.education || ''}
                              onChange={(e) => updateCell(rowIndex, 'education', e.target.value)}
                              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                row.education && row.education.trim() && row.education.trim().length < 2
                                  ? 'border-yellow-500 focus:ring-yellow-500'
                                  : 'border-gray-300'
                              }`}
                              placeholder="e.g., B.Tech, M.Tech, MBA, etc."
                            />
                            {row.education && row.education.trim() && row.education.trim().length < 2 && (
                              <p className="text-yellow-600 text-xs mt-1">Education should be at least 2 characters long</p>
                            )}
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Resume File
                            </label>
                            <input
                              type="file"
                              accept=".pdf,.docx"
                              onChange={(e) => handleFileUpload(rowIndex, e)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {row.resume_file_name && (
                              <div className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded mt-1">
                                ✓ {row.resume_file_name}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Key Skills - Full Width */}
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Key Skills
                        </label>
                        <textarea
                          value={row.key_skills || ''}
                          onChange={(e) => updateCell(rowIndex, 'key_skills', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          placeholder="Enter key technical skills, tools, and technologies"
                          rows={3}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Saved Profiles Table */}
              {profiles.length > 0 && (
                <div className="mt-8">
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Saved Profiles</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg">
                        <thead className="bg-gray-50 dark:bg-gray-700/50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Candidate Name</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact Info</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Experience</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Company</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CTC</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notice Period</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Education</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resume</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {profiles.map((profile) => (
                            <tr key={profile.student_id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                                {profile.candidate_name}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                <div>
                                  <p>{profile.email_id || 'N/A'}</p>
                                  <p className="text-xs text-gray-400">{profile.contact_no || 'N/A'}</p>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                <div>
                                  <p>{profile.total_experience} years total</p>
                                  <p className="text-xs text-gray-400">{profile.relevant_experience} years relevant</p>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {profile.current_company || 'N/A'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                <div>
                                  <p>Current: {profile.ctc_current} LPA</p>
                                  <p className="text-xs text-gray-400">Expected: {profile.ctc_expected} LPA</p>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {profile.location || 'N/A'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {profile.notice_period_days} days
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {profile.education || 'N/A'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {profile.source || 'N/A'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {profile.resume_file_name ? (
                                  <div className="flex items-center space-x-2">
                                    <span className="text-green-600 text-xs">✓ Uploaded</span>
                                    <button
                                      onClick={() => handleDownloadResume(profile.student_id)}
                                      className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                                      title="Download resume"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-xs">No resume</span>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              <div className="flex space-x-2">
                                  <button
                                    onClick={() => handleEditProfile(profile)}
                                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center"
                                    title="Edit profile"
                                  >
                                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleMoveProfile(profile)}
                                    className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center"
                                    title="Move profile to another requirement"
                                  >
                                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                    </svg>
                                    Move
                                  </button>
                                  <button
                                    onClick={() => handleDeleteProfile(profile.student_id, profile.candidate_name)}
                                    className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center"
                                    title="Delete profile"
                                  >
                                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {tableData.length > 0 && (
                <div className="flex justify-between items-center mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex space-x-3">
                    <button
                      onClick={handleSaveProfiles}
                      disabled={saving}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center"
                    >
                      {saving ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Saving...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Save Profiles
                        </>
                      )}
                    </button>
                  </div>
                  <div className="text-sm text-gray-600">
                    {tableData.length} candidate{tableData.length !== 1 ? 's' : ''} ready to save
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Submitted Profiles */}
        {currentStep === 'submitted_profiles' && (
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Step 2: Submitted Profiles</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Review and manage candidate profiles for this requirement
                  </p>
                </div>
                <div className="flex space-x-2">
                                                                            <button
                      onClick={handleSendMail}
                      disabled={profiles.length === 0 || sending}
                      className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center"
                      title="Send profiles via email"
                    >
                      {sending ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Sending...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          Send Mail
                        </>
                      )}
                    </button>
                  <button
                    onClick={() => setCurrentStep('candidate_submission')}
                    className="px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                  >
                    ← Back to Step 1
                  </button>
                </div>
              </div>
            </div>
            
            {profiles.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p className="text-lg">No profiles found for this requirement.</p>
                <div className="flex justify-center space-x-4 mt-4">
                  <button
                    onClick={() => setCurrentStep('candidate_submission')}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Go Back to Step 1
                  </button>
                  <button
                    onClick={() => setCurrentStep('candidate_submission')}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Add Candidates
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Candidate Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Experience</th>
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
                            <p>{profile.email_id}</p>
                            <p className="text-xs text-gray-400">{profile.contact_no}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            <p>{profile.total_experience} years total</p>
                            <p className="text-xs text-gray-400">{profile.relevant_experience} years relevant</p>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {/* Summary */}
            {profiles.length > 0 && (
              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center">
                  <div className="flex space-x-4 text-sm">
                    <span className="text-gray-600">
                      Total: <span className="font-medium">{profiles.length}</span>
                    </span>
                    <span className="text-green-600">
                      Selected: <span className="font-medium">{selectedProfiles.size}</span>
                    </span>
                    <span className="text-red-600">
                      Rejected: <span className="font-medium">{rejectedProfiles.size}</span>
                    </span>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={exportProfilesToDocument}
                      disabled={profiles.length === 0 || exporting}
                      className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center"
                      title="Export profiles as Word document"
                    >
                      {exporting ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-1 h-3 w-3 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Generating...
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Export
                        </>
                      )}
                    </button>
                    <button
                      onClick={resetCandidateSubmission}
                      className="px-3 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
                      title="Reset all selections"
                    >
                      Reset All
                    </button>
                    <button
                      onClick={handleMoveToScreening}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Next: Screening
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Screening */}
        {currentStep === 'screening' && (
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Step 3: Screening</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Review and select/reject candidates from submitted profiles
                  </p>
                </div>
                <button
                  onClick={() => setCurrentStep('submitted_profiles')}
                  className="px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                >
                  ← Back to Step 2
                </button>
              </div>
            </div>
            
            {profiles.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p className="text-lg">No profiles available for screening.</p>
                <button
                  onClick={() => setCurrentStep('submitted_profiles')}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 mt-4"
                >
                  Go Back to Step 2
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Candidate Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Experience</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
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
                            <p>{profile.email_id}</p>
                            <p className="text-xs text-gray-400">{profile.contact_no}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            <p>{profile.total_experience} years total</p>
                            <p className="text-xs text-gray-400">{profile.relevant_experience} years relevant</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            {(() => {
                              const displayInfo = getStepDisplayDate(profile, 'screening');
                              return (
                                <p className={`text-xs ${displayInfo.color}`}>
                                  {displayInfo.label}: {displayInfo.date}
                                </p>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleScreeningSelect(profile.student_id)}
                              disabled={isProfileActionBlocked(profile, 'screening')}
                              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                isProfileActionBlocked(profile, 'screening')
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : screeningSelected.has(profile.student_id)
                                  ? 'bg-green-600 text-white hover:bg-green-700'
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                              title={isProfileActionBlocked(profile, 'screening') ? 'Profile has progressed beyond this step - cannot modify' : screeningSelected.has(profile.student_id) ? 'Click to undo selection' : 'Click to select'}
                            >
                              {screeningSelected.has(profile.student_id) ? '✓ Selected' : 'Select'}
                            </button>
                            <button
                              onClick={() => handleScreeningReject(profile.student_id)}
                              disabled={isProfileActionBlocked(profile, 'screening')}
                              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                isProfileActionBlocked(profile, 'screening')
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : screeningRejected.has(profile.student_id)
                                  ? 'bg-red-600 text-white hover:bg-red-700'
                                  : 'bg-red-100 text-red-700 hover:bg-red-200'
                              }`}
                              title={isProfileActionBlocked(profile, 'screening') ? 'Profile has progressed beyond this step - cannot modify' : screeningRejected.has(profile.student_id) ? 'Click to undo rejection' : 'Click to reject'}
                            >
                              {screeningRejected.has(profile.student_id) ? '✗ Rejected' : 'Reject'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {/* Summary */}
            {profiles.length > 0 && (
              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center">
                  <div className="flex space-x-4 text-sm">
                    <span className="text-gray-600">
                      Total: <span className="font-medium">{profiles.length}</span>
                    </span>
                    <span className="text-green-600">
                      Selected: <span className="font-medium">{screeningSelected.size}</span>
                    </span>
                    <span className="text-red-600">
                      Rejected: <span className="font-medium">{screeningRejected.size}</span>
                    </span>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={resetScreening}
                      className="px-3 py-1 text-xs rounded bg-gray-500 text-white hover:bg-gray-600"
                      title="Reset all screening selections"
                    >
                      Reset All
                    </button>
                    <button
                      onClick={handleMoveToInterviewScheduled}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Next: Interview Scheduled
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Interview Scheduled */}
        {currentStep === 'interview_scheduled' && (
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Step 4: Interview Scheduled</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Mark candidates as scheduled for interview
                  </p>
                </div>
                <button
                  onClick={() => setCurrentStep('screening')}
                  className="px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                >
                  ← Back to Step 3
                </button>
              </div>
            </div>
            
            {screeningSelected.size === 0 && interviewScheduled.size === 0 && interviewRescheduled.size === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p className="text-lg">No candidates selected for interview scheduling.</p>
                <button
                  onClick={() => setCurrentStep('screening')}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 mt-4"
                >
                  Go Back to Step 3
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Candidate Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Experience</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Meet Link</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {profiles.filter(profile => screeningSelected.has(profile.student_id) || interviewScheduled.has(profile.student_id) || interviewRescheduled.has(profile.student_id)).map((profile) => (
                      <tr key={profile.student_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {profile.candidate_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            <p>{profile.email_id}</p>
                            <p className="text-xs text-gray-400">{profile.contact_no}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            <p>{profile.total_experience} years total</p>
                            <p className="text-xs text-gray-400">{profile.relevant_experience} years relevant</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {(() => {
                            const meetInfo = getMeetLinkForCandidate(profile.student_id, 'interview_scheduled');
                            if (loadingMeetLinks) {
                              return <div className="text-gray-400">Loading...</div>;
                            }
                            if (meetInfo && meetInfo.meet_link) {
                              return (
                                <div className="space-y-1">
                                  <a
                                    href={meetInfo.meet_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                                  >
                                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                    </svg>
                                    Join Meeting
                                  </a>
                                  {meetInfo.start_time && meetInfo.end_time && (
                                    <div className="text-xs text-gray-500">
                                      {formatMeetingTime(meetInfo.start_time, meetInfo.end_time, meetInfo.timezone || 'UTC')}
                                    </div>
                                  )}
                                </div>
                              );
                            }
                            return <div className="text-gray-400">—</div>;
                          })()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            {(() => {
                              const displayInfo = getStepDisplayDate(profile, 'interview_scheduled');
                              return (
                                <p className={`text-xs ${displayInfo.color}`}>
                                  {displayInfo.label}: {displayInfo.date}
                                </p>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleInterviewScheduled(profile.student_id)}
                              disabled={isProfileActionBlocked(profile, 'interview_scheduled')}
                              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                isProfileActionBlocked(profile, 'interview_scheduled')
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : interviewScheduled.has(profile.student_id)
                                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                              }`}
                              title={isProfileActionBlocked(profile, 'interview_scheduled') ? 'Profile has progressed beyond this step - cannot modify' : interviewScheduled.has(profile.student_id) ? 'Click to undo scheduling' : 'Click to mark as scheduled'}
                            >
                              {interviewScheduled.has(profile.student_id) ? '✓ Scheduled' : 'Mark as Scheduled'}
                            </button>
                            <button
                              onClick={() => handleInterviewRescheduled(profile.student_id)}
                              disabled={isProfileActionBlocked(profile, 'interview_scheduled')}
                              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                isProfileActionBlocked(profile, 'interview_scheduled')
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : interviewRescheduled.has(profile.student_id)
                                  ? 'bg-orange-600 text-white hover:bg-orange-700'
                                  : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                              }`}
                              title={isProfileActionBlocked(profile, 'interview_scheduled') ? 'Profile has progressed beyond this step - cannot modify' : interviewRescheduled.has(profile.student_id) ? 'Click to undo re-scheduling' : 'Click to mark as re-scheduled'}
                            >
                              {interviewRescheduled.has(profile.student_id) ? '✓ Re-Scheduled' : 'Re-Scheduled'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {/* Summary */}
            {screeningSelected.size > 0 && (
              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center">
                  <div className="flex space-x-4 text-sm">
                    <span className="text-gray-600">
                      Total: <span className="font-medium">{screeningSelected.size}</span>
                    </span>
                    <span className="text-blue-600">
                      Scheduled: <span className="font-medium">{interviewScheduled.size}</span>
                    </span>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleInitiateInterviewEmail('interview_scheduled')}
                      disabled={interviewScheduled.size === 0 || creatingMeeting}
                      className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center"
                      title="Send interview email with Teams meeting link"
                    >
                      {creatingMeeting ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Creating Meeting...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          Send Interview Email
                        </>
                      )}
                    </button>
                    <button
                      onClick={resetInterviewScheduled}
                      className="px-3 py-1 text-xs rounded bg-gray-500 text-white hover:bg-gray-600"
                      title="Reset all interview scheduling"
                    >
                      Reset All
                    </button>
                    <button
                      onClick={handleMoveToRound1}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Next: Interview Round 1
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 5: Interview Round 1 */}
        {currentStep === 'interview_round_1' && (
          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Step 5: Interview Round 1</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Select or reject candidates after Round 1 interview
                  </p>
                </div>
                <button
                  onClick={() => setCurrentStep('interview_scheduled')}
                  className="px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                >
                  ← Back to Step 4
                </button>
              </div>
            </div>
            
            {interviewScheduled.size === 0 && round1Selected.size === 0 && round1Rejected.size === 0 && round1Rescheduled.size === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p className="text-lg">No candidates scheduled for interview.</p>
                <button
                  onClick={() => setCurrentStep('interview_scheduled')}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 mt-4"
                >
                  Go Back to Step 4
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Candidate Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Experience</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Meet Link</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {profiles.filter(profile => interviewScheduled.has(profile.student_id) || round1Selected.has(profile.student_id) || round1Rejected.has(profile.student_id) || round1Rescheduled.has(profile.student_id)).map((profile) => (
                      <tr key={profile.student_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {profile.candidate_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            <p>{profile.email_id}</p>
                            <p className="text-xs text-gray-400">{profile.contact_no}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            <p>{profile.total_experience} years total</p>
                            <p className="text-xs text-gray-400">{profile.relevant_experience} years relevant</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {(() => {
                            const meetInfo = getMeetLinkForCandidate(profile.student_id, 'interview_round_1');
                            if (loadingMeetLinks) {
                              return <div className="text-gray-400">Loading...</div>;
                            }
                            if (meetInfo && meetInfo.meet_link) {
                              return (
                                <div className="space-y-1">
                                  <a
                                    href={meetInfo.meet_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                                  >
                                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                    </svg>
                                    Join Meeting
                                  </a>
                                  {meetInfo.start_time && meetInfo.end_time && (
                                    <div className="text-xs text-gray-500">
                                      {formatMeetingTime(meetInfo.start_time, meetInfo.end_time, meetInfo.timezone || 'UTC')}
                                    </div>
                                  )}
                                </div>
                              );
                            }
                            return <div className="text-gray-400">—</div>;
                          })()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            {(() => {
                              const displayInfo = getStepDisplayDate(profile, 'interview_round_1');
                              return (
                                <p className={`text-xs ${displayInfo.color}`}>
                                  {displayInfo.label}: {displayInfo.date}
                                </p>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleRound1Select(profile.student_id)}
                              disabled={isProfileActionBlocked(profile, 'interview_round_1')}
                              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                isProfileActionBlocked(profile, 'interview_round_1')
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : round1Selected.has(profile.student_id)
                                  ? 'bg-green-600 text-white hover:bg-green-700'
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                              title={isProfileActionBlocked(profile, 'interview_round_1') ? 'Profile has progressed beyond this step - cannot modify' : round1Selected.has(profile.student_id) ? 'Click to undo selection' : 'Click to select'}
                            >
                              {round1Selected.has(profile.student_id) ? '✓ Selected' : 'Select'}
                            </button>
                            <button
                              onClick={() => handleRound1Reject(profile.student_id)}
                              disabled={isProfileActionBlocked(profile, 'interview_round_1')}
                              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                isProfileActionBlocked(profile, 'interview_round_1')
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : round1Rejected.has(profile.student_id)
                                  ? 'bg-red-600 text-white hover:bg-red-700'
                                  : 'bg-red-100 text-red-700 hover:bg-red-200'
                              }`}
                              title={isProfileActionBlocked(profile, 'interview_round_1') ? 'Profile has progressed beyond this step - cannot modify' : round1Rejected.has(profile.student_id) ? 'Click to undo rejection' : 'Click to reject'}
                            >
                              {round1Rejected.has(profile.student_id) ? '✗ Rejected' : 'Reject'}
                            </button>
                            <button
                              onClick={() => handleRound1Rescheduled(profile.student_id)}
                              disabled={isProfileActionBlocked(profile, 'interview_round_1')}
                              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                isProfileActionBlocked(profile, 'interview_round_1')
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : round1Rescheduled.has(profile.student_id)
                                  ? 'bg-orange-600 text-white hover:bg-orange-700'
                                  : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                              }`}
                              title={isProfileActionBlocked(profile, 'interview_round_1') ? 'Profile has progressed beyond this step - cannot modify' : round1Rescheduled.has(profile.student_id) ? 'Click to undo re-scheduling' : 'Click to mark as re-scheduled'}
                            >
                              {round1Rescheduled.has(profile.student_id) ? '✓ Re-Scheduled' : 'Re-Scheduled'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {/* Summary */}
            {interviewScheduled.size > 0 && (
              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center">
                  <div className="flex space-x-4 text-sm">
                    <span className="text-gray-600">
                      Total: <span className="font-medium">{interviewScheduled.size}</span>
                    </span>
                    <span className="text-green-600">
                      Selected: <span className="font-medium">{round1Selected.size}</span>
                    </span>
                    <span className="text-red-600">
                      Rejected: <span className="font-medium">{round1Rejected.size}</span>
                    </span>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleInitiateInterviewEmail('interview_round_1')}
                      disabled={round1Selected.size === 0 || creatingMeeting}
                      className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center"
                      title="Send Round 1 interview email with Teams meeting link"
                    >
                      {creatingMeeting ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Creating Meeting...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          Send Round 1 Email
                        </>
                      )}
                    </button>
                    <button
                      onClick={resetRound1}
                      className="px-3 py-1 text-xs rounded bg-gray-500 text-white hover:bg-gray-600"
                      title="Reset all Round 1 selections"
                    >
                      Reset All
                    </button>
                    <button
                      onClick={handleMoveToRound2}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Next: Interview Round 2
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 6: Interview Round 2 */}
        {currentStep === 'interview_round_2' && (
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Step 6: Interview Round 2</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Select or reject candidates after Round 2 interview
                  </p>
                </div>
                <button
                  onClick={() => setCurrentStep('interview_round_1')}
                  className="px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                >
                  ← Back to Step 5
                </button>
              </div>
            </div>
            
            {round1Selected.size === 0 && round2Selected.size === 0 && round2Rejected.size === 0 && round2Rescheduled.size === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p className="text-lg">No candidates selected from Round 1.</p>
                <button
                  onClick={() => setCurrentStep('interview_round_1')}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 mt-4"
                >
                  Go Back to Step 5
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Candidate Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Experience</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Meet Link</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {profiles.filter(profile => round1Selected.has(profile.student_id) || round2Selected.has(profile.student_id) || round2Rejected.has(profile.student_id) || round2Rescheduled.has(profile.student_id)).map((profile) => (
                      <tr key={profile.student_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {profile.candidate_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            <p>{profile.email_id}</p>
                            <p className="text-xs text-gray-400">{profile.contact_no}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            <p>{profile.total_experience} years total</p>
                            <p className="text-xs text-gray-400">{profile.relevant_experience} years relevant</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {(() => {
                            const meetInfo = getMeetLinkForCandidate(profile.student_id, 'interview_round_2');
                            if (loadingMeetLinks) {
                              return <div className="text-gray-400">Loading...</div>;
                            }
                            if (meetInfo && meetInfo.meet_link) {
                              return (
                                <div className="space-y-1">
                                  <a
                                    href={meetInfo.meet_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                                  >
                                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                    </svg>
                                    Join Meeting
                                  </a>
                                  {meetInfo.start_time && meetInfo.end_time && (
                                    <div className="text-xs text-gray-500">
                                      {formatMeetingTime(meetInfo.start_time, meetInfo.end_time, meetInfo.timezone || 'UTC')}
                                    </div>
                                  )}
                                </div>
                              );
                            }
                            return <div className="text-gray-400">—</div>;
                          })()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            {(() => {
                              const displayInfo = getStepDisplayDate(profile, 'interview_round_2');
                              return (
                                <p className={`text-xs ${displayInfo.color}`}>
                                  {displayInfo.label}: {displayInfo.date}
                                </p>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleRound2Select(profile.student_id)}
                              disabled={isProfileActionBlocked(profile, 'interview_round_2')}
                              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                isProfileActionBlocked(profile, 'interview_round_2')
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : round2Selected.has(profile.student_id)
                                  ? 'bg-green-600 text-white hover:bg-green-700'
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                              title={isProfileActionBlocked(profile, 'interview_round_2') ? 'Profile has progressed beyond this step - cannot modify' : round2Selected.has(profile.student_id) ? 'Click to undo selection' : 'Click to select'}
                            >
                              {round2Selected.has(profile.student_id) ? '✓ Selected' : 'Select'}
                            </button>
                            <button
                              onClick={() => handleRound2Reject(profile.student_id)}
                              disabled={isProfileActionBlocked(profile, 'interview_round_2')}
                              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                isProfileActionBlocked(profile, 'interview_round_2')
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : round2Rejected.has(profile.student_id)
                                  ? 'bg-red-600 text-white hover:bg-red-700'
                                  : 'bg-red-100 text-red-700 hover:bg-red-200'
                              }`}
                              title={isProfileActionBlocked(profile, 'interview_round_2') ? 'Profile has progressed beyond this step - cannot modify' : round2Rejected.has(profile.student_id) ? 'Click to undo rejection' : 'Click to reject'}
                            >
                              {round2Rejected.has(profile.student_id) ? '✗ Rejected' : 'Reject'}
                            </button>
                            <button
                              onClick={() => handleRound2Rescheduled(profile.student_id)}
                              disabled={isProfileActionBlocked(profile, 'interview_round_2')}
                              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                isProfileActionBlocked(profile, 'interview_round_2')
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : round2Rescheduled.has(profile.student_id)
                                  ? 'bg-orange-600 text-white hover:bg-orange-700'
                                  : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                              }`}
                              title={isProfileActionBlocked(profile, 'interview_round_2') ? 'Profile has progressed beyond this step - cannot modify' : round2Rescheduled.has(profile.student_id) ? 'Click to undo re-scheduling' : 'Click to mark as re-scheduled'}
                            >
                              {round2Rescheduled.has(profile.student_id) ? '✓ Re-Scheduled' : 'Re-Scheduled'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {/* Summary */}
            {round1Selected.size > 0 && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <div className="flex space-x-4 text-sm">
                    <span className="text-gray-600">
                      Total: <span className="font-medium">{round1Selected.size}</span>
                    </span>
                    <span className="text-green-600">
                      Selected: <span className="font-medium">{round2Selected.size}</span>
                    </span>
                    <span className="text-red-600">
                      Rejected: <span className="font-medium">{round2Rejected.size}</span>
                    </span>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleInitiateInterviewEmail('interview_round_2')}
                      disabled={round2Selected.size === 0 || creatingMeeting}
                      className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center"
                      title="Send Round 2 interview email with Teams meeting link"
                    >
                      {creatingMeeting ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Creating Meeting...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          Send Round 2 Email
                        </>
                      )}
                    </button>
                    <button
                      onClick={resetRound2}
                      className="px-3 py-1 text-xs rounded bg-gray-500 text-white hover:bg-gray-600"
                      title="Reset all Round 2 selections"
                    >
                      Reset All
                    </button>
                    <button
                      onClick={handleMoveToOffered}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Next: Offered
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 7: Offered */}
        {currentStep === 'offered' && (
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Step 7: Offered</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Mark candidates as offered
                  </p>
                </div>
                <button
                  onClick={() => setCurrentStep('interview_round_2')}
                  className="px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                >
                  ← Back to Step 6
                </button>
              </div>
            </div>
            
            {round2Selected.size === 0 && offered.size === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p className="text-lg">No candidates selected from Round 2.</p>
                <button
                  onClick={() => setCurrentStep('interview_round_2')}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 mt-4"
                >
                  Go Back to Step 6
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Candidate Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Experience</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {profiles.filter(profile => round2Selected.has(profile.student_id) || offered.has(profile.student_id)).map((profile) => (
                      <tr key={profile.student_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {profile.candidate_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            <p>{profile.email_id}</p>
                            <p className="text-xs text-gray-400">{profile.contact_no}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            <p>{profile.total_experience} years total</p>
                            <p className="text-xs text-gray-400">{profile.relevant_experience} years relevant</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            {(() => {
                              const displayInfo = getStepDisplayDate(profile, 'offered');
                              return (
                                <p className={`text-xs ${displayInfo.color}`}>
                                  {displayInfo.label}: {displayInfo.date}
                                </p>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <button
                            onClick={() => handleOffered(profile.student_id)}
                            disabled={isProfileActionBlocked(profile, 'offered')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                              isProfileActionBlocked(profile, 'offered')
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : offered.has(profile.student_id)
                                ? 'bg-green-600 text-white hover:bg-green-700'
                                : 'bg-green-100 text-green-700 hover:bg-green-200'
                            }`}
                            title={isProfileActionBlocked(profile, 'offered') ? 'Profile has progressed beyond this step - cannot modify' : offered.has(profile.student_id) ? 'Click to undo offer' : 'Click to mark as offered'}
                          >
                            {offered.has(profile.student_id) ? '✓ Offered' : 'Mark as Offered'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {/* Summary */}
            {round2Selected.size > 0 && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <div className="flex space-x-4 text-sm">
                    <span className="text-gray-600">
                      Total: <span className="font-medium">{round2Selected.size}</span>
                    </span>
                    <span className="text-green-600">
                      Offered: <span className="font-medium">{offered.size}</span>
                    </span>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={resetOffered}
                      className="px-3 py-1 text-xs rounded bg-gray-500 text-white hover:bg-gray-600"
                      title="Reset all offer selections"
                    >
                      Reset All
                    </button>
                    <button
                      onClick={handleMoveToOnboarding}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Move to OnBoarding
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 8: OnBoarding */}
        {currentStep === 'onboarding' && (
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Step 8: OnBoarding</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Mark candidates as onboarded
                  </p>
                </div>
                <button
                  onClick={() => setCurrentStep('offered')}
                  className="px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                >
                  ← Back to Step 7
                </button>
              </div>
            </div>
            
            {offered.size === 0 && onboarding.size === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p className="text-lg">No candidates offered yet.</p>
                <button
                  onClick={() => setCurrentStep('offered')}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 mt-4"
                >
                  Go Back to Step 7
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Candidate Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Experience</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {profiles.filter(profile => offered.has(profile.student_id) || onboarding.has(profile.student_id)).map((profile) => (
                      <tr key={profile.student_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {profile.candidate_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            <p>{profile.email_id}</p>
                            <p className="text-xs text-gray-400">{profile.contact_no}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            <p>{profile.total_experience} years total</p>
                            <p className="text-xs text-gray-400">{profile.relevant_experience} years relevant</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            {(() => {
                              const displayInfo = getStepDisplayDate(profile, 'onboarding');
                              return (
                                <p className={`text-xs ${displayInfo.color}`}>
                                  {displayInfo.label}: {displayInfo.date}
                                </p>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <button
                            onClick={() => handleOnboarding(profile.student_id)}
                            disabled={isProfileActionBlocked(profile, 'onboarding')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                              isProfileActionBlocked(profile, 'onboarding')
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : onboarding.has(profile.student_id)
                                ? 'bg-pink-600 text-white hover:bg-pink-700'
                                : 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                            }`}
                            title={isProfileActionBlocked(profile, 'onboarding') ? 'Profile has progressed beyond this step - cannot modify' : onboarding.has(profile.student_id) ? 'Click to undo onboarding' : 'Click to mark as onboarded'}
                          >
                            {onboarding.has(profile.student_id) ? '✓ OnBoarded' : 'Mark as OnBoarded'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {/* Summary */}
            {offered.size > 0 && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <div className="flex space-x-4 text-sm">
                    <span className="text-gray-600">
                      Total: <span className="font-medium">{offered.size}</span>
                    </span>
                    <span className="text-pink-600">
                      OnBoarded: <span className="font-medium">{onboarding.size}</span>
                    </span>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={resetOnboarding}
                      className="px-3 py-1 text-xs rounded bg-gray-500 text-white hover:bg-gray-600"
                      title="Reset all onboarding selections"
                    >
                      Reset All
                    </button>
                    <button
                      onClick={handleCompleteWorkflow}
                      className="px-4 py-2 bg-pink-600 text-white rounded hover:bg-pink-700"
                    >
                      Complete Workflow
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Column Selection Modal */}
        {showColumnSelectionModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Select Profiles and Columns for Email</h2>
                <button
                  onClick={() => setShowColumnSelectionModal(false)}
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
                  {/* Profile Selection Section */}
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-3">Select Profiles to Send</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Choose which candidate profiles you want to include in the email. You can select individual profiles or use the bulk selection options.
                    </p>
                    
                    {/* Profile Selection Controls */}
                    <div className="flex space-x-3 mb-4">
                      <button
                        onClick={handleSelectAllProfilesForEmail}
                        className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                      >
                        Select All Profiles
                      </button>
                      <button
                        onClick={handleDeselectAllProfilesForEmail}
                        className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                      >
                        Deselect All Profiles
                      </button>
                    </div>

                    {/* Profile List */}
                    <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              <input
                                type="checkbox"
                                checked={selectedProfilesForEmail.size === profiles.length && profiles.length > 0}
                                onChange={() => {
                                  if (selectedProfilesForEmail.size === profiles.length) {
                                    handleDeselectAllProfilesForEmail();
                                  } else {
                                    handleSelectAllProfilesForEmail();
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              />
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Candidate Name</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Experience</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Company</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {profiles.map((profile) => (
                            <tr key={profile.student_id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={selectedProfilesForEmail.has(profile.student_id)}
                                  onChange={() => handleProfileToggleForEmail(profile.student_id)}
                                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                                {profile.candidate_name}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {profile.total_experience} years
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {profile.current_company || 'N/A'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    <div className="mt-2 text-sm text-gray-600">
                      Selected: {selectedProfilesForEmail.size} of {profiles.length} profiles
                    </div>
                  </div>

                  {/* Column Selection Section */}
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-3">Select Columns for Email</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Select which columns you want to include in the email template. Required columns are pre-selected and cannot be deselected.
                    </p>
                    
                    {/* Column Selection Controls */}
                    <div className="flex space-x-3 mb-6">
                      <button
                        onClick={handleSelectAllColumns}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      >
                        Select All
                      </button>
                      <button
                        onClick={handleDeselectAllColumns}
                        className="px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                      >
                        Select Required Only
                      </button>
                    </div>

                    {/* Column List */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {availableColumns.map((column) => (
                        <div key={column.id} className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg">
                          <input
                            type="checkbox"
                            id={column.id}
                            checked={selectedColumns.includes(column.id)}
                            onChange={() => handleColumnToggle(column.id)}
                            disabled={column.required}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <label
                            htmlFor={column.id}
                            className={`text-sm font-medium ${
                              column.required ? 'text-gray-900' : 'text-gray-700'
                            } ${column.required ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            {column.label}
                            {column.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                        </div>
                      ))}
                    </div>

                    {/* Preview */}
                    <div className="mt-6">
                      <h3 className="text-lg font-medium text-gray-900 mb-3">Email Preview</h3>
                      <div className="border border-gray-300 rounded-md p-4 bg-gray-50">
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="bg-gray-100">
                                {selectedColumns.map((columnId) => {
                                  const column = availableColumns.find(col => col.id === columnId);
                                  return (
                                    <th key={columnId} className="px-3 py-2 text-left font-medium text-gray-700 border border-gray-300">
                                      {column?.label}
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              {profiles
                                .filter(profile => selectedProfilesForEmail.has(profile.student_id))
                                .slice(0, 3)
                                .map((profile, index) => (
                                  <tr key={index} className="bg-white">
                                    {selectedColumns.map((columnId) => (
                                      <td key={columnId} className="px-3 py-2 border border-gray-300 text-gray-600">
                                        {profile[columnId] || 'N/A'}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              {profiles.filter(profile => selectedProfilesForEmail.has(profile.student_id)).length > 3 && (
                                <tr className="bg-gray-50">
                                  <td colSpan={selectedColumns.length} className="px-3 py-2 text-center text-gray-500 text-xs">
                                    ... and {profiles.filter(profile => selectedProfilesForEmail.has(profile.student_id)).length - 3} more profiles
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
                <button
                  onClick={() => setShowColumnSelectionModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProceedToEmail}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Proceed to Email
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Profile Modal */}
        {showEditModal && editingProfile && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Edit Profile: {editingProfile.candidate_name}</h2>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingProfile(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Basic Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">Basic Information</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Candidate Name *
                      </label>
                      <input
                        type="text"
                        value={editingProfile.candidate_name}
                        onChange={(e) => handleEditInputChange('candidate_name', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={editingProfile.email_id || ''}
                        onChange={(e) => handleEditInputChange('email_id', e.target.value)}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          editingProfile.email_id && editingProfile.email_id.trim() && !isValidEmail(editingProfile.email_id)
                            ? 'border-red-500 focus:ring-red-500'
                            : 'border-gray-300'
                        }`}
                      />
                      {editingProfile.email_id && editingProfile.email_id.trim() && !isValidEmail(editingProfile.email_id) && (
                        <p className="text-red-500 text-xs mt-1">Please enter a valid email address</p>
                      )}
                    </div>



                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Contact Number
                      </label>
                      <input
                        type="text"
                        value={editingProfile.contact_no || ''}
                        onChange={(e) => handleEditInputChange('contact_no', e.target.value)}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          editingProfile.contact_no && editingProfile.contact_no.trim() && !isValidPhone(editingProfile.contact_no)
                            ? 'border-red-500 focus:ring-red-500'
                            : 'border-gray-300'
                        }`}
                      />
                      {editingProfile.contact_no && editingProfile.contact_no.trim() && !isValidPhone(editingProfile.contact_no) && (
                        <p className="text-red-500 text-xs mt-1">Please enter a valid contact number (exactly 10 digits)</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Location
                      </label>
                      <input
                        type="text"
                        value={editingProfile.location || ''}
                        onChange={(e) => handleEditInputChange('location', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Experience & Company */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">Experience & Company</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Total Experience (Years)
                      </label>
                      <input
                        type="number"
                        value={editingProfile.total_experience || ''}
                        onChange={(e) => handleEditInputChange('total_experience', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="0"
                        step="0.1"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Relevant Experience (Years)
                      </label>
                      <input
                        type="number"
                        value={editingProfile.relevant_experience || ''}
                        onChange={(e) => handleEditInputChange('relevant_experience', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="0"
                        step="0.1"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Current Company
                      </label>
                      <input
                        type="text"
                        value={editingProfile.current_company || ''}
                        onChange={(e) => handleEditInputChange('current_company', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Notice Period (Days)
                      </label>
                      <input
                        type="number"
                        value={editingProfile.notice_period_days || ''}
                        onChange={(e) => handleEditInputChange('notice_period_days', parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="0"
                      />
                    </div>
                  </div>

                  {/* CTC & Additional Info */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">CTC & Additional Info</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Current CTC (LPA)
                      </label>
                      <input
                        type="number"
                        value={editingProfile.ctc_current || ''}
                        onChange={(e) => handleEditInputChange('ctc_current', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="0"
                        step="0.1"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Expected CTC (LPA)
                      </label>
                      <input
                        type="number"
                        value={editingProfile.ctc_expected || ''}
                        onChange={(e) => handleEditInputChange('ctc_expected', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="0"
                        step="0.1"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Source
                      </label>
                      <select
                        value={editingProfile.source || ''}
                        onChange={(e) => handleEditInputChange('source', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select Source</option>
                        <option value="naukri_com">Naukri.com</option>
                        <option value="monster_india">Monster India</option>
                        <option value="timesjobs">TimesJobs</option>
                        <option value="shine_com">Shine.com</option>
                        <option value="freshersworld">FreshersWorld</option>
                        <option value="github_stackoverflow">GitHub/StackOverflow</option>
                        <option value="internshala">Internshala</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Education
                      </label>
                      <input
                        type="text"
                        value={editingProfile.education || ''}
                        onChange={(e) => handleEditInputChange('education', e.target.value)}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          editingProfile.education && editingProfile.education.trim() && editingProfile.education.trim().length < 2
                            ? 'border-yellow-500 focus:ring-yellow-500'
                            : 'border-gray-300'
                        }`}
                      />
                      {editingProfile.education && editingProfile.education.trim() && editingProfile.education.trim().length < 2 && (
                        <p className="text-yellow-600 text-xs mt-1">Education should be at least 2 characters long</p>
                      )}
                    </div>


                  </div>

                  {/* Skills */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">Skills</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Key Skills
                      </label>
                      <textarea
                        value={editingProfile.key_skills || ''}
                        onChange={(e) => handleEditInputChange('key_skills', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={4}
                        placeholder="Enter key skills..."
                      />
                    </div>
                  </div>

                  {/* Resume */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">Resume</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Upload Resume (PDF or DOCX)
                      </label>
                      <input
                        type="file"
                        accept=".pdf,.docx"
                        onChange={handleResumeUpload}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">Maximum file size: 10MB</p>
                    </div>

                    {editingProfile.resume_file_name && (
                      <div className="bg-gray-50 p-3 rounded-md">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              Current Resume: {editingProfile.resume_file_name}
                            </p>
                            <p className="text-xs text-gray-500">
                              Uploaded: {editingProfile.resume_file_path}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDownloadResume(editingProfile.student_id)}
                            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                          >
                            Download
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingProfile(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateProfile}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Update Profile
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Email Modal */}
        {showEmailModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Compose Email</h2>
                <button
                  onClick={() => setShowEmailModal(false)}
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
                  {/* Email Form */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        To Email *
                      </label>
                      <input
                        type="email"
                        value={emailData.recipient_email}
                        onChange={(e) => handleEmailInputChange('recipient_email', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="recipient@example.com"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Recipient Name
                      </label>
                      <input
                        type="text"
                        value={emailData.recipient_name}
                        onChange={(e) => handleEmailInputChange('recipient_name', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Hiring Manager"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cc Email
                    </label>
                    <input
                      type="email"
                      value={emailData.cc_email}
                      onChange={(e) => handleEmailInputChange('cc_email', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="cc@example.com (optional)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Subject *
                    </label>
                    <input
                      type="text"
                      value={emailData.subject}
                      onChange={(e) => handleEmailInputChange('subject', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Email subject"
                      required
                    />
                  </div>

                  {/* Attachments Section */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Attachments
                    </label>
                    <div className="space-y-3">
                      <div>
                        <input
                          type="file"
                          id="email-attachments"
                          multiple
                          accept=".pdf,.docx"
                          onChange={handleEmailAttachmentUpload}
                          className="hidden"
                        />
                        <label
                          htmlFor="email-attachments"
                          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          Add PDF/DOCX Files
                        </label>
                        <p className="mt-1 text-xs text-gray-500">
                          Only PDF and DOCX files are supported
                        </p>
                      </div>
                      
                      {/* Display uploaded attachments */}
                      {emailAttachments.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-gray-700">Selected Files:</p>
                          {emailAttachments.map((file, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                              <div className="flex items-center">
                                <svg className="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="text-sm text-gray-700 truncate max-w-xs">{file.name}</span>
                                <span className="text-xs text-gray-500 ml-2">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleEmailAttachmentRemove(index)}
                                className="text-red-500 hover:text-red-700 p-1"
                                title="Remove file"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Email Preview */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Preview
                    </label>
                    <div className="border border-gray-300 rounded-md p-4 bg-gray-50">
                      <div className="space-y-2 text-sm">
                        <div><strong>To:</strong> {emailData.recipient_name} &lt;{emailData.recipient_email}&gt;</div>
                        {emailData.cc_email && (
                          <div><strong>Cc:</strong> {emailData.cc_email}</div>
                        )}
                        <div><strong>Subject:</strong> {emailData.subject}</div>
                        <div className="border-t pt-2 mt-2">
                          <div className="mb-2">
                            <strong>Dear {emailData.recipient_name || 'Hiring Manager'},</strong>
                          </div>

                          <div className="mb-2">
                            Please find below the candidate profiles for your review:
                          </div>
                          <div className="text-xs text-gray-600">
                            [Email will include a professional table with {profiles.length} candidate profile(s)]
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
                <button
                  onClick={() => setShowEmailModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendEmail}
                  disabled={sending || !emailData.recipient_email || !emailData.subject}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
                >
                  {sending ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Sending...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Send Email
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Teams Meeting Modal */}
        {showTeamsMeetingModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Create Teams Meeting</h2>
                <button
                  onClick={() => setShowTeamsMeetingModal(false)}
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
                  {/* Meeting Details Form */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Meeting Subject *
                      </label>
                      <input
                        type="text"
                        value={teamsMeetingData.subject}
                        onChange={(e) => handleTeamsMeetingInputChange('subject', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Interview Meeting Subject"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Meeting Type
                      </label>
                      <select
                        value={teamsMeetingData.meeting_type}
                        onChange={(e) => handleTeamsMeetingInputChange('meeting_type', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="interview_scheduled">Interview Scheduled</option>
                        <option value="interview_round_1">Interview Round 1</option>
                        <option value="interview_round_2">Interview Round 2</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Start Time *
                      </label>
                      <input
                        type="datetime-local"
                        value={teamsMeetingData.start_time}
                        onChange={(e) => handleTeamsMeetingInputChange('start_time', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        End Time *
                      </label>
                      <input
                        type="datetime-local"
                        value={teamsMeetingData.end_time}
                        onChange={(e) => handleTeamsMeetingInputChange('end_time', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  </div>

                  {/* Attendees Section */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Attendees (Auto-populated from selected candidates)
                    </label>
                    <div className="border border-gray-300 rounded-md p-4 bg-gray-50">
                      <div className="max-h-40 overflow-y-auto">
                        {teamsMeetingData.attendees.map((email, index) => (
                          <div key={index} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-b-0">
                            <span className="text-sm text-gray-700">{email}</span>
                            <button
                              onClick={() => {
                                const newAttendees = teamsMeetingData.attendees.filter((_, i) => i !== index);
                                handleTeamsMeetingInputChange('attendees', newAttendees);
                              }}
                              className="text-red-500 hover:text-red-700 text-sm"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                      {teamsMeetingData.attendees.length === 0 && (
                        <p className="text-sm text-gray-500 italic">No attendees selected</p>
                      )}
                    </div>
                  </div>

                  {/* Meeting Preview */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Meeting Preview
                    </label>
                    <div className="border border-gray-300 rounded-md p-4 bg-gray-50">
                      <div className="space-y-2 text-sm">
                        <div><strong>Subject:</strong> {teamsMeetingData.subject}</div>
                        <div><strong>Type:</strong> {teamsMeetingData.meeting_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
                        <div><strong>Start:</strong> {teamsMeetingData.start_time ? new Date(teamsMeetingData.start_time).toLocaleString() : 'Not set'}</div>
                        <div><strong>End:</strong> {teamsMeetingData.end_time ? new Date(teamsMeetingData.end_time).toLocaleString() : 'Not set'}</div>
                        <div><strong>Attendees:</strong> {teamsMeetingData.attendees.length} candidate(s)</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
                <button
                  onClick={() => setShowTeamsMeetingModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateTeamsMeeting}
                  disabled={creatingMeeting || !teamsMeetingData.subject || !teamsMeetingData.start_time || !teamsMeetingData.end_time}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
                >
                  {creatingMeeting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Creating Meeting...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Create Meeting
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Interview Email Form Modal */}
        {showInterviewEmailForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-t border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Send Interview Email</h2>
                <button
                  onClick={() => setShowInterviewEmailForm(false)}
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
                  {/* Email Form */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        To Email *
                      </label>
                      <input
                        type="email"
                        value={interviewEmailData.recipient_email}
                        onChange={(e) => handleInterviewEmailInputChange('recipient_email', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="candidate@example.com"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Recipient Name
                      </label>
                      <input
                        type="text"
                        value={interviewEmailData.recipient_name}
                        onChange={(e) => handleInterviewEmailInputChange('recipient_name', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Candidate Name"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cc Email
                    </label>
                    <input
                      type="email"
                      value={interviewEmailData.cc_email}
                      onChange={(e) => handleInterviewEmailInputChange('cc_email', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="cc@example.com (optional)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Subject *
                    </label>
                    <input
                      type="text"
                      value={interviewEmailData.subject}
                      onChange={(e) => handleInterviewEmailInputChange('subject', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Interview Email Subject"
                      required
                    />
                  </div>

                  {/* Attachments Section */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Attachments
                    </label>
                    <div className="space-y-3">
                      <div>
                        <input
                          type="file"
                          id="interview-email-attachments"
                          multiple
                          accept=".pdf,.docx"
                          onChange={handleInterviewEmailAttachmentUpload}
                          className="hidden"
                        />
                        <label
                          htmlFor="interview-email-attachments"
                          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          Add PDF/DOCX Files
                        </label>
                        <p className="mt-1 text-xs text-gray-500">
                          Only PDF and DOCX files are supported
                        </p>
                      </div>
                      
                      {/* Display uploaded attachments */}
                      {interviewEmailAttachments.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-gray-700">Selected Files:</p>
                          {interviewEmailAttachments.map((file, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                              <div className="flex items-center">
                                <svg className="w-4 h-4 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="text-sm text-gray-700 truncate max-w-xs">{file.name}</span>
                                <span className="text-xs text-gray-500 ml-2">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleInterviewEmailAttachmentRemove(index)}
                                className="text-red-500 hover:text-red-700 p-1"
                                title="Remove file"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Teams Meeting Link */}
                  {teamsMeetingLink && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Teams Meeting Link
                      </label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={teamsMeetingLink}
                          readOnly
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
                        />
                        <button
                          onClick={() => navigator.clipboard.writeText(teamsMeetingLink)}
                          className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                          title="Copy to clipboard"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Email Preview */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Preview
                    </label>
                    <div className="border border-gray-300 rounded-md p-4 bg-gray-50">
                      <div className="space-y-2 text-sm">
                        <div><strong>To:</strong> {interviewEmailData.recipient_name} &lt;{interviewEmailData.recipient_email}&gt;</div>
                        {interviewEmailData.cc_email && (
                          <div><strong>Cc:</strong> {interviewEmailData.cc_email}</div>
                        )}
                        <div><strong>Subject:</strong> {interviewEmailData.subject}</div>
                        <div className="border-t pt-2 mt-2">
                          <div dangerouslySetInnerHTML={{ __html: interviewEmailData.body }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
                <button
                  onClick={() => setShowInterviewEmailForm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendInterviewEmail}
                  disabled={sendingInterviewEmail || !interviewEmailData.recipient_email || !interviewEmailData.subject || !interviewEmailData.body}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
                >
                  {sendingInterviewEmail ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Sending...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Send Email
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

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
                      <p className="font-medium">{movingProfile.email_id || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Current Company:</span>
                      <p className="font-medium">{movingProfile.current_company || 'N/A'}</p>
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