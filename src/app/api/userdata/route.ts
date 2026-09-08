/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db, getStorage } from '@/lib/db';
import {
  parseUserDataBackup,
  splitStorageKey,
  USERDATA_BACKUP_VERSION,
  UserDataBackup,
} from '@/lib/userdata';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const username = authInfo.username;
    const [playRecords, favorites, searchHistory, skipConfigs] =
      await Promise.all([
        db.getAllPlayRecords(username),
        db.getAllFavorites(username),
        db.getSearchHistory(username),
        db.getAllSkipConfigs(username),
      ]);

    const backup: UserDataBackup = {
      version: USERDATA_BACKUP_VERSION,
      exportedAt: Date.now(),
      playRecords,
      favorites,
      searchHistory,
      skipConfigs,
    };

    return NextResponse.json(backup);
  } catch (err) {
    console.error('导出用户数据失败', err);
    return NextResponse.json(
      { error: '导出失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const username = authInfo.username;
    const backup = parseUserDataBackup(await request.json());
    const storage = getStorage() as {
      importUserBackup?: (
        userName: string,
        data: UserDataBackup
      ) => Promise<void>;
    };

    if (typeof storage?.importUserBackup === 'function') {
      await storage.importUserBackup(username, backup);
    } else {
      for (const [key, record] of Object.entries(backup.playRecords)) {
        const parsed = splitStorageKey(key);
        if (!parsed) continue;
        await db.savePlayRecord(username, parsed.source, parsed.id, record);
      }
      for (const [key, favorite] of Object.entries(backup.favorites)) {
        const parsed = splitStorageKey(key);
        if (!parsed) continue;
        await db.saveFavorite(username, parsed.source, parsed.id, favorite);
      }
      for (const [key, config] of Object.entries(backup.skipConfigs || {})) {
        const parsed = splitStorageKey(key);
        if (!parsed) continue;
        await db.setSkipConfig(username, parsed.source, parsed.id, config);
      }
      for (const keyword of [...(backup.searchHistory || [])].reverse()) {
        await db.addSearchHistory(username, keyword);
      }
    }

    return NextResponse.json({
      success: true,
      imported: {
        playRecords: Object.keys(backup.playRecords).length,
        favorites: Object.keys(backup.favorites).length,
        searchHistory: backup.searchHistory?.length || 0,
        skipConfigs: Object.keys(backup.skipConfigs || {}).length,
      },
    });
  } catch (err) {
    console.error('导入用户数据失败', err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : '导入失败',
      },
      { status: 400 }
    );
  }
}
