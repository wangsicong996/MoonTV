import { NextRequest } from 'next/server';

import { handleVodCms, vodCmsOptions } from '@/lib/vod-cms';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return vodCmsOptions();
}

export function GET(request: NextRequest) {
  return handleVodCms(request);
}
