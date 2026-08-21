import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { VaultProvider } from '@/components/VaultContext';
import { AccountsUsageProvider } from '@/components/AccountsUsageContext';
import { TimezoneProvider } from '@/components/TimezoneContext';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen`}
      >
        <TimezoneProvider>
          <VaultProvider>
            <AccountsUsageProvider>
              {children}
            </AccountsUsageProvider>
          </VaultProvider>
        </TimezoneProvider>
      </body>
    </html>
  );
}
