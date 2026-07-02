import { useState } from "react";
import { Text, StyleSheet, Pressable, View, TextInput } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type SearchUser } from "../../lib/api";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { colors, fonts, spacing, radii } from "../../theme";

export default function Friends() {
  const qc = useQueryClient();
  const friends = useQuery({ queryKey: ["friends"], queryFn: api.friends });
  const requests = useQuery({ queryKey: ["friendRequests"], queryFn: api.friendRequests });
  const feed = useQuery({ queryKey: ["feed"], queryFn: api.feed });

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  const search = useMutation({
    mutationFn: () => api.searchUsers(query.trim()),
    onSuccess: (res) => {
      setResults(res.users);
      setError(null);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Search failed"),
  });
  const sendRequest = useMutation({
    mutationFn: (id: string) => api.sendFriendRequest(id),
    onSuccess: (_res, id) => setSentTo((prev) => new Set(prev).add(id)),
    onError: (e) => setError(e instanceof ApiError ? e.message : "Could not send request"),
  });
  const accept = useMutation({
    mutationFn: (id: string) => api.acceptFriendRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["friendRequests"] });
      qc.invalidateQueries({ queryKey: ["friends"] });
      qc.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const incoming = requests.data?.requests ?? [];
  const myFriends = friends.data?.friends ?? [];
  const feedItems = feed.data?.feed ?? [];

  return (
    <Screen>
      <Text style={styles.h2}>Find heroes</Text>
      <Card>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by username…"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
          />
          <Pressable
            style={[styles.primary, query.trim().length < 2 && styles.disabled]}
            disabled={query.trim().length < 2 || search.isPending}
            onPress={() => search.mutate()}
          >
            <Text style={styles.primaryText}>{search.isPending ? "…" : "Search"}</Text>
          </Pressable>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
        {results?.length === 0 && <Text style={styles.muted}>No heroes match “{query}”.</Text>}
        {results?.map((u) => (
          <View key={u.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{u.username}</Text>
              <Text style={styles.lvl}>Lv {u.hero_level}</Text>
            </View>
            <Pressable
              style={styles.ghost}
              disabled={sentTo.has(u.id) || sendRequest.isPending}
              onPress={() => sendRequest.mutate(u.id)}
            >
              <Text style={styles.ghostText}>{sentTo.has(u.id) ? "Requested" : "Add"}</Text>
            </Pressable>
          </View>
        ))}
      </Card>

      {incoming.length > 0 && (
        <>
          <Text style={styles.h2}>Requests</Text>
          {incoming.map((r) => (
            <Card key={r.id}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{r.username}</Text>
                  <Text style={styles.lvl}>Lv {r.hero_level}</Text>
                </View>
                <Pressable style={styles.primary} onPress={() => accept.mutate(r.id)}>
                  <Text style={styles.primaryText}>Accept</Text>
                </Pressable>
              </View>
            </Card>
          ))}
        </>
      )}

      <Text style={styles.h2}>Your party ({myFriends.length})</Text>
      {myFriends.length === 0 ? (
        <Text style={styles.muted}>No friends yet. Search above to send a request.</Text>
      ) : (
        myFriends.map((f) => (
          <Card key={f.id}>
            <Text style={styles.name}>{f.username}</Text>
            <Text style={styles.lvl}>Lv {f.hero_level}</Text>
          </Card>
        ))
      )}

      <Text style={styles.h2}>Friends feed</Text>
      {feedItems.length === 0 ? (
        <Text style={styles.muted}>When your friends log activities, they’ll show up here.</Text>
      ) : (
        feedItems.map((item) => (
          <Card key={item.id}>
            <Text style={styles.name}>
              {item.username} <Text style={styles.muted}>logged</Text>{" "}
              <Text style={styles.cap}>{item.activity_slug.replace(/_/g, " ")}</Text>
            </Text>
            <Text style={styles.lvl}>
              +{item.final_xp} XP · {new Date(item.logged_at).toLocaleString()}
            </Text>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  h2: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginTop: spacing.sm },
  searchRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    color: colors.ink,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fonts.body,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  name: { fontFamily: fonts.bodyBold, color: colors.ink },
  cap: { textTransform: "capitalize" },
  lvl: { fontFamily: fonts.hud, color: colors.arcane2, fontSize: 12, marginTop: spacing.xs },
  muted: { fontFamily: fonts.body, color: colors.muted, marginTop: spacing.xs },
  error: { fontFamily: fonts.body, color: colors.danger, marginTop: spacing.sm },
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
  disabled: { opacity: 0.5 },
});
