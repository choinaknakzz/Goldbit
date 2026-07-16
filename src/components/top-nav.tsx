import Link from "next/link";
import { navItems } from "@/components/app-sidebar";
import { Badge } from "@/components/ui/badge";

export function TopNav() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/85 px-4 py-4 backdrop-blur sm:px-5 lg:ml-64">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">GoldOrbit</p>
          <h1 className="text-lg font-semibold text-foreground sm:text-xl">SOXL Infinite Buying V4.0</h1>
        </div>
        <Badge variant="gold">Manual orders only</Badge>
      </div>
      <nav className="mt-4 flex flex-wrap gap-1.5 sm:gap-2 lg:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-white/[0.03] px-2.5 py-2 text-xs font-medium text-zinc-300 transition hover:border-amber-300/50 hover:text-amber-100 sm:gap-2 sm:px-3 sm:text-sm"
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
