import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-medium text-muted-foreground", className)} {...props} />;
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20",
        className,
      )}
      {...props}
    />
  );
}
