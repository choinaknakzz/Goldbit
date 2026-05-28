import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ReverseModeWarning({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-400/25 bg-red-500/10 p-4 text-red-100">
      <AlertTriangle className="mt-0.5 h-5 w-5" />
      <div>
        <Badge variant="danger">Reverse Mode Alert</Badge>
        <div className="mt-2 space-y-1 text-sm">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
