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
          client_id: number | null
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
          client_id?: number | null
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
          client_id?: number | null
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
            foreignKeyName: "ad_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
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
          bm_account_name: string | null
          bm_id: string | null
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
          bm_account_name?: string | null
          bm_id?: string | null
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
          bm_account_name?: string | null
          bm_id?: string | null
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
      conversation_participants: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          last_message_at: string
          subject: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          last_message_at?: string
          subject?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          last_message_at?: string
          subject?: string
          updated_at?: string
          workspace_id?: string
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
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_accounts: {
        Row: {
          account_name: string | null
          account_status: number | null
          act_id: string
          business_id: string | null
          business_name: string | null
          client_id: number | null
          connection_id: string
          created_at: string
          currency: string | null
          id: string
          is_active: boolean
          last_synced_at: string | null
          timezone_name: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_name?: string | null
          account_status?: number | null
          act_id: string
          business_id?: string | null
          business_name?: string | null
          client_id?: number | null
          connection_id: string
          created_at?: string
          currency?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          timezone_name?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_name?: string | null
          account_status?: number | null
          act_id?: string
          business_id?: string | null
          business_name?: string | null
          client_id?: number | null
          connection_id?: string
          created_at?: string
          currency?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          timezone_name?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_accounts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "meta_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_connections: {
        Row: {
          access_token: string
          connected_by: string
          connection_type: string
          created_at: string
          id: string
          last_error: string | null
          meta_user_id: string | null
          meta_user_name: string | null
          scopes: string[] | null
          status: string
          token_expires_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          access_token: string
          connected_by: string
          connection_type?: string
          created_at?: string
          id?: string
          last_error?: string | null
          meta_user_id?: string | null
          meta_user_name?: string | null
          scopes?: string[] | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          access_token?: string
          connected_by?: string
          connection_type?: string
          created_at?: string
          id?: string
          last_error?: string | null
          meta_user_id?: string | null
          meta_user_name?: string | null
          scopes?: string[] | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_insights_daily: {
        Row: {
          ad_account_id: string
          clicks: number
          cpl: number
          cpm: number
          created_at: string
          ctr: number
          date: string
          frequency: number
          id: string
          impressions: number
          leads: number
          raw: Json | null
          reach: number
          spend: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ad_account_id: string
          clicks?: number
          cpl?: number
          cpm?: number
          created_at?: string
          ctr?: number
          date: string
          frequency?: number
          id?: string
          impressions?: number
          leads?: number
          raw?: Json | null
          reach?: number
          spend?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ad_account_id?: string
          clicks?: number
          cpl?: number
          cpm?: number
          created_at?: string
          ctr?: number
          date?: string
          frequency?: number
          id?: string
          impressions?: number
          leads?: number
          raw?: Json | null
          reach?: number
          spend?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_insights_daily_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_insights_daily_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_leads: {
        Row: {
          ad_account_id: string
          ad_id: string | null
          ad_name: string | null
          adset_id: string | null
          adset_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          client_id: number | null
          created_at: string
          created_time: string | null
          email: string | null
          field_data: Json | null
          form_id: string | null
          form_name: string | null
          full_name: string | null
          id: string
          lead_id: string
          phone: string | null
          raw: Json | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ad_account_id: string
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          client_id?: number | null
          created_at?: string
          created_time?: string | null
          email?: string | null
          field_data?: Json | null
          form_id?: string | null
          form_name?: string | null
          full_name?: string | null
          id?: string
          lead_id: string
          phone?: string | null
          raw?: Json | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ad_account_id?: string
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          client_id?: number | null
          created_at?: string
          created_time?: string | null
          email?: string | null
          field_data?: Json | null
          form_id?: string | null
          form_name?: string | null
          full_name?: string | null
          id?: string
          lead_id?: string
          phone?: string | null
          raw?: Json | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      meta_sync_log: {
        Row: {
          ad_account_id: string | null
          connection_id: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          rows_synced: number | null
          started_at: string
          status: string
          trigger: string
          workspace_id: string | null
        }
        Insert: {
          ad_account_id?: string | null
          connection_id?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          rows_synced?: number | null
          started_at?: string
          status?: string
          trigger?: string
          workspace_id?: string | null
        }
        Update: {
          ad_account_id?: string | null
          connection_id?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          rows_synced?: number | null
          started_at?: string
          status?: string
          trigger?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_sync_log_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_sync_log_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "meta_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_sync_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          event_type: string
          id: string
          in_app_enabled: boolean
          realtime_enabled: boolean
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          in_app_enabled?: boolean
          realtime_enabled?: boolean
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          in_app_enabled?: boolean
          realtime_enabled?: boolean
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          meta: Json | null
          read_at: string | null
          title: string
          type: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          meta?: Json | null
          read_at?: string | null
          title: string
          type?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          meta?: Json | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
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
      is_conversation_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      notif_pref_enabled: {
        Args: { _event_type: string; _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      workspace_role_of: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin"
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
      app_role: ["admin", "user", "super_admin"],
      bm_type: ["Own BM", "Agency BM"],
      campaign_status: ["active", "paused"],
      client_status: ["GREEN", "YELLOW", "RED", "BLOCKED"],
      report_status: ["draft", "ready", "delivered"],
      workspace_role: ["owner", "admin", "member", "viewer"],
    },
  },
} as const
