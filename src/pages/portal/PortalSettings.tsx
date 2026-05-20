import { useState } from "react";
import { usePortalClient } from "@/hooks/usePortalClient";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function PortalSettings() {
  const { client } = usePortalClient();
  const { user } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) return toast.error(error.message);
    setNewPassword("");
    toast.success("Password updated");
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Profile, notifications, and security.</p>
      </div>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">Profile</h3>
        <div className="space-y-3">
          <div>
            <Label>Email</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
          <div>
            <Label>Client name</Label>
            <Input value={client?.name ?? ""} disabled />
          </div>
          <div>
            <Label>Brand</Label>
            <Input value={client?.brand ?? ""} disabled />
          </div>
          <p className="text-xs text-muted-foreground">Profile fields are managed by your account manager. Reach out via Support to update.</p>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">Notifications</h3>
        <div className="space-y-3">
          {[
            "Weekly performance snapshot (Tuesdays)",
            "Monthly report (10th of each month)",
            "New approval pending",
            "New lead received",
            "Support ticket update",
            "Invoice generated",
            "Billing reminder (3 days before due)",
          ].map((label, i) => (
            <div key={i} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span className="text-sm">{label}</span>
              <Switch defaultChecked />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Preferences sync on save (coming soon).</p>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">Password</h3>
        <form onSubmit={handlePasswordChange} className="space-y-3 max-w-sm">
          <div>
            <Label htmlFor="np">New password</Label>
            <Input id="np" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </div>
          <Button type="submit" disabled={busy} className="bg-[hsl(var(--primary))]">
            {busy ? "Saving…" : "Update password"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
