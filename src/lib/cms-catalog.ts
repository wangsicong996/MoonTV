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
      type_id: Number(item?.type_id),
      type_name: String(item?.type_name || '').trim(),
      type_pid: Number(item?.type_pid || 0),
    }))
    .filter((item) => Number.isFinite(item.type_id) && item.type_name);
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
  const params: Record<string, string> = {
    ac: 'videolist',
    pg: String(pg),
  };
  if (options.t) params.t = options.t;

  let data = await fetchJson(buildCmsUrl(apiSite.api, params));
  if (!data || !Array.isArray(data.list)) {
    params.ac = 'list';
    data = await fetchJson(buildCmsUrl(apiSite.api, params));
  }

  let rawClass = Array.isArray(data?.class)
    ? data.class
    : Array.isArray(data?.type)
    ? data.type
    : [];
  const rawList = Array.isArray(data?.list) ? data.list : [];

  if (rawClass.length === 0) {
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
    class: normalizeClass(rawClass),
    list: normalizeList(rawList),
    page: Number(data?.page) || pg,
    pagecount: Math.max(1, Number(data?.pagecount) || 1),
  };
}
