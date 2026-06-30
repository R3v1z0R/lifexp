import { useCallback, useEffect, useState } from "react";

const KEY = "lifexp.timer";

interface TimerState {
  startedAt: number;
  label?: string;
}

function read(): TimerState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TimerState) : null;
  } catch {
    return null;
  }
}

export function useTimer() {
  const [state, setState] = useState<TimerState | null>(() => read());
  const [now, setNow] = useState(() => Date.now());

  // Re-read on mount + when another tab changes it.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setState(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Tick once a second while running (display only; elapsed is wall-clock).
  useEffect(() => {
    if (!state) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state]);

  const start = useCallback((label?: string) => {
    const next = { startedAt: Date.now(), label };
    localStorage.setItem(KEY, JSON.stringify(next));
    setState(next);
    setNow(Date.now());
  }, []);

  const stop = useCallback((): number => {
    const s = read();
    localStorage.removeItem(KEY);
    setState(null);
    if (!s) return 0;
    return Math.max(1, Math.round((Date.now() - s.startedAt) / 60000));
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(KEY);
    setState(null);
  }, []);

  const elapsedMs = state ? now - state.startedAt : 0;

  return {
    running: state !== null,
    startedAt: state?.startedAt ?? null,
    label: state?.label,
    elapsedMs,
    elapsedMinutes: Math.floor(elapsedMs / 60000),
    start,
    stop,
    reset,
  };
}

export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
