/* eslint-disable @typescript-eslint/no-explicit-any */

import { API_CONFIG, ApiSite } from '@/lib/config';

export interface CmsClass {
  type_id: number;
  type_name: string;
  type_pid: number;
}

export interface CmsVideo {
  id: string;
  title: string;
  poster: string;
  year: string;
  remarks?: string;
  episodes?: number;
  type_name?: string;
}

export interface CmsCatalogResult {
  source: { key: string; name: string };
  class: CmsClass[];
  list: CmsVideo[];
  page: number;
  pagecount: number;
}

function buildCmsUrl(
  api: string,
  params: Record<string, string>
): string {
  const usp = new URLSearchParams(params);
  return api.includes('?') ? `${api}&${usp.toString()}` : `${api}?${usp.toString()}`;
}

async function fetchJson(url: string): Promise<any | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      headers: API_CONFIG.search.headers,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseEpisodeCount(remarks?: string): number | undefined {
  if (!remarks) return undefined;
  const match = remarks.match(/(\d+)\s*集/);
  if (!match) return undefined;
  const count = Number(match[1]);
  return Number.isFinite(count) && count > 0 ? count : undefined;
}

function normalizeClass(raw: any[]): CmsClass[] {
  return raw
    .map((item) => ({
      type_id: Number(item?.type_id ?? item?.id),
      type_name: String(item?.type_name || item?.name || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .trim(),
      type_pid: Number(item?.type_pid || 0),
    }))
    .filter(
      (item) =>
        Number.isFinite(item.type_id) &&
        item.type_id > 0 &&
        item.type_name.length > 0
    );
}

/** 有父子分类时只保留叶子分类，避免点父类空白 */
export function pickVisibleCatalogClasses(classes: CmsClass[]): CmsClass[] {
  const named = classes.filter((item) => item.type_name);
  const parentIds = new Set(
    named.map((item) => item.type_pid).filter((id) => id > 0)
  );
  if (parentIds.size === 0) return named;
  return named.filter((item) => !parentIds.has(item.type_id));
}

function normalizeList(raw: any[]): CmsVideo[] {
  return raw
    .map((item) => {
      const id = item?.vod_id != null ? String(item.vod_id) : '';
      const title = String(item?.vod_name || '')
        .trim()
        .replace(/\s+/g, ' ');
      if (!id || !title) return null;
      const remarks = item?.vod_remarks ? String(item.vod_remarks) : undefined;
      return {
        id,
        title,
        poster: String(item?.vod_pic || ''),
        year: String(item?.vod_year || '').match(/\d{4}/)?.[0] || '',
        remarks,
        episodes: parseEpisodeCount(remarks),
        type_name: item?.type_name ? String(item.type_name) : undefined,
      } as CmsVideo;
    })
    .filter((item): item is CmsVideo => !!item);
}

export async function fetchSourceCatalog(
  apiSite: ApiSite,
  options: { t?: string; pg?: number } = {}
): Promise<CmsCatalogResult> {
  const pg = Math.max(1, options.pg || 1);
  const common: Record<string, string> = { pg: String(pg) };
  if (options.t) common.t = options.t;

  // 列表页用 ac=list，体积远小于 videolist（不含每集播放地址）
  let data = await fetchJson(buildCmsUrl(apiSite.api, { ...common, ac: 'list' }));
  const list = Array.isArray(data?.list) ? data.list : [];
  const missingPoster =
    list.length > 0 &&
    list.filter((item: any) => !item?.vod_pic).length >= list.length * 0.6;

  if (!data || !Array.isArray(data.list) || missingPoster) {
    const videoData = await fetchJson(
      buildCmsUrl(apiSite.api, { ...common, ac: 'videolist' })
    );
    if (videoData && Array.isArray(videoData.list)) {
      if (!Array.isArray(videoData.class) && Array.isArray(data?.class)) {
        videoData.class = data.class;
      }
      data = videoData;
    }
  }

  let rawClass = Array.isArray(data?.class)
    ? data.class
    : Array.isArray(data?.type)
    ? data.type
    : [];
  const rawList = Array.isArray(data?.list) ? data.list : [];

  if (rawClass.length === 0 && pg === 1) {
    const classData = await fetchJson(
      buildCmsUrl(apiSite.api, { ac: 'list', pg: '1' })
    );
    rawClass = Array.isArray(classData?.class)
      ? classData.class
      : Array.isArray(classData?.type)
      ? classData.type
      : [];
  }

  return {
    source: { key: apiSite.key, name: apiSite.name },
    class: pickVisibleCatalogClasses(normalizeClass(rawClass)),
    list: normalizeList(rawList),
    page: Number(data?.page) || pg,
    pagecount: Math.max(1, Number(data?.pagecount) || 1),
  };
}
