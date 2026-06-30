import { Link, NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/friends", label: "Friends" },
  { to: "/goals", label: "Goals" },
  { to: "/events", label: "Events" },
  { to: "/integrations", label: "Integrations" },
  { to: "/upgrade", label: "Upgrade" },
];

export function AppBar() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";
  const pending = useQuery({
    queryKey: ["imports", "pending"],
    queryFn: () => api.imports("pending"),
  });
  const pendingCount = pending.data?.imports.length ?? 0;

  return (
    <header className="pt-6">
      <div className="flex items-center justify-between">
        <Link to="/" className="font-display text-xl font-bold tracking-tight text-ink">
          Life<span className="text-xp">XP</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:inline">{user?.username}</span>
          <button
            onClick={logout}
            className="rounded-lg border border-line bg-panel px-3 py-1.5 text-sm text-muted transition hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </div>

      <nav className="mt-4 flex flex-wrap gap-1 border-b border-line pb-px">
        {NAV.map((item) => (
          <NavTab key={item.to} to={item.to} end={item.end} label={item.label} />
        ))}
        <NavLink
          to="/imports"
          className={({ isActive }) =>
            `relative rounded-t-lg px-3.5 py-2 text-sm font-medium transition ${
              isActive
                ? "text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-xp"
                : "text-muted hover:text-ink"
            }`
          }
        >
          Imports
          {pendingCount > 0 && (
            <span className="ml-1 rounded-full bg-xp px-1.5 text-xs font-bold text-bg">
              {pendingCount}
            </span>
          )}
        </NavLink>
        {isAdmin && <NavTab to="/admin" label="Admin" />}
      </nav>
    </header>
  );
}

function NavTab({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative rounded-t-lg px-3.5 py-2 text-sm font-medium transition ${
          isActive
            ? "text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-xp"
            : "text-muted hover:text-ink"
        }`
      }
    >
      {label}
    </NavLink>
  );
}
