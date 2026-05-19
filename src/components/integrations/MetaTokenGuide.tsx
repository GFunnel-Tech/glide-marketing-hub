import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Copy, Check, BookOpen, LifeBuoy, ClipboardList, ArrowDown, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SCOPES = [
  "ads_read",
  "read_insights",
  "ads_management",
  "business_management",
  "leads_retrieval",
];

const APP_ID = "122550261945762";

type Step = {
  title: string;
  body: React.ReactNode;
  link?: { href: string; label: string };
};

type TabKey = "system" | "user";
const TAB_STORAGE_KEY = "metahub:meta-token-guide:last-tab";

export function MetaTokenGuide({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<TabKey>(() => {
    if (typeof window === "undefined") return "system";
    const stored = window.localStorage.getItem(TAB_STORAGE_KEY);
    return stored === "user" || stored === "system" ? stored : "system";
  });
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    try { window.localStorage.setItem(TAB_STORAGE_KEY, tab); } catch { /* ignore */ }
  }, [tab]);

  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const systemSteps: Step[] = [
    {
      title: "Open Meta Business Settings",
      body: <>Sign in with the Facebook account that owns your Business Manager.</>,
      link: { href: "https://business.facebook.com/settings", label: "business.facebook.com/settings" },
    },
    {
      title: "Add the Meta Hub app to your Business Manager",
      body: (
        <>
          Go to <span className="font-medium text-foreground">Accounts → Apps</span> →{" "}
          <span className="font-medium text-foreground">Add → Connect an app ID</span> and paste the
          Meta Hub <span className="font-mono">App ID</span> shown below. Skip this if it's already listed.
          Without this step, the app won't appear in the token generator dropdown.
        </>
      ),
      link: { href: "https://business.facebook.com/settings/apps", label: "Open Business Settings → Apps" },
    },
    {
      title: "Create or select a System User",
      body: (
        <>
          Go to <span className="font-medium text-foreground">Users → System Users</span>. Click{" "}
          <span className="font-medium text-foreground">Add</span>, give it a name (e.g. "Meta Hub"),
          and set role to <span className="font-medium text-foreground">Admin</span>.
        </>
      ),
      link: { href: "https://business.facebook.com/settings/system-users", label: "Open System Users" },
    },
    {
      title: "Assign the Meta Hub app to the System User",
      body: (
        <>
          Click the system user → <span className="font-medium text-foreground">Add Assets</span> →{" "}
          <span className="font-medium text-foreground">Apps</span>. Select{" "}
          <span className="font-medium text-foreground">Meta Hub</span> and enable{" "}
          <span className="font-medium text-foreground">Develop app</span> and{" "}
          <span className="font-medium text-foreground">Manage app</span>. If you skip this, Meta will
          reject the token with "Application does not have permission".
        </>
      ),
    },
    {
      title: "Assign ad accounts to the System User",
      body: (
        <>
          Same system user → <span className="font-medium text-foreground">Add Assets</span> →{" "}
          <span className="font-medium text-foreground">Ad Accounts</span>. Select every ad account
          you want Meta Hub to read, then enable{" "}
          <span className="font-medium text-foreground">Manage campaigns</span> &{" "}
          <span className="font-medium text-foreground">View performance</span>. Without this, the
          token connects but discovers <span className="text-foreground font-medium">0 ad accounts</span>.
        </>
      ),
    },
    {
      title: "Generate the access token",
      body: (
        <>
          On the system user page, click <span className="font-medium text-foreground">Generate New Token</span>.
          Pick <span className="font-medium text-foreground">Meta Hub</span> from the app dropdown, set{" "}
          <span className="font-medium text-foreground">Token expiration: Never</span>, and check every
          scope listed below.
        </>
      ),
    },
    {
      title: "Copy & paste it into the field above",
      body: (
        <>
          Copy the token (you'll only see it once) and paste it into the{" "}
          <span className="font-medium text-foreground">Manual access token</span> field, then click{" "}
          <span className="font-medium text-foreground">Verify</span> →{" "}
          <span className="font-medium text-foreground">Connect</span>.
        </>
      ),
    },
  ];

  const userSteps: Step[] = [
    {
      title: "Open Graph API Explorer",
      body: <>Pick the Meta Hub app from the top-right dropdown.</>,
      link: { href: `https://developers.facebook.com/tools/explorer/${APP_ID}/`, label: "Graph API Explorer" },
    },
    {
      title: "Add the required permissions",
      body: (
        <>
          Click <span className="font-medium text-foreground">Add a Permission</span> and check each scope listed
          below. Then click <span className="font-medium text-foreground">Generate Access Token</span> and
          approve the prompt.
        </>
      ),
    },
    {
      title: "Extend it to a 60-day token",
      body: (
        <>
          Short tokens last ~1 hour. Open the{" "}
          <a
            className="text-primary hover:underline inline-flex items-center gap-0.5"
            href="https://developers.facebook.com/tools/debug/accesstoken/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Access Token Debugger <ExternalLink className="h-3 w-3" />
          </a>
          , paste the token, then click{" "}
          <span className="font-medium text-foreground">Extend Access Token</span>.
        </>
      ),
    },
    {
      title: "Paste the long-lived token above",
      body: (
        <>
          Paste into the <span className="font-medium text-foreground">Manual access token</span> field,
          click <span className="font-medium text-foreground">Verify</span>, then{" "}
          <span className="font-medium text-foreground">Connect</span>.
        </>
      ),
    },
  ];

  const steps = tab === "system" ? systemSteps : userSteps;

  return (
    <div className="rounded-md border border-border bg-background/40">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/40 transition-colors"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <BookOpen className="h-3.5 w-3.5 text-primary" />
        <span>How to get a Meta access token</span>
        <span className="ml-auto text-[10px] text-muted-foreground">~3 min</span>
      </button>

      {open && (
        <div className="border-t border-border p-3 space-y-3">
          {/* Prerequisites checklist */}
          <PrereqChecklist tab={tab} />

          {/* Tabs */}
          <div className="flex gap-1 rounded bg-muted/40 p-0.5">
            <TabBtn active={tab === "system"} onClick={() => setTab("system")}>
              System User token
              <span className="ml-1 text-[10px] text-success">Recommended · never expires</span>
            </TabBtn>
            <TabBtn active={tab === "user"} onClick={() => setTab("user")}>
              User token
              <span className="ml-1 text-[10px] text-muted-foreground">60 days</span>
            </TabBtn>
          </div>

          {/* Steps */}
          <ol className="space-y-2.5">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                <div className="flex-1 space-y-1 text-xs text-muted-foreground leading-relaxed">
                  <p className="font-medium text-foreground">{s.title}</p>
                  <p>{s.body}</p>
                  {s.link && (
                    <a
                      href={s.link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline text-[11px]"
                    >
                      {s.link.label} <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {/* Where to paste callout */}
          <div className="rounded-md border border-primary/40 bg-primary/5 p-2.5 flex items-start gap-2">
            <ArrowDown className="h-4 w-4 text-primary shrink-0 mt-0.5 animate-bounce" />
            <div className="text-xs leading-relaxed">
              <p className="font-semibold text-foreground">Where to paste the token</p>
              <p className="text-muted-foreground">
                Scroll down to the <span className="font-medium text-foreground">Manual access token</span> field
                directly below this guide. Paste your token there, click{" "}
                <span className="font-medium text-foreground">Verify</span> to confirm permissions, then click{" "}
                <span className="font-medium text-foreground">Connect</span> to save it to this workspace.
              </p>
            </div>
          </div>


          {/* App ID + scopes */}
          <div className="rounded border border-border bg-muted/30 p-2.5 space-y-2">
            <CopyRow label="Meta Hub App ID" value={APP_ID} copied={copied === "app"} onCopy={() => copy("app", APP_ID)} />
            <div>
              <p className="text-[11px] font-medium text-foreground mb-1">Required scopes</p>
              <div className="flex flex-wrap gap-1">
                {SCOPES.map(s => (
                  <button
                    key={s}
                    onClick={() => copy(s, s)}
                    className="text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5 hover:border-primary transition-colors flex items-center gap-1"
                    title="Click to copy"
                  >
                    {s}
                    {copied === s ? <Check className="h-2.5 w-2.5 text-success" /> : <Copy className="h-2.5 w-2.5 opacity-50" />}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                <span className="font-mono">ads_read</span> + <span className="font-mono">read_insights</span> are
                required. The rest unlock lead pulls and campaign edits.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              asChild
              size="sm"
              variant="outline"
              className="text-xs h-7"
            >
              <a
                href={tab === "system" ? "https://business.facebook.com/settings/system-users" : `https://developers.facebook.com/tools/explorer/${APP_ID}/`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open {tab === "system" ? "Business Settings" : "Graph Explorer"}
                <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </Button>
          </div>

          <Troubleshooting />
        </div>
      )}
    </div>
  );
}

type TroubleshootBranch = { when: React.ReactNode; then: React.ReactNode };
type TroubleshootEntry = {
  issue: string;
  fix?: React.ReactNode;
  branches?: TroubleshootBranch[];
};

const TROUBLESHOOTING: TroubleshootEntry[] = [
  {
    issue: "“Generate New Token” is greyed out / disabled",
    branches: [
      {
        when: <>The <span className="font-medium text-foreground">app dropdown is empty</span> or Meta Hub isn't listed</>,
        then: (
          <>
            The Meta Hub app isn't connected to your Business Manager yet. Open{" "}
            <a className="text-primary hover:underline" href="https://business.facebook.com/settings/apps" target="_blank" rel="noreferrer">Business Settings → Apps</a>{" "}
            → <span className="font-medium text-foreground">Add → Connect an app ID</span> and paste{" "}
            <span className="font-mono">{APP_ID}</span>. Reload the System Users page after.
          </>
        ),
      },
      {
        when: <>The app is listed but the <span className="font-medium text-foreground">button stays disabled</span></>,
        then: (
          <>
            The System User doesn't have the app assigned. Click the user →{" "}
            <span className="font-medium text-foreground">Add Assets → Apps</span>, pick{" "}
            <span className="font-medium text-foreground">Meta Hub</span>, and enable both{" "}
            <span className="font-medium text-foreground">Develop app</span> and{" "}
            <span className="font-medium text-foreground">Manage app</span>.
          </>
        ),
      },
      {
        when: <>You see <span className="font-medium text-foreground">“You need to finish setting up your business”</span></>,
        then: (
          <>
            Meta requires business verification before issuing long-lived tokens. Open{" "}
            <a className="text-primary hover:underline" href="https://business.facebook.com/settings/security" target="_blank" rel="noreferrer">Security Center</a>{" "}
            and complete the pending tasks (verify email, accept terms, confirm 2FA), then retry.
          </>
        ),
      },
      {
        when: <>Your role on the System User is <span className="font-medium text-foreground">Employee</span></>,
        then: (
          <>
            Only an <span className="font-medium text-foreground">Admin</span> System User can mint tokens with{" "}
            <span className="font-mono">ads_management</span> / <span className="font-mono">business_management</span>.
            Edit the user and switch role to Admin, or create a new Admin System User.
          </>
        ),
      },
    ],
  },
  {
    issue: "Verify fails with “missing required permissions”",
    branches: [
      {
        when: <>It complains about <span className="font-mono">ads_read</span> or <span className="font-mono">read_insights</span></>,
        then: (
          <>
            Re-generate the token and tick <span className="font-medium text-foreground">every</span> scope shown above
            before clicking <span className="font-medium text-foreground">Generate</span>. Meta silently drops scopes
            you didn't pre-approve on the app.
          </>
        ),
      },
      {
        when: <>It complains about <span className="font-mono">ads_management</span> or <span className="font-mono">business_management</span></>,
        then: (
          <>
            These are advanced-access scopes. Open{" "}
            <a className="text-primary hover:underline" href={`https://developers.facebook.com/apps/${APP_ID}/app-review/permissions/`} target="_blank" rel="noreferrer">App Review → Permissions</a>{" "}
            and confirm both are listed under <span className="font-medium text-foreground">Advanced Access</span>.
            If not, switch the app to <span className="font-medium text-foreground">Live</span> mode, or use a System User
            from the same Business that owns the app — internal users get advanced access automatically.
          </>
        ),
      },
      {
        when: <>It complains about <span className="font-mono">leads_retrieval</span></>,
        then: (
          <>
            Optional scope for Lead Ads. Either tick it when generating the token (Page admin role required), or
            ignore the warning — sync will still work without lead pulls.
          </>
        ),
      },
    ],
  },
  {
    issue: "Connected, but “No ad accounts found”",
    branches: [
      {
        when: <>You used a <span className="font-medium text-foreground">System User token</span></>,
        then: (
          <>
            The System User isn't assigned to any ad accounts. Open{" "}
            <a className="text-primary hover:underline" href="https://business.facebook.com/settings/system-users" target="_blank" rel="noreferrer">System Users</a>{" "}
            → click the user → <span className="font-medium text-foreground">Add Assets → Ad Accounts</span>, tick every
            account you want to sync, and enable <span className="font-medium text-foreground">Manage campaigns</span> +{" "}
            <span className="font-medium text-foreground">View performance</span>. Then click{" "}
            <span className="font-medium text-foreground">Refresh</span> on the connection — no need to regenerate the token.
          </>
        ),
      },
      {
        when: <>You used a <span className="font-medium text-foreground">User token</span></>,
        then: (
          <>
            Your Facebook user must be added to each ad account in{" "}
            <a className="text-primary hover:underline" href="https://business.facebook.com/settings/ad-accounts" target="_blank" rel="noreferrer">Business Settings → Ad Accounts</a>{" "}
            with at least <span className="font-medium text-foreground">Advertiser</span> access. If you're an agency,
            the client must share the ad account with your Business via{" "}
            <span className="font-medium text-foreground">Partners → Assign assets</span>.
          </>
        ),
      },
      {
        when: <>Ad accounts are <span className="font-medium text-foreground">disabled or unsettled</span></>,
        then: (
          <>
            Meta hides ad accounts with billing issues from the API. Open{" "}
            <a className="text-primary hover:underline" href="https://adsmanager.facebook.com/" target="_blank" rel="noreferrer">Ads Manager</a>,
            fix any "Account disabled" or "Payment required" banners, then click{" "}
            <span className="font-medium text-foreground">Refresh</span> here.
          </>
        ),
      },
      {
        when: <>The ad account lives in a <span className="font-medium text-foreground">different Business Manager</span></>,
        then: (
          <>
            A System User can only see assets owned by its own Business. Either move/share the ad account into the
            same Business, or generate the token from the Business that owns the account.
          </>
        ),
      },
    ],
  },
  {
    issue: "“Invalid OAuth access token” or token rejected immediately",
    fix: (
      <>
        You probably copied a masked preview (with •••) or extra whitespace. Re-open Business Settings,
        click <span className="font-medium text-foreground">Show</span> on the token, and copy the full string.
      </>
    ),
  },
  {
    issue: "“Session has expired” or error code 463/190",
    fix: (
      <>
        User tokens expire (~1 hour, or 60 days if extended). Use a System User token for permanent access,
        or extend with the{" "}
        <a className="text-primary hover:underline" href="https://developers.facebook.com/tools/debug/accesstoken/" target="_blank" rel="noreferrer">
          Access Token Debugger
        </a>.
      </>
    ),
  },
  {
    issue: "“Application does not have permission” / app token error",
    fix: (
      <>
        You pasted an App Access Token (looks like <span className="font-mono">APP_ID|APP_SECRET</span>).
        Use a User or System User token instead — app tokens cannot read ad data.
      </>
    ),
  },
  {
    issue: "Verify works, but sync fails later",
    fix: (
      <>
        The user who generated the token may have lost ad-account access, or the password changed.
        Click <span className="font-medium text-foreground">Test</span> on the connection to see Meta's exact error,
        then re-generate the token if needed.
      </>
    ),
  },
  {
    issue: "“Feature unavailable” when starting OAuth",
    fix: (
      <>
        The Facebook account opening the popup isn't listed as a developer/tester on the app, or the app
        is in Development mode. Add the user under{" "}
        <a className="text-primary hover:underline" href={`https://developers.facebook.com/apps/${APP_ID}/roles/roles/`} target="_blank" rel="noreferrer">
          App Roles
        </a>{" "}
        — or just use the manual token flow above.
      </>
    ),
  },
];

function Troubleshooting() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <div className="rounded border border-border bg-muted/20">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted/40 transition-colors rounded"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <LifeBuoy className="h-3 w-3 text-warning" />
        <span>Troubleshooting common errors</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{TROUBLESHOOTING.length} fixes</span>
      </button>
      {open && (
        <ul className="border-t border-border p-2 space-y-1">
          {TROUBLESHOOTING.map((t, i) => {
            const isOpen = expanded === i;
            const hasBranches = !!t.branches?.length;
            return (
              <li key={i} className="text-[11px] leading-relaxed rounded border border-border/60 bg-background/40">
                <button
                  onClick={() => setExpanded(isOpen ? null : i)}
                  className="w-full flex items-start gap-1.5 px-2 py-1.5 text-left hover:bg-muted/30 transition-colors rounded"
                >
                  {isOpen ? <ChevronDown className="h-3 w-3 mt-0.5 shrink-0" /> : <ChevronRight className="h-3 w-3 mt-0.5 shrink-0" />}
                  <span className="font-medium text-foreground flex-1">{t.issue}</span>
                  {hasBranches && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {t.branches!.length} branches
                    </span>
                  )}
                </button>
                {isOpen && (
                  <div className="px-2.5 pb-2 pt-0.5">
                    {t.fix && <p className="text-muted-foreground">{t.fix}</p>}
                    {hasBranches && (
                      <ul className="space-y-2 mt-1 border-l border-border/60 pl-2.5">
                        {t.branches!.map((b, bi) => (
                          <li key={bi}>
                            <p className="text-foreground">
                              <span className="text-[10px] uppercase tracking-wide text-warning font-semibold mr-1">If</span>
                              {b.when}
                            </p>
                            <p className="text-muted-foreground mt-0.5">
                              <span className="text-[10px] uppercase tracking-wide text-success font-semibold mr-1">Fix</span>
                              {b.then}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 text-[11px] px-2 py-1.5 rounded transition-colors text-left",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function CopyRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-xs font-mono text-foreground truncate">{value}</p>
      </div>
      <button
        onClick={onCopy}
        className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:border-primary text-muted-foreground hover:text-foreground transition-colors"
      >
        {copied ? <><Check className="h-3 w-3 text-success" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
      </button>
    </div>
  );
}

type ChecklistItem = { id: string; label: string; hint?: string };

const SYSTEM_PREREQS: ChecklistItem[] = [
  { id: "bm", label: "I own (or am Admin of) a Meta Business Manager", hint: "Required to create System Users and assign assets." },
  { id: "app", label: "I've added the Meta Hub app to my Business Manager", hint: "Business Settings → Accounts → Apps → Connect an app ID." },
  { id: "su", label: "I've created a System User with Admin role", hint: "Business Settings → Users → System Users → Add." },
  { id: "app-assigned", label: "I've assigned the Meta Hub app to that System User", hint: "System User → Add Assets → Apps → enable Develop & Manage." },
  { id: "ads", label: "I've assigned all ad accounts to that System User", hint: "Same screen → Add Assets → Ad Accounts → Manage campaigns + View performance." },
  { id: "scopes", label: "When generating, I'll tick ads_read + read_insights (+ leads_retrieval for lead sync)", hint: "Scopes are listed below for one-click copy." },
];

const USER_PREREQS: ChecklistItem[] = [
  { id: "fb", label: "I'm signed in with the Facebook account that has access to the ad accounts" },
  { id: "explorer", label: "I can open Graph API Explorer and select the Meta Hub app from the top-right dropdown" },
  { id: "scopes", label: "I'll request ads_read + read_insights (+ leads_retrieval) before generating" },
  { id: "extend", label: "I'll extend the short-lived token to 60 days via the Access Token Debugger" },
  { id: "note", label: "I understand User tokens expire — I'll switch to a System User token for production" },
];

function PrereqChecklist({ tab }: { tab: "system" | "user" }) {
  const items = tab === "system" ? SYSTEM_PREREQS : USER_PREREQS;
  const storageKey = `metahub:meta-token-guide:checklist:${tab}`;
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(window.localStorage.getItem(storageKey) || "{}"); } catch { return {}; }
  });
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(checked)); } catch { /* ignore */ }
  }, [storageKey, checked]);

  // Reload state when tab changes
  useEffect(() => {
    try { setChecked(JSON.parse(window.localStorage.getItem(storageKey) || "{}")); } catch { setChecked({}); }
  }, [storageKey]);

  const done = items.filter(i => checked[i.id]).length;
  const allDone = done === items.length;

  return (
    <div className={cn(
      "rounded-md border p-2.5 transition-colors",
      allDone ? "border-success/40 bg-success/5" : "border-primary/30 bg-primary/5",
    )}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 text-xs font-semibold text-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <ClipboardList className={cn("h-3.5 w-3.5", allDone ? "text-success" : "text-primary")} />
        <span>Before you start — prerequisites</span>
        <span className={cn(
          "ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded",
          allDone ? "bg-success/20 text-success" : "bg-primary/15 text-primary",
        )}>
          {done}/{items.length} {allDone ? "ready" : "done"}
        </span>
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {items.map(item => {
            const isChecked = !!checked[item.id];
            return (
              <li key={item.id}>
                <label className="flex items-start gap-2 cursor-pointer group">
                  <span
                    className={cn(
                      "mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                      isChecked
                        ? "bg-success border-success text-background"
                        : "border-border bg-background group-hover:border-primary",
                    )}
                    aria-hidden
                  >
                    {isChecked && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={e => setChecked(prev => ({ ...prev, [item.id]: e.target.checked }))}
                    className="sr-only"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-xs leading-snug",
                      isChecked ? "text-muted-foreground line-through" : "text-foreground",
                    )}>
                      {item.label}
                    </p>
                    {item.hint && !isChecked && (
                      <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{item.hint}</p>
                    )}
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {!allDone && open && (
        <p className="mt-2 text-[10px] text-muted-foreground italic">
          Tick each item once it's done. We'll save your progress on this device.
        </p>
      )}
      {allDone && (
        <p className="mt-2 text-[11px] text-success font-medium flex items-center gap-1">
          <Check className="h-3 w-3" /> You're ready — follow the steps below to generate and paste the token.
        </p>
      )}
    </div>
  );
}
