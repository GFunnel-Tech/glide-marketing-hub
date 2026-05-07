import { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useRebillAssignments, useAddAssignment, useDeleteAssignment, type AssignmentLevel } from "@/hooks/useRebilling";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

function useMetaAdAccounts() {
  const { currentWorkspace } = useWorkspace();
  return useQuery({
    queryKey: ["meta_ad_accounts", currentWorkspace?.id],
    enabled: !!currentWorkspace,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_ad_accounts")
        .select("id, act_id, account_name, business_name")
        .eq("workspace_id", currentWorkspace!.id)
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });
}

export function AssignmentManager({ clientId }: { clientId: number }) {
  const { data: assignments = [] } = useRebillAssignments(clientId);
  const { data: adAccounts = [] } = useMetaAdAccounts();
  const add = useAddAssignment();
  const del = useDeleteAssignment();

  const [adAccountId, setAdAccountId] = useState("");
  const [level, setLevel] = useState<AssignmentLevel>("account");
  const [objectId, setObjectId] = useState("");
  const [objectName, setObjectName] = useState("");

  const submit = async () => {
    if (!adAccountId) return;
    const acct = adAccounts.find((a) => a.id === adAccountId);
    await add.mutateAsync({
      client_id: clientId,
      ad_account_id: adAccountId,
      level,
      object_id: level === "account" ? acct?.act_id ?? "" : objectId,
      object_name: level === "account" ? acct?.account_name ?? null : objectName || null,
      excluded: false,
    });
    setObjectId(""); setObjectName("");
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Ad account</Label>
            <Select value={adAccountId} onValueChange={setAdAccountId}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {adAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.account_name || a.act_id} {a.business_name && `(${a.business_name})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Level</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as AssignmentLevel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="account">Whole ad account</SelectItem>
                <SelectItem value="campaign">Campaign</SelectItem>
                <SelectItem value="adset">Ad set</SelectItem>
                <SelectItem value="ad">Single ad</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {level !== "account" && (
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder={`${level} ID`} value={objectId} onChange={(e) => setObjectId(e.target.value)} />
            <Input placeholder={`${level} name (optional)`} value={objectName} onChange={(e) => setObjectName(e.target.value)} />
          </div>
        )}
        <Button size="sm" onClick={submit} disabled={!adAccountId || (level !== "account" && !objectId) || add.isPending}>
          <Plus className="h-3 w-3 mr-1" /> Add assignment
        </Button>
      </div>

      {assignments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No ad objects assigned yet.</p>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border">
          {assignments.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate">
                  <span className="text-xs uppercase text-muted-foreground mr-2">{a.level}</span>
                  {a.object_name || a.object_id}
                </div>
                <div className="text-xs text-muted-foreground truncate">{a.object_id}</div>
              </div>
              <button
                onClick={() => del.mutate(a.id)}
                className="text-muted-foreground hover:text-destructive p-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
