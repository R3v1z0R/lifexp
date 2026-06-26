import { useRegisterSW } from "virtual:pwa-register/react";

// Small HUD toast that surfaces service-worker lifecycle: a one-time
// "ready to work offline" confirmation, and a "new version" reload prompt
// when a fresh build has been precached.
export function PwaUpdater() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!offlineReady && !needRefresh) return null;

  function dismiss() {
    setOfflineReady(false);
    setNeedRefresh(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="panel flex items-center gap-3 px-4 py-3 shadow-xl">
        <span className="text-lg text-xp">✦</span>
        <p className="text-sm text-ink">
          {needRefresh ? "A new version of LifeXP is ready." : "LifeXP is ready to work offline."}
        </p>
        {needRefresh && (
          <button
            onClick={() => updateServiceWorker(true)}
            className="rounded-lg border border-xp/50 bg-xp/10 px-3 py-1.5 text-sm font-medium text-xp transition hover:bg-xp/20"
          >
            Reload
          </button>
        )}
        <button
          onClick={dismiss}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:text-ink"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
