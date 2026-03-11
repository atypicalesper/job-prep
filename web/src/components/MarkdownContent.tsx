import { marked } from 'marked';
import hljs from 'highlight.js';

marked.setOptions({ gfm: true, breaks: false });

const renderer = new marked.Renderer();

// marked v12 renderer.code signature: (code, infostring, escaped)
renderer.code = function (code: string, infostring: string | undefined) {
  const lang = infostring ?? '';
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
  let highlighted: string;
  try {
    highlighted = hljs.highlight(code, { language }).value;
  } catch {
    highlighted = hljs.highlightAuto(code).value;
  }
  const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
  return `<pre>${langLabel}<code class="hljs language-${language}">${highlighted}</code></pre>`;
};

renderer.heading = function (text: string, depth: number) {
  const id = text
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
  return (
    <div
      className="prose prose-slate dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
