/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { Check, Copy, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface VodSubscribeInfo {
  api: string;
  cmsApi: string;
  tvbox: {
    key: string;
    name: string;
    type: number;
    api: string;
    searchable: number;
    quickSearch: number;
    filterable: number;
  };
}

function getStorageType(): string {
  if (typeof window === 'undefined') return 'localstorage';
  return (window as any).RUNTIME_CONFIG?.STORAGE_TYPE || 'localstorage';
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = document.createElement('textarea');
    input.value = value;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
  }
}

export default function VodSubscribe() {
  const [storageType, setStorageType] = useState('localstorage');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState<VodSubscribeInfo | null>(null);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    setStorageType(getStorageType());
  }, []);

  const load = async () => {
    if (info || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/vod-subscribe');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '获取订阅地址失败');
      }
      setInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取订阅地址失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (value: string, key: string) => {
    await copyText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(''), 2000);
  };

  if (storageType === 'localstorage') {
    return (
      <p className='text-xs text-gray-500 dark:text-gray-400'>
        当前是本地收藏模式，其他播放器读不到。部署 Redis / D1 / Upstash 后即可生成订阅地址。
      </p>
    );
  }

  return (
    <div className='space-y-3'>
      {!info && (
        <button
          type='button'
          onClick={() => void load()}
          disabled={loading}
          className='inline-flex items-center gap-2 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60'
        >
          {loading ? (
            <Loader2 className='w-4 h-4 animate-spin' />
          ) : (
            <Copy className='w-4 h-4' />
          )}
          生成 VOD 订阅地址
        </button>
      )}

      {error && (
        <p className='text-xs text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded'>
          {error}
        </p>
      )}

      {info && (
        <>
          <div className='space-y-1'>
            <p className='text-xs text-gray-500 dark:text-gray-400'>
              苹果 CMS 接口，填到 TVBox / CatVod 等的 type=1 订阅
            </p>
            <div className='flex gap-2'>
              <input
                readOnly
                value={info.api}
                className='flex-1 min-w-0 px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100'
              />
              <button
                type='button'
                onClick={() => void handleCopy(info.api, 'api')}
                className='shrink-0 px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
              >
                {copied === 'api' ? (
                  <Check className='w-4 h-4 text-green-500' />
                ) : (
                  <Copy className='w-4 h-4' />
                )}
              </button>
            </div>
          </div>
          <div className='space-y-1'>
            <p className='text-xs text-gray-500 dark:text-gray-400'>
              兼容路径（部分播放器认 /api.php/provide/vod/）
            </p>
            <div className='flex gap-2'>
              <input
                readOnly
                value={info.cmsApi}
                className='flex-1 min-w-0 px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100'
              />
              <button
                type='button'
                onClick={() => void handleCopy(info.cmsApi, 'cms')}
                className='shrink-0 px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
              >
                {copied === 'cms' ? (
                  <Check className='w-4 h-4 text-green-500' />
                ) : (
                  <Copy className='w-4 h-4' />
                )}
              </button>
            </div>
          </div>
          <div className='space-y-1'>
            <p className='text-xs text-gray-500 dark:text-gray-400'>TVBox 站点配置</p>
            <div className='flex gap-2 items-start'>
              <pre className='flex-1 min-w-0 px-2 py-1.5 text-[11px] leading-5 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100 overflow-x-auto'>
                {JSON.stringify(info.tvbox, null, 2)}
              </pre>
              <button
                type='button'
                onClick={() =>
                  void handleCopy(JSON.stringify(info.tvbox, null, 2), 'tvbox')
                }
                className='shrink-0 px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
              >
                {copied === 'tvbox' ? (
                  <Check className='w-4 h-4 text-green-500' />
                ) : (
                  <Copy className='w-4 h-4' />
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
