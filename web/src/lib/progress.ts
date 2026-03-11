const VISITED_KEY = 'niprep_visited';
const RECENT_KEY  = 'niprep_recent';

export interface RecentPage {
  slug: string;   // e.g. "01-javascript-fundamentals/01-event-loop/01-event-loop-deep-dive"
  title: string;
  ts: number;
}

function getRawVisited(): string[] {
  try {
    return JSON.parse(localStorage.getItem(VISITED_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/** Record a page visit. Call on doc page mount. */
export function recordVisit(slug: string[], title: string): void {
  if (typeof window === 'undefined') return;
  const key = slug.join('/');

  // Mark visited (deduplicated)
  const visited = getRawVisited();
  if (!visited.includes(key)) {
    localStorage.setItem(VISITED_KEY, JSON.stringify([...visited, key]));
  }

  // Update recents (most recent first, deduplicated)
  const recent = getRecent().filter(r => r.slug !== key);
  recent.unshift({ slug: key, title, ts: Date.now() });
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 6)));
}

/** How many pages in a given top-level section have been visited. */
export function getVisitedCountBySection(sectionSlug: string): number {
  if (typeof window === 'undefined') return 0;
  return getRawVisited().filter(s => s.startsWith(sectionSlug + '/')).length;
}

/** All visited slugs as a Set. */
export function getVisitedSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  return new Set(getRawVisited());
}

/** Last N visited pages (most recent first). */
export function getRecent(): RecentPage[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentPage[];
  } catch {
    return [];
  }
}
