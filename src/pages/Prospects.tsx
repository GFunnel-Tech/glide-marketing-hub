import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProspects, type Client } from "@/hooks/useDatabase";
import { useConvertProspect, useMarkProspectLost } from "@/hooks/useProspectActions";
import NewProspectDialog from "@/components/prospects/NewProspectDialog";

export default function Prospects() {
  const { data: prospects = [], isLoading } = useProspects();
  const convert = useConvertProspect();
  const markLost = useMarkProspectLost();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return prospects;
    return prospects.filter((p) =>
      [p.brand, p.decisionMaker, p.warmPath, p.prospectSource]
        .filter((v): v is string => !!v)
        .some((v) => v.toLowerCase().includes(needle)),
    );
  }, [prospects, q]);

  const onConvert = async (p: Client) => {
    try {
      await convert.mutateAsync(p.id);
      toast.success(`${p.brand} is now a client`);
    } catch (e: any) {
      toast.error(e?.message || "Could not convert the prospect");
    }
  };

  const onLose = async (p: Client) => {
    try {
      await markLost.mutateAsync({ id: p.id });
      toast.success(`${p.brand} marked closed lost`);
    } catch (e: any) {
      toast.error(e?.message || "Could not update the prospect");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Prospects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The agency&rsquo;s own pipeline. Prospects carry notes, tasks and research
            from first contact, and keep all of it when they convert.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New prospect
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search company, contact or path"
          className="pl-9"
          aria-label="Search prospects"
        />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Decision-maker</TableHead>
              <TableHead>Warmest path</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="w-[1%]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-10">
                  Loading&hellip;
                </TableCell>
              </TableRow>
            )}

            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-14">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <Users className="h-6 w-6 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {prospects.length === 0 ? "No prospects yet" : "Nothing matches that search"}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {prospects.length === 0
                          ? "Add the first company you want to win."
                          : "Try a different company, contact or path."}
                      </p>
                    </div>
                    {prospects.length === 0 && (
                      <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        New prospect
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}

            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  {p.brand}
                  {p.website && (
                    <span className="block text-xs text-muted-foreground">{p.website}</span>
                  )}
                </TableCell>
                <TableCell>
                  {p.decisionMaker ? (
                    <>
                      {p.decisionMaker}
                      {p.decisionMakerRole && (
                        <span className="block text-xs text-muted-foreground">{p.decisionMakerRole}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">&mdash;</span>
                  )}
                </TableCell>
                <TableCell className="max-w-xs">
                  {p.warmPath ? (
                    <span className="text-sm">{p.warmPath}</span>
                  ) : (
                    <span className="text-muted-foreground">&mdash;</span>
                  )}
                </TableCell>
                <TableCell>
                  {p.prospectSource
                    ? <Badge variant="secondary">{p.prospectSource}</Badge>
                    : <span className="text-muted-foreground">&mdash;</span>}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">Actions</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onConvert(p)}>
                        Convert to client
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onLose(p)}>
                        Mark closed lost
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <NewProspectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
