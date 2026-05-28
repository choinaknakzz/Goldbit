import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "gold" | "danger" | "muted";

const variants: Record<BadgeVariant, string> = {
  default: "border-border bg-secondary text-secondary-foreground",
  gold: "border-amber-400/35 bg-amber-400/10 text-amber-200",
  danger: "border-red-400/35 bg-red-500/10 text-red-200",
  muted: "border-white/10 bg-white/5 text-muted-foreground",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium", variants[variant], className)}
      {...props}
    />
  );
}
