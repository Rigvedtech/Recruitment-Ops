'use client'

import React from 'react'
import DocxViewer from './DocxViewer'

interface JobDescriptionModalProps {
  isOpen: boolean
  onClose: () => void
  jobTitle: string
  companyName: string
  fileName: string
  filePath: string
}

const JobDescriptionModal: React.FC<JobDescriptionModalProps> = ({
  isOpen,
  onClose,
  jobTitle,
  companyName,
  fileName,
  filePath
}) => {
  if (!isOpen) return null

  const getFileType = (filename: string) => {
    const extension = filename.toLowerCase().split('.').pop()
    return extension === 'pdf' ? 'PDF' : extension === 'docx' ? 'DOCX' : 'Unknown'
  }

  const handleDownload = () => {
    // Convert absolute path to relative path for download
    let relativePath = filePath
    if (filePath.includes('\\uploads\\')) {
      const uploadsIndex = filePath.indexOf('\\uploads\\')
      relativePath = filePath.substring(uploadsIndex + 9)
      relativePath = relativePath.replace(/\\/g, '/')
    } else if (!filePath.includes('/') && !filePath.includes('\\')) {
      // If it's just a filename (no path separators), assume it's in job_descriptions folder
      relativePath = `job_descriptions/${filePath}`
    }
    
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://20.188.122.171:1976'
    const API_BASE_URL = baseUrl.endsWith('/api') ? baseUrl : baseUrl + '/api'
    const downloadUrl = `${API_BASE_URL}/download-file?path=${encodeURIComponent(relativePath)}`
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const fileType = getFileType(fileName)
  const isPdf = fileType === 'PDF'
  const isDocx = fileType === 'DOCX'

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-4 mx-auto p-5 border w-11/12 md:w-4/5 lg:w-3/4 xl:w-2/3 shadow-lg rounded-md bg-white max-h-[95vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">
              Job Description - {jobTitle}
            </h3>
            <div className="mt-1 text-sm text-gray-600">
              <p><span className="font-medium">Company:</span> {companyName}</p>
              <p><span className="font-medium">File:</span> {fileName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors duration-200"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-hidden mt-4">
          {isPdf ? (
            <div className="h-full">
              <iframe
                src={`${(() => {
                  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://20.188.122.171:1976'
                  return baseUrl.endsWith('/api') ? baseUrl : baseUrl + '/api'
                })()}/view-file?path=${encodeURIComponent(
                  (() => {
                    if (filePath.includes('\\uploads\\')) {
                      return filePath.substring(filePath.indexOf('\\uploads\\') + 9).replace(/\\/g, '/')
                    } else if (!filePath.includes('/') && !filePath.includes('\\')) {
                      return `job_descriptions/${filePath}`
                    }
                    return filePath
                  })()
                )}`}
                className="w-full h-full border-0 rounded"
                title={`Job Description - ${jobTitle}`}
              />
            </div>
          ) : isDocx ? (
            <div className="h-full overflow-y-auto max-h-[70vh]">
              <DocxViewer filePath={filePath} fileName={fileName} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="flex items-center justify-center w-16 h-16 bg-yellow-100 rounded-full mb-4">
                <svg
                  className="w-8 h-8 text-yellow-600"
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
              <h3 className="text-lg font-medium text-gray-900 mb-2">Unsupported File Type</h3>
              <p className="text-gray-600 text-sm text-center mb-4 max-w-md">
                This file type ({fileType}) is not supported for preview. You can download the original file instead.
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
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200 mt-4">
          <div className="text-sm text-gray-500">
            <span className="font-medium">File Type:</span> {fileType}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleDownload}
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
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Download
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default JobDescriptionModal
