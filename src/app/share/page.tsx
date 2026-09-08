/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

'use client';

import Hls from 'hls.js';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

const SEEK_SECONDS = 10;

interface ShareDetail {
  title: string;
  poster: string;
  episodes: string[];
  source_name: string;
  year: string;
  startEpisode: number;
  expiresAt: number;
}

function SharePlayClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get('t') || '';
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const overlayOpenRef = useRef(false);
  const playingIndexRef = useRef(0);
  const focusIndexRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<ShareDetail | null>(null);
  const [playingIndex, setPlayingIndex] = useState(0);
  const [focusIndex, setFocusIndex] = useState(0);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [seekHint, setSeekHint] = useState('');

  overlayOpenRef.current = overlayOpen;
  playingIndexRef.current = playingIndex;
  focusIndexRef.current = focusIndex;

  useEffect(() => {
    if (!token) {
      setError('缺少分享参数');
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const res = await fetch(`/api/share?t=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || '分享链接无效或已过期');
        }
        setDetail(data);
        const start = Math.min(
          Math.max(0, Number(data.startEpisode) || 0),
          Math.max(0, (data.episodes?.length || 1) - 1)
        );
        setPlayingIndex(start);
        setFocusIndex(start);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [token]);

  const playEpisode = useCallback((index: number, url: string) => {
    const video = videoRef.current;
    if (!video || !url) return;

    hlsRef.current?.destroy();
    hlsRef.current = null;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      void video.play().catch(() => undefined);
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, maxBufferLength: 30 });
      hls.loadSource(url);
      hls.attachMedia(video);
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        void video.play().catch(() => undefined);
      });
      return;
    }

    video.src = url;
    void video.play().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!detail?.episodes?.[playingIndex]) return;
    playEpisode(playingIndex, detail.episodes[playingIndex]);
  }, [detail, playingIndex, playEpisode]);

  useEffect(() => {
    return () => {
      hlsRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (!overlayOpen) return;
    buttonRefs.current[focusIndex]?.focus();
    buttonRefs.current[focusIndex]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }, [focusIndex, overlayOpen]);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
      return;
    }
    video.currentTime = Math.min(
      video.duration,
      Math.max(0, video.currentTime + delta)
    );
    setSeekHint(delta > 0 ? `+${SEEK_SECONDS}s` : `-${SEEK_SECONDS}s`);
    window.setTimeout(() => setSeekHint(''), 700);
  }, []);

  const openOverlay = useCallback(() => {
    setFocusIndex(playingIndexRef.current);
    setOverlayOpen(true);
  }, []);

  const closeOverlay = useCallback(() => {
    setOverlayOpen(false);
  }, []);

  const confirmEpisode = useCallback(
    (index: number) => {
      setPlayingIndex(index);
      setFocusIndex(index);
      setOverlayOpen(false);
    },
    []
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const episodes = detail?.episodes || [];
      if (!episodes.length) return;

      const key = event.key;
      const last = episodes.length - 1;
      const open = overlayOpenRef.current;

      if (
        [
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          'Enter',
          ' ',
          'Escape',
          'Backspace',
        ].includes(key)
      ) {
        event.preventDefault();
        event.stopPropagation();
      }

      if (!open) {
        if (key === 'ArrowLeft') {
          seekBy(-SEEK_SECONDS);
          return;
        }
        if (key === 'ArrowRight') {
          seekBy(SEEK_SECONDS);
          return;
        }
        if (
          key === 'ArrowUp' ||
          key === 'ArrowDown' ||
          key === 'Enter' ||
          key === ' '
        ) {
          openOverlay();
        }
        return;
      }

      if (key === 'Escape' || key === 'Backspace' || key === 'ArrowDown') {
        closeOverlay();
        return;
      }

      if (key === 'ArrowLeft') {
        setFocusIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key === 'ArrowRight') {
        setFocusIndex((current) => Math.min(last, current + 1));
        return;
      }
      if (key === 'ArrowUp') {
        setFocusIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key === 'Enter' || key === ' ') {
        confirmEpisode(focusIndexRef.current);
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [closeOverlay, confirmEpisode, detail, openOverlay, seekBy]);

  if (loading) {
    return (
      <div className='min-h-screen bg-black text-white flex items-center justify-center text-xl'>
        正在打开播放页...
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className='min-h-screen bg-black text-white flex items-center justify-center text-xl px-6 text-center'>
        {error || '分享链接无效或已过期'}
      </div>
    );
  }

  return (
    <div className='relative h-screen w-screen bg-black text-white overflow-hidden'>
      <video
        ref={videoRef}
        className='w-full h-full object-contain bg-black'
        autoPlay
        playsInline
        tabIndex={-1}
        poster={detail.poster || undefined}
        onClick={openOverlay}
      />

      {seekHint && (
        <div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
          <div className='rounded-full bg-black/60 px-6 py-3 text-2xl font-bold text-[#FFC107]'>
            {seekHint}
          </div>
        </div>
      )}

      <div
        className={`absolute inset-0 transition-opacity duration-300 ${
          overlayOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <button
          type='button'
          className='absolute inset-0 bg-black/40'
          tabIndex={-1}
          onClick={closeOverlay}
          aria-label='关闭选集'
        />
        <div
          className={`absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-3xl bg-black/75 backdrop-blur-md px-5 pt-5 pb-8 transition-transform duration-300 ${
            overlayOpen ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          <div className='mx-auto mb-4 h-1.5 w-16 rounded-full bg-white/30' />
          <div className='mb-4 text-lg text-[#FFC107] truncate'>
            {detail.title}
            {detail.episodes.length > 1
              ? ` · 第 ${focusIndex + 1} / ${detail.episodes.length} 集`
              : ''}
          </div>
          <div className='flex flex-wrap gap-3'>
            {detail.episodes.map((_, index) => (
              <button
                key={index}
                ref={(el) => {
                  buttonRefs.current[index] = el;
                }}
                type='button'
                tabIndex={overlayOpen && index === focusIndex ? 0 : -1}
                onClick={() => confirmEpisode(index)}
                className={`h-14 min-w-[4.5rem] rounded-lg px-4 text-lg font-bold outline-none ${
                  index === focusIndex
                    ? 'bg-[#FFC107] text-black ring-4 ring-[#FFC107]/70'
                    : index === playingIndex
                    ? 'bg-white/25 text-white'
                    : 'bg-white/10 text-white'
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense
      fallback={
        <div className='min-h-screen bg-black text-white flex items-center justify-center'>
          Loading...
        </div>
      }
    >
      <SharePlayClient />
    </Suspense>
  );
}
