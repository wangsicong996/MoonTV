/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { createVodToken } from '@/lib/vod';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function getOrigin(request: NextRequest): string {
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host =
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    new URL(request.url).host;
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  try {
    const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
    if (storageType === 'localstorage') {
      return NextResponse.json(
        {
          error:
            '当前是 localStorage 模式，收藏只存在浏览器里。请改用 Redis / D1 / Upstash 后再使用 VOD 订阅。',
        },
        { status: 400 }
      );
    }

    const authInfo = getAuthInfoFromCookie(request);
    const username = authInfo?.username;
    if (!username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const secret = process.env.PASSWORD || '';
    if (!secret) {
      return NextResponse.json({ error: '未配置站点密钥' }, { status: 500 });
    }

    const token = await createVodToken(username, secret);
    const origin = getOrigin(request);
    const api = `${origin}/api/vod/${token}`;
    const cmsApi = `${origin}/api.php/provide/vod/${token}`;

    return NextResponse.json({
      api,
      cmsApi,
      tvbox: {
        key: 'suntv_fav',
        name: 'suntv收藏',
        type: 1,
        api,
        searchable: 1,
        quickSearch: 1,
        filterable: 0,
      },
    });
  } catch (err) {
    console.error('生成 VOD 订阅失败', err);
    return NextResponse.json({ error: '生成失败' }, { status: 500 });
  }
}
