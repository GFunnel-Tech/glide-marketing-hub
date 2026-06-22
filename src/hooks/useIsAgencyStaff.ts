import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns true if the signed-in user is a member of any workspace
 * (owner / admin / member). Used to let agency staff preview the
 * client portal even when they don't have a portal_users mapping.
 */
export function useIsAgencyStaff() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["is_agency_staff", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user!.id)
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
  });
}
