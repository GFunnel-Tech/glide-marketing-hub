export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          author: string
          client_id: number
          created_at: string
          id: string
          result: string | null
          timestamp: string
          type: string
          workspace_id: string | null
        }
        Insert: {
          action: string
          author: string
          client_id: number
          created_at?: string
          id?: string
          result?: string | null
          timestamp: string
          type: string
          workspace_id?: string | null
        }
        Update: {
          action?: string
          author?: string
          client_id?: number
          created_at?: string
          id?: string
          result?: string | null
          timestamp?: string
          type?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_accounts: {
        Row: {
          access_token: string | null
          account_name: string | null
          connected_by: string | null
          created_at: string
          external_account_id: string
          id: string
          provider: string
          status: string
          token_expires_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          access_token?: string | null
          account_name?: string | null
          connected_by?: string | null
          created_at?: string
          external_account_id: string
          id?: string
          provider?: string
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          access_token?: string | null
          account_name?: string | null
          connected_by?: string | null
          created_at?: string
          external_account_id?: string
          id?: string
          provider?: string
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          ad_sets: number
          ads: number
          client_id: number
          cpl: number
          cpm: number
          created_at: string
          double_count: boolean
          frequency: number
          id: string
          leads: number
          name: string
          spend: number
          status: Database["public"]["Enums"]["campaign_status"]
          true_cpl: number
          true_leads: number
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          ad_sets?: number
          ads?: number
          client_id: number
          cpl?: number
          cpm?: number
          created_at?: string
          double_count?: boolean
          frequency?: number
          id?: string
          leads?: number
          name: string
          spend?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          true_cpl?: number
          true_leads?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          ad_sets?: number
          ads?: number
          client_id?: number
          cpl?: number
          cpm?: number
          created_at?: string
          double_count?: boolean
          frequency?: number
          id?: string
          leads?: number
          name?: string
          spend?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          true_cpl?: number
          true_leads?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          bm_type: Database["public"]["Enums"]["bm_type"]
          brand: string
          cpl: number
          cpm: number
          created_at: string
          double_count: boolean
          form_cvr: number
          frequency: number
          id: number
          last_audit: string | null
          leads: number
          name: string
          plai_connected: boolean
          reported_leads: number
          spend: number
          status: Database["public"]["Enums"]["client_status"]
          true_cpl: number
          true_leads: number
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          bm_type?: Database["public"]["Enums"]["bm_type"]
          brand: string
          cpl?: number
          cpm?: number
          created_at?: string
          double_count?: boolean
          form_cvr?: number
          frequency?: number
          id?: number
          last_audit?: string | null
          leads?: number
          name: string
          plai_connected?: boolean
          reported_leads?: number
          spend?: number
          status?: Database["public"]["Enums"]["client_status"]
          true_cpl?: number
          true_leads?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          bm_type?: Database["public"]["Enums"]["bm_type"]
          brand?: string
          cpl?: number
          cpm?: number
          created_at?: string
          double_count?: boolean
          form_cvr?: number
          frequency?: number
          id?: number
          last_audit?: string | null
          leads?: number
          name?: string
          plai_connected?: boolean
          reported_leads?: number
          spend?: number
          status?: Database["public"]["Enums"]["client_status"]
          true_cpl?: number
          true_leads?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          client_id: number
          created_at: string
          date: string
          id: string
          name: string
          phone: string | null
          stage: string
          status: string
          workspace_id: string | null
        }
        Insert: {
          client_id: number
          created_at?: string
          date: string
          id?: string
          name: string
          phone?: string | null
          stage: string
          status?: string
          workspace_id?: string | null
        }
        Update: {
          client_id?: number
          created_at?: string
          date?: string
          id?: string
          name?: string
          phone?: string | null
          stage?: string
          status?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding: {
        Row: {
          blockers: string[]
          brand: string
          client_id: number
          created_at: string
          days_in_phase: number
          id: string
          name: string
          owner: string
          phase: number
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          blockers?: string[]
          brand: string
          client_id: number
          created_at?: string
          days_in_phase?: number
          id?: string
          name: string
          owner: string
          phase?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          blockers?: string[]
          brand?: string
          client_id?: number
          created_at?: string
          days_in_phase?: number
          id?: string
          name?: string
          owner?: string
          phase?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          brand: string
          client_id: number
          client_name: string
          client_reviewed: boolean
          created_at: string
          delivered_date: string | null
          id: string
          metric_applications: number
          metric_appointments: number
          metric_closed_deals: number
          metric_cpl: number
          metric_leads: number
          metric_pipeline_value: number
          metric_spend: number
          month: string
          status: Database["public"]["Enums"]["report_status"]
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          brand: string
          client_id: number
          client_name: string
          client_reviewed?: boolean
          created_at?: string
          delivered_date?: string | null
          id?: string
          metric_applications?: number
          metric_appointments?: number
          metric_closed_deals?: number
          metric_cpl?: number
          metric_leads?: number
          metric_pipeline_value?: number
          metric_spend?: number
          month: string
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          brand?: string
          client_id?: number
          client_name?: string
          client_reviewed?: boolean
          created_at?: string
          delivered_date?: string | null
          id?: string
          metric_applications?: number
          metric_appointments?: number
          metric_closed_deals?: number
          metric_cpl?: number
          metric_leads?: number
          metric_pipeline_value?: number
          metric_spend?: number
          month?: string
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          access_level: string
          created_at: string
          id: string
          member_status: string
          name: string
          role: string
          updated_at: string
        }
        Insert: {
          access_level: string
          created_at?: string
          id?: string
          member_status?: string
          name: string
          role: string
          updated_at?: string
        }
        Update: {
          access_level?: string
          created_at?: string
          id?: string
          member_status?: string
          name?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_write_workspace: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      workspace_role_of: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
    }
    Enums: {
      app_role: "admin" | "user"
      bm_type: "Own BM" | "Agency BM"
      campaign_status: "active" | "paused"
      client_status: "GREEN" | "YELLOW" | "RED" | "BLOCKED"
      report_status: "draft" | "ready" | "delivered"
      workspace_role: "owner" | "admin" | "member" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      bm_type: ["Own BM", "Agency BM"],
      campaign_status: ["active", "paused"],
      client_status: ["GREEN", "YELLOW", "RED", "BLOCKED"],
      report_status: ["draft", "ready", "delivered"],
      workspace_role: ["owner", "admin", "member", "viewer"],
    },
  },
} as const
