import * as React from "react";
import { cn } from "@/lib/utils";

export function Button({
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-amber-300/30 bg-amber-300 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
