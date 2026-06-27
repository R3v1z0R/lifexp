import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { AppBar } from "../components/AppBar";
import { Page, Panel, PrimaryButton, GhostButton, Badge, ErrorText } from "../components/ui";

interface Entity {
  path: string;
  label: string;
  pk: string;
}

const ENTITIES: Entity[] = [
  { path: "xp-caps", label: "XP Caps", pk: "cap_key" },
  { path: "streak-tiers", label: "Streak Tiers", pk: "id" },
  { path: "perks", label: "Perks", pk: "slug" },
  { path: "sections", label: "Sections", pk: "slug" },
  { path: "activities", label: "Activities", pk: "slug" },
  { path: "intensity-configs", label: "Intensity", pk: "id" },
];

type Row = Record<string, unknown>;

export function Admin() {
  const [tab, setTab] = useState<Entity>(ENTITIES[0]);

  return (
    <Page>
      <AppBar />

      <div className="mt-9">
        <p className="eyebrow">Admin</p>
        <h1 className="font-display text-3xl font-bold text-ink">Game configuration</h1>
        <p className="mt-1 text-sm text-muted">Changes apply to the next logged activity — no redeploy.</p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {ENTITIES.map((e) => (
          <button
            key={e.path}
            onClick={() => setTab(e)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              tab.path === e.path
                ? "border-xp/50 bg-xp/10 text-xp"
                : "border-line bg-panel text-muted hover:text-ink"
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>

      <EntityTable key={tab.path} entity={tab} />
    </Page>
  );
}

function EntityTable({ entity }: { entity: Entity }) {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["admin", entity.path], queryFn: () => api.adminList(entity.path) });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = list.data?.items ?? [];
  const columns = useMemo(() => {
    const sample = items[0];
    return sample ? Object.keys(sample) : [];
  }, [items]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin", entity.path] });
  }
  function fail(e: unknown) {
    setError(e instanceof ApiError ? e.message : "Operation failed");
  }

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Row }) => api.adminUpdate(entity.path, id, body),
    onSuccess: () => {
      setEditingId(null);
      setError(null);
      refresh();
    },
    onError: fail,
  });
  const create = useMutation({
    mutationFn: (body: Row) => api.adminCreate(entity.path, body),
    onSuccess: () => {
      setCreating(false);
      setDraft({});
      setError(null);
      refresh();
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.adminDelete(entity.path, id),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: fail,
  });

  // Coerce a string input back to the column's original JS type.
  function coerce(col: string, value: string): unknown {
    const sample = items[0]?.[col];
    if (typeof sample === "number") return value === "" ? null : Number(value);
    if (typeof sample === "boolean") return value === "true";
    return value;
  }
  function buildBody(values: Record<string, string>): Row {
    const body: Row = {};
    for (const col of columns) {
      if (col in values) body[col] = coerce(col, values[col]);
    }
    return body;
  }

  function startEdit(row: Row) {
    const id = String(row[entity.pk]);
    setEditingId(id);
    setCreating(false);
    const d: Record<string, string> = {};
    for (const col of columns) d[col] = formatValue(row[col]);
    setDraft(d);
  }

  return (
    <Panel className="mt-5 overflow-x-auto">
      {error && <div className="p-4"><ErrorText>{error}</ErrorText></div>}
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-muted">
            {columns.map((c) => (
              <th key={c} className="px-4 py-3 font-medium">
                <span className="eyebrow">{c.replace(/_/g, " ")}</span>
              </th>
            ))}
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {items.map((row) => {
            const id = String(row[entity.pk]);
            const isEditing = editingId === id;
            return (
              <tr key={id} className="border-b border-line/60 align-middle">
                {columns.map((col) => (
                  <td key={col} className="px-4 py-2.5 text-ink">
                    {isEditing && col !== entity.pk ? (
                      <CellInput
                        sample={items[0]?.[col]}
                        value={draft[col] ?? ""}
                        onChange={(v) => setDraft((p) => ({ ...p, [col]: v }))}
                      />
                    ) : (
                      <span className={col === entity.pk ? "hud text-xp" : ""}>{formatValue(row[col])}</span>
                    )}
                  </td>
                ))}
                <td className="whitespace-nowrap px-4 py-2.5 text-right">
                  {isEditing ? (
                    <div className="flex justify-end gap-2">
                      <PrimaryButton className="py-1.5" onClick={() => update.mutate({ id, body: buildBody(draft) })} disabled={update.isPending}>
                        Save
                      </PrimaryButton>
                      <GhostButton className="py-1.5" onClick={() => setEditingId(null)}>
                        Cancel
                      </GhostButton>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <GhostButton className="py-1.5" onClick={() => startEdit(row)}>
                        Edit
                      </GhostButton>
                      <button
                        onClick={() => remove.mutate(id)}
                        className="rounded-lg border border-danger/40 px-3 py-1.5 text-sm text-danger transition hover:bg-danger/10"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}

          {creating && (
            <tr className="border-b border-line/60 bg-bg/30">
              {columns.map((col) => (
                <td key={col} className="px-4 py-2.5">
                  <CellInput
                    sample={items[0]?.[col]}
                    value={draft[col] ?? ""}
                    onChange={(v) => setDraft((p) => ({ ...p, [col]: v }))}
                  />
                </td>
              ))}
              <td className="whitespace-nowrap px-4 py-2.5 text-right">
                <div className="flex justify-end gap-2">
                  <PrimaryButton className="py-1.5" onClick={() => create.mutate(buildBody(draft))} disabled={create.isPending}>
                    Add
                  </PrimaryButton>
                  <GhostButton className="py-1.5" onClick={() => setCreating(false)}>
                    Cancel
                  </GhostButton>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="flex items-center justify-between p-4">
        <Badge>{items.length} rows</Badge>
        {!creating && (
          <GhostButton
            className="py-1.5"
            onClick={() => {
              setCreating(true);
              setEditingId(null);
              setDraft({});
            }}
          >
            + New row
          </GhostButton>
        )}
      </div>
    </Panel>
  );
}

function CellInput({
  sample,
  value,
  onChange,
}: {
  sample: unknown;
  value: string;
  onChange: (v: string) => void;
}) {
  if (typeof sample === "boolean") {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-line bg-bg/60 px-2 py-1.5 text-ink"
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  return (
    <input
      type={typeof sample === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-w-[90px] rounded-lg border border-line bg-bg/60 px-2 py-1.5 text-ink focus:border-xp"
    />
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
