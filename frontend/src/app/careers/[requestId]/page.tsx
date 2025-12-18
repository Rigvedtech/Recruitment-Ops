'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Briefcase,
  MapPin,
  Building2,
  Clock,
  Calendar,
  Users,
  GraduationCap,
  FileText,
  Share2,
  BookmarkPlus,
  Check,
  Loader2,
  AlertCircle,
  ChevronRight,
  Sparkles,
  TrendingUp,
  ExternalLink,
  Mail,
  Copy,
} from 'lucide-react';
import { fetchJobDetails, type JobDetails, type Job } from '@/services/careerApi';

// ============================================================================
// COMPONENT: Related Job Card
// ============================================================================
interface RelatedJobCardProps {
  job: Job;
}

const RelatedJobCard: React.FC<RelatedJobCardProps> = ({ job }) => {
  return (
    <Link href={`/careers/${job.request_id}`}>
      <div className="group p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-md transition-all">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
              {job.job_title}
            </h4>
            <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
              {job.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {job.location}
                </span>
              )}
            </div>
            <span className="text-xs text-slate-400 mt-2 block">
              {job.posted_date_relative}
            </span>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600 transition-colors" />
        </div>
      </div>
    </Link>
  );
};

// ============================================================================
// COMPONENT: Detail Item
// ============================================================================
interface DetailItemProps {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
}

