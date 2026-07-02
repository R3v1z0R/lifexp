import { useMemo, useState } from "react";
import { Text, StyleSheet, Pressable, View, TextInput } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { colors, fonts, spacing, radii } from "../../theme";

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

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function Admin() {
  const [tab, setTab] = useState<Entity>(ENTITIES[0]);
  return (
    <Screen>
      <Text style={styles.h1}>Game configuration</Text>
      <Text style={styles.muted}>Changes apply to the next logged activity — no redeploy.</Text>
      <View style={styles.tabs}>
        {ENTITIES.map((e) => (
          <Pressable
            key={e.path}
            style={[styles.tab, tab.path === e.path && styles.tabActive]}
            onPress={() => setTab(e)}
          >
            <Text style={[styles.tabText, tab.path === e.path && styles.tabTextActive]}>{e.label}</Text>
          </Pressable>
        ))}
      </View>
      <EntityList key={tab.path} entity={tab} />
    </Screen>
  );
}

function EntityList({ entity }: { entity: Entity }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin", entity.path], queryFn: () => api.adminList(entity.path) });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = list.data?.items ?? [];
  const columns = useMemo(() => (items[0] ? Object.keys(items[0]) : []), [items]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", entity.path] });
  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : "Operation failed");

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

  function coerce(col: string, value: string): unknown {
    const sample = items[0]?.[col];
    if (typeof sample === "number") return value === "" ? null : Number(value);
    if (typeof sample === "boolean") return value === "true";
    return value;
  }
  function buildBody(values: Record<string, string>): Row {
    const body: Row = {};
    for (const col of columns) if (col in values) body[col] = coerce(col, values[col]);
    return body;
  }
  function startEdit(row: Row) {
    setEditingId(String(row[entity.pk]));
    setCreating(false);
    const d: Record<string, string> = {};
    for (const col of columns) d[col] = formatValue(row[col]);
    setDraft(d);
  }

  return (
    <>
      {error && <Text style={styles.error}>{error}</Text>}

      {items.map((row) => {
        const id = String(row[entity.pk]);
        const isEditing = editingId === id;
        return (
          <Card key={id}>
            {columns.map((col) => (
              <View key={col} style={styles.field}>
                <Text style={styles.fieldLabel}>{col.replace(/_/g, " ")}</Text>
                {isEditing && col !== entity.pk ? (
                  <TextInput
                    style={styles.input}
                    value={draft[col] ?? ""}
                    onChangeText={(v) => setDraft((p) => ({ ...p, [col]: v }))}
                    keyboardType={typeof items[0]?.[col] === "number" ? "numeric" : "default"}
                    autoCapitalize="none"
                  />
                ) : (
                  <Text style={col === entity.pk ? styles.pk : styles.value}>{formatValue(row[col])}</Text>
                )}
              </View>
            ))}
            <View style={styles.actions}>
              {isEditing ? (
                <>
                  <Pressable style={styles.primary} disabled={update.isPending} onPress={() => update.mutate({ id, body: buildBody(draft) })}>
                    <Text style={styles.primaryText}>Save</Text>
                  </Pressable>
                  <Pressable style={styles.ghost} onPress={() => setEditingId(null)}>
                    <Text style={styles.ghostText}>Cancel</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable style={styles.ghost} onPress={() => startEdit(row)}>
                    <Text style={styles.ghostText}>Edit</Text>
                  </Pressable>
                  <Pressable style={styles.danger} disabled={remove.isPending} onPress={() => remove.mutate(id)}>
                    <Text style={styles.dangerText}>Delete</Text>
                  </Pressable>
                </>
              )}
            </View>
          </Card>
        );
      })}

      {creating && (
        <Card>
          {columns.map((col) => (
            <View key={col} style={styles.field}>
              <Text style={styles.fieldLabel}>{col.replace(/_/g, " ")}</Text>
              <TextInput
                style={styles.input}
                value={draft[col] ?? ""}
                onChangeText={(v) => setDraft((p) => ({ ...p, [col]: v }))}
                keyboardType={typeof items[0]?.[col] === "number" ? "numeric" : "default"}
                autoCapitalize="none"
              />
            </View>
          ))}
          <View style={styles.actions}>
            <Pressable style={styles.primary} disabled={create.isPending} onPress={() => create.mutate(buildBody(draft))}>
              <Text style={styles.primaryText}>Add</Text>
            </Pressable>
            <Pressable style={styles.ghost} onPress={() => setCreating(false)}>
              <Text style={styles.ghostText}>Cancel</Text>
            </Pressable>
          </View>
        </Card>
      )}

      <View style={styles.footer}>
        <Text style={styles.muted}>{items.length} rows</Text>
        {!creating && (
          <Pressable
            style={styles.ghost}
            onPress={() => {
              setCreating(true);
              setEditingId(null);
              setDraft({});
            }}
          >
            <Text style={styles.ghostText}>+ New row</Text>
          </Pressable>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  muted: { fontFamily: fonts.body, color: colors.muted, marginTop: spacing.xs },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  tab: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tabActive: { borderColor: colors.xp, backgroundColor: colors.panel },
  tabText: { fontFamily: fonts.body, color: colors.muted, fontSize: 13 },
  tabTextActive: { fontFamily: fonts.bodyBold, color: colors.xp },
  field: { marginBottom: spacing.sm },
  fieldLabel: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  value: { fontFamily: fonts.body, color: colors.ink },
  pk: { fontFamily: fonts.hud, color: colors.xp },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    color: colors.ink,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.body,
    marginTop: spacing.xs,
  },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  error: { fontFamily: fonts.body, color: colors.danger, marginTop: spacing.sm },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  primary: {
    backgroundColor: colors.xp,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  primaryText: { fontFamily: fonts.bodyBold, color: colors.bg },
  ghost: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  ghostText: { fontFamily: fonts.bodyBold, color: colors.muted },
  danger: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  dangerText: { fontFamily: fonts.bodyBold, color: colors.danger },
});
