import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, ShieldCheck, Mail, UserCheck, KeyRound, RefreshCw, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RoleKey = "tester" | "developer" | "admin";

const ROLES: {
  key: RoleKey;
  label: string;
  badge: string;
  who: string;
  steps: { title: string; detail: string; href?: string }[];
}[] = [
  {
    key: "admin",
    label: "Admin",
    badge: "bg-destructive/15 text-destructive border-destructive/30",
    who: "App owner inviting you — they perform step 1, you accept in steps 2–3.",
    steps: [
      {
        title: "Owner adds you in App Dashboard → Roles → Roles",
        detail: "They click \"Add Admins\" and enter your Facebook account or email associated with your developer account.",
        href: "https://developers.facebook.com/apps/",
      },
      {
        title: "Open the Facebook notification or email invite",
        detail: "Look for \"You've been invited to be an Admin on <App Name>\". Click View Request.",
        href: "https://www.facebook.com/settings?tab=requests",
      },
      {
        title: "Click Accept on the request page",
        detail: "You'll see the app name and the role (Admin). Click Accept — you may be prompted to re-enter your Facebook password.",
      },
      {
        title: "Confirm you're listed under Roles",
        detail: "Return to App Dashboard → Roles → Roles. Your name should appear under Administrators with status Active (not Pending).",
        href: "https://developers.facebook.com/apps/",
      },
      {
        title: "Reconnect from Lovable",
        detail: "Click Connect with Meta again. The OAuth screen should now list all advanced scopes without greying them out.",
      },
    ],
  },
  {
    key: "developer",
    label: "Developer",
    badge: "bg-primary/15 text-primary border-primary/30",
    who: "You need to read/sync ad data but not change app settings.",
    steps: [
      {
        title: "Owner adds you under Roles → Roles → Add Developers",
        detail: "They enter your Facebook user ID or email and submit.",
        href: "https://developers.facebook.com/apps/",
      },
      {
        title: "Accept the invite at facebook.com/settings (Requests tab)",
        detail: "Click View on the developer request, then Accept.",
        href: "https://www.facebook.com/settings?tab=requests",
      },
      {
        title: "Verify your account in App Dashboard",
        detail: "Some apps require two-factor authentication and a verified developer account before the role activates.",
        href: "https://developers.facebook.com/settings/developer/",
      },
      {
        title: "Reconnect from Lovable",
        detail: "Use Connect with Meta. If scopes are still greyed out, the app is likely in Development mode — ask the Admin to switch it to Live or add you as a Tester (next tab).",
      },
    ],
  },
  {
    key: "tester",
    label: "Tester",
    badge: "bg-warning/15 text-warning border-warning/30",
    who: "Quickest path while the app is in Development mode — lets you OAuth before App Review.",
    steps: [
      {
        title: "Owner invites you under Roles → Roles → Add Testers",
        detail: "Testers can use the app in Development mode and authorise all requested scopes (including advanced-access ones) without App Review.",
        href: "https://developers.facebook.com/apps/",
      },
      {
        title: "Accept the Tester request",
        detail: "Open the notification or facebook.com/settings → Requests tab → click Accept on the Tester invite.",
        href: "https://www.facebook.com/settings?tab=requests",
      },
      {
        title: "(If asked) accept Business Manager invite too",
        detail: "If the ad accounts live in a Business Manager, also accept the BM invite at business.facebook.com/settings/people.",
        href: "https://business.facebook.com/settings/people",
      },
      {
        title: "Reconnect from Lovable within 24h",
        detail: "Tester role activates immediately. Click Connect with Meta and tick every scope on the consent screen.",
      },
    ],
  },
];

const COMMON_PITFALLS = [
  "Request still says Pending — check facebook.com/settings → Requests, not your inbox.",
  "Wrong Facebook account — the invite was sent to a personal account, but you logged in with a different one.",
  "Two-factor auth not enabled on the developer account (required for Admin/Developer roles).",
  "App is in Development mode and you're not added as Tester/Developer/Admin → OAuth screen will say \"App not active\".",
  "You accepted the role but the Business Manager invite is still pending → scopes work but no ad accounts appear.",
];

export function MetaAppRolePanel() {
  const [openRole, setOpenRole] = useState<RoleKey>("tester");
  const [pitfallsOpen, setPitfallsOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Accept your Meta Developer app role before reconnecting
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            If Meta's consent screen greys out scopes, blocks the OAuth window, or says "App not active", you almost
            always need to accept a pending role invite first. Pick your role below for the exact step-by-step.
          </p>
        </div>
        <a
          href="https://www.facebook.com/settings?tab=requests"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0"
        >
          <Button size="sm" variant="outline">
            <Mail className="h-3 w-3" />
            <span className="ml-1">Open Facebook Requests</span>
            <ExternalLink className="h-3 w-3 ml-1 opacity-70" />
          </Button>
        </a>
      </div>

      {/* Role tabs */}
      <div className="flex gap-1.5 flex-wrap border-b border-border pb-2">
        {ROLES.map(r => (
          <button
            key={r.key}
            onClick={() => setOpenRole(r.key)}
            className={cn(
              "text-xs font-medium px-3 py-1.5 rounded-md border transition-colors",
              openRole === r.key
                ? r.badge
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {ROLES.filter(r => r.key === openRole).map(r => (
        <div key={r.key} className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <UserCheck className="h-3.5 w-3.5" />
            <span>{r.who}</span>
          </div>

          <ol className="space-y-2">
            {r.steps.map((s, i) => (
              <li
                key={i}
                className="flex gap-3 rounded-md border border-border bg-background p-3"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  {i + 1}
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium text-foreground">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.detail}</p>
                  {s.href && (
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      Open in Meta
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3">
            <RefreshCw className="h-4 w-4 text-primary shrink-0" />
            <p className="text-xs text-foreground">
              Once the role shows <Badge variant="secondary" className="mx-1 text-[10px]">Active</Badge>
              in App Dashboard → Roles, come back here and click <span className="font-semibold">Connect with Meta</span>.
            </p>
          </div>
        </div>
      ))}

      {/* Pitfalls accordion */}
      <div className="border-t border-border pt-3">
        <button
          onClick={() => setPitfallsOpen(o => !o)}
          className="flex items-center gap-2 text-xs font-medium text-foreground hover:text-primary transition-colors"
        >
          {pitfallsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <AlertTriangle className="h-3.5 w-3.5 text-warning" />
          Common reasons the role doesn't activate
        </button>
        {pitfallsOpen && (
          <ul className="mt-2 ml-5 space-y-1.5 text-xs text-muted-foreground list-disc">
            {COMMON_PITFALLS.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <KeyRound className="h-3 w-3" />
        Don't know your role? Ask the app owner to check{" "}
        <a
          href="https://developers.facebook.com/apps/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          App Dashboard → Roles
        </a>
        .
      </div>
    </div>
  );
}
