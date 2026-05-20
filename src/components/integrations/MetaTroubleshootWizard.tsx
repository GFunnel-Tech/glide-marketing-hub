import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, ExternalLink, LifeBuoy, CheckCircle2, AlertTriangle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

const APP_ID = "122550261945762";
const META_DEVELOPER_APPS_URL = "https://developers.facebook.com/apps/";
const TESTER_ACCEPT_URL = "https://www.facebook.com/settings/?tab=applications";

type Option = { id: string; label: string; hint?: string; next?: string; fix?: Fix };
type Node = { id: string; question: string; subtitle?: string; options: Option[] };
type Fix = {
  title: string;
  tone: "warn" | "bad" | "ok";
  summary: string;
  steps: { text: React.ReactNode; href?: string }[];
  retryHint?: string;
};

const FIXES: Record<string, Fix> = {
  popupBlocked: {
    title: "Browser blocked the popup",
    tone: "warn",
    summary: "Most ad blockers and Safari block the Meta sign-in popup.",
    steps: [
      { text: "Allow popups for this site in your browser address bar (lock icon → Site settings → Pop-ups)." },
      { text: "Disable strict tracking protection / ad blocker for this site." },
      { text: "If on Safari iframe, open the app in a new tab — Safari blocks third-party cookies in iframes." },
      { text: "Then click Connect with Meta again." },
    ],
    retryHint: "Use the Manual access token flow as a guaranteed fallback — no popup needed.",
  },
  oauthLoginLoop: {
    title: "Stuck on Facebook login loop",
    tone: "warn",
    summary: "Facebook keeps asking to log in or shows a blank screen.",
    steps: [
      { text: "Open facebook.com in a normal tab and confirm you're logged in to the right account." },
      { text: "Clear cookies for facebook.com and business.facebook.com, then retry." },
      { text: "Disable any Facebook Container extension (Firefox) — it isolates the popup from your session." },
      { text: "If 2FA is required, complete it on Facebook first, then retry." },
    ],
  },
  oauthFeatureUnavailable: {
    title: "Meta app tester access is missing",
    tone: "bad",
    summary: "If the Meta app is still in Development mode, Facebook only grants ads permissions to app Admins, Developers, or Testers. Facebook often does not show a bell notification for tester invites.",
    steps: [
      { text: "App admin: open Meta for Developers → My Apps → Meta Hub → App roles → Roles, then add this Facebook user as Developer or Tester.", href: META_DEVELOPER_APPS_URL },
      { text: "User: if no notification appears, open Facebook Settings → Apps and Websites, then scroll to Requests and accept the Meta Hub invite.", href: TESTER_ACCEPT_URL },
      { text: "After accepting, click Connect with Meta again and keep every ads permission enabled on the consent screen." },
      { text: "Or switch to the Manual access token flow — System User tokens bypass tester invitations entirely." },
    ],
  },
  oauthScopeDenied: {
    title: "Permissions were denied during sign-in",
    tone: "warn",
    summary: "You unchecked one or more scopes on Meta's consent screen.",
    steps: [
      { text: "Click Connect with Meta again." },
      { text: "On the consent screen, tap 'Edit settings' and re-enable every permission (ads_read, ads_management, business_management, read_insights, leads_retrieval)." },
      { text: "Approve, then return to this tab." },
    ],
  },
  oauthNoAccounts: {
    title: "Connected, but 0 ad accounts appear",
    tone: "warn",
    summary: "Meta returned no ad accounts for this user.",
    steps: [
      { text: "Open Business Settings → Ad Accounts and confirm your user has at least Advertiser access on each.", href: "https://business.facebook.com/settings/ad-accounts" },
      { text: "If accounts belong to client BMs, the client must share them via Partners → Assign assets." },
      { text: "Fix any 'Account disabled' or unsettled billing banners in Ads Manager.", href: "https://adsmanager.facebook.com/" },
      { text: "Click Test on the connection here — no need to reconnect." },
    ],
  },
  manualGenerateGreyed: {
    title: "'Generate New Token' is disabled",
    tone: "bad",
    summary: "The System User can't mint a token until the app is assigned.",
    steps: [
      { text: "Open Business Settings → Apps and click 'Add → Connect an app ID'.", href: "https://business.facebook.com/settings/apps" },
      { text: <>Paste the Meta Hub App ID: <span className="font-mono">{APP_ID}</span></> },
      { text: "Open the System User → Add Assets → Apps → pick Meta Hub → enable Develop app + Manage app." },
      { text: "Reload the System Users page — Generate New Token is now active." },
    ],
  },
  manualVerifyFailsPerms: {
    title: "Verify fails with 'missing permissions'",
    tone: "warn",
    summary: "The token is valid but is missing one or more required scopes.",
    steps: [
      { text: "Re-open the System User and click Generate New Token." },
      { text: "Tick EVERY scope: ads_read, read_insights, ads_management, business_management, leads_retrieval." },
      { text: "If ads_management or business_management is greyed out, the app needs Advanced Access — open App Review.", href: `https://developers.facebook.com/apps/${APP_ID}/app-review/permissions/` },
      { text: "Paste the new token and click Verify again." },
    ],
  },
  manualVerifyFailsExpired: {
    title: "Token expired or invalid",
    tone: "bad",
    summary: "Meta says the token is no longer valid.",
    steps: [
      { text: "If it's a User token from Graph Explorer, it expires in ~1 hour — extend it.", href: "https://developers.facebook.com/tools/debug/accesstoken/" },
      { text: "Better: generate a System User token (Token expiration: Never).", href: "https://business.facebook.com/settings/system-users" },
      { text: "Use Refresh token on the existing connection to swap in the new value without losing client mappings." },
    ],
  },
  manualVerifyFailsMalformed: {
    title: "Token looks malformed",
    tone: "warn",
    summary: "The string isn't being parsed as a valid OAuth token.",
    steps: [
      { text: "Re-copy the token from Business Settings — make sure you clicked 'Show' first (don't copy the masked ••• preview)." },
      { text: "Strip any leading 'Bearer ', surrounding quotes, or trailing whitespace." },
      { text: "Confirm it starts with 'EAA' — if it looks like 'APP_ID|APP_SECRET', that's an App token (won't work)." },
    ],
  },
  manualEdgeFunction500: {
    title: "'Edge Function returned a non-2xx status code'",
    tone: "bad",
    summary: "The server-side connect call crashed. Almost always a token or workspace issue.",
    steps: [
      { text: "Click Verify first (instead of Connect). If Verify fails too, fix the token error it reports." },
      { text: "If Verify succeeds but Connect fails, refresh the page and try again — workspace context may have dropped." },
      { text: "Check the connection list for a stale 'manual' entry from a previous attempt and delete it before reconnecting." },
      { text: "If it still fails, copy the exact Meta error from Verify and share it — that's the real cause." },
    ],
  },
  manualNoAccounts: {
    title: "Connected, but 0 ad accounts discovered",
    tone: "warn",
    summary: "The System User has no ad accounts assigned.",
    steps: [
      { text: "Open the System User in Business Settings.", href: "https://business.facebook.com/settings/system-users" },
      { text: "Click Add Assets → Ad Accounts → select every account you want to sync." },
      { text: "Enable Manage campaigns + View performance (Manage campaigns is required for ads_management)." },
      { text: "For accounts in other BMs, the owning BM must share them first (Ad Accounts → Assign Partner)." },
      { text: "Come back here and click Test on the connection — no need to regenerate the token." },
    ],
  },
  manualPartialAccounts: {
    title: "Some ad accounts missing",
    tone: "warn",
    summary: "Token works, but a subset of accounts isn't showing.",
    steps: [
      { text: "Open the System User → Add Assets → Ad Accounts — tick the missing ones." },
      { text: "If they live in a different BM, that BM admin must share the account to the System User's BM first." },
      { text: "Disabled or unsettled ad accounts are hidden by Meta until billing is resolved.", href: "https://adsmanager.facebook.com/" },
      { text: "Click Test on the connection to re-discover after fixing." },
    ],
  },
  manualWrongTokenType: {
    title: "Wrong token type",
    tone: "bad",
    summary: "App Access Tokens (APP_ID|APP_SECRET) and Page tokens can't read ad data.",
    steps: [
      { text: "Generate a System User token instead — Business Settings → Users → System Users → your user → Generate New Token.", href: "https://business.facebook.com/settings/system-users" },
      { text: "Or use a User token from Graph API Explorer with the Meta Hub app selected.", href: `https://developers.facebook.com/tools/explorer/${APP_ID}/` },
    ],
  },
  syncWorksOnceThenFails: {
    title: "First sync worked, later syncs fail",
    tone: "warn",
    summary: "Token still valid but losing access to specific assets.",
    steps: [
      { text: "Click Test on the connection — it will show which Meta error is being returned." },
      { text: "Common: the user generating the token lost ad-account access (left the BM, role downgraded)." },
      { text: "Common: password change invalidated all User tokens (System User tokens are immune)." },
      { text: "Switch to a System User token and use Refresh token here." },
    ],
  },
  unknown: {
    title: "Let's gather more info",
    tone: "warn",
    summary: "We need the exact error message to diagnose further.",
    steps: [
      { text: "Click Test on the failing connection — it pings Meta and surfaces the literal error." },
      { text: "Or paste the token into the Verify field — Verify shows Meta's verbatim response without saving anything." },
      { text: "Open the Troubleshooting section in the manual-token guide for the full error catalog." },
      { text: "If still stuck, share a screenshot of the error + the connection's last_error from the panel." },
    ],
  },
};

