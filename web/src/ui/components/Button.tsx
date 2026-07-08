import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  children,
  variant = "primary",
  ...rest
}: { children: ReactNode; variant?: "primary" | "secondary" } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={variant === "secondary" ? "fb-btn sec" : "fb-btn"} {...rest}>
      {children}
    </button>
  );
}
