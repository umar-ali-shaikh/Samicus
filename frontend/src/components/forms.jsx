// Small form primitives shared by the screens (inline-styled like the rest of the design system).
export const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid var(--color-border)", background: "#fff",
  fontSize: 14, color: "var(--color-ink)",
};

export function Field({ label, hint, children, style }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)" }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: "var(--color-label)" }}>{hint}</span>}
    </label>
  );
}

export function TextInput({ label, hint, style, ...props }) {
  return <Field label={label} hint={hint} style={style}><input {...props} style={inputStyle} /></Field>;
}

export function TextArea({ label, hint, rows = 4, style, ...props }) {
  return <Field label={label} hint={hint} style={style}><textarea rows={rows} {...props} style={{ ...inputStyle, resize: "vertical" }} /></Field>;
}

export function Select({ label, hint, options, placeholder, style, ...props }) {
  return (
    <Field label={label} hint={hint} style={style}>
      <select {...props} style={inputStyle}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}
      </select>
    </Field>
  );
}
