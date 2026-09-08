/* eslint-disable no-console */

import {
  deleteFavorite,
  Favorite,
  getAllFavorites,
  saveFavorite,
} from '@/lib/db.client';
import { pickBestSource } from '@/lib/source-prefer';
import { SearchResult } from '@/lib/types';
import { splitStorageKey } from '@/lib/userdata';

export type OptimizeStatus = 'updated' | 'unchanged' | 'skipped' | 'failed';

export interface OptimizeItemResult {
  title: string;
  status: OptimizeStatus;
  from?: string;
  to?: string;
  message?: string;
}

function normalizeTitle(title: string): string {
  return title.replaceAll(' ', '').toLowerCase();
}

function filterSameVideo(
  results: SearchResult[],
  title: string,
  year: string,
  totalEpisodes: number
): SearchResult[] {
  const wantTitle = normalizeTitle(title);
  const wantYear = (year || '').toLowerCase();
  const wantTv = totalEpisodes > 1;

  const exact = results.filter((result) => {
    if (normalizeTitle(result.title) !== wantTitle) return false;
    if (wantYear && wantYear !== 'unknown') {
      if ((result.year || '').toLowerCase() !== wantYear) return false;
    }
    if (wantTv) return result.episodes.length > 1;
    return true;
  });
  if (exact.length) return exact;

  return results.filter((result) => normalizeTitle(result.title) === wantTitle);
}

async function searchSources(query: string): Promise<SearchResult[]> {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
  if (!response.ok) {
    throw new Error('搜索失败');
  }
  const data = await response.json();
  return Array.isArray(data.results) ? data.results : [];
}

async function fetchCurrentDetail(
  source: string,
  id: string
): Promise<SearchResult | null> {
  try {
    const response = await fetch(
      `/api/detail?source=${encodeURIComponent(source)}&id=${encodeURIComponent(id)}`
    );
    if (!response.ok) return null;
    return (await response.json()) as SearchResult;
  } catch {
    return null;
  }
}

export async function optimizeFavoriteSources(
  onProgress?: (current: number, total: number, title: string) => void
): Promise<OptimizeItemResult[]> {
  const all = await getAllFavorites();
  const entries = Object.entries(all);
  const results: OptimizeItemResult[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const [key, favorite] = entries[index];
    const parsed = splitStorageKey(key);
    const title = favorite.title || '未命名';
    onProgress?.(index + 1, entries.length, title);

    if (!parsed) {
      results.push({ title, status: 'failed', message: '收藏键无效' });
      continue;
    }

    try {
      const query = favorite.search_title || favorite.title;
      let sources = filterSameVideo(
        await searchSources(query),
        favorite.title,
        favorite.year,
        favorite.total_episodes || 1
      );

      const already = sources.some(
        (item) => item.source === parsed.source && item.id === parsed.id
      );
      if (!already) {
        const current = await fetchCurrentDetail(parsed.source, parsed.id);
        if (current) sources = [current, ...sources];
      }

      if (!sources.length) {
        results.push({
          title,
          status: 'skipped',
          from: favorite.source_name,
          message: '没有可测速的线路',
        });
        continue;
      }

      const { best } = await pickBestSource(sources);
      if (!best) {
        results.push({
          title,
          status: 'skipped',
          from: favorite.source_name,
          message: '当前网络下线路都不通',
        });
        continue;
      }

      if (best.source === parsed.source && best.id === parsed.id) {
        results.push({
          title,
          status: 'unchanged',
          from: favorite.source_name,
          to: best.source_name,
        });
        continue;
      }

      const nextFavorite: Favorite = {
        ...favorite,
        title: best.title || favorite.title,
        source_name: best.source_name || favorite.source_name,
        year: best.year || favorite.year,
        cover: best.poster || favorite.cover,
        total_episodes: best.episodes?.length || favorite.total_episodes,
        save_time: favorite.save_time || Date.now(),
        search_title: favorite.search_title || favorite.title,
      };

      await saveFavorite(best.source, best.id, nextFavorite);
      await deleteFavorite(parsed.source, parsed.id);

      results.push({
        title,
        status: 'updated',
        from: favorite.source_name,
        to: best.source_name,
      });
    } catch (err) {
      console.error('优选收藏线路失败', title, err);
      results.push({
        title,
        status: 'failed',
        from: favorite.source_name,
        message: err instanceof Error ? err.message : '优选失败',
      });
    }
  }

  return results;
}
