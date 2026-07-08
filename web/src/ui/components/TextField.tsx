import type { InputHTMLAttributes, ReactNode } from "react";

export function TextField({
  label,
  trailing,
  ...rest
}: { label: string; trailing?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="fb-field">
      <label htmlFor={rest.id ?? label}>{label}</label>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input id={rest.id ?? label} aria-label={label} style={{ flex: 1 }} {...rest} />
        {trailing ? <span style={{ position: "absolute", right: 10 }}>{trailing}</span> : null}
      </div>
    </div>
  );
}
