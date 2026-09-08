'use client';

import { useEffect, useState } from 'react';

type ToastType = 'error' | 'success' | 'warning';

interface ToastInfo {
  id: string;
  message: string;
  type: ToastType;
}

const TYPE_CLASS: Record<ToastType, string> = {
  error: 'bg-red-500 text-white',
  success: 'bg-green-500 text-white',
  warning: 'bg-yellow-400 text-gray-900',
};

export function GlobalErrorIndicator() {
  const [currentToast, setCurrentToast] = useState<ToastInfo | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);

  useEffect(() => {
    const showToast = (message: string, type: ToastType) => {
      const next: ToastInfo = {
        id: Date.now().toString(),
        message,
        type,
      };

      setCurrentToast((prev) => {
        if (prev) setIsReplacing(true);
        return next;
      });
      setIsVisible(true);
    };

    const handleError = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail
        ?.message;
      if (message) showToast(message, 'error');
    };

    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; type?: ToastType }>)
        .detail;
      if (!detail?.message) return;
      const type: ToastType =
        detail.type === 'success' || detail.type === 'warning'
          ? detail.type
          : 'error';
      showToast(detail.message, type);
    };

    window.addEventListener('globalError', handleError);
    window.addEventListener('globalToast', handleToast);
    return () => {
      window.removeEventListener('globalError', handleError);
      window.removeEventListener('globalToast', handleToast);
    };
  }, []);

  useEffect(() => {
    if (!isReplacing) return;
    const timer = window.setTimeout(() => setIsReplacing(false), 200);
    return () => window.clearTimeout(timer);
  }, [isReplacing]);

  useEffect(() => {
    if (!isVisible || !currentToast) return;
    if (currentToast.type === 'error') return;
    const timer = window.setTimeout(() => {
      setIsVisible(false);
      setCurrentToast(null);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [isVisible, currentToast]);

  const handleClose = () => {
    setIsVisible(false);
    setCurrentToast(null);
    setIsReplacing(false);
  };

  if (!isVisible || !currentToast) {
    return null;
  }

  return (
    <div className='fixed top-4 right-4 z-[2000]'>
      <div
        className={`${TYPE_CLASS[currentToast.type]} px-4 py-3 rounded-lg shadow-lg flex items-center justify-between min-w-[300px] max-w-[400px] transition-all duration-300 ${
          isReplacing ? 'scale-105' : 'scale-100'
        } animate-fade-in`}
      >
        <span className='text-sm font-medium flex-1 mr-3'>
          {currentToast.message}
        </span>
        <button
          onClick={handleClose}
          className='opacity-80 hover:opacity-100 transition-opacity flex-shrink-0'
          aria-label='关闭提示'
        >
          <svg
            className='w-5 h-5'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M6 18L18 6M6 6l12 12'
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function triggerGlobalError(message: string) {
  triggerGlobalToast(message, 'error');
}

export function triggerGlobalToast(
  message: string,
  type: ToastType = 'error'
) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('globalToast', {
      detail: { message, type },
    })
  );
}
