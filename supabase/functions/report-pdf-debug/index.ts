// Temporary QA helper: re-renders a stored report to PDF and returns the bytes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildReportPdf } from "../_shared/reportPdf.ts";

Deno.serve(async (req) => {
  const { reportId } = await req.json().catch(() => ({ reportId: null }));
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data } = await supabase.from("client_reports").select("payload,commentary").eq("id", reportId).maybeSingle();
  if (!data) return new Response("not found", { status: 404 });
  const bytes = await buildReportPdf(data.payload as any, data.commentary ?? "");
  return new Response(bytes, { headers: { "Content-Type": "application/pdf" } });
});
