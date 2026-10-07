import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { headers } from 'next/headers';
import { ThemeProvider } from 'next-themes';

import { Toaster } from '@/components/ui/sonner';
import { NONCE_HEADER } from '@/lib/csp';

import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'KanbanFlow',
    template: '%s | KanbanFlow',
  },
  description:
    'Real-time collaborative project management. Drag, drop, and ship faster with your team.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request renders every route per request — required, because a
  // prerendered page carries no nonce and 'strict-dynamic' would block its scripts.
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider
          nonce={nonce}
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          {/* No `richColors`: its light-mode error and success text is under 4.5:1. */}
          <Toaster closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
