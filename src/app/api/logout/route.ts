import { NextResponse } from 'next/server';

import { getAuthCookieOptions } from '@/lib/auth';

export const runtime = 'edge';

export async function POST() {
  const response = NextResponse.json({ ok: true });

  response.cookies.set('auth', '', getAuthCookieOptions(new Date(0)));

  return response;
}
