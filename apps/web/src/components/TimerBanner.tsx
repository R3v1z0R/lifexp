import { Link } from "react-router-dom";
import { useTimer, formatElapsed } from "../lib/useTimer";

export function TimerBanner() {
  const { running, elapsedMs, label } = useTimer();
  if (!running) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 border-b border-xp/40 bg-bg/90 px-4 py-2 backdrop-blur">
      <span className="hud text-sm text-xp">● {formatElapsed(elapsedMs)}</span>
      <span className="text-sm text-muted">{label ?? "timer running"}</span>
      <Link to="/log" className="text-sm font-medium text-ink underline">
        Go to log
      </Link>
    </div>
  );
}
