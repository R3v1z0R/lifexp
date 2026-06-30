import { Panel } from "@lifexp/web";

// Raised console surface — the building block every stat block and quest row
// sits on. Composed here with realistic HUD content.

export const AttributeStat = () => (
  <div style={{ width: 300 }}>
    <Panel>
      <div style={{ padding: 20 }}>
        <p className="eyebrow">Strength</p>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 700, color: "var(--color-ink)" }}>
            Lv 8
          </span>
          <span className="hud" style={{ fontSize: 12, color: "var(--color-xp)" }}>1,420 / 1,800</span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.06)", marginTop: 14 }}>
          <div className="xp-fill" style={{ height: 8, borderRadius: 999, width: "62%" }} />
        </div>
      </div>
    </Panel>
  </div>
);

export const QuestEntry = () => (
  <div style={{ width: 300 }}>
    <Panel>
      <div style={{ padding: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p style={{ fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--color-ink)", margin: 0 }}>
            Morning run
          </p>
          <p className="eyebrow" style={{ marginTop: 4 }}>5.2 km · intensity 84</p>
        </div>
        <span className="hud" style={{ fontSize: 14, color: "var(--color-xp)" }}>+186 XP</span>
      </div>
    </Panel>
  </div>
);
