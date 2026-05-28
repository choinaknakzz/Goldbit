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
    </header>
  );
}
