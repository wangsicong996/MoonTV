/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAvailableApiSites, getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { fetchVideoDetail } from '@/lib/fetchVideoDetail';
import { Favorite } from '@/lib/types';
import { splitStorageKey } from '@/lib/userdata';
import {
  buildVodPlayUrl,
  decodeVodId,
  encodeVodId,
  sanitizePlayName,
  verifyVodToken,
} from '@/lib/vod';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Cache-Control': 'private, no-store',
};

type FavoriteEntry = {
  key: string;
  source: string;
  id: string;
  favorite: Favorite;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

function cmsPayload(
  list: Record<string, unknown>[],
  page: number,
  limit: number,
  total: number,
  classList: { type_id: number; type_pid: number; type_name: string }[]
) {
  const pagecount = Math.max(1, Math.ceil(total / Math.max(limit, 1)));
  return {
    code: 1,
    msg: '数据列表',
    page,
    pagecount,
    limit,
    total,
    class: classList,
    list,
  };
}

function toListItem(
  entry: FavoriteEntry,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const { favorite, source, id } = entry;
  const episodes = Number(favorite.total_episodes) || 1;
  const isTv = episodes > 1;
  return {
    vod_id: encodeVodId(source, id),
    vod_name: favorite.title,
    vod_pic: favorite.cover || '',
    vod_remarks: isTv ? `${episodes}集` : '正片',
    vod_year: favorite.year || '',
    vod_area: '',
    vod_actor: '',
    vod_director: '',
    vod_content: '',
    vod_play_from: sanitizePlayName(favorite.source_name),
    vod_play_url: '',
    type_id: isTv ? 2 : 1,
    type_name: isTv ? '电视剧' : '电影',
    vod_time: favorite.save_time
      ? new Date(favorite.save_time).toISOString().slice(0, 19).replace('T', ' ')
      : '',
    vod_serial: String(episodes),
    ...extra,
  };
}

function parseFavorites(
  all: Record<string, Favorite>
): FavoriteEntry[] {
  return Object.entries(all)
    .map(([key, favorite]) => {
      const parsed = splitStorageKey(key);
      if (!parsed) return null;
      return { key, source: parsed.source, id: parsed.id, favorite };
    })
    .filter((item): item is FavoriteEntry => !!item)
    .sort((a, b) => (b.favorite.save_time || 0) - (a.favorite.save_time || 0));
}

async function fillPlayUrls(entries: FavoriteEntry[]) {
  const apiSites = await getAvailableApiSites();
  const siteMap = new Map(apiSites.map((site) => [site.key, site]));
  const results = await Promise.all(
    entries.map(async (entry) => {
      const site = siteMap.get(entry.source);
      if (!site) {
        return toListItem(entry, {
          vod_remarks: '源不可用',
          vod_play_url: '',
        });
      }
      try {
        const detail = await fetchVideoDetail({
          source: entry.source,
          id: entry.id,
          fallbackTitle: entry.favorite.title,
        });
        const episodes = (detail.episodes || []).filter(
          (url) => url.startsWith('http://') || url.startsWith('https://')
        );
        const isTv = episodes.length > 1;
        return toListItem(entry, {
          vod_name: detail.title || entry.favorite.title,
          vod_pic: detail.poster || entry.favorite.cover,
          vod_year: detail.year || entry.favorite.year,
          vod_content: detail.desc || '',
          vod_play_from: sanitizePlayName(
            detail.source_name || entry.favorite.source_name
          ),
          vod_play_url: buildVodPlayUrl(episodes),
          vod_remarks:
            episodes.length > 1 ? `${episodes.length}集` : '正片',
          vod_serial: String(episodes.length || 1),
          type_id: isTv ? 2 : 1,
          type_name: isTv ? '电视剧' : '电影',
        });
      } catch (err) {
        console.error('VOD 详情拉取失败', entry.key, err);
        return toListItem(entry, { vod_remarks: '获取播放地址失败' });
      }
    })
  );
  return results;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
    if (storageType === 'localstorage') {
      return json({ code: 0, msg: 'localStorage 模式不支持 VOD 订阅', list: [] });
    }

    const secret = process.env.PASSWORD || '';
    const username = await verifyVodToken(params.token || '', secret);
    if (!username) {
      return json({ code: 0, msg: '订阅令牌无效', list: [] }, 401);
    }

    const config = await getConfig();
    const classList = [
      { type_id: 1, type_pid: 0, type_name: '电影' },
      { type_id: 2, type_pid: 0, type_name: '电视剧' },
      {
        type_id: 3,
        type_pid: 0,
        type_name: `${config.SiteConfig.SiteName || 'suntv'}收藏`,
      },
    ];

    const searchParams = request.nextUrl.searchParams;
    const ac = (searchParams.get('ac') || 'list').toLowerCase();
    const wd = (searchParams.get('wd') || '').trim();
    const idsRaw = searchParams.get('ids') || '';
    const typeId = Number(searchParams.get('t') || '0');
    const page = Math.max(1, Number(searchParams.get('pg') || '1') || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number(searchParams.get('pagesize') || searchParams.get('limit') || '50') || 50)
    );
    const hours = Number(searchParams.get('h') || '0');

    const entries = parseFavorites(await db.getAllFavorites(username));
    const now = Date.now();

    let filtered = entries;
    if (hours > 0) {
      const since = now - hours * 60 * 60 * 1000;
      filtered = filtered.filter((item) => (item.favorite.save_time || 0) >= since);
    }
    if (wd) {
      const keyword = wd.toLowerCase();
      filtered = filtered.filter((item) =>
        item.favorite.title.toLowerCase().includes(keyword)
      );
    }
    if (typeId === 1 || typeId === 2) {
      filtered = filtered.filter((item) => {
        const isTv = (item.favorite.total_episodes || 1) > 1;
        return typeId === 2 ? isTv : !isTv;
      });
    }

    const idList = idsRaw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const needPlayUrl = idList.length > 0 || ac === 'detail';

    if (idList.length > 0) {
      const wanted = idList
        .map((vodId) => {
          const decoded = decodeVodId(vodId);
          if (!decoded) return null;
          return filtered.find(
            (item) => item.source === decoded.source && item.id === decoded.id
          );
        })
        .filter((item): item is FavoriteEntry => !!item);

      const list = needPlayUrl
        ? await fillPlayUrls(wanted)
        : wanted.map((item) => toListItem(item));
      return json(cmsPayload(list, 1, list.length || 1, list.length, classList));
    }

    const total = filtered.length;
    const start = (page - 1) * limit;
    const pageItems = filtered.slice(start, start + limit);
    const list = needPlayUrl
      ? await fillPlayUrls(pageItems)
      : pageItems.map((item) => toListItem(item));

    return json(cmsPayload(list, page, limit, total, classList));
  } catch (err) {
    console.error('VOD 订阅接口失败', err);
    return json({ code: 0, msg: '服务异常', list: [] }, 500);
  }
}
