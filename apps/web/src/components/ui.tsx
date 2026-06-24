import type { ReactNode } from "react";

export function Page({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className={`mx-auto min-h-screen px-5 pb-20 ${narrow ? "max-w-2xl" : "max-w-5xl"}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-9 flex items-center justify-between">
      <h3 className="eyebrow">{children}</h3>
      {action}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`panel ${className}`}>{children}</div>;
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <div className="panel px-5 py-8 text-center text-sm text-muted">{children}</div>;
}

export function PrimaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-xl bg-xp px-4 py-2.5 font-display text-sm font-semibold text-bg transition hover:brightness-110 disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-xl border border-line bg-panel2 px-4 py-2.5 text-sm font-medium text-ink transition hover:border-muted disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      {children}
    </p>
  );
}

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "xp" | "arcane" | "streak" }) {
  const tones: Record<string, string> = {
    muted: "border-line bg-bg/50 text-muted",
    xp: "border-xp/40 bg-xp/10 text-xp",
    arcane: "border-arcane/50 bg-arcane/15 text-arcane2",
    streak: "border-streak/40 bg-streak/10 text-streak",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium capitalize ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`rounded-xl border border-line bg-bg/60 px-3.5 py-2.5 text-ink placeholder:text-muted focus:border-xp ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`rounded-xl border border-line bg-bg/60 px-3.5 py-2.5 text-ink focus:border-xp ${props.className ?? ""}`}
    />
  );
}

export function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  );
}
