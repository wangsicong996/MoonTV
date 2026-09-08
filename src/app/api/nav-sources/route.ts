import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getSidebarApiSites } from '@/lib/config';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sites = await getSidebarApiSites();
    return NextResponse.json(
      {
        sources: sites.map((site) => ({
          key: site.key,
          name: site.name,
        })),
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: '获取侧栏视频源失败', details: (error as Error).message },
      { status: 500 }
    );
  }
}
