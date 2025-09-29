import { useEffect, useState } from 'react';

interface DomainResolverState {
  isResolved: boolean;
  isLoading: boolean;
  error: string | null;
  domain: string | null;
}

export const useDomainResolver = () => {
  const [state, setState] = useState<DomainResolverState>({
    isResolved: false,
    isLoading: true,
    error: null,
    domain: null
  });

  useEffect(() => {
    const resolveDomain = async () => {
      try {
        // Use the actual domain without any override
        const currentDomain = window.location.origin;
        const domainHost = window.location.host;
        
        setState(prev => ({ ...prev, domain: currentDomain, isLoading: true }));

        // Get API base URL based on domain
        const getApiBaseUrl = () => {
          if (domainHost.includes('rgvdit-rops') || domainHost.includes('finquest-rops')) {
            return 'http://20.188.122.171:1976';
          }
          return process.env.NEXT_PUBLIC_API_URL || 'http://20.188.122.171:1976';
        };

        const API_BASE_URL = getApiBaseUrl();
        
        // Handle case where API_BASE_URL already includes /api
        const baseUrl = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
        const fullUrl = `${baseUrl}/domain/resolve`;
        
        console.log('DEBUG: API_BASE_URL =', API_BASE_URL);
        console.log('DEBUG: Base URL =', baseUrl);
        console.log('DEBUG: Full URL =', fullUrl);
        console.log('DEBUG: Domain Host =', domainHost);
        
        const response = await fetch(fullUrl, {
          method: 'POST',
          headers: {
            'X-Original-Domain': domainHost,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            domain_url: currentDomain
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to resolve domain: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.success) {
          setState({
            isResolved: true,
            isLoading: false,
            error: null,
            domain: currentDomain
          });
        } else {
          throw new Error(data.error || 'Failed to resolve domain');
        }

      } catch (error) {
        console.error('Domain resolution error:', error);
        setState({
          isResolved: false,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          domain: window.location.origin
        });
      }
    };

    resolveDomain();
  }, []);

  return state;
};
