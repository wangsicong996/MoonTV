/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { Check, ChevronDown, Copy, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  OptimizeItemResult,
  optimizeFavoriteSources,
} from '@/lib/vod-optimize';

interface VodSubscribeInfo {
  api: string;
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

function summarize(results: OptimizeItemResult[]): string {
  const updated = results.filter((item) => item.status === 'updated').length;
  const unchanged = results.filter((item) => item.status === 'unchanged').length;
  const skipped = results.filter((item) => item.status === 'skipped').length;
  const failed = results.filter((item) => item.status === 'failed').length;
  return `更新 ${updated} · 已是最优 ${unchanged} · 不通跳过 ${skipped} · 失败 ${failed}`;
}

export default function VodSubscribe() {
  const [storageType, setStorageType] = useState('localstorage');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState<VodSubscribeInfo | null>(null);
  const [copied, setCopied] = useState('');
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeProgress, setOptimizeProgress] = useState('');
  const [optimizeSummary, setOptimizeSummary] = useState('');
  const [recentOpen, setRecentOpen] = useState(false);

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

  const handleOptimize = async (limit?: number) => {
    if (optimizing) return;
    setOptimizing(true);
    setOptimizeSummary('');
    setOptimizeProgress('正在读取收藏夹...');
    try {
      const results = await optimizeFavoriteSources(
        (current, total, title) => {
          setOptimizeProgress(`正在测速 ${current}/${total}：${title}`);
        },
        limit ? { limit } : undefined
      );
      setOptimizeProgress('');
      setOptimizeSummary(summarize(results));
    } catch (err) {
      setOptimizeProgress('');
      setOptimizeSummary(err instanceof Error ? err.message : '更新失败');
    } finally {
      setOptimizing(false);
    }
  };

  const subscribeBlocked = storageType === 'localstorage';

  return (
    <div className='space-y-3'>
      {subscribeBlocked && (
        <p className='text-xs text-gray-500 dark:text-gray-400'>
          当前是本地收藏模式，其他播放器读不到订阅。仍可在本机测速后改收藏线路。部署 Redis / D1 / Upstash 后即可生成订阅地址。
        </p>
      )}

      {!subscribeBlocked && !info && (
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
          <p className='text-xs text-gray-500 dark:text-gray-400'>
            填这个地址，格式和黑木耳 / 如意资源一样。播放器会自己追加 ?ac=list、?ac=videolist&ids=
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
        </>
      )}

      <div className='pt-1 space-y-2'>
        <p className='text-xs text-gray-500 dark:text-gray-400'>
          在当前网络下，按播放页换源 tab 同一套 ping/测速，给收藏挑最优线路，并改写收藏和 VOD 的 m3u8。全部不通则跳过。请在和 VOD 播放器同一网络下点。
        </p>

        <div className='rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden'>
          <button
            type='button'
            onClick={() => setRecentOpen((open) => !open)}
            disabled={optimizing}
            className='w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60'
          >
            <span>只更新最近收藏夹内容</span>
            <ChevronDown
              className={`w-4 h-4 text-gray-500 transition-transform ${
                recentOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
          {recentOpen && (
            <div className='border-t border-gray-200 dark:border-gray-700 p-2 space-y-1.5 bg-gray-50/70 dark:bg-gray-800/40'>
              {[
                { limit: 3, label: '最近 3 个视频' },
                { limit: 10, label: '最近 10 个视频' },
                { limit: 50, label: '最近 50 个视频' },
              ].map((item) => (
                <button
                  key={item.limit}
                  type='button'
                  onClick={() => void handleOptimize(item.limit)}
                  disabled={optimizing}
                  className='w-full inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800 disabled:opacity-60'
                >
                  {optimizing ? (
                    <Loader2 className='w-4 h-4 animate-spin' />
                  ) : (
                    <RefreshCw className='w-4 h-4' />
                  )}
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type='button'
          onClick={() => void handleOptimize()}
          disabled={optimizing}
          className='inline-flex items-center gap-2 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60'
        >
          {optimizing ? (
            <Loader2 className='w-4 h-4 animate-spin' />
          ) : (
            <RefreshCw className='w-4 h-4' />
          )}
          更新全部 VOD 线路（收藏夹视频选优）
        </button>
        {optimizeProgress && (
          <p className='text-xs text-gray-500 dark:text-gray-400'>
            {optimizeProgress}
          </p>
        )}
        {optimizeSummary && (
          <p className='text-xs text-gray-600 dark:text-gray-300'>
            {optimizeSummary}
          </p>
        )}
      </div>
    </div>
  );
}
