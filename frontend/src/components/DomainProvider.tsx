'use client';

import React, { createContext, useContext } from 'react';
import { useDomainResolver } from '@/hooks/useDomainResolver';

interface DomainContextType {
  isResolved: boolean;
  isLoading: boolean;
  error: string | null;
  domain: string | null;
}

const DomainContext = createContext<DomainContextType>({
  isResolved: false,
  isLoading: true,
  error: null,
  domain: null
});

export const useDomain = () => {
  const context = useContext(DomainContext);
  if (!context) {
    throw new Error('useDomain must be used within a DomainProvider');
  }
  return context;
};

interface DomainProviderProps {
  children: React.ReactNode;
}

export const DomainProvider: React.FC<DomainProviderProps> = ({ children }) => {
  const domainState = useDomainResolver();

  // Show loading screen while resolving domain
  if (domainState.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Initializing domain configuration...</p>
          <p className="text-sm text-gray-400 mt-2">Domain: {domainState.domain}</p>
        </div>
      </div>
    );
  }

  // Show error screen if domain resolution failed
  if (domainState.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Domain Configuration Error</h1>
          <p className="text-gray-600 mb-4">{domainState.error}</p>
          <p className="text-sm text-gray-400 mb-4">Domain: {domainState.domain}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Render children only if domain is successfully resolved
  return (
    <DomainContext.Provider value={domainState}>
      {children}
    </DomainContext.Provider>
  );
};
