import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { AppBar } from "../components/AppBar";
import { Page, Panel, SectionTitle, PrimaryButton, GhostButton, Badge, ErrorText } from "../components/ui";

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

export function Upgrade() {
  const billing = useQuery({ queryKey: ["billing"], queryFn: api.billingMe });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkout = useMutation({
    mutationFn: (body: Parameters<typeof api.checkout>[0]) => api.checkout(body),
    onSuccess: (res) => {
      if (res.url) window.location.href = res.url;
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 503) {
        setNotice(
          "Billing isn't connected on this server yet. Add Stripe keys to enable checkout — the flow is ready."
        );
      } else {
        setError(e instanceof ApiError ? e.message : "Checkout failed");
      }
    },
  });

  const current = billing.data?.plan ?? "free";
  const credits = billing.data?.credit_balance ?? 0;

  return (
    <Page>
      <AppBar />

      <div className="mt-9 flex items-end justify-between">
        <div>
          <p className="eyebrow">Membership</p>
          <h1 className="font-display text-3xl font-bold text-ink">Power up your run</h1>
        </div>
        <Badge tone="xp">Balance · {credits} credits</Badge>
      </div>

      {notice && (
        <div className="mt-4 rounded-xl border border-arcane/40 bg-arcane/10 px-4 py-3 text-sm text-arcane2">
          {notice}
        </div>
      )}
      {error && <div className="mt-4"><ErrorText>{error}</ErrorText></div>}

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === current;
          const isPaid = plan.id !== "free";
          return (
            <Panel
              key={plan.id}
              className={`flex flex-col p-6 ${plan.id === "pro" ? "border-xp/50" : ""}`}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-bold text-ink">{plan.name}</h2>
                {plan.id === "pro" && <Badge tone="xp">Popular</Badge>}
              </div>
              <p className="mt-1 hud text-2xl font-bold text-xp">{plan.price}</p>

              <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm text-muted">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-0.5 text-xp">✦</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {isCurrent ? (
                  <GhostButton disabled className="w-full">
                    Current plan
                  </GhostButton>
                ) : isPaid ? (
                  <PrimaryButton
                    className="w-full"
                    disabled={checkout.isPending}
                    onClick={() => checkout.mutate({ kind: "subscription", plan: plan.id as "pro" | "team" })}
                  >
                    Choose {plan.name}
                  </PrimaryButton>
                ) : (
                  <GhostButton disabled className="w-full">
                    Always free
                  </GhostButton>
                )}
              </div>
            </Panel>
          );
        })}
      </div>

      <SectionTitle>Credit packs</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        {CREDIT_PACKS.map((p) => (
          <Panel key={p.pack} className="flex items-center justify-between p-5">
            <div>
              <p className="font-display text-lg font-bold text-ink">{p.credits} credits</p>
              <p className="hud text-sm text-muted">{p.price}</p>
            </div>
            <GhostButton
              disabled={checkout.isPending}
              onClick={() => checkout.mutate({ kind: "credits", pack: p.pack })}
            >
              Buy
            </GhostButton>
          </Panel>
        ))}
      </div>
    </Page>
  );
}
