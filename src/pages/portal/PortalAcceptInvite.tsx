import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type LookupResult =
  | { valid: true; invite_id: string; client_id: number; client_name: string; client_brand: string; email: string | null; expires_at: string }
  | { valid: false; reason: string };

export default function PortalAcceptInvite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const token = params.get("token") ?? params.get("code") ?? "";
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) {
        setLookup({ valid: false, reason: "missing_token" });
        return;
      }
      const { data, error } = await supabase.rpc("lookup_client_invite", { _code_or_token: token });
      if (error) {
        setLookup({ valid: false, reason: error.message });
      } else {
        setLookup(data as unknown as LookupResult);
        if (data && (data as any).valid && (data as any).email) setEmail((data as any).email);
      }
    })();
  }, [token]);

  // Once user is authenticated, redeem invite
  useEffect(() => {
    if (!user || !lookup || !("valid" in lookup) || !lookup.valid) return;
    (async () => {
      const { data, error } = await supabase.rpc("redeem_client_invite", { _code_or_token: token });
      if (error) {
        toast.error(error.message);
        return;
      }
      const result = data as any;
      if (result?.ok) {
        toast.success(result.already_linked ? "Already linked to this client" : "Invite accepted");
        navigate("/portal", { replace: true });
      } else {
        toast.error(`Invite ${result?.reason ?? "invalid"}`);
      }
    })();
  }, [user, lookup, token, navigate]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/portal/accept?token=${token}`,
        data: { display_name: name },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created — check your email to confirm, then return to this link.");
  };

  const handleSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
  };

  if (!lookup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!lookup.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
          <h1 className="text-xl font-semibold mb-2">Invite invalid</h1>
          <p className="text-sm text-muted-foreground mb-4">
            This invite is <strong>{lookup.reason}</strong>. Please contact your account manager for a fresh invite link.
          </p>
          <Button variant="outline" onClick={() => navigate("/portal/login")}>Go to sign in</Button>
        </Card>
      </div>
    );
  }

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto mb-3" />
          <p className="text-sm">Linking your account to {lookup.client_name}…</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-[#0F172A]">You're invited to {lookup.client_name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "signup" ? "Create your portal account" : "Sign in to accept this invite"}
          </p>
        </div>

        <div className="flex gap-1 mb-4 p-1 rounded-md bg-muted">
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 text-sm py-1.5 rounded ${mode === "signup" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
          >
            New account
          </button>
          <button
            onClick={() => setMode("signin")}
            className={`flex-1 text-sm py-1.5 rounded ${mode === "signin" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
          >
            I have an account
          </button>
        </div>

        <form onSubmit={mode === "signup" ? handleSignup : handleSignin} className="space-y-3">
          {mode === "signup" && (
            <div>
              <Label htmlFor="name">Your name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <Button type="submit" className="w-full bg-[#1B3F7B] hover:bg-[#1B3F7B]/90" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signup" ? "Create account" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
