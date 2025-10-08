'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getEnumValues, getRecruitmentReport } from '@/services/api';

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

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [company, setCompany] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ReportRow[]>([]);

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

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Analytics Reports</h1>
      <div className="bg-white rounded-lg p-4 shadow-sm border mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">From Date</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">To Date</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Company</label>
            <select value={company} onChange={e => setCompany(e.target.value)} className="w-full border rounded px-3 py-2">
              <option value="">All</option>
              {companyOptions.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={handleGenerate} disabled={loading} className="w-full bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700">
              {loading ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg p-4 shadow-sm border">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-medium">Report</h2>
          <button onClick={handleDownloadCsv} disabled={rows.length === 0} className="bg-gray-100 text-gray-700 rounded px-3 py-2 hover:bg-gray-200 text-sm">Download CSV</button>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {headers.map(h => (
                  <th key={h} className="px-3 py-2 text-left whitespace-nowrap border-b">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-center text-gray-500" colSpan={headers.length}>No data</td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.sr_no} className="hover:bg-gray-50">
                  <td className="px-3 py-2 border-b">{r.sr_no}</td>
                  <td className="px-3 py-2 border-b">{r.client}</td>
                  <td className="px-3 py-2 border-b">{r.job_role}</td>
                  <td className="px-3 py-2 border-b">{r.department}</td>
                  <td className="px-3 py-2 border-b">{r.location}</td>
                  <td className="px-3 py-2 border-b">{r.total_positions}</td>
                  <td className="px-3 py-2 border-b">{r.jd_received ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2 border-b">{r.profiles_shared}</td>
                  <td className="px-3 py-2 border-b">{r.screen_feedback_pending}</td>
                  <td className="px-3 py-2 border-b">{r.screen_select}</td>
                  <td className="px-3 py-2 border-b">{r.screen_reject}</td>
                  <td className="px-3 py-2 border-b">{r.screen_waiting_for_schedule}</td>
                  <td className="px-3 py-2 border-b">{r.screen_interview_schedule_received}</td>
                  <td className="px-3 py-2 border-b">{r.l1_interview_backout}</td>
                  <td className="px-3 py-2 border-b">{r.l1_interview_done}</td>
                  <td className="px-3 py-2 border-b">{r.l1_feedback_pending}</td>
                  <td className="px-3 py-2 border-b">{r.l1_interview_select}</td>
                  <td className="px-3 py-2 border-b">{r.l1_waiting_for_schedule}</td>
                  <td className="px-3 py-2 border-b">{r.l1_interview_schedule_received}</td>
                  <td className="px-3 py-2 border-b">{r.l2_interview_backout}</td>
                  <td className="px-3 py-2 border-b">{r.l2_interview_done}</td>
                  <td className="px-3 py-2 border-b">{r.l2_feedback_pending}</td>
                  <td className="px-3 py-2 border-b">{r.l2_interview_select}</td>
                  <td className="px-3 py-2 border-b">{r.l2_waiting_for_schedule}</td>
                  <td className="px-3 py-2 border-b">{r.l2_interview_schedule_received}</td>
                  <td className="px-3 py-2 border-b">{r.onboarded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


