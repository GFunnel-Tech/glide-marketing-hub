import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, FileText } from "lucide-react";
import { toast } from "sonner";

export function ClientContextPanel({ clientId }: { clientId: number }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["client_ai_context", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("ai_context")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return (data?.ai_context ?? "") as string;
    },
  });

  const [text, setText] = useState("");
  useEffect(() => { if (data != null) setText(data); }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("clients")
        .update({ ai_context: text })
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Context saved");
      qc.invalidateQueries({ queryKey: ["client_ai_context", clientId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-3">
      <div>
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Client Context for AI
        </h3>
        <p className="text-[11px] text-muted-foreground mt-1">
          Free-text the AI reads on every scan. Include goals, constraints, target CAC, avg deal size, hours, etc.
        </p>
      </div>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />
      ) : (
        <>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 4000))}
            rows={6}
            placeholder={`e.g.\n• Target CAC: $80\n• Min daily leads: 5\n• Only takes leads M–F\n• Avg deal size: $5k\n• Don't pause weekend campaigns`}
            className="text-xs font-mono"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending || text === data}
            >
              {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Save context
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
