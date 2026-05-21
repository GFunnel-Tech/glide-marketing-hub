import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export default function PortalAuth() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const initialMode = (params.get("mode") as "signin" | "signup") ?? "signin";
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState(params.get("code") ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      // If they signed in and brought a code, send through accept flow
      if (code) navigate(`/portal/accept?token=${encodeURIComponent(code)}`, { replace: true });
      else navigate("/portal", { replace: true });
    }
  }, [user, navigate, code]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return toast.error("Invite code is required to sign up");
    setBusy(true);
    // Validate code first
    const { data: lookup, error: lerr } = await supabase.rpc("lookup_client_invite", { _code_or_token: code.trim() });
    if (lerr || !(lookup as any)?.valid) {
      setBusy(false);
      return toast.error(`Invalid code: ${(lookup as any)?.reason ?? lerr?.message ?? "unknown"}`);
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/portal/accept?token=${encodeURIComponent(code.trim())}`,
        data: { display_name: name },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created — check your email to confirm, then your invite will be applied automatically.");
  };

  const handleForgot = async () => {
    if (!email) return toast.error("Enter your email first");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/portal/reset-password`,
    });
    if (error) return toast.error(error.message);
    toast.success("Password reset email sent");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-lg bg-[#1B3F7B] text-white flex items-center justify-center font-bold text-xl">P</div>
          <h1 className="text-2xl font-semibold text-[#0F172A]">Client Portal</h1>
          <p className="text-sm text-[#64748B] mt-1">
            {mode === "signin" ? "Sign in to your account" : "Create your portal account"}
          </p>
        </div>

        <div className="flex gap-1 mb-4 p-1 rounded-md bg-muted">
          <button
            onClick={() => setMode("signin")}
            className={`flex-1 text-sm py-1.5 rounded ${mode === "signin" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
          >
            Sign in
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 text-sm py-1.5 rounded ${mode === "signup" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
          >
            New account
          </button>
        </div>

        <form onSubmit={mode === "signin" ? handleSignIn : handleSignUp} className="space-y-3">
          {mode === "signup" && (
            <>
              <div>
                <Label htmlFor="code">Invite code</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. K9PQXR4N"
                  required
                />
                <p className="text-[11px] text-muted-foreground mt-1">Provided by your agency.</p>
              </div>
              <div>
                <Label htmlFor="name">Your name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            </>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={mode === "signup" ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full bg-[#1B3F7B] hover:bg-[#1B3F7B]/90" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
          {mode === "signin" && (
            <button type="button" onClick={handleForgot} className="block w-full text-center text-sm text-[#2563EB] hover:underline">
              Forgot password?
            </button>
          )}
        </form>

        <p className="mt-6 text-center text-xs text-[#64748B]">
          Have an invite link? <Link to="/portal/accept" className="text-[#2563EB] hover:underline">Open it here</Link>.
        </p>
      </Card>
    </div>
  );
}
