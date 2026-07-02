import { useEffect, useState, useSyncExternalStore } from "react";
import { timerController } from "./timer";

// Subscribes to the shared timer controller so the Log screen and the global
// banner stay in sync, and ticks once a second while running (display only —
// elapsed is always recomputed as wall-clock now - startedAt).
export function useTimer() {
  const state = useSyncExternalStore(
    timerController.subscribe,
    timerController.getSnapshot,
    timerController.getSnapshot,
  );
  const [now, setNow] = useState(() => Date.now());

  // Hydrate the shared snapshot from persisted storage on first mount.
  useEffect(() => {
    void timerController.load();
  }, []);

  useEffect(() => {
    if (!state) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state]);

  const elapsedMs = state ? now - state.startedAt : 0;

  return {
    running: state !== null,
    label: state?.label,
    elapsedMs,
    start: timerController.start,
    stop: timerController.stop,
    reset: timerController.reset,
  };
}