const NODES: Record<string, Node> = {
  start: {
    id: "start",
    question: "Which connection method are you using?",
    subtitle: "Different flows fail in different places — pick what you tried.",
    options: [
      { id: "oauth", label: "Connect with Meta (OAuth popup)", hint: "The blue 'Connect with Meta' button", next: "oauth_where" },
      { id: "manual", label: "Manual access token", hint: "Pasting a token into the field", next: "manual_where" },
      { id: "synced", label: "It connected, but sync is broken", hint: "Token saved, data isn't flowing", next: "sync_where" },
      { id: "unsure", label: "Not sure / haven't tried yet", hint: "Show me which to pick", next: "recommend" },
    ],
  },
  recommend: {
    id: "recommend",
    question: "Which best describes you?",
    options: [
      { id: "agency-owner", label: "I own / am Admin of the Business Manager", hint: "→ Use Manual token (System User). Never expires.", next: "manual_where" },
      { id: "agency-staff", label: "I'm staff with ad-account access but not BM Admin", hint: "→ Use OAuth. Quickest path.", next: "oauth_where" },
      { id: "client-bm", label: "The ad accounts live in a client's BM", hint: "→ Ask the client to share the ad account to your BM first, then use Manual token.", fix: FIXES.manualNoAccounts },
    ],
  },

  oauth_where: {
    id: "oauth_where",
    question: "Where does the OAuth flow break?",
    options: [
      { id: "popup", label: "Popup never opens or closes immediately", next: "oauth_popup" },
      { id: "login", label: "Stuck on Facebook login / loops back", fix: FIXES.oauthLoginLoop },
      { id: "feature", label: "Meta shows 'Feature unavailable'", fix: FIXES.oauthFeatureUnavailable },
      { id: "no-invite", label: "No tester notification / invite link doesn't work", fix: FIXES.oauthFeatureUnavailable },
      { id: "consent", label: "I clicked Cancel or skipped permissions", fix: FIXES.oauthScopeDenied },
    ],
  },
  oauth_popup: {
    id: "oauth_popup",
    question: "Are you using the app in an iframe (embedded in another site)?",
    subtitle: "Safari and most browsers block third-party cookies inside iframes — OAuth often fails there.",
    options: [
      { id: "iframe", label: "Yes, embedded in another site", hint: "→ Open the app in a new tab, or use Manual token", fix: FIXES.popupBlocked },
      { id: "standalone", label: "No, opened directly", next: "oauth_popup_browser" },
    ],
  },
  oauth_popup_browser: {
    id: "oauth_popup_browser",
    question: "What browser are you on?",
    options: [
      { id: "safari", label: "Safari", hint: "Safari blocks popups by default", fix: FIXES.popupBlocked },
      { id: "other", label: "Chrome / Firefox / Edge / Brave", hint: "Check for ad-blocker or popup blocker", fix: FIXES.popupBlocked },
    ],
  },

  manual_where: {
    id: "manual_where",
    question: "Where does the manual flow break?",
    options: [
      { id: "generate", label: "Can't generate the token in Business Settings", next: "manual_generate" },
      { id: "verify", label: "Verify fails", next: "manual_verify" },
      { id: "connect", label: "Verify passes but Connect fails", next: "manual_connect" },
      { id: "accounts", label: "Connected, but missing ad accounts", next: "manual_accounts" },
    ],
  },
  manual_generate: {
    id: "manual_generate",
    question: "What exactly is wrong on the Generate Token screen?",
    options: [
      { id: "greyed", label: "'Generate New Token' button is greyed out", fix: FIXES.manualGenerateGreyed },
      { id: "no-app", label: "Meta Hub doesn't appear in the app dropdown", fix: FIXES.manualGenerateGreyed },
      { id: "scopes", label: "Some scopes are greyed out / unavailable", fix: FIXES.manualVerifyFailsPerms },
      { id: "wrong-type", label: "I generated an App token by accident", fix: FIXES.manualWrongTokenType },
    ],
  },
  manual_verify: {
    id: "manual_verify",
    question: "What error does Verify show?",
    options: [
      { id: "perms", label: "Missing required permissions / scopes", fix: FIXES.manualVerifyFailsPerms },
      { id: "expired", label: "Token expired / session has expired (code 190 or 463)", fix: FIXES.manualVerifyFailsExpired },
      { id: "malformed", label: "Invalid OAuth access token / malformed", fix: FIXES.manualVerifyFailsMalformed },
      { id: "wrong-type", label: "Application does not have permission / app token", fix: FIXES.manualWrongTokenType },
    ],
  },
  manual_connect: {
    id: "manual_connect",
    question: "What does Connect say?",
    options: [
      { id: "edge500", label: "'Edge Function returned a non-2xx status code'", fix: FIXES.manualEdgeFunction500 },
      { id: "noaccounts", label: "Connected with 0 ad accounts", fix: FIXES.manualNoAccounts },
      { id: "other", label: "Different error — I need to gather more info", fix: FIXES.unknown },
    ],
  },
  manual_accounts: {
    id: "manual_accounts",
    question: "How many ad accounts came through?",
    options: [
      { id: "zero", label: "Zero accounts discovered", fix: FIXES.manualNoAccounts },
      { id: "some", label: "Some, but specific ones are missing", fix: FIXES.manualPartialAccounts },
      { id: "wrong-bm", label: "Accounts from one BM imported, others didn't", fix: FIXES.manualPartialAccounts },
    ],
  },

  sync_where: {
    id: "sync_where",
    question: "Describe the sync issue",
    options: [
      { id: "neverwork", label: "Sync has never succeeded", next: "manual_where" },
      { id: "stopped", label: "Worked initially, now fails", fix: FIXES.syncWorksOnceThenFails },
      { id: "partial", label: "Most accounts sync, a few error out", fix: FIXES.manualPartialAccounts },
      { id: "unknown-err", label: "Unclear error message", fix: FIXES.unknown },
    ],
  },
};

