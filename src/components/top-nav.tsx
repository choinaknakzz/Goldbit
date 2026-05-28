import Link from "next/link";
import { navItems } from "@/components/app-sidebar";
import { Badge } from "@/components/ui/badge";

export function TopNav() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/85 px-5 py-4 backdrop-blur lg:ml-64">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">GoldOrbit</p>
          <h1 className="text-xl font-semibold text-foreground">SOXL Infinite Buying V4.0</h1>
        </div>
        <Badge variant="gold">Manual orders only</Badge>
      </div>
      <nav className="mt-4 flex flex-wrap gap-2 lg:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex shrink-0 items-center gap-2 rounded-md border border-border bg-white/[0.03] px-3 py-2 text-sm font-medium text-zinc-300 transition hover:border-amber-300/50 hover:text-amber-100"
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
