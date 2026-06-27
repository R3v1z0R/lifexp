import * as React from "react";

// Preview-only theme surface for /design-sync. LifeXP is a dark-mode design
// system: its components assume the app's deep-indigo page behind them (the
// background normally painted on <body> by index.css). Design-pane cards render
// on white, so this provider re-creates that stage behind every preview so
// translucent fills and muted text read the way they do in the product.
export function DsTheme(props) {
  return React.createElement(
    "div",
    {
      style: {
        background:
          "radial-gradient(1100px 600px at 78% -8%, rgba(108,92,231,0.16), transparent 60%)," +
          "radial-gradient(900px 520px at 8% 108%, rgba(245,180,69,0.08), transparent 55%)," +
          "var(--color-bg)",
        color: "var(--color-ink)",
        fontFamily: "var(--font-body)",
        padding: 28,
        borderRadius: 16,
        minHeight: 88,
        boxSizing: "border-box",
      },
    },
    props.children,
  );
}
