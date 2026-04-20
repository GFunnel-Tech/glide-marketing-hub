import { LogOut, Settings as SettingsIcon, User as UserIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const initials = (user?.user_metadata?.display_name || user?.email || "U")
    .split(" ").map((s: string) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground text-xs font-semibold shadow-card hover:shadow-glow transition-shadow">
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-sm font-medium truncate">{user?.user_metadata?.display_name || "Account"}</span>
            <span className="text-xs text-muted-foreground truncate">{user?.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/settings")} className="cursor-pointer">
          <UserIcon className="mr-2 h-4 w-4" /> Profile & workspace
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/settings")} className="cursor-pointer">
          <SettingsIcon className="mr-2 h-4 w-4" /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive">
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
