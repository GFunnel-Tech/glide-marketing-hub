import { useState, useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

export function AlertBanner() {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem("emm-alert-dismissed") === "true";
  });

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem("emm-alert-dismissed", "true");
  };

  if (dismissed) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg bg-destructive px-4 py-3 text-destructive-foreground">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <p className="flex-1 text-sm font-medium">
        <strong>Agency BM Alert</strong> — Paul Healey's banned account is active inside the EMM Agency BM. This is degrading CPM for 8 clients.{" "}
        <button className="underline underline-offset-2 hover:opacity-80">Remove Account →</button>
      </p>
      <button onClick={dismiss} className="shrink-0 hover:opacity-80">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
