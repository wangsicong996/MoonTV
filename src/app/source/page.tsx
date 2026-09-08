/* eslint-disable no-console,react-hooks/exhaustive-deps,@typescript-eslint/no-explicit-any */

'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import DoubanCardSkeleton from '@/components/DoubanCardSkeleton';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

interface CmsClass {
  type_id: number;
  type_name: string;
  type_pid: number;
}

interface CmsVideo {
  id: string;
  title: string;
  poster: string;
  year: string;
  remarks?: string;
  episodes?: number;
  type_name?: string;
}

interface CmsCatalogResult {
  source: { key: string; name: string };
  class: CmsClass[];
  list: CmsVideo[];
  page: number;
  pagecount: number;
}

function SourcePageClient() {
  const searchParams = useSearchParams();
  const key = searchParams.get('key') || '';
  const typeId = searchParams.get('t') || '';

  const [sourceName, setSourceName] = useState('');
  const [classes, setClasses] = useState<CmsClass[]>([]);
  const [videos, setVideos] = useState<CmsVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pagecount, setPagecount] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadingRef = useRef<HTMLDivElement | null>(null);

  const skeletonData = Array.from({ length: 18 }, (_, index) => index);

  const fetchCatalog = useCallback(
    async (pg: number): Promise<CmsCatalogResult | null> => {
      if (!key) return null;
      const params = new URLSearchParams({ key, pg: String(pg) });
      if (typeId) params.set('t', typeId);
      const resp = await fetch(`/api/source/catalog?${params.toString()}`);
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `加载失败: ${resp.status}`);
      }
      return (await resp.json()) as CmsCatalogResult;
    },
    [key, typeId]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setVideos([]);
    setPage(1);

    fetchCatalog(1)
      .then((data) => {
        if (cancelled || !data) return;
        setSourceName(data.source.name);
        setClasses(data.class || []);
        setVideos(data.list || []);
        setPage(data.page || 1);
        setPagecount(data.pagecount || 1);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchCatalog]);

  const hasMore = page < pagecount;

  useEffect(() => {
    if (!hasMore || loading || isLoadingMore) return;
    const el = loadingRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        const nextPage = page + 1;
        setIsLoadingMore(true);
        fetchCatalog(nextPage)
          .then((data) => {
            if (!data) {
              setPagecount(page);
              return;
            }
            const incomingPage = Number(data.page) || nextPage;
            if (incomingPage <= page && (data.list || []).length === 0) {
              setPagecount(page);
              return;
            }
            setVideos((prev) => [...prev, ...(data.list || [])]);
            setPage(incomingPage > page ? incomingPage : nextPage);
            setPagecount(data.pagecount || 1);
            if (data.class?.length) setClasses(data.class);
          })
          .catch((err) => {
            console.error(err);
          })
          .finally(() => setIsLoadingMore(false));
      },
      { rootMargin: '200px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, isLoadingMore, fetchCatalog, page]);

  const visibleClasses = classes.filter((item) => item.type_name);

  const buildHref = (nextType?: number) => {
    const params = new URLSearchParams({ key });
    if (nextType) params.set('t', String(nextType));
    return `/source?${params.toString()}`;
  };

  const activePath = key ? `/source?key=${encodeURIComponent(key)}` : '/source';

  return (
    <PageLayout activePath={activePath}>
      <div className='px-4 sm:px-10 py-4 sm:py-8 overflow-visible'>
        <div className='mb-6 sm:mb-8 space-y-4 sm:space-y-6'>
          <div>
            <h1 className='text-2xl sm:text-3xl font-bold text-gray-800 mb-1 sm:mb-2 dark:text-gray-200'>
              {sourceName || '视频源'}
            </h1>
            <p className='text-sm sm:text-base text-gray-600 dark:text-gray-400'>
              {typeId
                ? visibleClasses.find((c) => String(c.type_id) === typeId)
                    ?.type_name || '分类内容'
                : '该源首页最新内容'}
              <span className='ml-2 text-xs text-gray-400 dark:text-gray-500'>
                分类来自该源 CMS
              </span>
            </p>
          </div>

          {key && (
            <div className='bg-white/60 dark:bg-gray-800/40 rounded-2xl p-4 sm:p-6 border border-gray-200/30 dark:border-gray-700/30 backdrop-blur-sm'>
              <div className='flex flex-wrap gap-2'>
                <Link
                  href={buildHref()}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    !typeId
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  全部
                </Link>
                {visibleClasses.map((item) => {
                  const selected = String(item.type_id) === typeId;
                  return (
                    <Link
                      key={item.type_id}
                      href={buildHref(item.type_id)}
                      className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                        selected
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {item.type_name}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {!key ? (
          <div className='text-center text-gray-500 dark:text-gray-400 py-16'>
            请从左侧选择一个视频源
          </div>
        ) : error ? (
          <div className='text-center text-red-500 py-16'>{error}</div>
        ) : (
          <div className='max-w-[95%] mx-auto mt-8 overflow-visible'>
            <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-12 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-8 sm:gap-y-20'>
              {loading
                ? skeletonData.map((index) => (
                    <DoubanCardSkeleton key={index} />
                  ))
                : videos.map((item) => (
                    <div key={`${key}-${item.id}`} className='w-full'>
                      <VideoCard
                        from='search'
                        id={item.id}
                        source={key}
                        source_name={sourceName}
                        title={item.title}
                        poster={item.poster}
                        year={item.year}
                        episodes={item.episodes}
                        type={
                          item.episodes && item.episodes > 1 ? 'tv' : 'movie'
                        }
                      />
                    </div>
                  ))}
            </div>

            {!loading && videos.length === 0 && (
              <div className='text-center text-gray-500 dark:text-gray-400 py-16'>
                该分类暂无内容
              </div>
            )}

            {hasMore && !loading && (
              <div
                ref={loadingRef}
                className='flex justify-center mt-12 py-8'
              >
                {isLoadingMore && (
                  <span className='text-sm text-gray-500 dark:text-gray-400'>
                    加载更多...
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

export default function SourcePage() {
  return (
    <Suspense>
      <SourcePageClient />
    </Suspense>
  );
}
