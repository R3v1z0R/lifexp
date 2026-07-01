import * as SecureStore from "expo-secure-store";

// Client-side, refresh-proof timer state: a single wall-clock start timestamp.
// Elapsed is always computed as (now - startedAt), so backgrounding, reloads, or
// a full process kill never drift the measured duration. Persisted in SecureStore
// (already in the native build + mocked in tests) so it survives an app restart.
const KEY = "lifexp.timer";

export interface TimerState {
  startedAt: number;
  label?: string;
}

export const timerStore = {
  async get(): Promise<TimerState | null> {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      return raw ? (JSON.parse(raw) as TimerState) : null;
    } catch {
      return null;
    }
  },
  async set(state: TimerState): Promise<void> {
    await SecureStore.setItemAsync(KEY, JSON.stringify(state));
  },
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(KEY);
  },
};

// Shared, in-memory source of truth so every useTimer consumer (the Log screen and
// the global banner) sees the same live timer — the RN equivalent of the web's
// cross-tab `storage` event. SecureStore remains the durable backing store; this
// caches the current state and fans out change notifications to subscribers.
let current: TimerState | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export const timerController = {
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
  getSnapshot(): TimerState | null {
    return current;
  },
  async load(): Promise<TimerState | null> {
    current = await timerStore.get();
    emit();
    return current;
  },
  async start(label?: string): Promise<void> {
    current = { startedAt: Date.now(), label };
    await timerStore.set(current);
    emit();
  },
  async stop(unit: string): Promise<number | null> {
    const s = current ?? (await timerStore.get());
    current = null;
    await timerStore.clear();
    emit();
    return s ? measuredValue(Date.now() - s.startedAt, unit) : null;
  },
  async reset(): Promise<void> {
    current = null;
    await timerStore.clear();
    emit();
  },
};

// mm:ss for display; minutes are not capped at 60 (a long session reads "75:00").
export function formatElapsed(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// The value to pre-fill the log form with, in the target activity's unit.
// Mirrors the web behaviour: at least 1, rounded to whole minutes (or hours).
export function measuredValue(elapsedMs: number, unit: string): number {
  const mins = Math.max(1, Math.round(elapsedMs / 60_000));
  return unit === "hours" ? Math.max(1, Math.round(mins / 60)) : mins;
}
