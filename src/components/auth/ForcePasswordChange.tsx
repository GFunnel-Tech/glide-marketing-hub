import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";

/**
 * Blocks the app for accounts flagged with profiles.must_change_password
 * (e.g. admin-created users given a temporary password) until they set
 * their own password.
 */
export function ForcePasswordChange({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [required, setRequired] = useState<boolean | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setRequired(false);
      return;
    }
    supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setRequired(!!(data as any)?.must_change_password);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (required !== true) return <>{children}</>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password,
        current_password: currentPassword,
      } as any);
      if (error) throw error;
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ must_change_password: false } as any)
        .eq("id", user!.id);
      if (pErr) throw pErr;
      toast.success("Password updated");
      setRequired(false);
    } catch (err: any) {
      toast.error(err.message || "Could not update password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-6">
      <Card className="w-full max-w-md p-6 shadow-elegant border-border/60">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Set a new password</h1>
            <p className="text-sm text-muted-foreground">
              Your account uses a temporary password. Choose a new one to continue.
            </p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cur">Temporary password</Label>
            <Input
              id="cur"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new">New password</Label>
            <Input
              id="new"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input
              id="confirm"
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat new password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update password
          </Button>
        </form>
      </Card>
    </div>
  );
}
