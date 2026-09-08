'use client';

export type NavSource = { key: string; name: string };

const EVENT = 'nav-sources-updated';

let memory: NavSource[] | null = null;
let inflight: Promise<NavSource[]> | null = null;

function emit(sources: NavSource[]) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: sources }));
}

export function getCachedNavSources(): NavSource[] {
  return memory || [];
}

export async function fetchNavSources(force = false): Promise<NavSource[]> {
  if (!force && memory) return memory;
  if (inflight) return inflight;

  inflight = fetch('/api/nav-sources')
    .then((resp) => (resp.ok ? resp.json() : { sources: [] }))
    .then((data) => {
      const sources: NavSource[] = Array.isArray(data?.sources)
        ? data.sources
        : [];
      memory = sources;
      emit(sources);
      return sources;
    })
    .catch(() => memory || [])
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function subscribeNavSources(
  callback: (sources: NavSource[]) => void
): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const handler = (event: Event) => {
    const sources = (event as CustomEvent<NavSource[]>).detail;
    callback(Array.isArray(sources) ? sources : []);
  };
  window.addEventListener(EVENT, handler);

  if (memory) {
    callback(memory);
  } else {
    fetchNavSources().then(callback);
  }

  return () => window.removeEventListener(EVENT, handler);
}

export function invalidateNavSources(): Promise<NavSource[]> {
  memory = null;
  return fetchNavSources(true);
}
