import { Page, SectionTitle, Panel, Badge, PrimaryButton } from "@lifexp/web";

// The single-column command-center shell every screen lives in (centered,
// max-width, full-height). Shown composing the primitives it frames.

export const CommandCenter = () => (
  <Page narrow>
    <SectionTitle action={<Badge tone="streak">12-day streak</Badge>}>Today</SectionTitle>
    <Panel>
      <div style={{ padding: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p className="eyebrow">Hero level</p>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: "var(--color-ink)" }}>
            Level 12
          </span>
        </div>
        <PrimaryButton>Log it</PrimaryButton>
      </div>
    </Panel>
  </Page>
);
