import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Copy, Check, BookOpen, LifeBuoy } from "lucide-react";
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

export function MetaTokenGuide({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<"system" | "user">("system");
  const [copied, setCopied] = useState<string | null>(null);

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
      title: "Create or select a System User",
      body: (
        <>
          Go to <span className="font-medium text-foreground">Users → System Users</span>. Click{" "}
          <span className="font-medium text-foreground">Add</span>, give it a name (e.g. "Meta Hub"),
          and set role to <span className="font-medium text-foreground">Admin</span>.
        </>
      ),
    },
    {
      title: "Assign ad accounts to the system user",
      body: (
        <>
          Click the system user → <span className="font-medium text-foreground">Add Assets</span> →{" "}
          <span className="font-medium text-foreground">Ad Accounts</span>. Select every ad account
          you want Meta Hub to read, then enable{" "}
          <span className="font-medium text-foreground">Manage campaigns</span> &{" "}
          <span className="font-medium text-foreground">View performance</span>.
        </>
      ),
    },
    {
      title: "Generate the access token",
      body: (
        <>
          On the system user page, click <span className="font-medium text-foreground">Generate New Token</span>.
          Pick the app below, set <span className="font-medium text-foreground">Token expiration: Never</span>,
          and check the scopes listed below.
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
        </div>
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
