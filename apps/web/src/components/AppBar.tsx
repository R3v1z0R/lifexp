import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function AppBar({ username }: { username: string }) {
  const { logout } = useAuth();
  return (
    <header className="flex items-center justify-between pt-6">
      <Link to="/" className="font-display text-xl font-bold tracking-tight text-ink">
        Life<span className="text-xp">XP</span>
      </Link>
      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-muted sm:inline">{username}</span>
        <button
          onClick={logout}
          className="rounded-lg border border-line bg-panel px-3 py-1.5 text-sm text-muted transition hover:text-ink"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
