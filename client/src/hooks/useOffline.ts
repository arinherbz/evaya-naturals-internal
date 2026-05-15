import { useCallback, useEffect, useState } from 'react';
import { getQueuedSales, deleteQueuedSale, getQueuedSaleReplayToken } from '../lib/offlineQueue';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export function useOffline() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [replaying, setReplaying] = useState(false);

  const refreshCount = useCallback(async () => {
    const queued = await getQueuedSales();
    setPendingCount(queued.length);
  }, []);

  const replayQueue = useCallback(async () => {
    const queued = await getQueuedSales();
    if (queued.length === 0) return;
    setReplaying(true);
    for (const { key, item } of queued) {
      try {
        const token = getQueuedSaleReplayToken();
        if (!token) {
          break;
        }
        const res = await fetch(`${API_BASE}/pos/sales`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(item.payload),
        });
        if (res.ok) {
          await deleteQueuedSale(key);
        }
      } catch {
        // still offline, stop replaying
        break;
      }
    }
    await refreshCount();
    setReplaying(false);
  }, [refreshCount]);

  useEffect(() => {
    refreshCount();

    const onOffline = () => setIsOffline(true);
    const onOnline = async () => {
      setIsOffline(false);
      await replayQueue();
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [refreshCount, replayQueue]);

  return { isOffline, pendingCount, replaying, refreshCount };
}
