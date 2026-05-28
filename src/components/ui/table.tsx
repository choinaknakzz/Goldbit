import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full caption-bottom text-sm", className)} {...props} />;
}

export const THead = (props: React.HTMLAttributes<HTMLTableSectionElement>) => <thead {...props} />;
export const TBody = (props: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody {...props} />;
export const TR = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn("border-b border-border transition-colors hover:bg-white/[0.03]", className)} {...props} />
);
export const TH = ({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn("h-10 px-3 text-left text-xs font-medium uppercase text-muted-foreground", className)} {...props} />
);
export const TD = ({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("px-3 py-3 align-middle text-foreground", className)} {...props} />
);
