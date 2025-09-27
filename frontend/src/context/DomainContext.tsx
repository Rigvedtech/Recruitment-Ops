'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface DomainConfig {
  name: string;
  database: string;
  theme: string;
  primaryColor: string;
  secondaryColor: string;
}

interface DomainContextType {
  domain: string;
  domainConfig: DomainConfig;
  isProduction: boolean;
}

const DomainContext = createContext<DomainContextType | undefined>(undefined);

export const DomainProvider = ({ children }: { children: ReactNode }) => {
  const [domain, setDomain] = useState('');

  useEffect(() => {
    const currentDomain = window.location.host;
    setDomain(currentDomain);
    console.log('Current domain:', currentDomain);
  }, []);

  const getDomainConfig = (domain: string): DomainConfig => {
    if (domain.includes('rgvdit-rops')) {
      return {
        name: 'Rigved IT',
        database: 'rigvedit_prod',
        theme: 'blue',
        primaryColor: '#2563eb',
        secondaryColor: '#1d4ed8'
      };
    } else if (domain.includes('finquest-rops')) {
      return {
        name: 'FinQuest',
        database: 'finquest_recops',
        theme: 'green',
        primaryColor: '#059669',
        secondaryColor: '#047857'
      };
    }
    return {
      name: 'Development',
      database: 'rigvedit_dev',
      theme: 'gray',
      primaryColor: '#6b7280',
      secondaryColor: '#4b5563'
    };
  };

  const domainConfig = getDomainConfig(domain);
  const isProduction = domain.includes('rigvedtech.com');

  return (
    <DomainContext.Provider value={{ domain, domainConfig, isProduction }}>
      {children}
    </DomainContext.Provider>
  );
};

export const useDomain = () => {
  const context = useContext(DomainContext);
  if (!context) {
    throw new Error('useDomain must be used within a DomainProvider');
  }
  return context;
};

// Hook for getting domain-specific styles
export const useDomainStyles = () => {
  const { domainConfig } = useDomain();
  
  return {
    primaryColor: domainConfig.primaryColor,
    secondaryColor: domainConfig.secondaryColor,
    theme: domainConfig.theme,
    // CSS custom properties for easy styling
    cssVariables: {
      '--primary-color': domainConfig.primaryColor,
      '--secondary-color': domainConfig.secondaryColor,
    }
  };
};
