import { Favorite, PlayRecord, SkipConfig } from './types';

export const USERDATA_BACKUP_VERSION = 1;
export const USERDATA_MAX_ITEMS = 3000;

export interface UserDataBackup {
  version: number;
  exportedAt: number;
  playRecords: Record<string, PlayRecord>;
  favorites: Record<string, Favorite>;
  searchHistory?: string[];
  skipConfigs?: Record<string, SkipConfig>;
}

export function splitStorageKey(
  key: string
): { source: string; id: string } | null {
  const idx = key.indexOf('+');
  if (idx <= 0 || idx === key.length - 1) return null;
  return {
    source: key.slice(0, idx),
    id: key.slice(idx + 1),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parsePlayRecord(value: unknown): PlayRecord | null {
  if (!isRecord(value) || typeof value.title !== 'string' || !value.title) {
    return null;
  }
  if (typeof value.source_name !== 'string' || !value.source_name) {
    return null;
  }
  const index = Number(value.index);
  if (!Number.isFinite(index) || index < 1) return null;

  return {
    title: value.title,
    source_name: value.source_name,
    cover: typeof value.cover === 'string' ? value.cover : '',
    year: typeof value.year === 'string' ? value.year : '',
    index,
    total_episodes: Number(value.total_episodes) || 1,
    play_time: Number(value.play_time) || 0,
    total_time: Number(value.total_time) || 0,
    save_time: Number(value.save_time) || Date.now(),
    search_title:
      typeof value.search_title === 'string' ? value.search_title : '',
  };
}

function parseFavorite(value: unknown): Favorite | null {
  if (!isRecord(value) || typeof value.title !== 'string' || !value.title) {
    return null;
  }
  if (typeof value.source_name !== 'string' || !value.source_name) {
    return null;
  }
  return {
    title: value.title,
    source_name: value.source_name,
    cover: typeof value.cover === 'string' ? value.cover : '',
    year: typeof value.year === 'string' ? value.year : '',
    total_episodes: Number(value.total_episodes) || 1,
    save_time: Number(value.save_time) || Date.now(),
    search_title:
      typeof value.search_title === 'string' ? value.search_title : '',
  };
}

function parseSkipConfig(value: unknown): SkipConfig | null {
  if (!isRecord(value)) return null;
  return {
    enable: Boolean(value.enable),
    intro_time: Number(value.intro_time) || 0,
    outro_time: Number(value.outro_time) || 0,
  };
}

export function parseUserDataBackup(raw: unknown): UserDataBackup {
  if (!isRecord(raw)) {
    throw new Error('不是有效的 JSON 备份');
  }

  const playRecords: Record<string, PlayRecord> = {};
  if (raw.playRecords !== undefined) {
    if (!isRecord(raw.playRecords)) {
      throw new Error('播放记录格式错误');
    }
    for (const [key, value] of Object.entries(raw.playRecords)) {
      if (!splitStorageKey(key)) continue;
      const record = parsePlayRecord(value);
      if (record) playRecords[key] = record;
      if (Object.keys(playRecords).length >= USERDATA_MAX_ITEMS) break;
    }
  }

  const favorites: Record<string, Favorite> = {};
  if (raw.favorites !== undefined) {
    if (!isRecord(raw.favorites)) {
      throw new Error('收藏夹格式错误');
    }
    for (const [key, value] of Object.entries(raw.favorites)) {
      if (!splitStorageKey(key)) continue;
      const favorite = parseFavorite(value);
      if (favorite) favorites[key] = favorite;
      if (Object.keys(favorites).length >= USERDATA_MAX_ITEMS) break;
    }
  }

  const searchHistory = Array.isArray(raw.searchHistory)
    ? raw.searchHistory
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 20)
    : [];

  const skipConfigs: Record<string, SkipConfig> = {};
  if (raw.skipConfigs !== undefined && isRecord(raw.skipConfigs)) {
    for (const [key, value] of Object.entries(raw.skipConfigs)) {
      if (!splitStorageKey(key)) continue;
      const config = parseSkipConfig(value);
      if (config) skipConfigs[key] = config;
      if (Object.keys(skipConfigs).length >= USERDATA_MAX_ITEMS) break;
    }
  }

  if (
    Object.keys(playRecords).length === 0 &&
    Object.keys(favorites).length === 0 &&
    searchHistory.length === 0 &&
    Object.keys(skipConfigs).length === 0
  ) {
    throw new Error('备份文件里没有可导入的数据');
  }

  return {
    version: Number(raw.version) || USERDATA_BACKUP_VERSION,
    exportedAt: Number(raw.exportedAt) || Date.now(),
    playRecords,
    favorites,
    searchHistory,
    skipConfigs,
  };
}
