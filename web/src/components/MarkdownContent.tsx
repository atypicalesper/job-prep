'use client';

import { useEffect, useRef } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js';

marked.setOptions({ gfm: true, breaks: false });

const renderer = new marked.Renderer();

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

renderer.code = function (code: string, infostring: string | undefined) {
  const lang = (infostring ?? '').trim();
  if (!lang) {
    // No language — plain text / ASCII diagram, skip hljs to preserve alignment
    return `<pre><code class="hljs">${escapeHtml(code)}</code></pre>`;
  }
  const language = hljs.getLanguage(lang) ? lang : 'plaintext';
  let highlighted: string;
  try {
    highlighted = hljs.highlight(code, { language }).value;
  } catch {
    highlighted = hljs.highlightAuto(code).value;
  }
  return `<pre><span class="code-lang">${escapeHtml(lang)}</span><code class="hljs language-${language}">${highlighted}</code></pre>`;
};

renderer.heading = function (text: string, depth: number) {
  // text may contain rendered HTML (e.g. <code>foo</code>) — strip tags before building the ID
  // so it matches the IDs generated server-side by extractHeadings() in docs.ts
  const plain = text.replace(/<[^>]+>/g, '');
  const id = plain
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return `<h${depth} id="${id}">${text}</h${depth}>`;
};

marked.use({ renderer });

interface Props {
  markdown: string;
}

export default function MarkdownContent({ markdown }: Props) {
  const html = marked(markdown) as string;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.querySelectorAll<HTMLElement>('pre').forEach(pre => {
      if (pre.querySelector('.copy-btn')) return;

      pre.style.position = 'relative';

      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.onclick = async () => {
        const code = pre.querySelector('code')?.textContent ?? '';
        try {
          await navigator.clipboard.writeText(code);
          btn.textContent = 'Copied!';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.textContent = 'Copy';
            btn.classList.remove('copied');
          }, 2000);
        } catch {
          // clipboard not available (e.g. non-HTTPS)
        }
      };
      pre.appendChild(btn);
    });
  }, [html]);

  return (
    <div
      ref={containerRef}
      className="prose prose-slate dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
