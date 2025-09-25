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
        
        setState(prev => ({ ...prev, domain: currentDomain, isLoading: true }));

        // Make API call to backend to resolve domain and initialize database
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1010';
        
        // Handle case where API_BASE_URL already includes /api
        const baseUrl = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
        const fullUrl = `${baseUrl}/domain/resolve`;
        
        console.log('DEBUG: API_BASE_URL =', API_BASE_URL);
        console.log('DEBUG: Base URL =', baseUrl);
        console.log('DEBUG: Full URL =', fullUrl);
        
        const response = await fetch(fullUrl, {
          method: 'POST',
          headers: {
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
