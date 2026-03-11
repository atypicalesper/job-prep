import fs from 'fs';
import path from 'path';

// Absolute path to the markdown content directory
const DOCS_ROOT = path.join(process.cwd(), '..', 'node-interview-prep');

export interface NavItem {
  title: string;
  slug: string[];
  children?: NavItem[];
}

/** Convert a file/directory name like "01-event-loop" → "Event Loop" */
function humanize(name: string): string {
  return name
    .replace(/^\d+-/, '')           // strip leading "01-"
    .replace(/-/g, ' ')             // dashes → spaces
    .replace(/\b\w/g, c => c.toUpperCase()); // title case
}

/** Recursively build the navigation tree from the docs directory */
export function buildNavTree(dir: string = DOCS_ROOT, prefix: string[] = []): NavItem[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  // Sort: directories first by name, then files
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const items: NavItem[] = [];

  for (const entry of entries) {
    // Skip hidden files, non-md files at top level, READMEs
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'README.md') continue;

    if (entry.isDirectory()) {
      const slug = [...prefix, entry.name];
      const children = buildNavTree(path.join(dir, entry.name), slug);
      if (children.length === 0) continue;
      items.push({
        title: humanize(entry.name),
        slug,
        children,
      });
    } else if (entry.name.endsWith('.md')) {
      const slug = [...prefix, entry.name.replace(/\.md$/, '')];
      items.push({
        title: humanize(entry.name.replace(/\.md$/, '')),
        slug,
      });
    }
  }

  return items;
}

/** Resolve a slug array to a file path and return its content */
export function getDocContent(slug: string[]): { content: string; title: string } | null {
  // Try slug as-is (a .md file)
  const mdPath = path.join(DOCS_ROOT, ...slug) + '.md';
  if (fs.existsSync(mdPath)) {
    const content = fs.readFileSync(mdPath, 'utf-8');
    const title = extractTitle(content) ?? humanize(slug[slug.length - 1]);
    return { content, title };
  }

  // Try as directory — look for index or first .md file
  const dirPath = path.join(DOCS_ROOT, ...slug);
  if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md')).sort();
    if (files.length > 0) {
      const content = fs.readFileSync(path.join(dirPath, files[0]), 'utf-8');
      const title = extractTitle(content) ?? humanize(slug[slug.length - 1]);
      return { content, title };
    }
  }

  return null;
}

function extractTitle(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

/** Return all valid doc slugs (for static generation) */
export function getAllDocSlugs(): string[][] {
  const slugs: string[][] = [];

  function walk(dir: string, prefix: string[]) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'README.md') continue;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), [...prefix, entry.name]);
      } else if (entry.name.endsWith('.md')) {
        slugs.push([...prefix, entry.name.replace(/\.md$/, '')]);
      }
    }
  }

  walk(DOCS_ROOT, []);
  return slugs;
}

/** Get the flat ordered list of all doc slugs for prev/next navigation */
function flattenNav(items: NavItem[]): NavItem[] {
  const result: NavItem[] = [];
  for (const item of items) {
    if (item.children) {
      result.push(...flattenNav(item.children));
    } else {
      result.push(item);
    }
  }
  return result;
}

export function getPrevNext(currentSlug: string[]): {
  prev: NavItem | null;
  next: NavItem | null;
} {
  const nav = buildNavTree();
  const flat = flattenNav(nav);
  const key = currentSlug.join('/');
  const idx = flat.findIndex(item => item.slug.join('/') === key);

  return {
    prev: idx > 0 ? flat[idx - 1] : null,
    next: idx < flat.length - 1 ? flat[idx + 1] : null,
  };
}
