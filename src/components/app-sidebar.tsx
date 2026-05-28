import Link from "next/link";
import { BarChart3, BookOpenText, ClipboardList, Home, Settings, TrendingUp } from "lucide-react";

export const navItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/today", label: "Today", icon: ClipboardList },
  { href: "/trades", label: "Trades", icon: TrendingUp },
  { href: "/history", label: "History", icon: BarChart3 },
  { href: "/logic", label: "Logic", icon: BookOpenText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-zinc-950/95 px-4 py-6 lg:block">
      <div className="mb-8">
        <p className="text-2xl font-bold text-amber-200">Goldbit</p>
        <p className="text-sm text-muted-foreground">Mine gains, loop by loop.</p>
      </div>
      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 hover:text-amber-100"
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
