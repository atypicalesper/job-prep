import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { buildNavTree } from '@/lib/docs';
import Sidebar from '@/components/Sidebar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Node.js Interview Prep',
  description: 'Senior Node.js / TypeScript interview preparation guide',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const nav = buildNavTree();

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <div className="flex min-h-screen">
            <Sidebar nav={nav} />
            <main className="flex-1 min-w-0 overflow-x-hidden">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
