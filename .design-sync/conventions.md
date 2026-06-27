# LifeXP design system — how to build with it

LifeXP is a **dark-mode, RPG character-sheet HUD**: a deep-indigo console where
gold reads as earned XP energy and violet as arcane/social. Components are plain
presentational React — no provider, theme object, or context is required to use
them.

## Setup: render on the dark surface

The system assumes the app's deep-indigo page behind every component — that
background is normally painted on `<body>`. Reproduce it on your root container,
or translucent fills and muted text (badges, inputs, hints) will look washed
out:

```jsx
<div style={{ minHeight: "100vh", background: "var(--color-bg)", color: "var(--color-ink)" }}>
  {/* app content */}
</div>
```

Tokens and the three brand fonts (Space Grotesk, Inter, JetBrains Mono) load
from the design system's stylesheet — no font setup needed on your side.

## Styling idiom: Tailwind v4 utilities + a few semantic classes

Style your own layout glue with these **real** classes (all present in the
compiled stylesheet):

| Purpose | Vocabulary |
|---|---|
| Surfaces | `bg-bg`, `bg-panel`, `bg-panel2`, `border-line`, and the `.panel` class (raised card with hairline border + radius) |
| Text | `text-ink` (primary), `text-muted` (secondary) |
| Earned energy — XP/level/streak/CTAs ONLY | `text-xp`, `bg-xp` (gold); `.xp-fill` (gold gradient for progress bars) |
| Arcane/social — perks, magic | `text-arcane2`, and the violet `--color-arcane` token |
| Streak / danger | `text-streak` (ember green), `text-danger` (red) |
| Type | `font-display` (Space Grotesk — hero names, titles, big numerals); body is Inter by default |
| HUD numerals | the `.hud` class (JetBrains Mono, tabular) — use for every XP value, level, streak count, credit balance |
| Instrument labels | the `.eyebrow` class (small-caps letterspaced mono) above a stat or field |
| Signature glow | `.ring-glow` (gold drop-shadow, already on `XpRing`) |

**The one rule that keeps it on-brand:** gold (`xp`) is reserved for earned
energy — XP, levels, streaks, primary CTAs — and violet (`arcane`) for
perks/social. Don't spend either on ordinary chrome.

For custom CSS, the tokens are CSS variables: `var(--color-bg | -panel | -panel2 | -line | -ink | -muted | -xp | -xp2 | -arcane | -arcane2 | -streak | -danger)`
and `var(--font-display | -body | -mono)`.

## Where the truth lives

Read the design system's `styles.css` (and the `_ds_bundle.css` it imports) for
the full token + class set, and each component's `.prompt.md` / `.d.ts` for its
exact API before composing.

## One idiomatic build snippet

An attribute stat block — a library `Panel` and `XpRing`, with the styling idiom
for the layout glue:

```jsx
<div style={{ display: "flex", gap: 20, alignItems: "center" }}>
  <XpRing level={12} progress={0.62} />
  <Panel className="grow">
    <div style={{ padding: 20 }}>
      <p className="eyebrow">Strength</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="font-display text-ink" style={{ fontSize: 30, fontWeight: 700 }}>Lv 8</span>
        <span className="hud text-xp">1,420 / 1,800</span>
      </div>
      <div className="bg-bg" style={{ height: 8, borderRadius: 999, marginTop: 12 }}>
        <div className="xp-fill" style={{ height: 8, borderRadius: 999, width: "62%" }} />
      </div>
    </div>
  </Panel>
</div>
```
