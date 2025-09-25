'use client'

import React, { useState, useEffect } from 'react'

interface DocxViewerProps {
  filePath: string
  fileName: string
}

const DocxViewer: React.FC<DocxViewerProps> = ({ filePath, fileName }) => {
  const [htmlContent, setHtmlContent] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    const convertDocxToHtml = async () => {
      try {
        setLoading(true)
        setError('')

        // Convert absolute path to relative path
        let relativePath = filePath
        if (filePath.includes('\\uploads\\')) {
          // Extract the relative path from the absolute path
          const uploadsIndex = filePath.indexOf('\\uploads\\')
          relativePath = filePath.substring(uploadsIndex + 9) // +9 to skip '\uploads\'
          relativePath = relativePath.replace(/\\/g, '/') // Convert backslashes to forward slashes
        }

        const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1010'
        const API_BASE_URL = baseUrl.endsWith('/api') ? baseUrl : baseUrl + '/api'
        const response = await fetch(`${API_BASE_URL}/convert-docx-to-html?path=${encodeURIComponent(relativePath)}`)
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to convert document')
        }

        if (!data.html_content) {
          throw new Error('No content received from server')
        }

        setHtmlContent(data.html_content)
      } catch (err) {
        console.error('Error converting DOCX to HTML:', err)
        setError(err instanceof Error ? err.message : 'Failed to load document content')
      } finally {
        setLoading(false)
      }
    }

    if (filePath) {
      convertDocxToHtml()
    }
  }, [filePath])

  const handleDownload = () => {
    // Convert absolute path to relative path for download
    let relativePath = filePath
    if (filePath.includes('\\uploads\\')) {
      const uploadsIndex = filePath.indexOf('\\uploads\\')
      relativePath = filePath.substring(uploadsIndex + 9)
      relativePath = relativePath.replace(/\\/g, '/')
    }
    
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1010'
    const API_BASE_URL = baseUrl.endsWith('/api') ? baseUrl : baseUrl + '/api'
    const downloadUrl = `${API_BASE_URL}/download-file?path=${encodeURIComponent(relativePath)}`
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600 text-sm">Loading document content...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
          <svg
            className="w-8 h-8 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Document</h3>
        <p className="text-red-600 text-sm text-center mb-4 max-w-md">
          {error}
        </p>
        <button
          onClick={handleDownload}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Download Original File
        </button>
      </div>
    )
  }

  return (
    <div className="prose prose-sm max-w-none min-h-full p-4">
      <div 
        className="prose-headings:font-semibold prose-p:leading-relaxed prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-li:marker:text-blue-600 prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-h4:text-base prose-table:border-collapse prose-th:border prose-th:border-gray-300 prose-th:px-3 prose-th:py-2 prose-td:border prose-td:border-gray-300 prose-td:px-3 prose-td:py-2"
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    </div>
  )
}

export default DocxViewer
