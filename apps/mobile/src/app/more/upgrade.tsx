import { useState } from "react";
import { Text, StyleSheet, Pressable, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { api, ApiError } from "../../lib/api";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { colors, fonts, spacing, radii } from "../../theme";

type Plan = "free" | "pro" | "team";

const PLANS: { id: Plan; name: string; price: string; features: string[] }[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    features: ["Log every activity", "Hero levels & streaks", "1 active shared goal", "Join public events"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$6/mo",
    features: ["Everything in Free", "Unlimited shared goals", "Host private events", "Advanced analytics"],
  },
  {
    id: "team",
    name: "Team",
    price: "$18/mo",
    features: ["Everything in Pro", "Team leaderboards", "Group events", "Shared admin tools"],
  },
];

const CREDIT_PACKS = [
  { pack: "small", credits: 100, price: "$2" },
  { pack: "medium", credits: 500, price: "$8" },
  { pack: "large", credits: 1200, price: "$15" },
];

export default function Upgrade() {
  const billing = useQuery({ queryKey: ["billing"], queryFn: api.billingMe });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkout = useMutation({
    mutationFn: (body: Parameters<typeof api.checkout>[0]) => api.checkout(body),
    onSuccess: async (res) => {
      if (res.url) await WebBrowser.openBrowserAsync(res.url);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 503) {
        setNotice(
          "Billing isn't connected on this server yet. Add Stripe keys to enable checkout — the flow is ready.",
        );
      } else {
        setError(e instanceof ApiError ? e.message : "Checkout failed");
      }
    },
  });

  const current = (billing.data?.plan ?? "free") as Plan;
  const credits = billing.data?.credit_balance ?? 0;

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>Power up your run</Text>
        <Text style={styles.badge}>{credits} credits</Text>
      </View>

      {notice && (
        <Card>
          <Text style={styles.notice}>{notice}</Text>
        </Card>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      {PLANS.map((plan) => {
        const isCurrent = plan.id === current;
        const isPaid = plan.id !== "free";
        return (
          <Card key={plan.id}>
            <View style={styles.headerRow}>
              <Text style={styles.planName}>{plan.name}</Text>
              <Text style={styles.price}>{plan.price}</Text>
            </View>
            {plan.features.map((f) => (
              <Text key={f} style={styles.feature}>
                ✦ {f}
              </Text>
            ))}
            {isCurrent ? (
              <Pressable style={[styles.ghost, styles.disabled]} disabled>
                <Text style={styles.ghostText}>Current plan</Text>
              </Pressable>
            ) : isPaid ? (
              <Pressable
                style={[styles.primary, checkout.isPending && styles.disabled]}
                disabled={checkout.isPending}
                onPress={() => checkout.mutate({ kind: "subscription", plan: plan.id as "pro" | "team" })}
              >
                <Text style={styles.primaryText}>Choose {plan.name}</Text>
              </Pressable>
            ) : (
              <Pressable style={[styles.ghost, styles.disabled]} disabled>
                <Text style={styles.ghostText}>Always free</Text>
              </Pressable>
            )}
          </Card>
        );
      })}

      <Text style={styles.h2}>Credit packs</Text>
      {CREDIT_PACKS.map((p) => (
        <Card key={p.pack}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.planName}>{p.credits} credits</Text>
              <Text style={styles.priceSm}>{p.price}</Text>
            </View>
            <Pressable
              style={[styles.ghost, checkout.isPending && styles.disabled]}
              disabled={checkout.isPending}
              onPress={() => checkout.mutate({ kind: "credits", pack: p.pack })}
            >
              <Text style={styles.ghostText}>Buy</Text>
            </Pressable>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  h1: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  h2: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginTop: spacing.sm },
  badge: { fontFamily: fonts.hud, color: colors.xp, fontSize: 13 },
  planName: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  price: { fontFamily: fonts.hud, fontSize: 20, color: colors.xp },
  priceSm: { fontFamily: fonts.hud, fontSize: 13, color: colors.muted, marginTop: spacing.xs },
  feature: { fontFamily: fonts.body, color: colors.muted, marginTop: spacing.xs },
  notice: { fontFamily: fonts.body, color: colors.arcane2 },
  error: { fontFamily: fonts.body, color: colors.danger, marginTop: spacing.sm },
  primary: {
    backgroundColor: colors.xp,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  primaryText: { fontFamily: fonts.bodyBold, color: colors.bg },
  ghost: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    marginTop: spacing.md,
  },
  ghostText: { fontFamily: fonts.bodyBold, color: colors.muted },
  disabled: { opacity: 0.5 },
});
