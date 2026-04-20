import { Search, Bell } from "lucide-react";
import { Input } from "@/components/ui/input";

export function TopBar() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search clients, campaigns..."
          className="pl-9 bg-accent/50 border-border text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <button className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
          <Bell className="h-4 w-4" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
            3
          </span>
        </button>
      </div>
    </header>
  );
}
