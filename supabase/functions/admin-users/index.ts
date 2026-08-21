import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const caller = userRes?.user;
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleRow) {
      // Log denied access attempt for the audit trail
      await admin.from("impersonation_log").insert({
        super_admin_id: caller.id,
        action: "denied_admin_access",
        meta: { endpoint: "admin-users", email: caller.email ?? null },
      }).then(() => {}, () => {});
      return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === "list") {
      const { data: users, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) throw error;
      const ids = users.users.map((u) => u.id);
      const [{ data: roles }, { data: members }, { data: profiles }] = await Promise.all([
        admin.from("user_roles").select("user_id, role").in("user_id", ids),
        admin.from("workspace_members").select("user_id, workspace_id, role, workspaces:workspace_id(id,name)").in("user_id", ids),
        admin.from("profiles").select("id, display_name, avatar_url").in("id", ids),
      ]);
      return json({
        users: users.users.map((u) => ({
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          banned_until: (u as any).banned_until ?? null,
          profile: profiles?.find((p: any) => p.id === u.id) ?? null,
          roles: roles?.filter((r: any) => r.user_id === u.id).map((r: any) => r.role) ?? [],
          workspaces: members?.filter((m: any) => m.user_id === u.id).map((m: any) => ({
            id: m.workspaces?.id, name: m.workspaces?.name, role: m.role,
          })) ?? [],
        })),
      });
    }

    if (action === "set_role") {
      const { user_id, role, enabled } = body;
      const ALLOWED = new Set(["user", "admin", "moderator", "super_admin"]);
      if (!ALLOWED.has(role)) return json({ error: "Unknown role" }, 400);

      // Don't let an admin modify their own role assignments through this surface
      if (user_id === caller.id) {
        return json({ error: "You cannot change your own roles" }, 403);
      }

      if (role === "super_admin") {
        if (enabled) {
          // Cap total number of super admins to prevent runaway escalation
          const { count } = await admin
            .from("user_roles")
            .select("user_id", { count: "exact", head: true })
            .eq("role", "super_admin");
          if ((count ?? 0) >= 5) {
            return json({ error: "Super admin limit reached (max 5). Remove one first." }, 403);
          }
        } else {
          // Never allow removing the last super admin
          const { count } = await admin
            .from("user_roles")
            .select("user_id", { count: "exact", head: true })
            .eq("role", "super_admin");
          if ((count ?? 0) <= 1) {
            return json({ error: "Cannot remove the last super admin" }, 403);
          }
        }
      }

      if (enabled) {
        await admin.from("user_roles").upsert({ user_id, role }, { onConflict: "user_id,role" });
      } else {
        await admin.from("user_roles").delete().eq("user_id", user_id).eq("role", role);
      }
      await admin.from("impersonation_log").insert({
        super_admin_id: caller.id,
        target_user_id: user_id,
        action: enabled ? "grant_role" : "revoke_role",
        meta: { role },
      });
      return json({ ok: true });
    }

    // Helper: prevent acting on self or on other super admins (ban/delete)
    const guardTarget = async (user_id: string) => {
      if (user_id === caller.id) return "You cannot perform this action on yourself";
      const { data: r } = await admin
        .from("user_roles").select("role").eq("user_id", user_id).eq("role", "super_admin").maybeSingle();
      if (r) return "Cannot perform this action on another super admin";
      return null;
    };

    if (action === "ban") {
      const { user_id, duration } = body;
      const blocked = await guardTarget(user_id);
      if (blocked) return json({ error: blocked }, 403);
      const { error } = await admin.auth.admin.updateUserById(user_id, {
        ban_duration: duration ?? "876000h",
      } as any);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "unban") {
      const { user_id } = body;
      if (user_id === caller.id) return json({ error: "Cannot unban yourself" }, 403);
      const { error } = await admin.auth.admin.updateUserById(user_id, { ban_duration: "none" } as any);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "delete_user") {
      const { user_id } = body;
      const blocked = await guardTarget(user_id);
      if (blocked) return json({ error: blocked }, 403);
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "list_workspaces") {
      const { data, error } = await admin
        .from("workspaces")
        .select("id, name, slug, created_at, created_by, workspace_members(count)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json({ workspaces: data });
    }

    if (action === "delete_workspace") {
      const { workspace_id } = body;
      const { error } = await admin.from("workspaces").delete().eq("id", workspace_id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "rename_workspace") {
      const { workspace_id, name } = body;
      const { error } = await admin.from("workspaces").update({ name }).eq("id", workspace_id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "list_audit") {
      const { limit = 200 } = body;
      const { data: rows, error } = await admin
        .from("impersonation_log")
        .select("id, super_admin_id, target_user_id, action, meta, created_at")
        .order("created_at", { ascending: false })
        .limit(Math.min(Math.max(limit, 1), 500));
      if (error) throw error;

      const ids = Array.from(new Set((rows ?? []).flatMap((r: any) => [r.super_admin_id, r.target_user_id]).filter(Boolean)));
      const { data: profiles } = await admin.from("profiles").select("id, email, display_name").in("id", ids);
      const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));

      return json({
        entries: (rows ?? []).map((r: any) => ({
          ...r,
          super_admin: byId.get(r.super_admin_id) ?? null,
          target_user: byId.get(r.target_user_id) ?? null,
        })),
      });
    }

    if (action === "update_user") {
      const { user_id, display_name, position, department, email, password } = body;
      if (!user_id) return json({ error: "user_id required" }, 400);
      if (email || password) {
        const blocked = user_id === caller.id ? null : await guardTarget(user_id);
        if (blocked) return json({ error: blocked }, 403);
        const attrs: Record<string, unknown> = {};
        if (email) {
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Invalid email" }, 400);
          attrs.email = email;
          attrs.email_confirm = true;
        }
        if (password) {
          if (String(password).length < 8) return json({ error: "Password must be at least 8 characters" }, 400);
          attrs.password = password;
        }
        const { error } = await admin.auth.admin.updateUserById(user_id, attrs as any);
        if (error) throw error;
      }
      const patch: Record<string, unknown> = {};
      if (display_name !== undefined) patch.display_name = display_name;
      if (position !== undefined) patch.position = position;
      if (department !== undefined) patch.department = department;
      if (email) patch.email = email;
      if (Object.keys(patch).length) {
        const { error } = await admin.from("profiles").update(patch).eq("id", user_id);
        if (error) throw error;
      }
      await admin.from("impersonation_log").insert({
        super_admin_id: caller.id,
        target_user_id: user_id,
        action: "update_user",
        meta: { fields: Object.keys({ ...patch, ...(password ? { password: true } : {}) }) },
      }).then(() => {}, () => {});
      return json({ ok: true });
    }

    if (action === "create_user") {
      const { email, password, display_name, position, workspace_id, workspace_role } = body;
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Valid email required" }, 400);
      if (!password || String(password).length < 8) return json({ error: "Password must be at least 8 characters" }, 400);
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: display_name ?? null,
          ...(workspace_id ? { invited_to_workspace: workspace_id } : {}),
        },
      });
      if (error) throw error;
      const newId = created.user!.id;
      await admin.from("profiles").update({ display_name: display_name ?? null, position: position ?? null, email }).eq("id", newId);
      if (workspace_id) {
        const { data: existing } = await admin.from("workspace_members")
          .select("id").eq("workspace_id", workspace_id).eq("user_id", newId).maybeSingle();
        if (!existing) {
          await admin.from("workspace_members").insert({
            workspace_id, user_id: newId, role: workspace_role ?? "member",
          });
        }
      }
      await admin.from("impersonation_log").insert({
        super_admin_id: caller.id, target_user_id: newId, action: "create_user", meta: { email },
      }).then(() => {}, () => {});
      return json({ ok: true, user_id: newId });
    }

    const WS_ROLES = new Set(["owner", "admin", "member", "viewer"]);

    if (action === "set_workspace_member") {
      const { user_id, workspace_id, role } = body;
      if (!user_id || !workspace_id) return json({ error: "user_id and workspace_id required" }, 400);
      if (!WS_ROLES.has(role)) return json({ error: "Unknown workspace role" }, 400);
      const { data: existing } = await admin.from("workspace_members")
        .select("id").eq("workspace_id", workspace_id).eq("user_id", user_id).maybeSingle();
      if (existing) {
        const { error } = await admin.from("workspace_members").update({ role }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await admin.from("workspace_members").insert({ workspace_id, user_id, role });
        if (error) throw error;
      }
      await admin.from("impersonation_log").insert({
        super_admin_id: caller.id, target_user_id: user_id,
        action: existing ? "update_workspace_member" : "add_workspace_member",
        meta: { workspace_id, role },
      }).then(() => {}, () => {});
      return json({ ok: true });
    }

    if (action === "remove_workspace_member") {
      const { user_id, workspace_id } = body;
      if (!user_id || !workspace_id) return json({ error: "user_id and workspace_id required" }, 400);
      const { error } = await admin.from("workspace_members")
        .delete().eq("workspace_id", workspace_id).eq("user_id", user_id);
      if (error) throw error;
      await admin.from("impersonation_log").insert({
        super_admin_id: caller.id, target_user_id: user_id,
        action: "remove_workspace_member", meta: { workspace_id },
      }).then(() => {}, () => {});
      return json({ ok: true });
    }

    if (action === "create_workspace") {
      const { name } = body;
      if (!name || !String(name).trim()) return json({ error: "Name required" }, 400);
      const { data, error } = await admin.from("workspaces")
        .insert({ name: String(name).trim(), created_by: caller.id })
        .select("id").single();
      if (error) throw error;
      return json({ ok: true, workspace_id: data.id });
    }

    return json({ error: "Unknown action" }, 400);

  } catch (e: any) {
    console.error(e);
    return json({ error: e.message ?? "Server error" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
