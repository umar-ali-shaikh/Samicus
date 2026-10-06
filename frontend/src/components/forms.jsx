// Small form primitives shared by the screens (inline-styled like the rest of the design system).
import { useId, useRef, useState, useCallback, cloneElement } from "react";

export const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid var(--color-border)", background: "#fff",
  fontSize: 14, color: "var(--color-ink)",
};
const invalidInputStyle = { ...inputStyle, borderColor: "#C0392B" };

// P2-1: the shared validation pattern every form screen should use — inline error text,
// aria-describedby/aria-invalid wired automatically onto whatever single input Field wraps,
// and (paired with useFormValidation below) focus moved to the first invalid field. Field
// owns id generation via useId() so callers never have to invent/collide on ids themselves.
export function Field({ label, hint, error, children, style }) {
  const autoId = useId();
  const fieldId = children.props.id || autoId;
  const errorId = error ? `${fieldId}-error` : undefined;
  const control = cloneElement(children, {
    id: fieldId,
    "aria-invalid": error ? "true" : undefined,
    "aria-describedby": errorId,
  });
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)" }}>{label}</span>
      {control}
      {error ? (
        <span id={errorId} role="alert" style={{ fontSize: 11.5, color: "#C0392B", fontWeight: 600 }}>{error}</span>
      ) : hint ? (
        <span style={{ fontSize: 11, color: "var(--color-label)" }}>{hint}</span>
      ) : null}
    </label>
  );
}

export function TextInput({ label, hint, error, style, ...props }) {
  return <Field label={label} hint={hint} error={error} style={style}><input {...props} style={error ? invalidInputStyle : inputStyle} /></Field>;
}

export function TextArea({ label, hint, error, rows = 4, style, ...props }) {
  return (
    <Field label={label} hint={hint} error={error} style={style}>
      <textarea rows={rows} {...props} style={{ ...(error ? invalidInputStyle : inputStyle), resize: "vertical" }} />
    </Field>
  );
}

export function Select({ label, hint, error, options, placeholder, style, ...props }) {
  return (
    <Field label={label} hint={hint} error={error} style={style}>
      <select {...props} style={error ? invalidInputStyle : inputStyle}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}
      </select>
    </Field>
  );
}

// P2-1: one hook for "validate on submit, show inline errors, focus the first invalid
// field" — every screen that validates a form (Login, Contract Review, ...) uses this
// instead of hand-rolling its own ad hoc `if (...) return setError(...)` checks.
//
// Usage:
//   const { errors, registerField, validate } = useFormValidation();
//   ...
//   <TextInput ref={registerField("email")} error={errors.email} ... />
//   ...
//   const ok = validate([["email", !email.trim(), "Email is required."], [...]]);
export function useFormValidation() {
  const [errors, setErrors] = useState({});
  const fieldRefs = useRef({});

  const registerField = useCallback(
    (name) => (el) => {
      fieldRefs.current[name] = el;
    },
    []
  );

  // `checks` is an ordered array of [fieldName, isInvalid, message] — the first failing
  // check is also the first field focused, matching the form's visual reading order.
  const validate = useCallback((checks) => {
    const nextErrors = {};
    for (const [name, isInvalid, message] of checks) {
      if (isInvalid) nextErrors[name] = message;
    }
    setErrors(nextErrors);
    const firstInvalidName = checks.find(([name]) => nextErrors[name])?.[0];
    if (firstInvalidName) fieldRefs.current[firstInvalidName]?.focus();
    return Object.keys(nextErrors).length === 0;
  }, []);

  const clearError = useCallback((name) => {
    setErrors((e) => {
      if (!e[name]) return e;
      const next = { ...e };
      delete next[name];
      return next;
    });
  }, []);

  return { errors, registerField, validate, clearError };
}
