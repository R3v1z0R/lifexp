import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";

export function Login() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") await register(username, email, password);
      else await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="eyebrow">Level up your real life</p>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink">
            Life<span className="text-xp">XP</span>
          </h1>
        </div>

        <div className="panel p-6">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-bg/60 p-1">
            <TabButton active={mode === "login"} onClick={() => setMode("login")}>
              Sign in
            </TabButton>
            <TabButton active={mode === "register"} onClick={() => setMode("register")}>
              New hero
            </TabButton>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            {mode === "register" && (
              <Field
                label="Username"
                value={username}
                onChange={setUsername}
                autoComplete="username"
                required
              />
            )}
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              required
            />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              required
            />

            {error && (
              <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-2 rounded-xl bg-xp px-4 py-3 font-display text-sm font-semibold text-bg transition hover:brightness-110 disabled:opacity-60"
            >
              {busy ? "…" : mode === "register" ? "Begin your run" : "Enter"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
        active ? "bg-panel2 text-ink" : "text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-line bg-bg/60 px-3.5 py-2.5 text-ink placeholder:text-muted focus:border-xp"
        {...rest}
      />
    </label>
  );
}
