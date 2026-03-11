import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { buildNavTree, buildSearchIndex } from '@/lib/docs';
import Shell from '@/components/Shell';
import './globals.css';

export const metadata: Metadata = {
  title: 'Node.js Interview Prep',
  description: 'Senior Node.js / TypeScript interview preparation guide',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const nav = buildNavTree();
  const searchIndex = buildSearchIndex();

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <Shell nav={nav} searchIndex={searchIndex}>
            {children}
          </Shell>
        </ThemeProvider>
      </body>
    </html>
  );
}
