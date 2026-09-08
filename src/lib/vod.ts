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

export function favoriteKeyToVodId(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2147483646 + 1;
}

export function vodEn(title: string, vodId: number): string {
  const ascii = (title || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
  return ascii || `fav${vodId}`;
}

export function buildVodPlayUrl(episodes: string[]): string {
  if (!episodes.length) return '';
  if (episodes.length === 1) {
    return `正片$${episodes[0]}`;
  }
  return episodes
    .map((url, index) => {
      const name = `第${String(index + 1).padStart(2, '0')}集`;
      return `${name}$${url}`;
    })
    .join('#');
}

export function sanitizePlayName(name: string): string {
  return (name || 'm3u8').replace(/[$#,]/g, '_');
}

export const VOD_CLASS_LIST = [
  { type_id: 1, type_pid: 0, type_name: '电影片' },
  { type_id: 2, type_pid: 0, type_name: '连续剧' },
  { type_id: 3, type_pid: 0, type_name: '综艺片' },
  { type_id: 4, type_pid: 0, type_name: '动漫片' },
  { type_id: 6, type_pid: 1, type_name: '动作片' },
  { type_id: 7, type_pid: 1, type_name: '喜剧片' },
  { type_id: 8, type_pid: 1, type_name: '爱情片' },
  { type_id: 9, type_pid: 1, type_name: '科幻片' },
  { type_id: 10, type_pid: 1, type_name: '恐怖片' },
  { type_id: 11, type_pid: 1, type_name: '剧情片' },
  { type_id: 12, type_pid: 1, type_name: '战争片' },
  { type_id: 13, type_pid: 2, type_name: '国产剧' },
  { type_id: 14, type_pid: 2, type_name: '香港剧' },
  { type_id: 15, type_pid: 2, type_name: '韩国剧' },
  { type_id: 16, type_pid: 2, type_name: '欧美剧' },
  { type_id: 20, type_pid: 1, type_name: '记录片' },
  { type_id: 21, type_pid: 2, type_name: '台湾剧' },
  { type_id: 22, type_pid: 2, type_name: '日本剧' },
  { type_id: 23, type_pid: 2, type_name: '海外剧' },
  { type_id: 24, type_pid: 2, type_name: '泰国剧' },
  { type_id: 25, type_pid: 3, type_name: '大陆综艺' },
  { type_id: 26, type_pid: 3, type_name: '港台综艺' },
  { type_id: 27, type_pid: 3, type_name: '日韩综艺' },
  { type_id: 28, type_pid: 3, type_name: '欧美综艺' },
  { type_id: 29, type_pid: 4, type_name: '国产动漫' },
  { type_id: 30, type_pid: 4, type_name: '日韩动漫' },
  { type_id: 31, type_pid: 4, type_name: '欧美动漫' },
  { type_id: 32, type_pid: 4, type_name: '港台动漫' },
  { type_id: 33, type_pid: 4, type_name: '海外动漫' },
  { type_id: 34, type_pid: 1, type_name: '伦理片' },
  { type_id: 36, type_pid: 2, type_name: '短剧' },
  { type_id: 37, type_pid: 1, type_name: '动画片' },
];

const MOVIE_TYPES = new Set([1, 6, 7, 8, 9, 10, 11, 12, 20, 34, 37]);
const TV_TYPES = new Set([2, 13, 14, 15, 16, 21, 22, 23, 24, 36]);

export function vodTypeOf(isTv: boolean): { type_id: number; type_name: string } {
  return isTv
    ? { type_id: 13, type_name: '国产剧' }
    : { type_id: 11, type_name: '剧情片' };
}

export function matchesVodType(isTv: boolean, typeId: number): boolean {
  if (!typeId) return true;
  if (MOVIE_TYPES.has(typeId)) return !isTv;
  if (TV_TYPES.has(typeId)) return isTv;
  return true;
}
