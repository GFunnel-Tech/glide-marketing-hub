import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

export default function PortalApprovals() {
  // Scaffold: real approvals will be fed via n8n / ClickUp bridge.
  const pending: Array<{ id: string; type: string; title: string; preview: string; submittedBy: string; date: string }> = [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Approvals</h1>
        <p className="text-sm text-muted-foreground mt-1">Review and approve creative, scripts, and content waiting on you.</p>
      </div>

      {!pending.length ? (
        <Card className="p-10 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-[hsl(var(--success))]" />
          <h3 className="mt-3 text-base font-semibold">You're all caught up</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            No pending approvals right now. We'll notify you when something needs your review.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {pending.map((item) => (
            <Card key={item.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{item.type}</p>
                  <h3 className="mt-1 font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{item.preview}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{item.submittedBy} · {item.date}</p>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <Button className="bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90">Approve</Button>
                  <Button variant="outline">Request changes</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
