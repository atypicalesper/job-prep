import type { Metadata } from 'next';
import Script from 'next/script';
import { ThemeProvider } from 'next-themes';
import { buildNavTree, buildSearchIndex } from '@/lib/docs';
import Shell from '@/components/Shell';
import './globals.css';

// ─── Microsoft Clarity ────────────────────────────────────────────────────────
// Paste your Project ID from clarity.microsoft.com → Settings → Overview
const CLARITY_ID = 'REPLACE_WITH_YOUR_CLARITY_ID';

export const metadata: Metadata = {
  title: 'Node.js Interview Prep',
  description: 'Node.js software engineer interview preparation — JavaScript, TypeScript, system design, databases, and more.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const nav = buildNavTree();
  const searchIndex = buildSearchIndex();

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {CLARITY_ID !== 'REPLACE_WITH_YOUR_CLARITY_ID' && (
          <Script id="clarity" strategy="afterInteractive">{`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window,document,"clarity","script","${CLARITY_ID}");
          `}</Script>
        )}
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <Shell nav={nav} searchIndex={searchIndex}>
            {children}
          </Shell>
        </ThemeProvider>
      </body>
    </html>
  );
}
