"use client";

import { Field, inputStyle } from "@/components/ui";
import { STATES } from "@/lib/format";

export interface JurisdictionEntry {
  state: string;
  forum: string;
}

// Ported from frontend/src/screens/profile/AdvocateForms.jsx's Jurisdictions.
export function JurisdictionsEditor({ value, onChange }: { value: JurisdictionEntry[]; onChange: (next: JurisdictionEntry[]) => void }) {
  return (
    <Field label="Courts & forums you appear before">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {value.map((j, i) => (
          <div key={i} style={{ display: "flex", gap: 8 }}>
            <select
              value={j.state}
              onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, state: e.target.value } : x)))}
              style={inputStyle}
            >
              <option value="">State…</option>
              {STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <input
              value={j.forum}
              onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, forum: e.target.value } : x)))}
              placeholder="e.g. City Civil Court"
              style={inputStyle}
            />
            <button
              onClick={() => onChange(value.filter((_, k) => k !== i))}
              aria-label="Remove"
              type="button"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18 }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...value, { state: "", forum: "" }])}
          type="button"
          style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--color-rust)", cursor: "pointer", fontSize: 12.5 }}
        >
          + Add a forum
        </button>
      </div>
    </Field>
  );
}
