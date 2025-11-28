'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getEnumValues, getRecruitmentReport, getInternalTrackerReport } from '@/services/api';

type ReportRow = {
  sr_no: number;
  client: string | null;
  job_role: string | null;
  department: string | null;
  location: string | null;
  total_positions: number | null;
  jd_received: boolean;
  profiles_shared: number;
  screen_feedback_pending: number;
  screen_select: number;
  screen_reject: number;
  screen_waiting_for_schedule: number;
  screen_interview_schedule_received: number;
  l1_interview_backout: number;
  l1_interview_done: number;
  l1_feedback_pending: number;
  l1_interview_select: number;
  l1_waiting_for_schedule: number;
  l1_interview_schedule_received: number;
  l2_interview_backout: number;
  l2_interview_done: number;
  l2_feedback_pending: number;
  l2_interview_select: number;
  l2_waiting_for_schedule: number;
  l2_interview_schedule_received: number;
  onboarded: number;
};

type InternalTrackerRow = {
  sr_no: number;
  date: string | null;
  recruiter_name: string | null;
  client_name: string | null;
  candidate_name: string;
  requirement: string | null;
  contract_permanent: string | null;
  contact_number: string | null;
  email_id: string | null;
  total_exp: number | null;
  relevant_exp: number | null;
  current_company: string | null;
  reason_for_job_change: string;
  location: string | null;
  notice_period: number | null;
  current_ctc: number | null;
  expected_ctc: number | null;
  resume_shortlist: string;
  interview_round_1_date: string | null;
  interview_round_1_feedback: string;
  interview_round_2_date: string | null;
  interview_round_2_feedback: string;
  final_yn: string;
  comment: string;
};

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [company, setCompany] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [showRequirementsReport, setShowRequirementsReport] = useState(false);
  const [showInternalTracker, setShowInternalTracker] = useState(false);
  const [internalTrackerLoading, setInternalTrackerLoading] = useState(false);
  const [internalTrackerRows, setInternalTrackerRows] = useState<InternalTrackerRow[]>([]);
  const [internalTrackerDateFrom, setInternalTrackerDateFrom] = useState<string>('');
  const [internalTrackerDateTo, setInternalTrackerDateTo] = useState<string>('');

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/login');
      return;
    }
    try {
      const parsed = JSON.parse(storedUser);
      if (parsed.role !== 'admin') {
        router.push('/login');
        return;
      }
      setUser(parsed);
    } catch {
      router.push('/login');
      return;
    }
    // Load company enum values
    (async () => {
      try {
        const res = await getEnumValues('company');
        setCompanyOptions(res.values || res.enum_values || res.data || []);
      } catch (e) {
        console.error('Failed to load company enum values', e);
      }
    })();
  }, [router]);

  const handleGenerate = async () => {
    try {
      setLoading(true);
      const res = await getRecruitmentReport({ date_from: dateFrom || undefined, date_to: dateTo || undefined, company: company || undefined });
      if (res.success) {
        setRows(res.data || []);
      } else {
        setRows([]);
      }
    } catch (e) {
      console.error('Failed to generate report', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const headers = useMemo(() => [
    'Sr. No','Client','Job Role','Department','Location','Total No of Positions','JD Received',
    'No. of Profiles shared','Feedback Pending','Screen select','Screen Reject','Waiting for schedule','Interview Schedule received',
    'Interview backout','Interview done','Feedback Pending','Interview Select','Waiting for schedule','Interview Schedule received',
    'Interview backout','Interview done','Feedback Pending','Interview Select','Waiting for schedule','Interview Schedule received',
    'Onboarded'
  ], []);

  const toCsv = () => {
    const escape = (v: any) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };
    const lines = [headers.join(',')];
    rows.forEach(r => {
      const values = [
        r.sr_no, r.client, r.job_role, r.department, r.location, r.total_positions, r.jd_received ? 'Yes' : 'No',
        r.profiles_shared, r.screen_feedback_pending, r.screen_select, r.screen_reject, r.screen_waiting_for_schedule, r.screen_interview_schedule_received,
        r.l1_interview_backout, r.l1_interview_done, r.l1_feedback_pending, r.l1_interview_select, r.l1_waiting_for_schedule, r.l1_interview_schedule_received,
        r.l2_interview_backout, r.l2_interview_done, r.l2_feedback_pending, r.l2_interview_select, r.l2_waiting_for_schedule, r.l2_interview_schedule_received,
        r.onboarded
      ];
      lines.push(values.map(escape).join(','));
    });
    return lines.join('\n');
  };

  const handleDownloadCsv = () => {
    const csv = toCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'recruitment_report.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleGenerateInternalTracker = async () => {
    try {
      setInternalTrackerLoading(true);
      const res = await getInternalTrackerReport({ date_from: internalTrackerDateFrom || undefined, date_to: internalTrackerDateTo || undefined });
      if (res.success) {
        setInternalTrackerRows(res.data || []);
      } else {
        setInternalTrackerRows([]);
      }
    } catch (e) {
      console.error('Failed to generate internal tracker report', e);
      setInternalTrackerRows([]);
    } finally {
      setInternalTrackerLoading(false);
    }
  };

  const internalTrackerHeaders = useMemo(() => [
    'Sl.no', 'Date', 'Recruiter Name', 'Client Name', 'Candidate Name', 'Requirement', 'Contract/Permanent',
    'Contact Number', 'Email ID', 'Total. Exp', 'Relevant. Exp', 'Current Company', 'Reason for Job Change',
    'Location', 'Notice Period', 'Current CTC', 'Expected CTC', 'Resume Shortlist Yes/No',
    'Interview Round 1 Date', 'Interview Round 1 Feedback', 'Interview Round 2 Date', 'Interview Round 2 Feedback',
    'Final (Y/N)', 'Comment'
  ], []);

  const toInternalTrackerCsv = () => {
    const escape = (v: any) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };
    const lines = [internalTrackerHeaders.join(',')];
    internalTrackerRows.forEach(r => {
      const values = [
        r.sr_no, r.date, r.recruiter_name, r.client_name, r.candidate_name, r.requirement, r.contract_permanent,
        r.contact_number, r.email_id, r.total_exp, r.relevant_exp, r.current_company, r.reason_for_job_change,
        r.location, r.notice_period, r.current_ctc, r.expected_ctc, r.resume_shortlist,
        r.interview_round_1_date, r.interview_round_1_feedback, r.interview_round_2_date, r.interview_round_2_feedback,
        r.final_yn, r.comment
      ];
      lines.push(values.map(escape).join(','));
    });
    return lines.join('\n');
  };

  const handleDownloadInternalTrackerCsv = () => {
    const csv = toInternalTrackerCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'internal_tracker_report.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 md:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-50">Analytics &amp; Reports</h1>
          <p className="text-sm md:text-base text-slate-600 dark:text-slate-400">
            Get a clear overview of your recruitment pipeline with clean, exportable reports.
          </p>
        </div>

        {!showRequirementsReport && !showInternalTracker && (
          <div className="pt-6 grid gap-4 sm:grid-cols-2 max-w-3xl">
            <button
              onClick={() => setShowRequirementsReport(true)}
              className="group relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white/80 p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-500 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900/80"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-sky-400 to-cyan-400" />
              <div className="mt-2 space-y-2">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Requirements Report</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Analyze requirements across clients, roles, locations and stages in the hiring funnel.
                </p>
                <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                  Detailed table · CSV export
                </div>
              </div>
            </button>
            <button
              onClick={() => setShowInternalTracker(true)}
              className="group relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white/80 p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-purple-500 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900/80"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500" />
              <div className="mt-2 space-y-2">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Internal Tracker</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Track detailed candidate information with recruiter details, interview schedules, and candidate profiles.
                </p>
                <div className="inline-flex items-center gap-2 rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700 dark:bg-purple-500/10 dark:text-purple-200">
                  Detailed table · CSV export
                </div>
              </div>
            </button>
          </div>
        )}

        {showRequirementsReport && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <button
                  onClick={() => setShowRequirementsReport(false)}
                  className="inline-flex items-center text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <span className="mr-1 text-base">&larr;</span>
                  Back to all analytics
                </button>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Requirements Report</h2>
                <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400">
                  Filter by date range and company to generate a tailored requirements report.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 md:p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">From date</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:bg-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">To date</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:bg-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Company</label>
                  <select
                    value={company}
                    onChange={e => setCompany(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:bg-slate-900"
                  >
                    <option value="">All companies</option>
                    {companyOptions.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleGenerate}
                    disabled={loading}
                    className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
                  >
                    {loading ? 'Generating…' : 'Generate report'}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/90 p-3 md:p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Report results</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {rows.length === 0 ? 'No data for the selected filters.' : `${rows.length === 1 ? '1 requirement found.' : `${rows.length} requirements found.`}`}
                  </p>
                </div>
                <button
                  onClick={handleDownloadCsv}
                  disabled={rows.length === 0}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                >
                  Download CSV
                </button>
              </div>

              <div className="overflow-auto rounded-xl border border-slate-100 dark:border-slate-700">
                <table className="min-w-full text-xs md:text-sm">
                  <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <tr>
                      {headers.map(h => (
                        <th
                          key={h}
                          className="sticky top-0 z-10 border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide md:text-xs whitespace-nowrap bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr>
                        <td
                          className="px-3 py-6 text-center text-slate-500 dark:text-slate-400"
                          colSpan={headers.length}
                        >
                          No data. Adjust your filters and try again.
                        </td>
                      </tr>
                    )}
                    {rows.map((r) => (
                      <tr key={r.sr_no} className="even:bg-slate-50/60 hover:bg-blue-50/40 dark:even:bg-slate-900 dark:hover:bg-slate-800/80">
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.sr_no}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.client}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.job_role}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.department}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.location}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.total_positions}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            r.jd_received
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200'
                          }`}>
                            {r.jd_received ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.profiles_shared}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.screen_feedback_pending}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.screen_select}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.screen_reject}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.screen_waiting_for_schedule}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.screen_interview_schedule_received}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.l1_interview_backout}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.l1_interview_done}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.l1_feedback_pending}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.l1_interview_select}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.l1_waiting_for_schedule}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.l1_interview_schedule_received}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.l2_interview_backout}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.l2_interview_done}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.l2_feedback_pending}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.l2_interview_select}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.l2_waiting_for_schedule}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.l2_interview_schedule_received}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.onboarded}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {showInternalTracker && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <button
                  onClick={() => {
                    setShowInternalTracker(false);
                    setInternalTrackerRows([]);
                    setInternalTrackerDateFrom('');
                    setInternalTrackerDateTo('');
                  }}
                  className="inline-flex items-center text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <span className="mr-1 text-base">&larr;</span>
                  Back to all analytics
                </button>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Internal Tracker</h2>
                <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400">
                  Filter by date range to generate a detailed internal tracker report with candidate information.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 md:p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">From date</label>
                  <input
                    type="date"
                    value={internalTrackerDateFrom}
                    onChange={e => setInternalTrackerDateFrom(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:bg-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">To date</label>
                  <input
                    type="date"
                    value={internalTrackerDateTo}
                    onChange={e => setInternalTrackerDateTo(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:bg-slate-900"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleGenerateInternalTracker}
                    disabled={internalTrackerLoading}
                    className="inline-flex w-full items-center justify-center rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-purple-400"
                  >
                    {internalTrackerLoading ? 'Generating…' : 'Generate report'}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/90 p-3 md:p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Report results</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {internalTrackerRows.length === 0 ? 'No data for the selected filters.' : `${internalTrackerRows.length === 1 ? '1 candidate found.' : `${internalTrackerRows.length} candidates found.`}`}
                  </p>
                </div>
                <button
                  onClick={handleDownloadInternalTrackerCsv}
                  disabled={internalTrackerRows.length === 0}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                >
                  Download CSV
                </button>
              </div>

              <div className="overflow-auto rounded-xl border border-slate-100 dark:border-slate-700">
                <table className="min-w-full text-xs md:text-sm">
                  <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <tr>
                      {internalTrackerHeaders.map(h => (
                        <th
                          key={h}
                          className="sticky top-0 z-10 border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide md:text-xs whitespace-nowrap bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {internalTrackerRows.length === 0 && (
                      <tr>
                        <td
                          className="px-3 py-6 text-center text-slate-500 dark:text-slate-400"
                          colSpan={internalTrackerHeaders.length}
                        >
                          No data. Adjust your filters and try again.
                        </td>
                      </tr>
                    )}
                    {internalTrackerRows.map((r) => (
                      <tr key={r.sr_no} className="even:bg-slate-50/60 hover:bg-purple-50/40 dark:even:bg-slate-900 dark:hover:bg-slate-800/80">
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.sr_no}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.date}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.recruiter_name}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.client_name}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.candidate_name}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.requirement}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.contract_permanent}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.contact_number}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.email_id}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.total_exp}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.relevant_exp}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.current_company}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.reason_for_job_change}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.location}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.notice_period}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.current_ctc}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.expected_ctc}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            r.resume_shortlist === 'Yes'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200'
                          }`}>
                            {r.resume_shortlist}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.interview_round_1_date}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.interview_round_1_feedback}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.interview_round_2_date}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.interview_round_2_feedback}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.final_yn}</td>
                        <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">{r.comment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


