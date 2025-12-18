'use client';

import React, { useEffect, useRef } from 'react';

/**
 * Careers Layout - Forces Light Mode
 * 
 * This layout is specifically for the careers portal (/careers routes).
 * Since the careers page dark mode implementation is incomplete,
 * this layout ensures the page always renders in light mode
 * regardless of user's system preferences or stored theme.
 * 
 * Uses MutationObserver to ensure the dark class is always removed,
 * even if the ThemeContext tries to add it.
 */
export default function CareersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const originalThemeRef = useRef<string | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    
    // Store the original theme state
    originalThemeRef.current = root.classList.contains('dark') ? 'dark' : 'light';
    
    // Function to force light mode
    const forceLightMode = () => {
      if (root.classList.contains('dark')) {
        root.classList.remove('dark');
      }
      if (!root.classList.contains('light')) {
        root.classList.add('light');
      }
    };
    
    // Initial force to light mode
    forceLightMode();
    
    // Create MutationObserver to watch for class changes on html element
    // This catches when ThemeContext tries to add 'dark' class
    observerRef.current = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          // Re-force light mode if someone added dark class
          forceLightMode();
        }
      });
    });
    
    // Start observing
    observerRef.current.observe(root, {
      attributes: true,
      attributeFilter: ['class'],
    });
    
    // Cleanup: restore the original theme when navigating away from careers pages
    return () => {
      // Disconnect observer
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      
      // Restore original theme if it was dark
      if (originalThemeRef.current === 'dark') {
        root.classList.remove('light');
        root.classList.add('dark');
      }
    };
  }, []);

  return <>{children}</>;
}
