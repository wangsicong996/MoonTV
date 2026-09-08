import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { fetchSourceCatalog } from '@/lib/cms-catalog';
import { getCacheTime, getConfig } from '@/lib/config';
import { yellowWords } from '@/lib/yellow';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key')?.trim();
  const t = searchParams.get('t')?.trim() || undefined;
  const pg = Number(searchParams.get('pg') || '1');

  if (!key) {
    return NextResponse.json({ error: '缺少 key 参数' }, { status: 400 });
  }

  try {
    const config = await getConfig();
    const site = config.SourceConfig.find((s) => s.key === key && !s.disabled);
    if (!site) {
      return NextResponse.json({ error: '视频源不存在或已禁用' }, { status: 404 });
    }

    const catalog = await fetchSourceCatalog(
      {
        key: site.key,
        name: site.name,
        api: site.api,
        detail: site.detail,
      },
      { t, pg: Number.isFinite(pg) ? pg : 1 }
    );

    if (!config.SiteConfig.DisableYellowFilter) {
      catalog.list = catalog.list.filter((item) => {
        const typeName = item.type_name || '';
        return !yellowWords.some((word) => typeName.includes(word));
      });
      catalog.class = catalog.class.filter((item) => {
        return !yellowWords.some((word) => item.type_name.includes(word));
      });
    }

    const cacheTime = await getCacheTime();
    return NextResponse.json(catalog, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: '获取视频源目录失败', details: (error as Error).message },
      { status: 500 }
    );
  }
}
