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
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
        }
        Relationships: []
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
        }
        Relationships: [
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
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
        }
        Relationships: [
          {
            foreignKeyName: "reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      bm_type: "Own BM" | "Agency BM"
      campaign_status: "active" | "paused"
      client_status: "GREEN" | "YELLOW" | "RED" | "BLOCKED"
      report_status: "draft" | "ready" | "delivered"
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
      bm_type: ["Own BM", "Agency BM"],
      campaign_status: ["active", "paused"],
      client_status: ["GREEN", "YELLOW", "RED", "BLOCKED"],
      report_status: ["draft", "ready", "delivered"],
    },
  },
} as const
