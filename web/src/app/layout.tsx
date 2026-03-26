import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { buildNavTree, buildSearchIndex } from '@/lib/docs';
import Shell from '@/components/Shell';
import { NotebookProvider } from '@/lib/notebook';
import './globals.css';

const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID || '';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const SITE_URL = 'https://atypicalesper.github.io/dev-atlas';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'dev atlas',
    template: '%s — dev atlas',
  },
  description: 'The complete developer knowledge base. JavaScript, TypeScript, React, Node.js, Python, AI/ML, system design, DSA, databases, cloud, and more.',
  keywords: ['developer knowledge base', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'system design', 'DSA', 'interview prep', 'AI', 'cloud', 'AWS'],
  authors: [{ name: 'Tarun Singh', url: 'https://atypicalesper.github.io' }],
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'dev atlas',
    title: 'dev atlas — developer knowledge base',
    description: 'The complete developer knowledge base. JavaScript, TypeScript, React, Node.js, Python, AI/ML, system design, DSA, databases, cloud, and more.',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary',
    title: 'dev atlas — developer knowledge base',
    description: 'The complete developer knowledge base. JavaScript, TypeScript, React, Node.js, Python, AI/ML, system design, DSA, databases, cloud, and more.',
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: `${basePath}/logo.svg`, type: 'image/svg+xml' },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const nav = buildNavTree();
  const searchIndex = buildSearchIndex();

  return (
    <html lang="en" translate="no" suppressHydrationWarning>
      <head suppressHydrationWarning>
        {CLARITY_ID && (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${CLARITY_ID}");`,
            }}
          />
        )}
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <NotebookProvider>
            <Shell nav={nav} searchIndex={searchIndex}>
              {children}
            </Shell>
          </NotebookProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
