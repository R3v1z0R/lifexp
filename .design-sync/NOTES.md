# design-sync notes — LifeXP Design System

Synced project: `LifeXP Design System` (claude.ai/design, projectId in config.json).
Scope: the reusable presentational primitives from `apps/web/src/components/`
(`XpRing` + the `ui.tsx` family) — 12 components. The app-coupled `AppBar` and
`PwaUpdater` are deliberately excluded (router/auth/PWA-virtual-module deps).

## Repo-specific gotchas

- **This is a Vite app, not a published component library** — there is no
  `dist/` of components. We bundle via a hand-written entry `apps/web/.ds-entry.mjs`
  that re-exports only the 12 clean primitives. `cfg.entry` points at it. Do NOT
  switch to synth-entry (no `--entry`): synth re-exports every file in
  `src/components/`, including `PwaUpdater.tsx`, whose `virtual:pwa-register/react`
  import esbuild cannot resolve → bundle fails. Keep the explicit entry.
- **Tailwind v4 utilities are tree-shaken**, so the component classes only exist
  in a *compiled* stylesheet. `cfg.cssEntry` = `apps/web/.ds-compiled.css`, which
  `cfg.buildCmd` regenerates by copying the hashed `vite build` output
  (`apps/web/dist/assets/index-*.css`). The compiled file is gitignored; re-sync
  must run `buildCmd` first (the driver does). buildCmd uses `cp` — fine under the
  Bash tool / git-bash; if running the driver from PowerShell, regenerate the css
  manually or run buildCmd in bash.
- **Authored-preview styling constraint:** previews may only use Tailwind classes
  the *app* actually uses (those are the only ones compiled). For composition glue
  in `.design-sync/previews/*.tsx` we use inline styles + CSS-var tokens
  (`var(--color-*)`, `var(--font-*)`) and the always-present custom classes
  (`.panel`, `.eyebrow`, `.hud`, `.xp-fill`, `.ring-glow`). The components
  themselves carry their own (compiled) classes, so they render correctly.
- **Dark-mode DS on white cards:** design-pane cards render on a hardcoded white
  body. LifeXP is dark-mode, so translucent fills (Badge `muted`, TextInput,
  Select) and muted text look washed out on white. Fix = a preview-only theme
  provider `apps/web/.ds-theme.jsx` (exports `DsTheme`), wired via
  `cfg.extraEntries` + `cfg.provider`. It paints the app's indigo gradient behind
  every card. It is preview-only — it is NOT documented to the design agent and is
  not one of the 12 components.
- **Fonts are bundled woff2** (latin subset of Space Grotesk / Inter / JetBrains
  Mono) under `.design-sync/fonts/`, wired via `cfg.extraFonts`. The app itself
  loads them from Google's CDN via `<link>` in `index.html`; we self-host for the
  DS so renders are network-independent. To refresh, re-run the fetch (see the
  throwaway script approach in git history / scratchpad) — only the `latin` subset
  faces are kept.

## Playwright / render check

- Cached chromium build is **1223** → install **playwright@1.60.0** (pins 1223)
  into `.ds-sync/` for `package-validate.mjs`. A different cached build needs the
  matching version (check `playwright-core/browsers.json`).

## Known render warns

- None outstanding. Final validate: 12/12 render clean, 0 bad, 0 floor cards.

## Re-sync risks (what can silently go stale)

- **Hashed CSS path:** `buildCmd` globs `index-*.css`; if vite emits multiple
  top-level css chunks the glob could grab the wrong one. Today there is exactly
  one. Check `apps/web/.ds-compiled.css` is ~20KB and contains `.panel`/`--color-xp`
  after a rebuild.
- **Preview/theme coupling to app source:** `.ds-entry.mjs` names the 12 exports
  explicitly and `.ds-theme.jsx` hardcodes the indigo gradient (kept in sync with
  `apps/web/src/index.css`). If `ui.tsx` adds/removes/renames a primitive, update
  `.ds-entry.mjs` AND `cfg.componentSrcMap`. If the brand background changes in
  `index.css`, update `.ds-theme.jsx`.
- **Tokens dir is empty** by design — tokens live in `_ds_bundle.css` (from the
  Tailwind `@theme` block) and reach designs via the `styles.css` import closure.
  `[TOKENS_MISSING]`-style warns are expected/non-blocking here.
