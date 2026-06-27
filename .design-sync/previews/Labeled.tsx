import { Labeled, TextInput, Select } from "@lifexp/web";

// Field wrapper — an eyebrow label stacked over any control. Composed here with
// the controls it actually wraps (the only true render).

export const HeroName = () => (
  <div style={{ width: 320 }}>
    <Labeled label="Hero name">
      <TextInput placeholder="Sir Reginald Sweatsalot" style={{ width: "100%" }} />
    </Labeled>
  </div>
);

export const Activity = () => (
  <div style={{ width: 320 }}>
    <Labeled label="Activity">
      <Select defaultValue="run" style={{ width: "100%" }}>
        <option value="run">Running</option>
        <option value="read">Reading</option>
        <option value="focus">Deep work</option>
      </Select>
    </Labeled>
  </div>
);
