export interface Requirement {
  id?: number;
  request_id: string;
  job_title: string;
  department?: string;
  location?: string;
  shift?: string;
  job_type?: string;
  hiring_manager?: string;
  experience_range?: string;
  skills_required?: string;
  minimum_qualification?: string;
  number_of_positions?: number;
  budget_ctc?: string;
  priority?: string;
  tentative_doj?: string;
  additional_remarks?: string;
  status: string;
  email_subject?: string;
  sender_email?: string;
  sender_name?: string;
  company_name?: string;
  received_datetime?: string | null;
  assigned_to?: string;
  assigned_recruiters?: string[];
  notes?: string;
  created_at: string;
  updated_at: string;
  is_manual_requirement?: boolean;
  // Job Description fields
  job_description?: string;
  jd_path?: string;
  job_file_name?: string;
}

export interface TrackerRequirement extends Requirement {
  profiles_count?: number;
  onboarded_count?: number;
  breach_time_display?: string;
  is_new_assignment?: boolean;
  detected_category?: string;
}
