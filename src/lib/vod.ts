function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return atob(padded + pad);
}

async function hmacHex(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function createVodToken(
  username: string,
  secret: string
): Promise<string> {
  const body = toBase64Url(JSON.stringify({ u: username, v: 1 }));
  const sig = await hmacHex(body, secret);
  return `${body}.${sig}`;
}

export async function verifyVodToken(
  token: string,
  secret: string
): Promise<string | null> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = await hmacHex(body, secret);
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(fromBase64Url(body)) as { u?: string };
    if (!payload.u || typeof payload.u !== 'string') return null;
    return payload.u;
  } catch {
    return null;
  }
}

export function encodeVodId(source: string, id: string): string {
  return `${source}~~${id}`;
}

export function decodeVodId(
  vodId: string
): { source: string; id: string } | null {
  const raw = decodeURIComponent(vodId || '');
  const idx = raw.indexOf('~~');
  if (idx <= 0) return null;
  const source = raw.slice(0, idx);
  const id = raw.slice(idx + 2);
  if (!source || !id) return null;
  return { source, id };
}

export function buildVodPlayUrl(episodes: string[]): string {
  if (!episodes.length) return '';
  if (episodes.length === 1) {
    return `正片$${episodes[0]}`;
  }
  return episodes
    .map((url, index) => `第${index + 1}集$${url}`)
    .join('#');
}

export function sanitizePlayName(name: string): string {
  return (name || 'moontv').replace(/[$#]/g, '_');
}
