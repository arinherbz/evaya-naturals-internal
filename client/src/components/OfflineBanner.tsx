import { useOffline } from '../hooks/useOffline';

export default function OfflineBanner() {
  const { isOffline, pendingCount, replaying } = useOffline();

  if (!isOffline && pendingCount === 0) return null;

  if (!isOffline && pendingCount > 0) {
    return (
      <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-xs font-semibold text-emerald-700 shadow-lg">
        {replaying ? `Syncing ${pendingCount} sale${pendingCount > 1 ? 's' : ''}…` : `${pendingCount} sale${pendingCount > 1 ? 's' : ''} synced`}
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-amber-200 bg-amber-50 px-5 py-2.5 text-xs font-semibold text-amber-700 shadow-lg">
      Offline{pendingCount > 0 ? ` — ${pendingCount} action${pendingCount > 1 ? 's' : ''} pending sync` : ''}
    </div>
  );
}
