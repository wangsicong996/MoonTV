export const SHARE_TTL_MS = 5 * 60 * 60 * 1000;

export interface SharePayload {
  s: string;
  i: string;
  exp: number;
  ep?: number;
}

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

export async function createShareToken(
  source: string,
  id: string,
  secret: string,
  episodeIndex = 0
): Promise<string> {
  const payload: SharePayload = {
    s: source,
    i: id,
    exp: Date.now() + SHARE_TTL_MS,
    ep: episodeIndex,
  };
  const body = toBase64Url(JSON.stringify(payload));
  const sig = await hmacHex(body, secret);
  return `${body}.${sig}`;
}

export async function verifyShareToken(
  token: string,
  secret: string
): Promise<SharePayload | null> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = await hmacHex(body, secret);
  if (!timingSafeEqual(sig, expected)) return null;

  try {
    const payload = JSON.parse(fromBase64Url(body)) as SharePayload;
    if (!payload.s || !payload.i || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
