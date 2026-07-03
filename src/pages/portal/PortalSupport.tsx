import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bot } from "lucide-react";
import { toast } from "sonner";

const faqs = [
  { cat: "Campaigns", q: "Why am I in the learning phase?", a: "Meta needs ~50 conversions per ad set to exit the learning phase. We're optimizing in the background." },
  { cat: "Campaigns", q: "What does CTR mean?", a: "Click-through rate — the percentage of people who see your ad and click it." },
  { cat: "Leads", q: "Where do my leads go after they submit the form?", a: "They flow into GHL automatically, then the AI setter reaches out within minutes." },
  { cat: "Creative", q: "How long does creative review take?", a: "Typically 2-3 business days from upload to approval." },
  { cat: "Billing", q: "When am I billed?", a: "Monthly on the day you originally signed up. You'll see a notification 3 days before." },
];

export default function PortalSupport() {
  const [category, setCategory] = useState("technical");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: wire to n8n ClickUp bridge
    toast.success("Ticket submitted — your team will respond shortly");
    setSubject("");
    setDescription("");
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Support</h1>
        <p className="text-sm text-muted-foreground mt-1">Tickets, knowledge base, and your AI account assistant.</p>
      </div>

      <Card className="p-6 bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--accent))] text-primary-foreground">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
            <Bot className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">Your AI Account Assistant</h3>
            <p className="mt-1 text-sm text-white/80">Ask anything about your campaigns, leads, performance, or billing.</p>
            <Button className="mt-3 bg-white text-[hsl(var(--primary))] hover:bg-white/90" disabled>
              Start conversation
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">Submit a support ticket</h3>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="campaign">Campaign issue</SelectItem>
                  <SelectItem value="creative">Creative</SelectItem>
                  <SelectItem value="lead">Lead problem</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select defaultValue="normal">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} required />
          </div>
          <Button type="submit" className="bg-[hsl(var(--primary))]">Submit ticket</Button>
        </form>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">Knowledge base</h3>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <details key={i} className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                <span className="text-xs uppercase tracking-wider text-muted-foreground mr-2">{f.cat}</span>
                {f.q}
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}