export function MetaTroubleshootWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [stack, setStack] = useState<string[]>(["start"]);
  const [fix, setFix] = useState<Fix | null>(null);

  const currentId = stack[stack.length - 1];
  const node = NODES[currentId];

  const reset = () => {
    setStack(["start"]);
    setFix(null);
  };

  const handleOption = (opt: Option) => {
    if (opt.fix) {
      setFix(opt.fix);
    } else if (opt.next && NODES[opt.next]) {
      setStack(s => [...s, opt.next!]);
    }
  };

  const back = () => {
    if (fix) { setFix(null); return; }
    if (stack.length > 1) setStack(s => s.slice(0, -1));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-warning" />
            Meta connection troubleshooter
          </DialogTitle>
          <DialogDescription>
            Answer a few questions and we'll point you to the exact fix.
          </DialogDescription>
        </DialogHeader>

        {fix ? (
          <FixCard fix={fix} />
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{node.question}</p>
              {node.subtitle && (
                <p className="text-xs text-muted-foreground mt-1">{node.subtitle}</p>
              )}
            </div>
            <ul className="space-y-2">
              {node.options.map(opt => (
                <li key={opt.id}>
                  <button
                    onClick={() => handleOption(opt)}
                    className="w-full text-left rounded-md border border-border bg-card hover:border-primary hover:bg-accent/40 transition-colors p-3 group"
                  >
                    <div className="flex items-start gap-2">
                      <ArrowRight className="h-3.5 w-3.5 mt-0.5 text-muted-foreground group-hover:text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{opt.label}</p>
                        {opt.hint && (
                          <p className="text-xs text-muted-foreground mt-0.5">{opt.hint}</p>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={back}
            disabled={stack.length === 1 && !fix}
          >
            <ArrowLeft className="h-3 w-3 mr-1" /> Back
          </Button>
          <div className="text-[10px] text-muted-foreground">
            Step {fix ? stack.length + 1 : stack.length}
          </div>
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="h-3 w-3 mr-1" /> Start over
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FixCard({ fix }: { fix: Fix }) {
  const toneClass =
    fix.tone === "bad"
      ? "border-destructive/40 bg-destructive/10"
      : fix.tone === "warn"
      ? "border-warning/40 bg-warning/10"
      : "border-success/40 bg-success/10";
  const Icon = fix.tone === "ok" ? CheckCircle2 : AlertTriangle;
  const iconColor =
    fix.tone === "bad" ? "text-destructive" : fix.tone === "warn" ? "text-warning" : "text-success";

  return (
    <div className={cn("rounded-md border p-3 space-y-2.5", toneClass)}>
      <div className="flex items-start gap-2">
        <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", iconColor)} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{fix.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{fix.summary}</p>
        </div>
      </div>
      <ol className="space-y-1.5 text-xs">
        {fix.steps.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="shrink-0 h-4 w-4 rounded-full bg-background border border-border text-[10px] font-semibold flex items-center justify-center text-foreground">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <span className="text-foreground">{s.text}</span>
              {s.href && (
                <a
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-primary hover:underline ml-1"
                >
                  Open <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
      {fix.retryHint && (
        <p className="text-[11px] italic text-muted-foreground border-t border-border/60 pt-2">
          💡 {fix.retryHint}
        </p>
      )}
    </div>
  );
}
