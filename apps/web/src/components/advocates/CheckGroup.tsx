"use client";

import { Field } from "@/components/ui";

// Ported from frontend/src/screens/profile/AdvocateForms.jsx's CheckGroup.
export function CheckGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<readonly [string, string]>;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <Field label={label}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
        {options.map(([v, l]) => (
          <label key={v} style={{ display: "flex", gap: 6 }}>
            <input type="checkbox" checked={value.includes(v)} onChange={() => toggle(v)} /> {l}
          </label>
        ))}
      </div>
    </Field>
  );
}
