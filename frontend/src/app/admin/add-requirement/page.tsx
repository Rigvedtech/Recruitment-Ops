'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/types/student';
import { api } from '@/services/api';
import RoleGuard from '@/components/RoleGuard';

interface Recruiter {
  id: number;
  username: string;
  email?: string;
  role: string;
}

interface BulkUploadResult {
  row: number;
  status: 'success' | 'error' | 'duplicate';
  request_id?: string;
  job_title?: string;
  message?: string;
  duplicates?: any[];
  match_type?: string;
}

interface DuplicateRequirement {
  id: number;
  request_id: string;
  job_title: string;
  company_name: string;
  department: string;
  location: string;
  created_at: string;
  status: string;
}

const AddRequirementPage: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  // Bulk upload states
  const [uploadMode, setUploadMode] = useState<'single' | 'bulk'>('single');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkUploadResult[]>([]);
  const [showBulkResults, setShowBulkResults] = useState(false);

  // JD upload states
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [jdUploading, setJdUploading] = useState(false);
  const [jdUploadResult, setJdUploadResult] = useState<any>(null);


  // Duplicate handling states
  const [duplicateRequirement, setDuplicateRequirement] = useState<DuplicateRequirement[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [pendingRequirementData, setPendingRequirementData] = useState<any>(null);
  const [duplicateMatchType, setDuplicateMatchType] = useState<string>('');

  // Custom enum values state
  const [customCompany, setCustomCompany] = useState('');
  const [customDepartment, setCustomDepartment] = useState('');
  const [customShift, setCustomShift] = useState('');
  const [customJobType, setCustomJobType] = useState('');
  const [customPriority, setCustomPriority] = useState('');
  const [showCustomInput, setShowCustomInput] = useState<{
    company: boolean;
    department: boolean;
    shift: boolean;
    jobType: boolean;
    priority: boolean;
  }>({
    company: false,
    department: false,
    shift: false,
    jobType: false,
    priority: false
  });

  // Dynamic enum options state - stores display values
  const [dynamicOptions, setDynamicOptions] = useState<{
    companies: string[];
    departments: string[];
    shifts: string[];
    jobTypes: string[];
    priorities: string[];
  }>({
    companies: [],
    departments: [],
    shifts: [],
    jobTypes: [],
    priorities: []
  });

  // Mapping between display values and sanitized values
  const [enumValueMapping, setEnumValueMapping] = useState<{
    companies: { [key: string]: string };
    departments: { [key: string]: string };
    shifts: { [key: string]: string };
    jobTypes: { [key: string]: string };
    priorities: { [key: string]: string };
  }>({
    companies: {},
    departments: {},
    shifts: {},
    jobTypes: {},
    priorities: {}
  });

  // Load existing enum values from database on component mount
  useEffect(() => {
    const loadEnumValues = async () => {
      const enumTypes = ['company', 'department', 'shift', 'job_type', 'priority'];
      
      for (const enumType of enumTypes) {
        try {
          const response = await api.get(`/get-enum-values?enum_type=${enumType}`);
          if (response.success && response.values) {
            // Filter out predefined values to get only custom ones
            const predefinedValues = getPredefinedValues(enumType);
            const customValues = response.values.filter((value: string) => 
              !predefinedValues.includes(value)
            );
            
            if (customValues.length > 0) {
              setDynamicOptions(prev => {
                let key: keyof typeof prev;
                switch (enumType) {
                  case 'company':
                    key = 'companies';
                    break;
                  case 'department':
                    key = 'departments';
                    break;
                  case 'shift':
                    key = 'shifts';
                    break;
                  case 'job_type':
                    key = 'jobTypes';
                    break;
                  case 'priority':
                    key = 'priorities';
                    break;
                  default:
                    return prev;
                }
                return {
                  ...prev,
                  [key]: customValues
                };
              });
            }
          }
        } catch (error) {
          console.error(`Error loading ${enumType} enum values:`, error);
        }
      }
    };

    loadEnumValues();
  }, []);

  // Helper function to get predefined values for each enum type
  const getPredefinedValues = (enumType: string): string[] => {
    switch (enumType) {
      case 'company':
        return ['tech_corp', 'infosys', 'tcs', 'wipro', 'accenture', 'cognizant', 'capgemini', 'ibm', 'microsoft', 'google', 'amazon', 'oracle', 'sap', 'deloitte', 'pwc', 'kpmg', 'ey', 'mckinsey', 'bcg', 'bain'];
      case 'department':
        return ['engineering', 'human_resources', 'finance', 'marketing', 'sales', 'operations', 'information_technology', 'customer_support', 'product_management', 'quality_assurance', 'business_development', 'legal', 'administration', 'technical'];
      case 'shift':
        return ['day', 'night', 'rotational', 'flexible'];
      case 'job_type':
        return ['full_time', 'part_time', 'contract', 'internship', 'freelance'];
      case 'priority':
        return ['high', 'medium', 'low', 'urgent'];
      default:
        return [];
    }
  };


  const [formData, setFormData] = useState({
    job_title: '',
    company_name: '',
    department: '',
    location: '',
    shift: '',
    job_type: '',
    hiring_manager: '',
    experience_range: '',
    skills_required: '',
    minimum_qualification: '',
    number_of_positions: '',
    budget_ctc: '',
    priority: '',
    tentative_doj: '',
    additional_remarks: '',
    assigned_to: ''
  });

  useEffect(() => {
    // Check if user is logged in and has admin role
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const userData: User = JSON.parse(storedUser);
        if (userData.role === 'admin') {
          setUser(userData);
          fetchRecruiters();
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
  }, [router]);

  const fetchRecruiters = async () => {
    try {
      setLoading(true);
      const recruitersData = await api.get('/users/recruiters');
      setRecruiters(recruitersData);
    } catch (err) {
      console.error('Error fetching recruiters:', err);
      setError('Failed to fetch recruiters');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // Handle "Add New" option selection
    if (value === 'add_new') {
      const fieldType = name.replace('_name', '').replace('_', '') as keyof typeof showCustomInput;
      setShowCustomInput(prev => ({
        ...prev,
        [fieldType]: true
      }));
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    // Update custom value state
    switch (name) {
      case 'customCompany':
        setCustomCompany(value);
        break;
      case 'customDepartment':
        setCustomDepartment(value);
        break;
      case 'customShift':
        setCustomShift(value);
        break;
      case 'customJobType':
        setCustomJobType(value);
        break;
      case 'customPriority':
        setCustomPriority(value);
        break;
    }
  };

  const handleSaveCustomValue = async (fieldType: string) => {
    let customValue = '';
    let formFieldName = '';
    let enumType = '';
    
    switch (fieldType) {
      case 'company':
        customValue = customCompany;
        formFieldName = 'company_name';
        enumType = 'company';
        break;
      case 'department':
        customValue = customDepartment;
        formFieldName = 'department';
        enumType = 'department';
        break;
      case 'shift':
        customValue = customShift;
        formFieldName = 'shift';
        enumType = 'shift';
        break;
      case 'jobType':
        customValue = customJobType;
        formFieldName = 'job_type';
        enumType = 'job_type';
        break;
      case 'priority':
        customValue = customPriority;
        formFieldName = 'priority';
        enumType = 'priority';
        break;
    }
    
    if (customValue.trim()) {
      const trimmedValue = customValue.trim();
      
      try {
        // Call API to add enum value to database
        const requestData = {
          enum_type: enumType,
          new_value: trimmedValue
        };
        console.log('Sending request data:', requestData);
        
        const response = await api.post('/add-enum-value', requestData);
        
        if (response.success) {
          // Set the custom value in form data (use sanitized value for form submission)
          setFormData(prev => ({
            ...prev,
            [formFieldName]: response.added_value // Use sanitized value from backend
          }));
          
          // Add to dynamic options for immediate UI update (use display value)
          const displayValue = response.display_value || trimmedValue;
          const sanitizedValue = response.added_value;
          
          setDynamicOptions(prev => {
            let key: keyof typeof prev;
            switch (fieldType) {
              case 'company':
                key = 'companies';
                break;
              case 'department':
                key = 'departments';
                break;
              case 'shift':
                key = 'shifts';
                break;
              case 'jobType':
                key = 'jobTypes';
                break;
              case 'priority':
                key = 'priorities';
                break;
              default:
                key = 'companies'; // fallback
            }
            const currentArray = Array.isArray(prev[key]) ? prev[key] as string[] : [];
            return {
              ...prev,
              [key]: [...currentArray, displayValue]
            };
          });

          // Store the mapping between display and sanitized values
          setEnumValueMapping(prev => {
            let key: keyof typeof prev;
            switch (fieldType) {
              case 'company':
                key = 'companies';
                break;
              case 'department':
                key = 'departments';
                break;
              case 'shift':
                key = 'shifts';
                break;
              case 'jobType':
                key = 'jobTypes';
                break;
              case 'priority':
                key = 'priorities';
                break;
              default:
                key = 'companies';
            }
            return {
              ...prev,
              [key]: {
                ...prev[key],
                [displayValue]: sanitizedValue
              }
            };
          });
          
          // Hide custom input and reset custom value
          setShowCustomInput(prev => ({
            ...prev,
            [fieldType]: false
          }));
          
          switch (fieldType) {
            case 'company':
              setCustomCompany('');
              break;
            case 'department':
              setCustomDepartment('');
              break;
            case 'shift':
              setCustomShift('');
              break;
            case 'jobType':
              setCustomJobType('');
              break;
            case 'priority':
              setCustomPriority('');
              break;
          }
          
          alert(`Successfully added "${trimmedValue}" to ${fieldType} options!`);
        } else {
          const errorMsg = response.error || 'Failed to add enum value';
          console.error('API returned error:', response);
          alert(errorMsg);
        }
      } catch (error: any) {
        console.error('Error adding enum value:', error);
        const errorMessage = error.response?.data?.error || error.message || 'Failed to add enum value';
        console.error('Full error response:', error.response);
        alert(`Error: ${errorMessage}`);
      }
    }
  };

  const handleCancelCustomValue = (fieldType: string) => {
    // Hide custom input and reset custom value
    setShowCustomInput(prev => ({
      ...prev,
      [fieldType]: false
    }));
    
    switch (fieldType) {
      case 'company':
        setCustomCompany('');
        break;
      case 'department':
        setCustomDepartment('');
        break;
      case 'shift':
        setCustomShift('');
        break;
      case 'jobType':
        setCustomJobType('');
        break;
      case 'priority':
        setCustomPriority('');
        break;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);

      // Validate required fields
      if (!formData.job_title.trim()) {
        setError('Job title is required');
        return;
      }

      if (!formData.company_name.trim()) {
        setError('Company name is required');
        return;
      }

      if (!formData.department.trim()) {
        setError('Department is required');
        return;
      }

      if (!formData.location.trim()) {
        setError('Location is required');
        return;
      }

      if (!formData.shift.trim()) {
        setError('Shift is required');
        return;
      }

      if (!formData.job_type.trim()) {
        setError('Job type is required');
        return;
      }

      if (!formData.priority.trim()) {
        setError('Priority is required');
        return;
      }

      // Prepare data for submission
      const submissionData = {
        ...formData,
        number_of_positions: formData.number_of_positions ? parseInt(formData.number_of_positions) : null,
        tentative_doj: formData.tentative_doj || null,
        // Include JD fields if uploaded
        job_description: jdUploadResult?.job_description_text || null,
        jd_path: jdUploadResult?.file_path || null,
        job_file_name: jdUploadResult?.original_filename || null
      };

      // If we have a JD file but haven't uploaded it to our system yet, upload it now
      if (jdFile && jdUploadResult && !jdUploadResult.file_path) {
        try {
          const jdUploadResponse = await api.uploadJobDescription(jdFile);
          submissionData.jd_path = jdUploadResponse.file_info.file_path;
          submissionData.job_description = jdUploadResponse.file_info.job_description_text;
        } catch (err) {
          console.warn('Failed to upload JD to our system, continuing without JD file:', err);
          // Continue without JD file if upload fails
        }
      }

      const response = await api.createRequirement(submissionData);
      
      // Check if duplicates were found
      if (response.has_duplicates) {
        setDuplicateRequirement(response.duplicate_check.duplicates);
        setDuplicateMatchType(response.duplicate_check.match_type);
        setPendingRequirementData(submissionData);
        setShowDuplicateModal(true);
        return;
      }
      
      setSuccess(`Requirement created successfully! Request ID: ${response.requirement.request_id}`);
      
      // Reset form after successful submission
      setFormData({
        job_title: '',
        company_name: '',
        department: '',
        location: '',
        shift: '',
        job_type: '',
        hiring_manager: '',
        experience_range: '',
        skills_required: '',
        minimum_qualification: '',
        number_of_positions: '',
        budget_ctc: '',
        priority: '',
        tentative_doj: '',
        additional_remarks: '',
        assigned_to: ''
      });
      
      // Reset JD upload
      setJdFile(null);
      setJdUploadResult(null);



    } catch (err: any) {
      console.error('Error creating requirement:', err);
      setError(err.message || 'Failed to create requirement');
    } finally {
      setSubmitting(false);
    }
  };

  // Bulk upload handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
        'application/csv'
      ];
      if (!allowedTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.csv')) {
        setError('Please select a valid Excel file (.xlsx or .xls) or CSV file (.csv)');
        return;
      }
      
      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }
      
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setError(null);
    // Reset the file input
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  // JD file handlers
  const handleJdFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      const allowedExtensions = ['.pdf', '.docx'];
      const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      
      if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
        setError('Please select a valid PDF or DOCX file');
        return;
      }
      
      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError('JD file size must be less than 10MB');
        return;
      }
      
      setJdFile(file);
      setError(null);
    }
  };

  const handleRemoveJdFile = () => {
    setJdFile(null);
    setJdUploadResult(null);
    setError(null);
    // Reset the file input
    const fileInput = document.getElementById('jd-upload') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleJdUpload = async () => {
    if (!jdFile) {
      setError('Please select a JD file to upload');
      return;
    }

    try {
      setJdUploading(true);
      setError(null);

      // Step 1: Upload to your JD parsing service
      const parseResponse = await api.parseJobDescription(jdFile);
      
      // Step 2: Auto-fill form fields with parsed data
      // Handle different possible response structures
      let parsedData = null;
      
      if (parseResponse) {
        // Check if response has success/data structure
        if (parseResponse.success && parseResponse.data) {
          parsedData = parseResponse.data;
        }
        // Check if response is directly the parsed data
        else if (parseResponse.job_title || parseResponse.company_name || parseResponse.location) {
          parsedData = parseResponse;
        }
        // Check if response has a different structure
        else if (parseResponse.extractedData || parseResponse.result || parseResponse.parsed_data || parseResponse.extracted_data) {
          parsedData = parseResponse.extractedData || parseResponse.result || parseResponse.parsed_data || parseResponse.extracted_data;
        }
      }
      
      if (parsedData) {
        // Map API field names to form field names
        const fieldMapping = {
          jobTitle: 'job_title',
          company: 'company_name',
          department: 'department',
          location: 'location',
          shift: 'shift',
          jobType: 'job_type',
          hiringManager: 'hiring_manager',
          experienceRange: 'experience_range',
          skillsRequired: 'skills_required',
          minimumQualification: 'minimum_qualification',
          numberOfPositions: 'number_of_positions',
          budgetCTC: 'budget_ctc',
          priority: 'priority',
          tentativeDOJ: 'tentative_doj',
          additionalRemarks: 'additional_remarks',
          assignedTo: 'assigned_to'
        };
        
        // Create mapped data object
        const mappedData = {};
        Object.entries(fieldMapping).forEach(([apiField, formField]) => {
          if (parsedData[apiField] !== null && parsedData[apiField] !== undefined) {
            mappedData[formField] = parsedData[apiField];
          }
        });
        
        setFormData(prev => ({
          ...prev,
          ...mappedData
        }));
        
        // Step 3: Store JD file info for later upload to our system
        setJdUploadResult({
          job_description_text: parsedData.jobDescription || parsedData.job_description_text,
          file_path: null, // Will be set when we upload to our system
          original_filename: jdFile.name
        });
        
        setSuccess('Job description parsed and form auto-filled successfully!');
      } else {
        throw new Error(parseResponse?.message || 'Failed to parse job description - no data received');
      }
      
    } catch (err: any) {
      setError(err.message || 'Failed to parse job description');
    } finally {
      setJdUploading(false);
    }
  };

  const handleBulkUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file to upload');
      return;
    }

    try {
      setBulkUploading(true);
      setError(null);
      setSuccess(null);
      setShowBulkResults(false);

      // Prepare JD info if uploaded
      const jdInfo = jdUploadResult ? {
        job_description: jdUploadResult.job_description_text,
        jd_path: jdUploadResult.file_path,
        job_file_name: jdUploadResult.original_filename
      } : undefined;

      const response = await api.bulkUploadRequirements(selectedFile, jdInfo);
      
      setBulkResults(response.results);
      setShowBulkResults(true);
      
      if (response.summary.success_count > 0) {
        setSuccess(`Bulk upload completed! ${response.summary.success_count} requirements created successfully.`);
        
        // Reset file selections
        setSelectedFile(null);
        setJdFile(null);
        setJdUploadResult(null);
      }
      
    } catch (err: any) {
      console.error('Error uploading file:', err);
      setError(err.message || 'Failed to upload file');
    } finally {
      setBulkUploading(false);
    }
  };

  const handleDuplicateModalAction = async (action: 'proceed' | 'cancel') => {
    if (action === 'cancel') {
      setShowDuplicateModal(false);
      setDuplicateRequirement([]);
      setPendingRequirementData(null);
      setDuplicateMatchType('');
      return;
    }

    if (action === 'proceed' && pendingRequirementData) {
      try {
        setSubmitting(true);
        setError(null);
        setSuccess(null);

        // Include JD fields in force create as well
        const forceCreateData = {
          ...pendingRequirementData,
          job_description: jdUploadResult?.job_description_text || null,
          jd_path: jdUploadResult?.file_path || null,
          job_file_name: jdUploadResult?.original_filename || null
        };
        
        const response = await api.forceCreateRequirement(forceCreateData);
        
        setSuccess(`Requirement created successfully! Request ID: ${response.requirement.request_id}`);
        
        // Reset form after successful submission
        setFormData({
          job_title: '',
          company_name: '',
          department: '',
          location: '',
          shift: '',
          job_type: '',
          hiring_manager: '',
          experience_range: '',
          skills_required: '',
          minimum_qualification: '',
          number_of_positions: '',
          budget_ctc: '',
          priority: '',
          tentative_doj: '',
          additional_remarks: '',
          assigned_to: ''
        });
        
        // Reset JD upload
        setJdFile(null);
        setJdUploadResult(null);

        // Close modal and reset states
        setShowDuplicateModal(false);
        setDuplicateRequirement([]);
        setPendingRequirementData(null);
        setDuplicateMatchType('');

      } catch (err: any) {
        console.error('Error creating requirement:', err);
        setError(err.message || 'Failed to create requirement');
      } finally {
        setSubmitting(false);
      }
    }
  };

  const downloadTemplate = (format: 'csv' | 'excel' = 'csv') => {
    // Create template data
    const templateData = [
      {
        'Job Title': 'Software Engineer',
        'Company': 'Tech_Corp',
        'Department': 'Engineering',
        'Location': 'Bangalore, India',
        'Shift': 'Day',
        'Job Type': 'full_time',
        'Hiring Manager': 'John Doe',
        'Experience Range': '3-5 years',
        'Skills Required': 'JavaScript, React, Node.js',
        'Minimum Qualification': 'Bachelor\'s Degree',
        'Number of Positions': 2,
        'Budget CTC': '8-12 LPA',
        'Priority': 'high',
        'Tentative DOJ': '2024-02-01',
        'Additional Remarks': 'Urgent requirement',
        'Assigned To': 'recruiter1'
      },
      {
        'Job Title': 'Data Analyst',
        'Company': 'Infosys',
        'Department': 'Information_Technology',
        'Location': 'Mumbai, India',
        'Shift': 'Day',
        'Job Type': 'full_time',
        'Hiring Manager': 'Jane Smith',
        'Experience Range': '2-4 years',
        'Skills Required': 'Python, SQL, Tableau',
        'Minimum Qualification': 'Master\'s Degree',
        'Number of Positions': 1,
        'Budget CTC': '6-10 LPA',
        'Priority': 'medium',
        'Tentative DOJ': '2024-03-01',
        'Additional Remarks': 'Remote work possible',
        'Assigned To': 'recruiter2'
      }
    ];

    const headers = Object.keys(templateData[0]);

    if (format === 'excel') {
      // For Excel, we'll create a CSV that Excel can open properly
      const csvContent = [
        headers.join(','),
        ...templateData.map(row =>
          headers.map(header => {
            const value = row[header];
            // Escape quotes and wrap in quotes if contains comma, quote, or newline
            const escapedValue = String(value).replace(/"/g, '""');
            return `"${escapedValue}"`;
          }).join(',')
        )
      ].join('\n');

      // Add BOM for Excel compatibility
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bulk_requirements_template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } else {
      // Create CSV content
      const csvContent = [
        headers.join(','),
        ...templateData.map(row =>
          headers.map(header => {
            const value = row[header];
            // Escape quotes and wrap in quotes if contains comma, quote, or newline
            const escapedValue = String(value).replace(/"/g, '""');
            return `"${escapedValue}"`;
          }).join(',')
        )
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bulk_requirements_template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Add New Requirement</h1>
              <p className="text-gray-600 mt-1">Create a new job requirement manually</p>
            </div>
            <button
              onClick={() => router.push('/admin')}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Dashboard
            </button>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="mb-6">
          <div className="flex space-x-4">
            <button
              onClick={() => setUploadMode('single')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                uploadMode === 'single'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Single RFH
            </button>
            <button
              onClick={() => setUploadMode('bulk')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                uploadMode === 'bulk'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Bulk Upload RFH
            </button>
          </div>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-6 rounded-md bg-green-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
                             <div className="ml-3">
                 <p className="text-sm font-medium text-green-800">{success}</p>
               </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Upload Section */}
        {uploadMode === 'bulk' && (
          <div className="bg-white shadow-sm rounded-lg p-6 mb-6">
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Bulk Upload Requirements</h3>
              <p className="text-gray-600 mb-4">
                Upload an Excel file (.xlsx or .xls) or CSV file (.csv) with multiple requirements. The file should contain the following columns:
              </p>
              
              <div className="bg-gray-50 p-4 rounded-md mb-4">
                <h4 className="font-medium text-gray-900 mb-2">Required Columns:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• <strong>Job Title</strong> - The job title/position</li>
                  <li>• <strong>Company</strong> - Company name (use exact values: Tech_Corp, Infosys, TCS, Wipro, Accenture, Cognizant, Capgemini, IBM, Microsoft, Google, Amazon, Oracle, SAP, Deloitte, PwC, KPMG, EY, McKinsey, BCG, Bain, BOSCH)</li>
                  <li>• <strong>Department</strong> - Department name (use exact values: Engineering, Human_Resources, Finance, Marketing, Sales, Operations, Information_Technology, Customer_Support, Product_Management, Quality_Assurance, Business_Development, Legal, Administration, Technical)</li>
                  <li>• <strong>Location</strong> - Job location</li>
                </ul>
                
                <h4 className="font-medium text-gray-900 mt-4 mb-2">Optional Columns:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• <strong>Shift</strong> - Day, Night, rotational, flexible</li>
                  <li>• <strong>Job Type</strong> - full_time, part_time, contract, internship, freelance</li>
                  <li>• <strong>Hiring Manager</strong> - Name of hiring manager</li>
                  <li>• <strong>Experience Range</strong> - e.g., "3-5 years"</li>
                  <li>• <strong>Skills Required</strong> - Required skills</li>
                  <li>• <strong>Minimum Qualification</strong> - Minimum education requirement</li>
                  <li>• <strong>Number of Positions</strong> - Number of open positions</li>
                  <li>• <strong>Budget CTC</strong> - Budget for compensation</li>
                  <li>• <strong>Priority</strong> - high, medium, low, urgent</li>
                  <li>• <strong>Tentative DOJ</strong> - Date of joining (YYYY-MM-DD format)</li>
                  <li>• <strong>Additional Remarks</strong> - Any additional notes</li>
                  <li>• <strong>Assigned To</strong> - Recruiter username</li>
                </ul>
              </div>

              <div className="flex space-x-3 mb-4">
                <button
                  onClick={() => downloadTemplate('csv')}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download CSV Template
                </button>
                <button
                  onClick={() => downloadTemplate('excel')}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download Excel Template
                </button>
              </div>
            </div>

            <div className="space-y-4">

              
              <div>
                <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 mb-2">
                  Select Excel or CSV File
                </label>
                <input
                  id="file-upload"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                                  {selectedFile && (
                   <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                     <div className="flex items-center justify-between">
                       <div className="flex items-center">
                         <svg className="h-5 w-5 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                         </svg>
                         <div>
                           <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                           <p className="text-xs text-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                         </div>
                       </div>
                       <button
                         onClick={handleRemoveFile}
                         className="text-red-600 hover:text-red-900 p-1 rounded-md hover:bg-red-50"
                         title="Remove file"
                       >
                         <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                         </svg>
                       </button>
                     </div>
                   </div>
                 )}
              </div>

              {/* JD Upload for Bulk Mode */}
              <div>
                <label htmlFor="jd-upload-bulk" className="block text-sm font-medium text-gray-700 mb-2">
                  Upload Job Description (Optional - PDF or DOCX)
                </label>
                <input
                  id="jd-upload-bulk"
                  type="file"
                  accept=".pdf,.docx"
                  onChange={handleJdFileSelect}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload a job description file that will be associated with all requirements in the bulk upload. Maximum file size: 10MB.
                </p>

                {jdFile && (
                  <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <svg className="h-5 w-5 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{jdFile.name}</p>
                          <p className="text-xs text-gray-500">{(jdFile.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={handleJdUpload}
                          disabled={jdUploading}
                          className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {jdUploading ? 'Uploading...' : 'Upload'}
                        </button>
                        <button
                          onClick={handleRemoveJdFile}
                          className="text-red-600 hover:text-red-900 p-1 rounded-md hover:bg-red-50"
                          title="Remove file"
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {jdUploadResult && (
                  <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
                    <div className="flex items-center">
                      <svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-green-800">Job description uploaded successfully!</p>
                        <p className="text-xs text-green-600">File: {jdUploadResult.original_filename}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleBulkUpload}
                  disabled={!selectedFile || bulkUploading}
                  className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bulkUploading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Uploading...
                    </div>
                  ) : (
                    'Upload Requirements'
                  )}
                </button>
              </div>
            </div>

            {/* Bulk Upload Results */}
            {showBulkResults && (
              <div className="mt-6">
                <h4 className="font-medium text-gray-900 mb-3">Upload Results</h4>
                <div className="bg-gray-50 rounded-md p-4 max-h-64 overflow-y-auto">
                  {bulkResults.map((result, index) => (
                    <div key={index} className={`py-2 ${index > 0 ? 'border-t border-gray-200' : ''}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <span className="text-sm font-medium text-gray-700">Row {result.row}:</span>
                          <span className="ml-2 text-sm text-gray-600">
                            {result.status === 'success' ? result.job_title : result.message}
                          </span>
                        </div>
                        <div className="flex items-center">
                          {result.status === 'success' ? (
                            <div className="flex items-center text-green-600">
                              <svg className="h-4 w-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              <span className="text-sm font-medium">{result.request_id}</span>
                            </div>
                          ) : result.status === 'duplicate' ? (
                            <div className="flex items-center text-yellow-600">
                              <svg className="h-4 w-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                              <span className="text-sm">Duplicate ({result.match_type})</span>
                            </div>
                          ) : (
                            <div className="flex items-center text-red-600">
                              <svg className="h-4 w-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                              </svg>
                              <span className="text-sm">Error</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Show duplicate details for duplicate results */}
                      {result.status === 'duplicate' && result.duplicates && (
                        <div className="mt-2 ml-6 bg-yellow-50 border border-yellow-200 rounded-md p-2">
                          <p className="text-xs text-yellow-800 mb-2">Found similar requirements:</p>
                          {result.duplicates.map((dup: any, dupIndex: number) => (
                            <div key={dupIndex} className="text-xs text-gray-600 mb-1">
                              • {dup.job_title} at {dup.company_name} ({dup.request_id}) - {dup.status}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Form */}
        {uploadMode === 'single' && (
          <div className="bg-white shadow-sm rounded-lg">
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Job Description Upload */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Job Description Upload</h3>
              <div className="space-y-4">
                <div>
                  <label htmlFor="jd-upload" className="block text-sm font-medium text-gray-700 mb-2">
                    Upload Job Description (PDF or DOCX)
                  </label>
                  <input
                    id="jd-upload"
                    type="file"
                    accept=".pdf,.docx"
                    onChange={handleJdFileSelect}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Upload a PDF or DOCX file containing the job description. Maximum file size: 10MB.
                  </p>
                </div>

                {jdFile && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <svg className="h-5 w-5 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{jdFile.name}</p>
                          <p className="text-xs text-gray-500">{(jdFile.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={handleJdUpload}
                          disabled={jdUploading}
                          className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {jdUploading ? 'Uploading...' : 'Upload'}
                        </button>
                        <button
                          onClick={handleRemoveJdFile}
                          className="text-red-600 hover:text-red-900 p-1 rounded-md hover:bg-red-50"
                          title="Remove file"
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {jdUploadResult && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                    <div className="flex items-center">
                      <svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-green-800">Job description parsed and form auto-filled!</p>
                        <p className="text-xs text-green-600">File: {jdUploadResult.original_filename}</p>
                        <p className="text-xs text-green-600">Please review and edit the auto-filled fields as needed.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Basic Information */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="job_title" className="block text-sm font-medium text-gray-700 mb-1">
                    Job Title *
                  </label>
                  <input
                    type="text"
                    id="job_title"
                    name="job_title"
                    value={formData.job_title}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Software Engineer"
                  />
                </div>

                <div>
                  <label htmlFor="company_name" className="block text-sm font-medium text-gray-700 mb-1">
                    Company *
                  </label>
                  <select
                    id="company_name"
                    name="company_name"
                    value={formData.company_name}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Company</option>
                    <option value="Tech_Corp">Tech Corp</option>
                    <option value="Infosys">Infosys</option>
                    <option value="TCS">TCS</option>
                    <option value="Wipro">Wipro</option>
                    <option value="Accenture">Accenture</option>
                    <option value="Cognizant">Cognizant</option>
                    <option value="Capgemini">Capgemini</option>
                    <option value="IBM">IBM</option>
                    <option value="Microsoft">Microsoft</option>
                    <option value="Google">Google</option>
                    <option value="Amazon">Amazon</option>
                    <option value="Oracle">Oracle</option>
                    <option value="SAP">SAP</option>
                    <option value="Deloitte">Deloitte</option>
                    <option value="PwC">PwC</option>
                    <option value="KPMG">KPMG</option>
                    <option value="EY">EY</option>
                    <option value="McKinsey">McKinsey</option>
                    <option value="BCG">BCG</option>
                    <option value="Bain">Bain</option>
                    <option value="BOSCH">BOSCH</option>
                    {/* Dynamically added companies */}
                    {dynamicOptions.companies.map((company, index) => {
                      const sanitizedValue = enumValueMapping.companies[company] || company;
                      return (
                        <option key={`custom-${index}`} value={sanitizedValue}>
                          {company}
                        </option>
                      );
                    })}
                    <option value="add_new" className="text-blue-600 font-medium">+ Add New Company</option>
                  </select>
                  
                  {/* Custom Company Input */}
                  {showCustomInput.company && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <label htmlFor="customCompany" className="block text-sm font-medium text-gray-700 mb-1">
                        Enter New Company Name
                      </label>
                      <input
                        type="text"
                        id="customCompany"
                        name="customCompany"
                        value={customCompany}
                        onChange={handleCustomInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., New Company Name"
                        autoFocus
                      />
                      <div className="flex justify-end space-x-2 mt-2">
                        <button
                          type="button"
                          onClick={() => handleCancelCustomValue('company')}
                          className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveCustomValue('company')}
                          disabled={!customCompany.trim()}
                          className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="department" className="block text-sm font-medium text-gray-700 mb-1">
                    Department *
                  </label>
                  <select
                    id="department"
                    name="department"
                    value={formData.department}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    {/* <option value="">Select Department</option>
                    <option value="Engineering">Engineering</option>
                    <option value="Human_Resources">Human Resources</option>
                    <option value="Finance">Finance</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Sales">Sales</option>
                    <option value="Operations">Operations</option>
                    <option value="Information_Technology">Information Technology</option>
                    <option value="Customer_Support">Customer Support</option>
                    <option value="Product_Management">Product Management</option>
                    <option value="Quality_Assurance">Quality Assurance</option>
                    <option value="Business_Development">Business Development</option>
                    <option value="Legal">Legal</option>
                    <option value="Administration">Administration</option>
                    <option value="Technical">Technical</option> */}
                    {/* Dynamically added departments */}
                    {dynamicOptions.departments.map((department, index) => {
                      const sanitizedValue = enumValueMapping.departments[department] || department;
                      return (
                        <option key={`custom-${index}`} value={sanitizedValue}>
                          {department}
                        </option>
                      );
                    })}
                    <option value="add_new" className="text-blue-600 font-medium">+ Add New Department</option>
                  </select>
                  
                  {/* Custom Department Input */}
                  {showCustomInput.department && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <label htmlFor="customDepartment" className="block text-sm font-medium text-gray-700 mb-1">
                        Enter New Department Name
                      </label>
                      <input
                        type="text"
                        id="customDepartment"
                        name="customDepartment"
                        value={customDepartment}
                        onChange={handleCustomInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., New Department Name"
                        autoFocus
                      />
                      <div className="flex justify-end space-x-2 mt-2">
                        <button
                          type="button"
                          onClick={() => handleCancelCustomValue('department')}
                          className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveCustomValue('department')}
                          disabled={!customDepartment.trim()}
                          className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
                    Location *
                  </label>
                  <input
                    type="text"
                    id="location"
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Bangalore, India"
                  />
                </div>

                <div>
                  <label htmlFor="shift" className="block text-sm font-medium text-gray-700 mb-1">
                    Shift *
                  </label>
                  <select
                    id="shift"
                    name="shift"
                    value={formData.shift}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Shift</option>
                    {/* <option value="Day">Day</option>
                    <option value="Night">Night</option> */}  
                    <option value="rotational">Rotational</option>
                    <option value="flexible">Flexible</option>
                    {/* Dynamically added shifts */}
                    {dynamicOptions.shifts.map((shift, index) => {
                      const sanitizedValue = enumValueMapping.shifts[shift] || shift;
                      return (
                        <option key={`custom-${index}`} value={sanitizedValue}>
                          {shift}
                        </option>
                      );
                    })}
                    <option value="add_new" className="text-blue-600 font-medium">+ Add New Shift</option>
                  </select>
                  
                  {/* Custom Shift Input */}
                  {showCustomInput.shift && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <label htmlFor="customShift" className="block text-sm font-medium text-gray-700 mb-1">
                        Enter New Shift Type
                      </label>
                      <input
                        type="text"
                        id="customShift"
                        name="customShift"
                        value={customShift}
                        onChange={handleCustomInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., Evening Shift"
                        autoFocus
                      />
                      <div className="flex justify-end space-x-2 mt-2">
                        <button
                          type="button"
                          onClick={() => handleCancelCustomValue('shift')}
                          className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveCustomValue('shift')}
                          disabled={!customShift.trim()}
                          className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="job_type" className="block text-sm font-medium text-gray-700 mb-1">
                    Job Type *
                  </label>
                  <select
                    id="job_type"
                    name="job_type"
                    value={formData.job_type}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Job Type</option>
                    <option value="full_time">Full-time</option>
                    <option value="part_time">Part-time</option>
                    <option value="contract">Contract</option>
                    <option value="internship">Internship</option>
                    <option value="freelance">Freelance</option>
                    {/* Dynamically added job types */}
                    {dynamicOptions.jobTypes.map((jobType, index) => {
                      const sanitizedValue = enumValueMapping.jobTypes[jobType] || jobType;
                      return (
                        <option key={`custom-${index}`} value={sanitizedValue}>
                          {jobType}
                        </option>
                      );
                    })}
                    <option value="add_new" className="text-blue-600 font-medium">+ Add New Job Type</option>
                  </select>
                  
                  {/* Custom Job Type Input */}
                  {showCustomInput.jobType && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <label htmlFor="customJobType" className="block text-sm font-medium text-gray-700 mb-1">
                        Enter New Job Type
                      </label>
                      <input
                        type="text"
                        id="customJobType"
                        name="customJobType"
                        value={customJobType}
                        onChange={handleCustomInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., Temporary"
                        autoFocus
                      />
                      <div className="flex justify-end space-x-2 mt-2">
                        <button
                          type="button"
                          onClick={() => handleCancelCustomValue('jobType')}
                          className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveCustomValue('jobType')}
                          disabled={!customJobType.trim()}
                          className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="hiring_manager" className="block text-sm font-medium text-gray-700 mb-1">
                    Hiring Manager
                  </label>
                  <input
                    type="text"
                    id="hiring_manager"
                    name="hiring_manager"
                    value={formData.hiring_manager}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., John Doe"
                  />
                </div>

                {/* Priority moved next to Hiring Manager */}
                <div>
                  <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">
                    Priority *
                  </label>
                  <select
                    id="priority"
                    name="priority"
                    value={formData.priority}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Priority</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                    <option value="urgent">Urgent</option>
                    {/* Dynamically added priorities */}
                    {dynamicOptions.priorities.map((priority, index) => {
                      const sanitizedValue = enumValueMapping.priorities[priority] || priority;
                      return (
                        <option key={`custom-${index}`} value={sanitizedValue}>
                          {priority}
                        </option>
                      );
                    })}
                    <option value="add_new" className="text-blue-600 font-medium">+ Add New Priority</option>
                  </select>
                  {/* Custom Priority Input */}
                  {showCustomInput.priority && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <label htmlFor="customPriority" className="block text-sm font-medium text-gray-700 mb-1">
                        Enter New Priority Level
                      </label>
                      <input
                        type="text"
                        id="customPriority"
                        name="customPriority"
                        value={customPriority}
                        onChange={handleCustomInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., Critical"
                        autoFocus
                      />
                      <div className="flex justify-end space-x-2 mt-2">
                        <button
                          type="button"
                          onClick={() => handleCancelCustomValue('priority')}
                          className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveCustomValue('priority')}
                          disabled={!customPriority.trim()}
                          className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Requirements */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Requirements</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="experience_range" className="block text-sm font-medium text-gray-700 mb-1">
                    Experience Range
                  </label>
                  <input
                    type="text"
                    id="experience_range"
                    name="experience_range"
                    value={formData.experience_range}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 3-5 years"
                  />
                </div>

                <div>
                  <label htmlFor="minimum_qualification" className="block text-sm font-medium text-gray-700 mb-1">
                    Minimum Qualification
                  </label>
                  <input
                    type="text"
                    id="minimum_qualification"
                    name="minimum_qualification"
                    value={formData.minimum_qualification}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Bachelor's Degree"
                  />
                </div>

                <div>
                  <label htmlFor="number_of_positions" className="block text-sm font-medium text-gray-700 mb-1">
                    Number of Positions
                  </label>
                  <input
                    type="number"
                    id="number_of_positions"
                    name="number_of_positions"
                    value={formData.number_of_positions}
                    onChange={handleInputChange}
                    min="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 2"
                  />
                </div>

                <div>
                  <label htmlFor="budget_ctc" className="block text-sm font-medium text-gray-700 mb-1">
                    Budget CTC
                  </label>
                  <input
                    type="text"
                    id="budget_ctc"
                    name="budget_ctc"
                    value={formData.budget_ctc}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 8-12 LPA"
                  />
                </div>

                

                <div>
                  <label htmlFor="tentative_doj" className="block text-sm font-medium text-gray-700 mb-1">
                    Tentative Date of Joining
                  </label>
                  <input
                    type="date"
                    id="tentative_doj"
                    name="tentative_doj"
                    value={formData.tentative_doj}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label htmlFor="skills_required" className="block text-sm font-medium text-gray-700 mb-1">
                  Skills Required
                </label>
                <textarea
                  id="skills_required"
                  name="skills_required"
                  value={formData.skills_required}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., JavaScript, React, Node.js, MongoDB"
                />
              </div>
            </div>

            {/* Assignment */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Assignment</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="assigned_to" className="block text-sm font-medium text-gray-700 mb-1">
                    Assign to Recruiter
                  </label>
                  <select
                    id="assigned_to"
                    name="assigned_to"
                    value={formData.assigned_to}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Recruiter</option>
                    {recruiters.map((recruiter) => (
                      <option key={recruiter.id} value={recruiter.username}>
                        {recruiter.username}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              
            </div>

            {/* Additional Information */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Additional Information</h3>
              <div>
                <label htmlFor="additional_remarks" className="block text-sm font-medium text-gray-700 mb-1">
                  Additional Remarks
                </label>
                <textarea
                  id="additional_remarks"
                  name="additional_remarks"
                  value={formData.additional_remarks}
                  onChange={handleInputChange}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Any additional information, special requirements, or remarks..."
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={() => router.push('/admin')}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Creating...
                  </div>
                ) : (
                  'Create Requirement'
                )}
              </button>
            </div>
          </form>
        </div>
        )}

        {/* Duplicate Requirement Modal */}
        {showDuplicateModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Duplicate Requirement Found
                  </h3>
                  <button
                    onClick={() => handleDuplicateModalAction('cancel')}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="mb-4">
                  <p className="text-sm text-gray-600 mb-2">
                    We found {duplicateRequirement.length} similar requirement(s) in the system:
                  </p>
                  <p className="text-xs text-gray-500 mb-4">
                    Match type: <span className="font-medium">{duplicateMatchType === 'exact' ? 'Exact Match' : 'Similar Match'}</span>
                  </p>
                </div>

                <div className="max-h-64 overflow-y-auto mb-4">
                  {duplicateRequirement.map((req, index) => (
                    <div key={req.id} className="border border-gray-200 rounded-md p-3 mb-2">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900">{req.job_title}</h4>
                          <p className="text-sm text-gray-600">{req.company_name}</p>
                          <p className="text-sm text-gray-600">{req.department} • {req.location}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Request ID: {req.request_id} • Status: {req.status} • Created: {new Date(req.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-yellow-800">
                        Would you like to proceed and create this requirement anyway? This will create a new requirement even though similar ones exist.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => handleDuplicateModalAction('cancel')}
                    className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDuplicateModalAction('proceed')}
                    disabled={submitting}
                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Creating...
                      </div>
                    ) : (
                      'Create Anyway'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function AddRequirementPageWrapper() {
  return (
    <RoleGuard allowedRoles={['admin']}>
      <AddRequirementPage />
    </RoleGuard>
  );
} 