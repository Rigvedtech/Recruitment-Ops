import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { EmailProvider } from '@/context/EmailContext';
import NavigationWrapper from '@/components/NavigationWrapper';
import { DomainProvider } from '@/context/DomainContext';
import { ThemeProvider } from '@/context/ThemeContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Email Tracker',
  description: 'Email tracking and management system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ThemeProvider>
          <DomainProvider>
            <EmailProvider>
              <NavigationWrapper>
                  {children}
              </NavigationWrapper>
            </EmailProvider>
          </DomainProvider>
        </ThemeProvider>
      </body>
    </html>
  );
} 