import { Select } from "@lifexp/web";

// Dropdown — same dark fill and gold focus as TextInput.

export const Activity = () => (
  <div style={{ width: 320 }}>
    <Select defaultValue="run" style={{ width: "100%" }}>
      <option value="run">Running</option>
      <option value="meditate">Meditation</option>
      <option value="read">Reading</option>
      <option value="focus">Deep work</option>
    </Select>
  </div>
);
