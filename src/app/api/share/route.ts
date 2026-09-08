/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites } from '@/lib/config';
import { getDetailFromApi } from '@/lib/downstream';
import {
  createShareToken,
  SHARE_TTL_MS,
  verifyShareToken,
} from '@/lib/share';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const secret = process.env.PASSWORD || '';
    if (!secret) {
      return NextResponse.json({ error: '未配置站点密钥' }, { status: 500 });
    }

    const body = (await request.json()) as {
      source?: string;
      id?: string;
      episode?: number;
    };
    const source = body.source?.trim();
    const id = body.id?.trim();
    if (!source || !id) {
      return NextResponse.json({ error: '缺少 source 或 id' }, { status: 400 });
    }

    const token = await createShareToken(
      source,
      id,
      secret,
      Number.isFinite(body.episode) ? Number(body.episode) : 0
    );
    const expiresAt = Date.now() + SHARE_TTL_MS;
    const url = new URL('/share', request.url);
    url.searchParams.set('t', token);

    return NextResponse.json({
      url: url.toString(),
      expiresAt,
      expiresInHours: 5,
    });
  } catch (err) {
    console.error('创建分享链接失败', err);
    return NextResponse.json({ error: '创建失败' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('t') || '';
    const secret = process.env.PASSWORD || '';
    if (!token || !secret) {
      return NextResponse.json({ error: '链接无效' }, { status: 400 });
    }

    const payload = await verifyShareToken(token, secret);
    if (!payload) {
      return NextResponse.json(
        { error: '分享链接无效或已过期' },
        { status: 410 }
      );
    }

    const apiSites = await getAvailableApiSites();
    const apiSite = apiSites.find((site) => site.key === payload.s);
    if (!apiSite) {
      return NextResponse.json({ error: '来源不可用' }, { status: 400 });
    }

    const detail = await getDetailFromApi(apiSite, payload.i);
    return NextResponse.json({
      title: detail.title,
      poster: detail.poster,
      episodes: detail.episodes || [],
      source_name: detail.source_name,
      year: detail.year,
      startEpisode: payload.ep || 0,
      expiresAt: payload.exp,
    });
  } catch (err) {
    console.error('读取分享内容失败', err);
    return NextResponse.json({ error: '获取播放信息失败' }, { status: 500 });
  }
}
