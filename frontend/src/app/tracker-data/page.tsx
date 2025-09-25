'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/services/api'

interface TrackerRow {
  request_id: string;
  student_ids: string;
  student_count: number;
}

const TrackerDataPage: React.FC = () => {
  const router = useRouter()
  const [rows, setRows] = useState<TrackerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    // Check authentication first
    const storedUser = localStorage.getItem('user')
    if (!storedUser) {
      router.push('/login')
      return
    }

    try {
      const userData = JSON.parse(storedUser)
      if (!userData.role || !['admin', 'recruiter'].includes(userData.role)) {
        router.push('/login')
        return
      }
      setAuthChecked(true)
      fetchTrackerTable()
    } catch (error) {
      console.error('Error parsing user data:', error)
      localStorage.removeItem('user')
      router.push('/login')
    }
  }, [router])

  // Don't render anything until authentication is checked
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const fetchTrackerTable = async () => {
    try {
      setLoading(true)
      const data = await api.get('/tracker')
      // Only keep the required fields, as they are in the database
      setRows(data.map((row: any) => ({
        request_id: row.request_id,
        student_ids: row.student_ids,
        student_count: row.student_count
      })))
    } catch (err) {
      setError('Failed to fetch tracker table')
      console.error('Error fetching tracker table:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600 text-center">
          <p className="text-xl font-semibold mb-2">Error</p>
          <p>{error}</p>
          <button 
            onClick={fetchTrackerTable}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Tracker Table</h1>
      <div className="overflow-x-auto bg-white shadow-md rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Request ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student IDs</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student Count</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.map((row, idx) => (
              <tr key={row.request_id + '-' + idx} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.request_id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.student_ids}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.student_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default TrackerDataPage 