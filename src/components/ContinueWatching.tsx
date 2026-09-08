/* eslint-disable no-console */
'use client';

import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';

import type { PlayRecord } from '@/lib/db.client';
import {
  clearAllPlayRecords,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';

import DoubanCardSkeleton from '@/components/DoubanCardSkeleton';
import VideoCard from '@/components/VideoCard';

interface ContinueWatchingProps {
  className?: string;
}

export default function ContinueWatching({ className }: ContinueWatchingProps) {
  const [playRecords, setPlayRecords] = useState<
    (PlayRecord & { key: string })[]
  >([]);
  const [loading, setLoading] = useState(true);

  const updatePlayRecords = (allRecords: Record<string, PlayRecord>) => {
    const recordsArray = Object.entries(allRecords).map(([key, record]) => ({
      ...record,
      key,
    }));

    const sortedRecords = recordsArray.sort(
      (a, b) => b.save_time - a.save_time
    );

    setPlayRecords(sortedRecords);
  };

  useEffect(() => {
    const fetchPlayRecords = async () => {
      try {
        setLoading(true);
        const allRecords = await getAllPlayRecords();
        updatePlayRecords(allRecords);
      } catch (error) {
        console.error('获取播放记录失败:', error);
        setPlayRecords([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayRecords();

    const unsubscribe = subscribeToDataUpdates(
      'playRecordsUpdated',
      (newRecords: Record<string, PlayRecord>) => {
        updatePlayRecords(newRecords);
      }
    );

    return unsubscribe;
  }, []);

  const getProgress = (record: PlayRecord) => {
    if (record.total_time === 0) return 0;
    return (record.play_time / record.total_time) * 100;
  };

  const parseKey = (key: string) => {
    const [source, id] = key.split('+');
    return { source, id };
  };

  const handleClear = async () => {
    const { isConfirmed } = await Swal.fire({
      title: '清空继续观看？',
      text: '将删除全部播放记录，此操作不可恢复。',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: '确认清空',
      cancelButtonText: '取消',
      confirmButtonColor: '#dc2626',
    });
    if (!isConfirmed) return;
    await clearAllPlayRecords();
    setPlayRecords([]);
  };

  return (
    <section className={`mb-8 ${className || ''}`}>
      <div className='mb-4 flex items-center justify-between'>
        <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
          继续观看
        </h2>
        {!loading && playRecords.length > 0 && (
          <button
            className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            onClick={handleClear}
          >
            清空
          </button>
        )}
      </div>
      <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
        {loading
          ? Array.from({ length: 12 }).map((_, index) => (
              <DoubanCardSkeleton key={index} />
            ))
          : playRecords.map((record) => {
              const { source, id } = parseKey(record.key);
              return (
                <div key={record.key} className='w-full'>
                  <VideoCard
                    id={id}
                    title={record.title}
                    poster={record.cover}
                    year={record.year}
                    source={source}
                    source_name={record.source_name}
                    progress={getProgress(record)}
                    episodes={record.total_episodes}
                    currentEpisode={record.index}
                    query={record.search_title}
                    from='playrecord'
                    onDelete={() =>
                      setPlayRecords((prev) =>
                        prev.filter((r) => r.key !== record.key)
                      )
                    }
                    type={record.total_episodes > 1 ? 'tv' : ''}
                  />
                </div>
              );
            })}
        {!loading && playRecords.length === 0 && (
          <div className='col-span-full text-center text-gray-500 py-8 dark:text-gray-400'>
            暂无继续观看
          </div>
        )}
      </div>
    </section>
  );
}
