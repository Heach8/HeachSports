let currentOrg = localStorage.getItem('ncl_org') || '';
export const setOrgSlug = (s) => { currentOrg = s; localStorage.setItem('ncl_org', s); };
export const getOrgSlug = () => currentOrg;

export async function api(path, opts = {}) {
  if (currentOrg) {
    path += (path.includes('?') ? '&' : '?') + 'org=' + encodeURIComponent(currentOrg);
  }
  const isForm = opts.body instanceof FormData;
  const res = await fetch('/api' + path, {
    credentials: 'include',
    ...opts,
    headers: opts.body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body && !isForm ? JSON.stringify(opts.body) : opts.body
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Bir hata olustu');
  return data;
}

// Canli yayin: SSE baglantisi
export function subscribeLive(matchId, onUpdate) {
  const url = matchId ? `/api/live/stream?matchId=${matchId}` : '/api/live/stream';
  const es = new EventSource(url);
  es.addEventListener('update', (e) => onUpdate(JSON.parse(e.data)));
  return () => es.close();
}
