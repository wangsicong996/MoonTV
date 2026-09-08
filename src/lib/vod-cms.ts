/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAvailableApiSites } from '@/lib/config';
import { db } from '@/lib/db';
import { fetchVideoDetail } from '@/lib/fetchVideoDetail';
import { Favorite } from '@/lib/types';
import { splitStorageKey } from '@/lib/userdata';
import {
  buildVodPlayUrl,
  decodeVodId,
  favoriteKeyToVodId,
  matchesVodType,
  sanitizePlayName,
  verifyVodToken,
  vodEn,
  vodTypeOf,
  VOD_CLASS_LIST,
} from '@/lib/vod';

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
  vodId: number;
  favorite: Favorite;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export function vodCmsOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function cmsPayload(
  list: Record<string, unknown>[],
  page: number,
  limit: number,
  total: number
) {
  const pagecount = Math.max(1, Math.ceil(total / Math.max(limit, 1)));
  return {
    code: 1,
    msg: '数据列表',
    page,
    pagecount,
    limit: String(limit),
    total,
    list,
    class: VOD_CLASS_LIST,
  };
}

function formatTime(saveTime?: number): string {
  if (!saveTime) return '';
  const date = new Date(saveTime);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function toListItem(
  entry: FavoriteEntry,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const { favorite, vodId } = entry;
  const episodes = Number(favorite.total_episodes) || 1;
  const isTv = episodes > 1;
  const type = vodTypeOf(isTv);
  return {
    vod_id: vodId,
    vod_name: favorite.title,
    type_id: type.type_id,
    type_name: type.type_name,
    vod_en: vodEn(favorite.title, vodId),
    vod_time: formatTime(favorite.save_time),
    vod_remarks: isTv ? `更新至第${String(episodes).padStart(2, '0')}集` : '正片',
    vod_play_from: 'm3u8',
    vod_pic: favorite.cover || '',
    vod_year: favorite.year || '',
    vod_level: 1,
    vod_hits: 999,
    vod_score: '9.0',
    ...extra,
  };
}

function parseFavorites(all: Record<string, Favorite>): FavoriteEntry[] {
  return Object.entries(all)
    .map(([key, favorite]) => {
      const parsed = splitStorageKey(key);
      if (!parsed) return null;
      return {
        key,
        source: parsed.source,
        id: parsed.id,
        vodId: favoriteKeyToVodId(key),
        favorite,
      };
    })
    .filter((item): item is FavoriteEntry => !!item)
    .sort((a, b) => (b.favorite.save_time || 0) - (a.favorite.save_time || 0));
}

function findByVodId(entries: FavoriteEntry[], rawId: string): FavoriteEntry | null {
  const decoded = decodeVodId(rawId);
  if (decoded) {
    return (
      entries.find(
        (item) => item.source === decoded.source && item.id === decoded.id
      ) || null
    );
  }
  const numeric = Number(rawId);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return entries.find((item) => item.vodId === numeric) || null;
}

async function fillPlayUrls(entries: FavoriteEntry[]) {
  const apiSites = await getAvailableApiSites();
  const siteMap = new Map(apiSites.map((site) => [site.key, site]));
  return Promise.all(
    entries.map(async (entry) => {
      const site = siteMap.get(entry.source);
      if (!site) {
        return toListItem(entry, {
          vod_remarks: '源不可用',
          vod_play_from: 'm3u8',
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
        const type = vodTypeOf(isTv);
        const fromName = sanitizePlayName(
          `${detail.source_name || entry.favorite.source_name}m3u8`
        );
        return toListItem(entry, {
          vod_name: detail.title || entry.favorite.title,
          vod_pic: detail.poster || entry.favorite.cover,
          vod_year: detail.year || entry.favorite.year,
          vod_content: detail.desc || '',
          vod_play_from: fromName,
          vod_play_url: buildVodPlayUrl(episodes),
          vod_remarks: isTv
            ? `更新至第${String(episodes.length).padStart(2, '0')}集`
            : '正片',
          type_id: type.type_id,
          type_name: type.type_name,
        });
      } catch (err) {
        console.error('VOD 详情拉取失败', entry.key, err);
        return toListItem(entry, {
          vod_remarks: '获取播放地址失败',
          vod_play_url: '',
        });
      }
    })
  );
}

async function resolveUsername(
  request: NextRequest,
  pathToken?: string
): Promise<string | null> {
  const secret = process.env.PASSWORD || '';
  const queryToken = request.nextUrl.searchParams.get('token') || '';
  const token = pathToken || queryToken;
  if (token) {
    return verifyVodToken(token, secret);
  }
  if (process.env.USERNAME) {
    return process.env.USERNAME;
  }
  try {
    const users = await db.getAllUsers();
    if (users.length === 1) return users[0];
  } catch {
    return null;
  }
  return null;
}

export async function handleVodCms(
  request: NextRequest,
  pathToken?: string
): Promise<NextResponse> {
  try {
    const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
    if (storageType === 'localstorage') {
      return json({ code: 0, msg: 'localStorage 模式不支持 VOD 订阅', list: [] });
    }

    const username = await resolveUsername(request, pathToken);
    if (!username) {
      return json({ code: 0, msg: '订阅令牌无效', list: [] }, 401);
    }

    const searchParams = request.nextUrl.searchParams;
    const ac = (searchParams.get('ac') || 'list').toLowerCase();
    const wd = (searchParams.get('wd') || '').trim();
    const idsRaw = searchParams.get('ids') || '';
    const typeId = Number(searchParams.get('t') || '0');
    const page = Math.max(1, Number(searchParams.get('pg') || '1') || 1);
    const limit = Math.min(
      100,
      Math.max(
        1,
        Number(searchParams.get('pagesize') || searchParams.get('limit') || '20') ||
          20
      )
    );
    const hours = Number(searchParams.get('h') || '0');

    const entries = parseFavorites(await db.getAllFavorites(username));
    const now = Date.now();

    let filtered = entries;
    if (hours > 0) {
      const since = now - hours * 60 * 60 * 1000;
      filtered = filtered.filter(
        (item) => (item.favorite.save_time || 0) >= since
      );
    }
    if (wd) {
      const keyword = wd.toLowerCase();
      filtered = filtered.filter((item) =>
        item.favorite.title.toLowerCase().includes(keyword)
      );
    }
    if (typeId) {
      filtered = filtered.filter((item) =>
        matchesVodType((item.favorite.total_episodes || 1) > 1, typeId)
      );
    }

    const idList = idsRaw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const needPlayUrl = idList.length > 0 || ac === 'detail';

    if (idList.length > 0) {
      const wanted = idList
        .map((vodId) => findByVodId(entries, vodId))
        .filter((item): item is FavoriteEntry => !!item);
      const list = needPlayUrl
        ? await fillPlayUrls(wanted)
        : wanted.map((item) => toListItem(item));
      return json(cmsPayload(list, 1, Math.max(list.length, 1), list.length));
    }

    const total = filtered.length;
    const start = (page - 1) * limit;
    const pageItems = filtered.slice(start, start + limit);
    const list = needPlayUrl
      ? await fillPlayUrls(pageItems)
      : pageItems.map((item) => toListItem(item));

    return json(cmsPayload(list, page, limit, total));
  } catch (err) {
    console.error('VOD 订阅接口失败', err);
    return json({ code: 0, msg: '服务异常', list: [] }, 500);
  }
}