const DetailItem: React.FC<DetailItemProps> = ({ icon, label, value }) => {
  if (!value) return null;

  return (
    <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl">
      <div className="flex-shrink-0 w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
        {icon}
      </div>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="font-medium text-slate-900">{value}</p>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================
export default function JobDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params.requestId as string;

  const [job, setJob] = useState<JobDetails | null>(null);
  const [relatedJobs, setRelatedJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    const loadJobDetails = async () => {
      if (!requestId) return;

      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchJobDetails(requestId);
        setJob(result.job);
        setRelatedJobs(result.related_jobs);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load job details');
      } finally {
        setIsLoading(false);
      }
    };

    loadJobDetails();
  }, [requestId]);

  // Check if job is saved in localStorage
  useEffect(() => {
    if (requestId) {
      const savedJobs = JSON.parse(localStorage.getItem('savedJobs') || '[]');
      setIsSaved(savedJobs.includes(requestId));
    }
  }, [requestId]);

  const handleSaveJob = () => {
    const savedJobs = JSON.parse(localStorage.getItem('savedJobs') || '[]');
    if (isSaved) {
      const updated = savedJobs.filter((id: string) => id !== requestId);
      localStorage.setItem('savedJobs', JSON.stringify(updated));
      setIsSaved(false);
    } else {
      savedJobs.push(requestId);
      localStorage.setItem('savedJobs', JSON.stringify(savedJobs));
      setIsSaved(true);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShareEmail = () => {
    const subject = encodeURIComponent(`Job Opportunity: ${job?.job_title}`);
    const body = encodeURIComponent(
      `Check out this job opportunity:\n\n${job?.job_title}\n${window.location.href}`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  // Loading State
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
        {/* Header Skeleton */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center h-16">
              <div className="w-32 h-8 bg-slate-200 rounded animate-pulse" />
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-slate-200 rounded w-1/4 mb-6" />
            <div className="bg-white border border-slate-200 rounded-2xl p-8 mb-8">
              <div className="h-10 bg-slate-200 rounded w-3/4 mb-4" />
              <div className="h-6 bg-slate-200 rounded w-1/2 mb-6" />
              <div className="flex gap-3">
                <div className="h-8 bg-slate-200 rounded-full w-24" />
                <div className="h-8 bg-slate-200 rounded-full w-32" />
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-4 mb-8">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-24 bg-slate-200 rounded-xl" />
              ))}
            </div>
            <div className="h-64 bg-slate-200 rounded-xl" />
          </div>
        </main>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 flex items-center justify-center p-4">
        <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Job Not Found</h1>
          <p className="text-slate-600 mb-6">
            {error === 'Job not found'
              ? 'This job posting may have been removed or is no longer available.'
              : error}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => router.back()}
              className="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium"
            >
              Go Back
            </button>
            <Link
              href="/careers"
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
            >
              Browse All Jobs
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!job) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/careers" className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-900">Careers</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Link */}
        <Link
          href="/careers"
          className="inline-flex items-center gap-2 text-slate-600 hover:text-indigo-600 font-medium mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Jobs
        </Link>

        {/* Job Header */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 lg:p-8 mb-8 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="flex-1">
              {/* Badges */}
              <div className="flex flex-wrap gap-2 mb-4">
                {job.is_new && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 text-sm font-semibold bg-emerald-50 text-emerald-700 rounded-full">
                    <Sparkles className="w-4 h-4" />
                    New
                  </span>
                )}
                {job.is_urgent && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 text-sm font-semibold bg-amber-50 text-amber-700 rounded-full">
                    <TrendingUp className="w-4 h-4" />
                    Urgent Hiring
                  </span>
                )}
              </div>

              {/* Title */}
              <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
                {job.job_title}
              </h1>

              {/* Meta Info */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-slate-600">
                {job.company_name && (
                  <span className="inline-flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-slate-400" />
                    {job.company_name}
                  </span>
                )}
                {job.location && (
                  <span className="inline-flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-slate-400" />
                    {job.location}
                  </span>
                )}
                {job.posted_date_relative && (
                  <span className="inline-flex items-center gap-2">
                    <Clock className="w-5 h-5 text-slate-400" />
                    Posted {job.posted_date_relative}
                  </span>
                )}
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mt-6">
                {job.department && (
                  <span className="px-4 py-2 text-sm font-medium bg-slate-100 text-slate-700 rounded-full">
                    {job.department}
                  </span>
                )}
                {job.job_type && (
                  <span className="px-4 py-2 text-sm font-medium bg-indigo-50 text-indigo-700 rounded-full">
                    {job.job_type}
                  </span>
                )}
                {job.shift && (
                  <span className="px-4 py-2 text-sm font-medium bg-purple-50 text-purple-700 rounded-full">
                    {job.shift}
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3 lg:items-end">
              <button
                onClick={handleSaveJob}
                className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
                  isSaved
                    ? 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {isSaved ? (
                  <>
                    <Check className="w-5 h-5" />
                    Saved
                  </>
                ) : (
                  <>
                    <BookmarkPlus className="w-5 h-5" />
                    Save Job
                  </>
                )}
              </button>

              <div className="relative">
                <button
                  onClick={() => setShowShareMenu(!showShareMenu)}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition-colors"
                >
                  <Share2 className="w-5 h-5" />
                  Share
                </button>

                {showShareMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-10">
                    <button
                      onClick={handleCopyLink}
                      className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                    >
                      {copiedLink ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-slate-400" />
                      )}
                      <span className="text-sm">
                        {copiedLink ? 'Link Copied!' : 'Copy Link'}
                      </span>
                    </button>
                    <button
                      onClick={handleShareEmail}
                      className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                    >
                      <Mail className="w-4 h-4 text-slate-400" />
                      <span className="text-sm">Email</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Key Details */}
            <div className="grid sm:grid-cols-2 gap-4">
              <DetailItem
                icon={<Briefcase className="w-5 h-5 text-indigo-600" />}
                label="Experience Required"
                value={job.experience_range}
              />
              <DetailItem
                icon={<Users className="w-5 h-5 text-purple-600" />}
                label="Open Positions"
                value={job.number_of_positions?.toString()}
              />
              <DetailItem
                icon={<Calendar className="w-5 h-5 text-amber-600" />}
                label="Expected Joining"
                value={
                  job.tentative_doj
                    ? new Date(job.tentative_doj).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : null
                }
              />
              <DetailItem
                icon={<GraduationCap className="w-5 h-5 text-cyan-600" />}
                label="Qualification"
                value={job.minimum_qualification}
              />
            </div>

            {/* Job Description */}
            {job.job_description && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 lg:p-8">
                <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  Job Description
                </h2>
                <div
                  className="prose prose-slate max-w-none prose-headings:font-semibold prose-p:text-slate-600 prose-li:text-slate-600"
                  dangerouslySetInnerHTML={{
                    __html: job.job_description
                      .replace(/\n/g, '<br />')
                      .replace(/•/g, '<li>')
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'),
                  }}
                />
              </div>
            )}

          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Apply CTA Card */}
            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white">
              <h3 className="text-xl font-bold mb-2">Interested in this role?</h3>
              <p className="text-indigo-100 mb-6 text-sm">
                Apply now and take the next step in your career journey.
              </p>
              <button className="w-full py-3 bg-white text-indigo-600 font-semibold rounded-xl hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2">
                Apply Now
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>

            {/* Related Jobs */}
            {relatedJobs.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4">
                  Similar Opportunities
                </h3>
                <div className="space-y-3">
                  {relatedJobs.map((relJob) => (
                    <RelatedJobCard key={relJob.request_id} job={relJob} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Mobile Sticky Apply Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 lg:hidden z-20">
        <button className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2">
          Apply Now
          <ExternalLink className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

