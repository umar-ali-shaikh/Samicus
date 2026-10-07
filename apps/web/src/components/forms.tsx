// Ported subset of frontend/src/components/forms.jsx -- TextInput/TextArea wrap ui.tsx's Field
// and inputStyle so form screens don't each hand-roll the label/hint/error layout.
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Field, inputStyle } from "@/components/ui";

const invalidInputStyle = { ...inputStyle, borderColor: "#C0392B" };

export function TextInput({
  label,
  hint,
  error,
  ...props
}: { label: string; hint?: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={error}>
      <input {...props} style={error ? invalidInputStyle : inputStyle} />
    </Field>
  );
}

export function TextArea({
  label,
  hint,
  error,
  rows = 4,
  ...props
}: { label: string; hint?: string; error?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} hint={hint} error={error}>
      <textarea rows={rows} {...props} style={{ ...(error ? invalidInputStyle : inputStyle), resize: "vertical" }} />
    </Field>
  );
}
