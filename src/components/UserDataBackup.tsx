/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { Download, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import {
  addSearchHistory,
  getAllFavorites,
  getAllPlayRecords,
  getAllSkipConfigs,
  getSearchHistory,
  refreshAllCache,
  saveFavorite,
  savePlayRecord,
  saveSkipConfig,
} from '@/lib/db.client';
import {
  parseUserDataBackup,
  splitStorageKey,
  USERDATA_BACKUP_VERSION,
  UserDataBackup,
} from '@/lib/userdata';

interface UserDataBackupButtonsProps {
  collapsed?: boolean;
}

function getStorageType(): string {
  if (typeof window === 'undefined') return 'localstorage';
  return (window as any).RUNTIME_CONFIG?.STORAGE_TYPE || 'localstorage';
}

function downloadJson(data: UserDataBackup) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `moontv-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function collectLocalBackup(): Promise<UserDataBackup> {
  const [playRecords, favorites, searchHistory, skipConfigs] =
    await Promise.all([
      getAllPlayRecords(),
      getAllFavorites(),
      getSearchHistory(),
      getAllSkipConfigs(),
    ]);
  return {
    version: USERDATA_BACKUP_VERSION,
    exportedAt: Date.now(),
    playRecords,
    favorites,
    searchHistory,
    skipConfigs,
  };
}

async function importLocalBackup(backup: UserDataBackup) {
  for (const [key, record] of Object.entries(backup.playRecords)) {
    const parsed = splitStorageKey(key);
    if (!parsed) continue;
    await savePlayRecord(parsed.source, parsed.id, record);
  }
  for (const [key, favorite] of Object.entries(backup.favorites)) {
    const parsed = splitStorageKey(key);
    if (!parsed) continue;
    await saveFavorite(parsed.source, parsed.id, favorite);
  }
  for (const [key, config] of Object.entries(backup.skipConfigs || {})) {
    const parsed = splitStorageKey(key);
    if (!parsed) continue;
    await saveSkipConfig(parsed.source, parsed.id, config);
  }
  for (const keyword of [...(backup.searchHistory || [])].reverse()) {
    await addSearchHistory(keyword);
  }
}

const UserDataBackupButtons = ({
  collapsed = false,
}: UserDataBackupButtonsProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [message, setMessage] = useState('');

  const buttonClass = `group flex items-center rounded-lg px-2 py-2 pl-4 text-sm text-gray-700 hover:bg-gray-100/30 hover:text-green-600 transition-colors duration-200 min-h-[40px] dark:text-gray-300 dark:hover:text-green-400 ${
    collapsed ? 'w-full max-w-none mx-0' : 'mx-0'
  } gap-3 justify-start disabled:opacity-50`;

  const handleExport = async () => {
    if (busy) return;
    setBusy('export');
    setMessage('');
    try {
      let backup: UserDataBackup;
      if (getStorageType() === 'localstorage') {
        backup = await collectLocalBackup();
      } else {
        const res = await fetch('/api/userdata');
        if (!res.ok) {
          throw new Error('导出失败');
        }
        const json = await res.json();
        backup = {
          version: json.version || USERDATA_BACKUP_VERSION,
          exportedAt: json.exportedAt || Date.now(),
          playRecords: json.playRecords || {},
          favorites: json.favorites || {},
          searchHistory: json.searchHistory || [],
          skipConfigs: json.skipConfigs || {},
        };
      }
      downloadJson(backup);
      setMessage('已导出 JSON 文件');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '导出失败');
    } finally {
      setBusy(null);
    }
  };

  const handleImportFile = async (file: File) => {
    setBusy('import');
    setMessage('');
    try {
      const text = await file.text();
      const backup = parseUserDataBackup(JSON.parse(text));
      const counts = [
        `${Object.keys(backup.playRecords).length} 条播放记录`,
        `${Object.keys(backup.favorites).length} 条收藏`,
      ];
      const ok = window.confirm(
        `将把备份合并到当前账号（相同条目会被覆盖）：\n${counts.join('、')}。\n是否继续？`
      );
      if (!ok) {
        setBusy(null);
        return;
      }

      if (getStorageType() === 'localstorage') {
        await importLocalBackup(backup);
      } else {
        const res = await fetch('/api/userdata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(backup),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.error || '导入失败');
        }
        await refreshAllCache();
      }
      setMessage('导入完成，刷新页面后即可看到');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '导入失败');
    } finally {
      setBusy(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className='space-y-1'>
      <button
        type='button'
        onClick={handleExport}
        disabled={!!busy}
        title='导出观看数据'
        className={buttonClass}
      >
        <div className='w-4 h-4 flex items-center justify-center'>
          {busy === 'export' ? (
            <Loader2 className='h-4 w-4 animate-spin text-gray-500' />
          ) : (
            <Download className='h-4 w-4 text-gray-500 group-hover:text-green-600 dark:text-gray-400 dark:group-hover:text-green-400' />
          )}
        </div>
        {!collapsed && (
          <span className='whitespace-nowrap'>导出观看数据</span>
        )}
      </button>
      <button
        type='button'
        onClick={() => fileInputRef.current?.click()}
        disabled={!!busy}
        title='导入观看数据'
        className={buttonClass}
      >
        <div className='w-4 h-4 flex items-center justify-center'>
          {busy === 'import' ? (
            <Loader2 className='h-4 w-4 animate-spin text-gray-500' />
          ) : (
            <Upload className='h-4 w-4 text-gray-500 group-hover:text-green-600 dark:text-gray-400 dark:group-hover:text-green-400' />
          )}
        </div>
        {!collapsed && (
          <span className='whitespace-nowrap'>导入观看数据</span>
        )}
      </button>
      <input
        ref={fileInputRef}
        type='file'
        accept='application/json,.json'
        className='hidden'
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            void handleImportFile(file);
          }
        }}
      />
      {!collapsed && message && (
        <p className='px-4 py-1 text-xs text-gray-500 dark:text-gray-400 leading-snug'>
          {message}
        </p>
      )}
    </div>
  );
};

export default UserDataBackupButtons;
