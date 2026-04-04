const KEY = 'devAtlasPathways';

export interface PathwayItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Pathway {
  id: string;
  name: string;
  items: PathwayItem[];
  createdAt: number;
}

export function loadPathways(): Pathway[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Pathway[];
  } catch {
    return [];
  }
}

export function savePathways(pathways: Pathway[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(pathways));
}

export function mkPathway(name: string): Pathway {
  return { id: crypto.randomUUID(), name: name.trim(), items: [], createdAt: Date.now() };
}

export function mkItem(text: string): PathwayItem {
  return { id: crypto.randomUUID(), text: text.trim(), done: false };
}
