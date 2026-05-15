import { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from '../lib/auth-storage';

interface QueuedRequest {
  id: string;
  method: string;
  url: string;
  body?: unknown;
  timestamp: number;
  retryCount: number;
}

const STORAGE_KEY = 'evaya_offline_queue';
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

export function useOfflineQueue() {
  const [queue, setQueue] = useState<QueuedRequest[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isProcessing, setIsProcessing] = useState(false);

  // Load queue from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setQueue(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load offline queue:', e);
    }
  }, []);

  // Save queue to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.error('Failed to save offline queue:', e);
    }
  }, [queue]);

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      processQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [queue]);

  const enqueue = useCallback((method: string, url: string, body?: unknown) => {
    const request: QueuedRequest = {
      id: crypto.randomUUID(),
      method,
      url,
      body,
      timestamp: Date.now(),
      retryCount: 0,
    };

    setQueue((prev) => [...prev, request]);
    return request.id;
  }, []);

  const dequeue = useCallback((id: string) => {
    setQueue((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const retry = useCallback((id: string) => {
    setQueue((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, retryCount: r.retryCount + 1 } : r
      )
    );
  }, []);

  const processQueue = useCallback(async () => {
    if (isProcessing || queue.length === 0 || !isOnline) return;

    setIsProcessing(true);

    for (const request of queue) {
      if (request.retryCount >= MAX_RETRIES) {
        dequeue(request.id);
        continue;
      }

      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getAuthToken() ?? ''}`,
          },
          body: request.body ? JSON.stringify(request.body) : undefined,
        });

        if (response.ok) {
          dequeue(request.id);
        } else {
          retry(request.id);
        }
      } catch {
        retry(request.id);
      }

      // Small delay between requests
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
    }

    setIsProcessing(false);
  }, [queue, isOnline, isProcessing, dequeue, retry]);

  const clearQueue = useCallback(() => {
    setQueue([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    queue,
    isOnline,
    isProcessing,
    enqueue,
    dequeue,
    processQueue,
    clearQueue,
    queueLength: queue.length,
  };
}

// Cache utilities for offline product data
export const useProductCache = () => {
  const CACHE_KEY = 'evaya_product_cache';
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  const getCachedProducts = useCallback(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION) {
          return data;
        }
      }
    } catch {
      // Cache invalid or corrupted
    }
    return null;
  }, []);

  const cacheProducts = useCallback((products: unknown) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: products,
        timestamp: Date.now(),
      }));
    } catch {
      // Storage full or unavailable
    }
  }, []);

  const clearCache = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
  }, []);

  return { getCachedProducts, cacheProducts, clearCache };
};
