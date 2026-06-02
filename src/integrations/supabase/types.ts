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
      account_match_suggestions: {
        Row: {
          client_id: number
          created_at: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          score: number
          source: string
          source_business_name: string | null
          source_name: string | null
          source_ref: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: number
          created_at?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          score: number
          source: string
          source_business_name?: string | null
          source_name?: string | null
          source_ref: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: number
          created_at?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          score?: number
          source?: string
          source_business_name?: string | null
          source_name?: string | null
          source_ref?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_match_suggestions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_match_suggestions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
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
      ad_action_log: {
        Row: {
          action: string
          channel: string
          client_id: number | null
          created_at: string
          error_message: string | null
          id: string
          meta: Json | null
          performed_by: string | null
          result_object_id: string | null
          source_object_id: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          action: string
          channel: string
          client_id?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          meta?: Json | null
          performed_by?: string | null
          result_object_id?: string | null
          source_object_id?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          action?: string
          channel?: string
          client_id?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          meta?: Json | null
          performed_by?: string | null
          result_object_id?: string | null
          source_object_id?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: []
      }
      ad_drafts: {
        Row: {
          channel: string
          client_id: number | null
          countries: string[]
          created_at: string
          created_by: string
          id: string
          launch_error: string | null
          meta_ad_id: string | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          objective: string
          preview_summary: Json | null
          special_ad_category: string | null
          state: Json
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          channel?: string
          client_id?: number | null
          countries?: string[]
          created_at?: string
          created_by: string
          id?: string
          launch_error?: string | null
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          objective: string
          preview_summary?: Json | null
          special_ad_category?: string | null
          state?: Json
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          channel?: string
          client_id?: number | null
          countries?: string[]
          created_at?: string
          created_by?: string
          id?: string
          launch_error?: string | null
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          objective?: string
          preview_summary?: Json | null
          special_ad_category?: string | null
          state?: Json
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_drafts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_drafts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_templates: {
        Row: {
          channel: string
          client_id: number | null
          created_at: string
          created_by: string
          id: string
          name: string
          objective: string
          state: Json
          thumbnail_url: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          channel?: string
          client_id?: number | null
          created_at?: string
          created_by: string
          id?: string
          name: string
          objective: string
          state?: Json
          thumbnail_url?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          channel?: string
          client_id?: number | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          objective?: string
          state?: Json
          thumbnail_url?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_templates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_action_audit_log: {
        Row: {
          action_id: string
          action_type: string
          actor_id: string | null
          actor_kind: string
          client_id: number | null
          error_message: string | null
          event: string
          id: string
          new_status: string | null
          occurred_at: string
          payload: Json | null
          prev_status: string | null
          reasoning: string | null
          result: Json | null
          workspace_id: string
        }
        Insert: {
          action_id: string
          action_type: string
          actor_id?: string | null
          actor_kind?: string
          client_id?: number | null
          error_message?: string | null
          event: string
          id?: string
          new_status?: string | null
          occurred_at?: string
          payload?: Json | null
          prev_status?: string | null
          reasoning?: string | null
          result?: Json | null
          workspace_id: string
        }
        Update: {
          action_id?: string
          action_type?: string
          actor_id?: string | null
          actor_kind?: string
          client_id?: number | null
          error_message?: string | null
          event?: string
          id?: string
          new_status?: string | null
          occurred_at?: string
          payload?: Json | null
          prev_status?: string | null
          reasoning?: string | null
          result?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_action_audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_notification_settings: {
        Row: {
          alert_on: string
          created_at: string
          email_enabled: boolean
          extra_email_recipients: string[]
          notify_workspace_members: boolean
          slack_channel_id: string | null
          slack_channel_name: string | null
          slack_enabled: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          alert_on?: string
          created_at?: string
          email_enabled?: boolean
          extra_email_recipients?: string[]
          notify_workspace_members?: boolean
          slack_channel_id?: string | null
          slack_channel_name?: string | null
          slack_enabled?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          alert_on?: string
          created_at?: string
          email_enabled?: boolean
          extra_email_recipients?: string[]
          notify_workspace_members?: boolean
          slack_channel_id?: string | null
          slack_channel_name?: string | null
          slack_enabled?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_notification_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_pending_actions: {
        Row: {
          action_type: string
          approved_at: string | null
          approved_by: string | null
          client_id: number | null
          created_at: string
          error_message: string | null
          executed_at: string | null
          id: string
          payload: Json
          proposed_by: string
          reasoning: string | null
          result: Json | null
          status: string
          workspace_id: string
        }
        Insert: {
          action_type: string
          approved_at?: string | null
          approved_by?: string | null
          client_id?: number | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          payload: Json
          proposed_by: string
          reasoning?: string | null
          result?: Json | null
          status?: string
          workspace_id: string
        }
        Update: {
          action_type?: string
          approved_at?: string | null
          approved_by?: string | null
          client_id?: number | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          payload?: Json
          proposed_by?: string
          reasoning?: string | null
          result?: Json | null
          status?: string
          workspace_id?: string
        }
        Relationships: []
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
          issues_status: string | null
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
          issues_status?: string | null
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
          issues_status?: string | null
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
      client_guarantees: {
        Row: {
          client_id: number
          created_at: string
          created_by: string
          criteria: Json
          deadline: string
          description: string | null
          id: string
          last_evaluated_at: string | null
          last_status_change_at: string | null
          name: string
          start_date: string
          status: string
          template_id: string | null
          terms: string | null
          updated_at: string
          visible_to_client: boolean
          workspace_id: string
        }
        Insert: {
          client_id: number
          created_at?: string
          created_by: string
          criteria?: Json
          deadline: string
          description?: string | null
          id?: string
          last_evaluated_at?: string | null
          last_status_change_at?: string | null
          name: string
          start_date?: string
          status?: string
          template_id?: string | null
          terms?: string | null
          updated_at?: string
          visible_to_client?: boolean
          workspace_id: string
        }
        Update: {
          client_id?: number
          created_at?: string
          created_by?: string
          criteria?: Json
          deadline?: string
          description?: string | null
          id?: string
          last_evaluated_at?: string | null
          last_status_change_at?: string | null
          name?: string
          start_date?: string
          status?: string
          template_id?: string | null
          terms?: string | null
          updated_at?: string
          visible_to_client?: boolean
          workspace_id?: string
        }
        Relationships: []
      }
      client_invites: {
        Row: {
          client_id: number
          code: string
          created_at: string
          created_by: string
          email: string | null
          expires_at: string
          id: string
          max_uses: number
          note: string | null
          status: string
          token: string
          updated_at: string
          used_count: number
          workspace_id: string
        }
        Insert: {
          client_id: number
          code: string
          created_at?: string
          created_by: string
          email?: string | null
          expires_at?: string
          id?: string
          max_uses?: number
          note?: string | null
          status?: string
          token?: string
          updated_at?: string
          used_count?: number
          workspace_id: string
        }
        Update: {
          client_id?: number
          code?: string
          created_at?: string
          created_by?: string
          email?: string | null
          expires_at?: string
          id?: string
          max_uses?: number
          note?: string | null
          status?: string
          token?: string
          updated_at?: string
          used_count?: number
          workspace_id?: string
        }
        Relationships: []
      }
      client_kpi_overrides: {
        Row: {
          client_id: number
          created_at: string
          id: string
          overrides: Json
          preset_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: number
          created_at?: string
          id?: string
          overrides?: Json
          preset_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: number
          created_at?: string
          id?: string
          overrides?: Json
          preset_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_kpi_overrides_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "kpi_threshold_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      client_optimization_rules: {
        Row: {
          client_id: number
          created_at: string
          enabled: boolean
          max_cpl_absolute: number | null
          max_cpl_multiplier: number
          max_frequency: number
          min_ctr: number
          min_leads_threshold: number
          min_spend_before_pause: number
          notes: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: number
          created_at?: string
          enabled?: boolean
          max_cpl_absolute?: number | null
          max_cpl_multiplier?: number
          max_frequency?: number
          min_ctr?: number
          min_leads_threshold?: number
          min_spend_before_pause?: number
          notes?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: number
          created_at?: string
          enabled?: boolean
          max_cpl_absolute?: number | null
          max_cpl_multiplier?: number
          max_frequency?: number
          min_ctr?: number
          min_leads_threshold?: number
          min_spend_before_pause?: number
          notes?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_optimization_rules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_optimization_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_optimization_schedules: {
        Row: {
          active: boolean
          cadence: string
          client_id: number
          created_at: string
          created_by: string
          day_of_week: number | null
          id: string
          last_run_at: string | null
          last_status: string | null
          last_summary: string | null
          next_run_at: string
          prompt_override: string | null
          run_hour: number
          timezone: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          cadence?: string
          client_id: number
          created_at?: string
          created_by: string
          day_of_week?: number | null
          id?: string
          last_run_at?: string | null
          last_status?: string | null
          last_summary?: string | null
          next_run_at?: string
          prompt_override?: string | null
          run_hour?: number
          timezone?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          cadence?: string
          client_id?: number
          created_at?: string
          created_by?: string
          day_of_week?: number | null
          id?: string
          last_run_at?: string | null
          last_status?: string | null
          last_summary?: string | null
          next_run_at?: string
          prompt_override?: string | null
          run_hour?: number
          timezone?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_optimization_schedules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_optimization_schedules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_report_schedules: {
        Row: {
          active: boolean
          cadence: string
          client_id: number
          commentary_override: string | null
          created_at: string
          created_by: string
          day_of_month: number | null
          day_of_week: number | null
          id: string
          last_run_at: string | null
          next_run_at: string
          recipients: Json
          send_hour: number
          template_id: string
          timezone: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          cadence?: string
          client_id: number
          commentary_override?: string | null
          created_at?: string
          created_by: string
          day_of_month?: number | null
          day_of_week?: number | null
          id?: string
          last_run_at?: string | null
          next_run_at?: string
          recipients?: Json
          send_hour?: number
          template_id: string
          timezone?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          cadence?: string
          client_id?: number
          commentary_override?: string | null
          created_at?: string
          created_by?: string
          day_of_month?: number | null
          day_of_week?: number | null
          id?: string
          last_run_at?: string | null
          next_run_at?: string
          recipients?: Json
          send_hour?: number
          template_id?: string
          timezone?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_report_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      client_reports: {
        Row: {
          client_id: number
          commentary: string | null
          created_at: string
          email_message_ids: Json
          error_message: string | null
          generated_at: string | null
          id: string
          payload: Json
          pdf_url: string | null
          period_end: string
          period_start: string
          recipients: Json
          schedule_id: string | null
          sent_at: string | null
          share_token: string
          status: string
          template_id: string | null
          trigger_type: string
          triggered_by: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: number
          commentary?: string | null
          created_at?: string
          email_message_ids?: Json
          error_message?: string | null
          generated_at?: string | null
          id?: string
          payload?: Json
          pdf_url?: string | null
          period_end: string
          period_start: string
          recipients?: Json
          schedule_id?: string | null
          sent_at?: string | null
          share_token?: string
          status?: string
          template_id?: string | null
          trigger_type?: string
          triggered_by?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: number
          commentary?: string | null
          created_at?: string
          email_message_ids?: Json
          error_message?: string | null
          generated_at?: string | null
          id?: string
          payload?: Json
          pdf_url?: string | null
          period_end?: string
          period_start?: string
          recipients?: Json
          schedule_id?: string | null
          sent_at?: string | null
          share_token?: string
          status?: string
          template_id?: string | null
          trigger_type?: string
          triggered_by?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_reports_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "client_report_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_reports_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      client_status_phases: {
        Row: {
          auto_managed: boolean
          color: string
          created_at: string
          enabled: boolean
          id: string
          label: string
          sort_order: number
          status_key: string
          updated_at: string
          webhook_url: string | null
          workspace_id: string
        }
        Insert: {
          auto_managed?: boolean
          color?: string
          created_at?: string
          enabled?: boolean
          id?: string
          label: string
          sort_order?: number
          status_key: string
          updated_at?: string
          webhook_url?: string | null
          workspace_id: string
        }
        Update: {
          auto_managed?: boolean
          color?: string
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          sort_order?: number
          status_key?: string
          updated_at?: string
          webhook_url?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      client_stripe_accounts: {
        Row: {
          access_token: string
          client_id: number
          connect_type: string
          connected_at: string
          connected_by: string | null
          created_at: string
          disconnected_at: string | null
          id: string
          last_event_at: string | null
          last_event_type: string | null
          livemode: boolean
          publishable_key: string | null
          raw_oauth_response: Json | null
          refresh_token: string | null
          scope: string | null
          stripe_user_id: string
          token_type: string | null
          updated_at: string
          webhook_signing_secret: string | null
          workspace_id: string
        }
        Insert: {
          access_token: string
          client_id: number
          connect_type?: string
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          last_event_at?: string | null
          last_event_type?: string | null
          livemode?: boolean
          publishable_key?: string | null
          raw_oauth_response?: Json | null
          refresh_token?: string | null
          scope?: string | null
          stripe_user_id: string
          token_type?: string | null
          updated_at?: string
          webhook_signing_secret?: string | null
          workspace_id: string
        }
        Update: {
          access_token?: string
          client_id?: number
          connect_type?: string
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          last_event_at?: string | null
          last_event_type?: string | null
          livemode?: boolean
          publishable_key?: string | null
          raw_oauth_response?: Json | null
          refresh_token?: string | null
          scope?: string | null
          stripe_user_id?: string
          token_type?: string | null
          updated_at?: string
          webhook_signing_secret?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_stripe_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_stripe_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_wallets: {
        Row: {
          auto_topup_enabled: boolean
          balance: number
          client_id: number
          created_at: string
          currency: string
          id: string
          last_transaction_at: string | null
          low_balance_threshold: number
          stripe_customer_id: string | null
          stripe_payment_method_id: string | null
          topup_amount: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          auto_topup_enabled?: boolean
          balance?: number
          client_id: number
          created_at?: string
          currency?: string
          id?: string
          last_transaction_at?: string | null
          low_balance_threshold?: number
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          topup_amount?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          auto_topup_enabled?: boolean
          balance?: number
          client_id?: number
          created_at?: string
          currency?: string
          id?: string
          last_transaction_at?: string | null
          low_balance_threshold?: number
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          topup_amount?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          archived_at: string | null
          autonomous_optimization: boolean
          bm_account_name: string | null
          bm_id: string | null
          bm_type: Database["public"]["Enums"]["bm_type"]
          brand: string
          clickup_list_id: string | null
          cpl: number
          cpm: number
          created_at: string
          double_count: boolean
          form_cvr: number
          frequency: number
          ghl_location_id: string | null
          id: number
          last_audit: string | null
          launched_at: string | null
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
          archived_at?: string | null
          autonomous_optimization?: boolean
          bm_account_name?: string | null
          bm_id?: string | null
          bm_type?: Database["public"]["Enums"]["bm_type"]
          brand: string
          clickup_list_id?: string | null
          cpl?: number
          cpm?: number
          created_at?: string
          double_count?: boolean
          form_cvr?: number
          frequency?: number
          ghl_location_id?: string | null
          id?: number
          last_audit?: string | null
          launched_at?: string | null
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
          archived_at?: string | null
          autonomous_optimization?: boolean
          bm_account_name?: string | null
          bm_id?: string | null
          bm_type?: Database["public"]["Enums"]["bm_type"]
          brand?: string
          clickup_list_id?: string | null
          cpl?: number
          cpm?: number
          created_at?: string
          double_count?: boolean
          form_cvr?: number
          frequency?: number
          ghl_location_id?: string | null
          id?: number
          last_audit?: string | null
          launched_at?: string | null
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
      custom_kpi_alerts: {
        Row: {
          client_id: number | null
          cooldown_minutes: number
          created_at: string
          created_by: string
          custom_kpi_id: string
          enabled: boolean
          id: string
          last_fired_at: string | null
          notify_channels: Json
          severity: string
          threshold: Json | null
          trend: Json | null
          trigger_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id?: number | null
          cooldown_minutes?: number
          created_at?: string
          created_by: string
          custom_kpi_id: string
          enabled?: boolean
          id?: string
          last_fired_at?: string | null
          notify_channels?: Json
          severity?: string
          threshold?: Json | null
          trend?: Json | null
          trigger_type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: number | null
          cooldown_minutes?: number
          created_at?: string
          created_by?: string
          custom_kpi_id?: string
          enabled?: boolean
          id?: string
          last_fired_at?: string | null
          notify_channels?: Json
          severity?: string
          threshold?: Json | null
          trend?: Json | null
          trigger_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_kpi_alerts_custom_kpi_id_fkey"
            columns: ["custom_kpi_id"]
            isOneToOne: false
            referencedRelation: "custom_kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_kpi_evaluations: {
        Row: {
          client_id: number | null
          created_at: string
          custom_kpi_id: string
          id: string
          inputs: Json
          period_end: string
          period_start: string
          value: number | null
          workspace_id: string
        }
        Insert: {
          client_id?: number | null
          created_at?: string
          custom_kpi_id: string
          id?: string
          inputs?: Json
          period_end: string
          period_start: string
          value?: number | null
          workspace_id: string
        }
        Update: {
          client_id?: number | null
          created_at?: string
          custom_kpi_id?: string
          id?: string
          inputs?: Json
          period_end?: string
          period_start?: string
          value?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_kpi_evaluations_custom_kpi_id_fkey"
            columns: ["custom_kpi_id"]
            isOneToOne: false
            referencedRelation: "custom_kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_kpis: {
        Row: {
          client_id: number | null
          created_at: string
          created_by: string
          description: string | null
          direction: string
          enabled: boolean
          format: Json
          formula: Json
          id: string
          name: string
          sort_order: number
          unit: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id?: number | null
          created_at?: string
          created_by: string
          description?: string | null
          direction?: string
          enabled?: boolean
          format?: Json
          formula: Json
          id?: string
          name: string
          sort_order?: number
          unit?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: number | null
          created_at?: string
          created_by?: string
          description?: string | null
          direction?: string
          enabled?: boolean
          format?: Json
          formula?: Json
          id?: string
          name?: string
          sort_order?: number
          unit?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      ghl_appointments: {
        Row: {
          assigned_to: string | null
          calendar_id: string | null
          client_id: number | null
          contact_id: string | null
          created_at: string | null
          end_time: string | null
          id: string
          location_id: string
          raw: Json | null
          start_time: string | null
          status: string | null
          synced_at: string
          title: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          assigned_to?: string | null
          calendar_id?: string | null
          client_id?: number | null
          contact_id?: string | null
          created_at?: string | null
          end_time?: string | null
          id: string
          location_id: string
          raw?: Json | null
          start_time?: string | null
          status?: string | null
          synced_at?: string
          title?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          assigned_to?: string | null
          calendar_id?: string | null
          client_id?: number | null
          contact_id?: string | null
          created_at?: string | null
          end_time?: string | null
          id?: string
          location_id?: string
          raw?: Json | null
          start_time?: string | null
          status?: string | null
          synced_at?: string
          title?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      ghl_installs: {
        Row: {
          access_token: string
          client_id: number | null
          company_id: string | null
          created_at: string
          id: string
          installed_by: string | null
          last_error: string | null
          location_id: string
          location_name: string | null
          refresh_token: string
          scopes: string[]
          status: string
          token_expires_at: string
          updated_at: string
          user_type: string | null
          workspace_id: string
        }
        Insert: {
          access_token: string
          client_id?: number | null
          company_id?: string | null
          created_at?: string
          id?: string
          installed_by?: string | null
          last_error?: string | null
          location_id: string
          location_name?: string | null
          refresh_token: string
          scopes?: string[]
          status?: string
          token_expires_at: string
          updated_at?: string
          user_type?: string | null
          workspace_id: string
        }
        Update: {
          access_token?: string
          client_id?: number | null
          company_id?: string | null
          created_at?: string
          id?: string
          installed_by?: string | null
          last_error?: string | null
          location_id?: string
          location_name?: string | null
          refresh_token?: string
          scopes?: string[]
          status?: string
          token_expires_at?: string
          updated_at?: string
          user_type?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      ghl_locations: {
        Row: {
          address: string | null
          business_name: string | null
          created_at: string
          id: string
          last_synced_at: string
          location_id: string
          name: string | null
          raw: Json | null
          timezone: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          address?: string | null
          business_name?: string | null
          created_at?: string
          id?: string
          last_synced_at?: string
          location_id: string
          name?: string | null
          raw?: Json | null
          timezone?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          address?: string | null
          business_name?: string | null
          created_at?: string
          id?: string
          last_synced_at?: string
          location_id?: string
          name?: string | null
          raw?: Json | null
          timezone?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      ghl_oauth_states: {
        Row: {
          client_id: number | null
          created_at: string
          expires_at: string
          redirect_to: string | null
          state: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          client_id?: number | null
          created_at?: string
          expires_at?: string
          redirect_to?: string | null
          state: string
          user_id: string
          workspace_id: string
        }
        Update: {
          client_id?: number | null
          created_at?: string
          expires_at?: string
          redirect_to?: string | null
          state?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      ghl_opportunities: {
        Row: {
          assigned_to: string | null
          client_id: number | null
          contact_id: string | null
          created_at: string | null
          id: string
          location_id: string
          monetary_value: number | null
          name: string | null
          pipeline_id: string | null
          pipeline_name: string | null
          raw: Json | null
          source: string | null
          stage_id: string | null
          stage_name: string | null
          status: string | null
          synced_at: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          assigned_to?: string | null
          client_id?: number | null
          contact_id?: string | null
          created_at?: string | null
          id: string
          location_id: string
          monetary_value?: number | null
          name?: string | null
          pipeline_id?: string | null
          pipeline_name?: string | null
          raw?: Json | null
          source?: string | null
          stage_id?: string | null
          stage_name?: string | null
          status?: string | null
          synced_at?: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: number | null
          contact_id?: string | null
          created_at?: string | null
          id?: string
          location_id?: string
          monetary_value?: number | null
          name?: string | null
          pipeline_id?: string | null
          pipeline_name?: string | null
          raw?: Json | null
          source?: string | null
          stage_id?: string | null
          stage_name?: string | null
          status?: string | null
          synced_at?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      ghl_stage_map: {
        Row: {
          client_id: number
          created_at: string
          id: string
          internal_stage: string
          pipeline_id: string
          pipeline_name: string | null
          stage_id: string
          stage_name: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: number
          created_at?: string
          id?: string
          internal_stage: string
          pipeline_id: string
          pipeline_name?: string | null
          stage_id: string
          stage_name?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: number
          created_at?: string
          id?: string
          internal_stage?: string
          pipeline_id?: string
          pipeline_name?: string | null
          stage_id?: string
          stage_name?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      ghl_sync_state: {
        Row: {
          client_id: number | null
          last_appts_sync_at: string | null
          last_contacts_sync_at: string | null
          last_error: string | null
          last_opps_sync_at: string | null
          last_run_at: string | null
          location_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id?: number | null
          last_appts_sync_at?: string | null
          last_contacts_sync_at?: string | null
          last_error?: string | null
          last_opps_sync_at?: string | null
          last_run_at?: string | null
          location_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: number | null
          last_appts_sync_at?: string | null
          last_contacts_sync_at?: string | null
          last_error?: string | null
          last_opps_sync_at?: string | null
          last_run_at?: string | null
          location_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      ghl_webhook_events: {
        Row: {
          applied: boolean
          company_id: string | null
          created_at: string
          error: string | null
          event_type: string | null
          ghl_contact_id: string | null
          ghl_opportunity_id: string | null
          id: string
          location_id: string | null
          matched_lead_id: string | null
          payload: Json | null
          processed_at: string | null
          received_at: string
          signature_valid: boolean | null
          workspace_id: string | null
        }
        Insert: {
          applied?: boolean
          company_id?: string | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          ghl_contact_id?: string | null
          ghl_opportunity_id?: string | null
          id?: string
          location_id?: string | null
          matched_lead_id?: string | null
          payload?: Json | null
          processed_at?: string | null
          received_at?: string
          signature_valid?: boolean | null
          workspace_id?: string | null
        }
        Update: {
          applied?: boolean
          company_id?: string | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          ghl_contact_id?: string | null
          ghl_opportunity_id?: string | null
          id?: string
          location_id?: string | null
          matched_lead_id?: string | null
          payload?: Json | null
          processed_at?: string | null
          received_at?: string
          signature_valid?: boolean | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      google_leads: {
        Row: {
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
          external_lead_id: string | null
          field_data: Json | null
          form_id: string | null
          form_name: string | null
          full_name: string | null
          id: string
          note: string | null
          phone: string | null
          raw: Json | null
          stage: Database["public"]["Enums"]["lead_stage"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
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
          external_lead_id?: string | null
          field_data?: Json | null
          form_id?: string | null
          form_name?: string | null
          full_name?: string | null
          id?: string
          note?: string | null
          phone?: string | null
          raw?: Json | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
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
          external_lead_id?: string | null
          field_data?: Json | null
          form_id?: string | null
          form_name?: string | null
          full_name?: string | null
          id?: string
          note?: string | null
          phone?: string | null
          raw?: Json | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      guarantee_evaluations: {
        Row: {
          client_id: number
          created_at: string
          criteria_results: Json
          evaluated_at: string
          guarantee_id: string
          id: string
          overall_progress: number
          status: string
          workspace_id: string
        }
        Insert: {
          client_id: number
          created_at?: string
          criteria_results?: Json
          evaluated_at?: string
          guarantee_id: string
          id?: string
          overall_progress?: number
          status: string
          workspace_id: string
        }
        Update: {
          client_id?: number
          created_at?: string
          criteria_results?: Json
          evaluated_at?: string
          guarantee_id?: string
          id?: string
          overall_progress?: number
          status?: string
          workspace_id?: string
        }
        Relationships: []
      }
      guarantee_templates: {
        Row: {
          created_at: string
          created_by: string
          criteria: Json
          description: string | null
          duration_days: number
          enabled: boolean
          id: string
          name: string
          terms: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          criteria?: Json
          description?: string | null
          duration_days?: number
          enabled?: boolean
          id?: string
          name: string
          terms?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          criteria?: Json
          description?: string | null
          duration_days?: number
          enabled?: boolean
          id?: string
          name?: string
          terms?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      impersonation_log: {
        Row: {
          action: string
          created_at: string
          id: string
          meta: Json | null
          super_admin_id: string
          target_user_id: string | null
          target_workspace_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          meta?: Json | null
          super_admin_id: string
          target_user_id?: string | null
          target_workspace_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          meta?: Json | null
          super_admin_id?: string
          target_user_id?: string | null
          target_workspace_id?: string | null
        }
        Relationships: []
      }
      integration_configs: {
        Row: {
          clickup_api_token: string | null
          clickup_default_list_id: string | null
          created_at: string
          ghl_api_key: string | null
          ghl_company_id: string | null
          ghl_webhook_secret: string | null
          id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          clickup_api_token?: string | null
          clickup_default_list_id?: string | null
          created_at?: string
          ghl_api_key?: string | null
          ghl_company_id?: string | null
          ghl_webhook_secret?: string | null
          id?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          clickup_api_token?: string | null
          clickup_default_list_id?: string | null
          created_at?: string
          ghl_api_key?: string | null
          ghl_company_id?: string | null
          ghl_webhook_secret?: string | null
          id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      kpi_threshold_presets: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          kpis: Json
          name: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          kpis?: Json
          name: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          kpis?: Json
          name?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      lead_score_calibrations: {
        Row: {
          created_at: string
          evidence: Json
          id: string
          proposed_thresholds: Json
          proposed_weights: Json
          reviewed_at: string | null
          reviewed_by: string | null
          rule_set_id: string
          status: Database["public"]["Enums"]["calibration_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          evidence?: Json
          id?: string
          proposed_thresholds: Json
          proposed_weights: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_set_id: string
          status?: Database["public"]["Enums"]["calibration_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          evidence?: Json
          id?: string
          proposed_thresholds?: Json
          proposed_weights?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_set_id?: string
          status?: Database["public"]["Enums"]["calibration_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_score_calibrations_rule_set_id_fkey"
            columns: ["rule_set_id"]
            isOneToOne: false
            referencedRelation: "lead_score_rule_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_score_events: {
        Row: {
          client_id: number | null
          created_at: string
          id: string
          lead_id: string
          lead_source: Database["public"]["Enums"]["lead_source_type"]
          occurred_at: string
          signal_type: string
          value: Json
          workspace_id: string
        }
        Insert: {
          client_id?: number | null
          created_at?: string
          id?: string
          lead_id: string
          lead_source: Database["public"]["Enums"]["lead_source_type"]
          occurred_at?: string
          signal_type: string
          value?: Json
          workspace_id: string
        }
        Update: {
          client_id?: number | null
          created_at?: string
          id?: string
          lead_id?: string
          lead_source?: Database["public"]["Enums"]["lead_source_type"]
          occurred_at?: string
          signal_type?: string
          value?: Json
          workspace_id?: string
        }
        Relationships: []
      }
      lead_score_rule_sets: {
        Row: {
          auto_tune_enabled: boolean
          created_at: string
          created_by: string | null
          grade_thresholds: Json
          id: string
          is_active: boolean
          last_tuned_at: string | null
          name: string
          qualifying_rules: Json
          scope: Database["public"]["Enums"]["lead_score_scope"]
          scope_id: string | null
          source_modifiers: Json
          updated_at: string
          version: number
          weights: Json
          workspace_id: string
        }
        Insert: {
          auto_tune_enabled?: boolean
          created_at?: string
          created_by?: string | null
          grade_thresholds?: Json
          id?: string
          is_active?: boolean
          last_tuned_at?: string | null
          name?: string
          qualifying_rules?: Json
          scope?: Database["public"]["Enums"]["lead_score_scope"]
          scope_id?: string | null
          source_modifiers?: Json
          updated_at?: string
          version?: number
          weights?: Json
          workspace_id: string
        }
        Update: {
          auto_tune_enabled?: boolean
          created_at?: string
          created_by?: string | null
          grade_thresholds?: Json
          id?: string
          is_active?: boolean
          last_tuned_at?: string | null
          name?: string
          qualifying_rules?: Json
          scope?: Database["public"]["Enums"]["lead_score_scope"]
          scope_id?: string | null
          source_modifiers?: Json
          updated_at?: string
          version?: number
          weights?: Json
          workspace_id?: string
        }
        Relationships: []
      }
      lead_scores: {
        Row: {
          breakdown: Json
          campaign_id: string | null
          client_id: number | null
          computed_at: string
          created_at: string
          grade: Database["public"]["Enums"]["lead_score_grade"]
          id: string
          lead_id: string
          lead_source: Database["public"]["Enums"]["lead_source_type"]
          outcome: Database["public"]["Enums"]["lead_outcome"]
          rule_set_id: string | null
          rule_set_version: number | null
          score: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          breakdown?: Json
          campaign_id?: string | null
          client_id?: number | null
          computed_at?: string
          created_at?: string
          grade?: Database["public"]["Enums"]["lead_score_grade"]
          id?: string
          lead_id: string
          lead_source: Database["public"]["Enums"]["lead_source_type"]
          outcome?: Database["public"]["Enums"]["lead_outcome"]
          rule_set_id?: string | null
          rule_set_version?: number | null
          score?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          breakdown?: Json
          campaign_id?: string | null
          client_id?: number | null
          computed_at?: string
          created_at?: string
          grade?: Database["public"]["Enums"]["lead_score_grade"]
          id?: string
          lead_id?: string
          lead_source?: Database["public"]["Enums"]["lead_source_type"]
          outcome?: Database["public"]["Enums"]["lead_outcome"]
          rule_set_id?: string | null
          rule_set_version?: number | null
          score?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_scores_rule_set_id_fkey"
            columns: ["rule_set_id"]
            isOneToOne: false
            referencedRelation: "lead_score_rule_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          client_id: number
          created_at: string
          date: string
          ghl_contact_id: string | null
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
          ghl_contact_id?: string | null
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
          ghl_contact_id?: string | null
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
      linkedin_leads: {
        Row: {
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
          external_lead_id: string | null
          field_data: Json | null
          form_id: string | null
          form_name: string | null
          full_name: string | null
          id: string
          note: string | null
          phone: string | null
          raw: Json | null
          stage: Database["public"]["Enums"]["lead_stage"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
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
          external_lead_id?: string | null
          field_data?: Json | null
          form_id?: string | null
          form_name?: string | null
          full_name?: string | null
          id?: string
          note?: string | null
          phone?: string | null
          raw?: Json | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
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
          external_lead_id?: string | null
          field_data?: Json | null
          form_id?: string | null
          form_name?: string | null
          full_name?: string | null
          id?: string
          note?: string | null
          phone?: string | null
          raw?: Json | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      manual_leads: {
        Row: {
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
          external_lead_id: string | null
          field_data: Json | null
          form_id: string | null
          form_name: string | null
          full_name: string | null
          id: string
          note: string | null
          phone: string | null
          raw: Json | null
          stage: Database["public"]["Enums"]["lead_stage"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
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
          external_lead_id?: string | null
          field_data?: Json | null
          form_id?: string | null
          form_name?: string | null
          full_name?: string | null
          id?: string
          note?: string | null
          phone?: string | null
          raw?: Json | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
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
          external_lead_id?: string | null
          field_data?: Json | null
          form_id?: string | null
          form_name?: string | null
          full_name?: string | null
          id?: string
          note?: string | null
          phone?: string | null
          raw?: Json | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
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
      meta_ads: {
        Row: {
          ad_account_id: string
          adset_id: string | null
          adset_name: string | null
          body: string | null
          call_to_action_type: string | null
          campaign_id: string | null
          campaign_name: string | null
          clicks: number
          client_id: number | null
          cpl: number
          created_at: string
          creative_hash: string | null
          creative_id: string | null
          ctr: number
          days_active: number
          effective_status: string | null
          first_seen_at: string | null
          id: string
          image_url: string | null
          impressions: number
          leads: number
          link_url: string | null
          media_type: string | null
          name: string | null
          page_avatar_url: string | null
          page_name: string | null
          spend: number
          targeting_summary: Json | null
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          video_id: string | null
          workspace_id: string
        }
        Insert: {
          ad_account_id: string
          adset_id?: string | null
          adset_name?: string | null
          body?: string | null
          call_to_action_type?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          clicks?: number
          client_id?: number | null
          cpl?: number
          created_at?: string
          creative_hash?: string | null
          creative_id?: string | null
          ctr?: number
          days_active?: number
          effective_status?: string | null
          first_seen_at?: string | null
          id: string
          image_url?: string | null
          impressions?: number
          leads?: number
          link_url?: string | null
          media_type?: string | null
          name?: string | null
          page_avatar_url?: string | null
          page_name?: string | null
          spend?: number
          targeting_summary?: Json | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          video_id?: string | null
          workspace_id: string
        }
        Update: {
          ad_account_id?: string
          adset_id?: string | null
          adset_name?: string | null
          body?: string | null
          call_to_action_type?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          clicks?: number
          client_id?: number | null
          cpl?: number
          created_at?: string
          creative_hash?: string | null
          creative_id?: string | null
          ctr?: number
          days_active?: number
          effective_status?: string | null
          first_seen_at?: string | null
          id?: string
          image_url?: string | null
          impressions?: number
          leads?: number
          link_url?: string | null
          media_type?: string | null
          name?: string | null
          page_avatar_url?: string | null
          page_name?: string | null
          spend?: number
          targeting_summary?: Json | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          video_id?: string | null
          workspace_id?: string
        }
        Relationships: []
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
      meta_form_pipeline_map: {
        Row: {
          client_id: number
          created_at: string
          form_id: string
          form_name: string | null
          id: string
          pipeline_id: string
          pipeline_name: string | null
          stage_id: string | null
          stage_name: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: number
          created_at?: string
          form_id: string
          form_name?: string | null
          id?: string
          pipeline_id: string
          pipeline_name?: string | null
          stage_id?: string | null
          stage_name?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: number
          created_at?: string
          form_id?: string
          form_name?: string | null
          id?: string
          pipeline_id?: string
          pipeline_name?: string | null
          stage_id?: string | null
          stage_name?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_form_pipeline_map_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_form_pipeline_map_workspace_id_fkey"
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
      meta_insights_granular_daily: {
        Row: {
          ad_account_id: string
          clicks: number
          created_at: string
          date: string
          id: string
          impressions: number
          leads: number
          level: Database["public"]["Enums"]["rebill_assignment_level"]
          object_id: string
          object_name: string | null
          parent_adset_id: string | null
          parent_campaign_id: string | null
          raw: Json | null
          spend: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ad_account_id: string
          clicks?: number
          created_at?: string
          date: string
          id?: string
          impressions?: number
          leads?: number
          level: Database["public"]["Enums"]["rebill_assignment_level"]
          object_id: string
          object_name?: string | null
          parent_adset_id?: string | null
          parent_campaign_id?: string | null
          raw?: Json | null
          spend?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ad_account_id?: string
          clicks?: number
          created_at?: string
          date?: string
          id?: string
          impressions?: number
          leads?: number
          level?: Database["public"]["Enums"]["rebill_assignment_level"]
          object_id?: string
          object_name?: string | null
          parent_adset_id?: string | null
          parent_campaign_id?: string | null
          raw?: Json | null
          spend?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
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
          clickup_task_id: string | null
          client_id: number | null
          created_at: string
          created_time: string | null
          email: string | null
          field_data: Json | null
          form_id: string | null
          form_name: string | null
          full_name: string | null
          ghl_check_status: string | null
          ghl_checked_at: string | null
          ghl_contact_id: string | null
          ghl_opportunity_id: string | null
          ghl_stage: string | null
          ghl_status_updated_at: string | null
          id: string
          last_sync_error: string | null
          lead_id: string
          next_check_at: string | null
          note: string | null
          phone: string | null
          raw: Json | null
          recovered_at: string | null
          stage: Database["public"]["Enums"]["lead_stage"]
          sync_attempts: number
          sync_status: string
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
          clickup_task_id?: string | null
          client_id?: number | null
          created_at?: string
          created_time?: string | null
          email?: string | null
          field_data?: Json | null
          form_id?: string | null
          form_name?: string | null
          full_name?: string | null
          ghl_check_status?: string | null
          ghl_checked_at?: string | null
          ghl_contact_id?: string | null
          ghl_opportunity_id?: string | null
          ghl_stage?: string | null
          ghl_status_updated_at?: string | null
          id?: string
          last_sync_error?: string | null
          lead_id: string
          next_check_at?: string | null
          note?: string | null
          phone?: string | null
          raw?: Json | null
          recovered_at?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          sync_attempts?: number
          sync_status?: string
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
          clickup_task_id?: string | null
          client_id?: number | null
          created_at?: string
          created_time?: string | null
          email?: string | null
          field_data?: Json | null
          form_id?: string | null
          form_name?: string | null
          full_name?: string | null
          ghl_check_status?: string | null
          ghl_checked_at?: string | null
          ghl_contact_id?: string | null
          ghl_opportunity_id?: string | null
          ghl_stage?: string | null
          ghl_status_updated_at?: string | null
          id?: string
          last_sync_error?: string | null
          lead_id?: string
          next_check_at?: string | null
          note?: string | null
          phone?: string | null
          raw?: Json | null
          recovered_at?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          sync_attempts?: number
          sync_status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      meta_oauth_events: {
        Row: {
          connection_id: string | null
          correlation_id: string
          created_at: string
          declined_scopes: string[] | null
          details: Json | null
          error_code: string | null
          error_message: string | null
          granted_scopes: string[] | null
          http_status: number | null
          id: string
          meta_user_name: string | null
          outcome: string
          step: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          connection_id?: string | null
          correlation_id: string
          created_at?: string
          declined_scopes?: string[] | null
          details?: Json | null
          error_code?: string | null
          error_message?: string | null
          granted_scopes?: string[] | null
          http_status?: number | null
          id?: string
          meta_user_name?: string | null
          outcome: string
          step: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          connection_id?: string | null
          correlation_id?: string
          created_at?: string
          declined_scopes?: string[] | null
          details?: Json | null
          error_code?: string | null
          error_message?: string | null
          granted_scopes?: string[] | null
          http_status?: number | null
          id?: string
          meta_user_name?: string | null
          outcome?: string
          step?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_oauth_events_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "meta_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_oauth_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      optimization_run_log: {
        Row: {
          client_id: number
          error: string | null
          id: string
          schedule_id: string | null
          status: string
          summary: string | null
          tool_events: Json | null
          triggered_at: string
          workspace_id: string
        }
        Insert: {
          client_id: number
          error?: string | null
          id?: string
          schedule_id?: string | null
          status: string
          summary?: string | null
          tool_events?: Json | null
          triggered_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: number
          error?: string | null
          id?: string
          schedule_id?: string | null
          status?: string
          summary?: string | null
          tool_events?: Json | null
          triggered_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "optimization_run_log_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "client_optimization_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_onboarding: {
        Row: {
          billing_done: boolean
          brand_done: boolean
          brand_logo_url: string | null
          brand_notes: string | null
          brand_primary_color: string | null
          business_name: string | null
          client_id: number
          completed_at: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          meta_done: boolean
          profile_done: boolean
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          billing_done?: boolean
          brand_done?: boolean
          brand_logo_url?: string | null
          brand_notes?: string | null
          brand_primary_color?: string | null
          business_name?: string | null
          client_id: number
          completed_at?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          meta_done?: boolean
          profile_done?: boolean
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          billing_done?: boolean
          brand_done?: boolean
          brand_logo_url?: string | null
          brand_notes?: string | null
          brand_primary_color?: string | null
          business_name?: string | null
          client_id?: number
          completed_at?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          meta_done?: boolean
          profile_done?: boolean
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      portal_users: {
        Row: {
          accepted_at: string | null
          approved_at: string | null
          approved_by: string | null
          client_id: number
          created_at: string
          id: string
          invite_id: string | null
          status: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          client_id: number
          created_at?: string
          id?: string
          invite_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          client_id?: number
          created_at?: string
          id?: string
          invite_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          gfunnel_user_profile_id: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          gfunnel_user_profile_id?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          gfunnel_user_profile_id?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rebill_assignments: {
        Row: {
          ad_account_id: string
          client_id: number
          created_at: string
          excluded: boolean
          id: string
          level: Database["public"]["Enums"]["rebill_assignment_level"]
          object_id: string
          object_name: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ad_account_id: string
          client_id: number
          created_at?: string
          excluded?: boolean
          id?: string
          level: Database["public"]["Enums"]["rebill_assignment_level"]
          object_id: string
          object_name?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ad_account_id?: string
          client_id?: number
          created_at?: string
          excluded?: boolean
          id?: string
          level?: Database["public"]["Enums"]["rebill_assignment_level"]
          object_id?: string
          object_name?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      rebill_configs: {
        Row: {
          cadence: Database["public"]["Enums"]["rebill_cadence"]
          client_id: number
          created_at: string
          currency: string
          enabled: boolean
          fixed_fee: number
          id: string
          markup_pct: number
          monthly_minimum: number
          notes: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          cadence?: Database["public"]["Enums"]["rebill_cadence"]
          client_id: number
          created_at?: string
          currency?: string
          enabled?: boolean
          fixed_fee?: number
          id?: string
          markup_pct?: number
          monthly_minimum?: number
          notes?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          cadence?: Database["public"]["Enums"]["rebill_cadence"]
          client_id?: number
          created_at?: string
          currency?: string
          enabled?: boolean
          fixed_fee?: number
          id?: string
          markup_pct?: number
          monthly_minimum?: number
          notes?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      rebill_invoices: {
        Row: {
          client_id: number
          created_at: string
          currency: string
          fixed_fee: number
          id: string
          invoice_number: string | null
          line_items: Json
          markup_pct: number
          monthly_minimum: number
          notes: string | null
          paid_at: string | null
          pdf_url: string | null
          period_end: string
          period_start: string
          raw_spend: number
          sent_at: string | null
          status: Database["public"]["Enums"]["rebill_invoice_status"]
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          total_due: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: number
          created_at?: string
          currency?: string
          fixed_fee?: number
          id?: string
          invoice_number?: string | null
          line_items?: Json
          markup_pct?: number
          monthly_minimum?: number
          notes?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          period_end: string
          period_start: string
          raw_spend?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["rebill_invoice_status"]
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          total_due?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: number
          created_at?: string
          currency?: string
          fixed_fee?: number
          id?: string
          invoice_number?: string | null
          line_items?: Json
          markup_pct?: number
          monthly_minimum?: number
          notes?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          period_end?: string
          period_start?: string
          raw_spend?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["rebill_invoice_status"]
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          total_due?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      report_templates: {
        Row: {
          branding: Json
          commentary_template: string | null
          created_at: string
          created_by: string
          default_period: string
          description: string | null
          id: string
          name: string
          sections: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          branding?: Json
          commentary_template?: string | null
          created_at?: string
          created_by: string
          default_period?: string
          description?: string | null
          id?: string
          name: string
          sections?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          branding?: Json
          commentary_template?: string | null
          created_at?: string
          created_by?: string
          default_period?: string
          description?: string | null
          id?: string
          name?: string
          sections?: Json
          updated_at?: string
          workspace_id?: string
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
      stripe_charges: {
        Row: {
          amount: number
          amount_refunded: number
          client_id: number
          created_at: string
          created_at_stripe: string
          currency: string
          customer_email: string | null
          description: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          livemode: boolean
          paid: boolean
          raw: Json | null
          receipt_url: string | null
          refunded: boolean
          status: string
          stripe_charge_id: string
          stripe_customer_id: string | null
          stripe_user_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount: number
          amount_refunded?: number
          client_id: number
          created_at?: string
          created_at_stripe: string
          currency: string
          customer_email?: string | null
          description?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          livemode?: boolean
          paid?: boolean
          raw?: Json | null
          receipt_url?: string | null
          refunded?: boolean
          status: string
          stripe_charge_id: string
          stripe_customer_id?: string | null
          stripe_user_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          amount_refunded?: number
          client_id?: number
          created_at?: string
          created_at_stripe?: string
          currency?: string
          customer_email?: string | null
          description?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          livemode?: boolean
          paid?: boolean
          raw?: Json | null
          receipt_url?: string | null
          refunded?: boolean
          status?: string
          stripe_charge_id?: string
          stripe_customer_id?: string | null
          stripe_user_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_charges_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_charges_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_connect_oauth_states: {
        Row: {
          client_id: number
          connect_type: string
          consumed_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          return_url: string | null
          state: string
          workspace_id: string
        }
        Insert: {
          client_id: number
          connect_type?: string
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          return_url?: string | null
          state: string
          workspace_id: string
        }
        Update: {
          client_id?: number
          connect_type?: string
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          return_url?: string | null
          state?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_connect_oauth_states_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_connect_oauth_states_workspace_id_fkey"
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
      tiktok_leads: {
        Row: {
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
          external_lead_id: string | null
          field_data: Json | null
          form_id: string | null
          form_name: string | null
          full_name: string | null
          id: string
          note: string | null
          phone: string | null
          raw: Json | null
          stage: Database["public"]["Enums"]["lead_stage"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
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
          external_lead_id?: string | null
          field_data?: Json | null
          form_id?: string | null
          form_name?: string | null
          full_name?: string | null
          id?: string
          note?: string | null
          phone?: string | null
          raw?: Json | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
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
          external_lead_id?: string | null
          field_data?: Json | null
          form_id?: string | null
          form_name?: string | null
          full_name?: string | null
          id?: string
          note?: string | null
          phone?: string | null
          raw?: Json | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
          workspace_id?: string
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
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          client_id: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          invoice_id: string | null
          stripe_payment_intent_id: string | null
          type: Database["public"]["Enums"]["wallet_txn_type"]
          wallet_id: string
          workspace_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          client_id: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          type: Database["public"]["Enums"]["wallet_txn_type"]
          wallet_id: string
          workspace_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          client_id?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          type?: Database["public"]["Enums"]["wallet_txn_type"]
          wallet_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "client_wallets"
            referencedColumns: ["id"]
          },
        ]
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
      workspace_kpi_settings: {
        Row: {
          created_at: string
          green_score_min: number
          id: string
          overrides: Json
          preset_id: string | null
          updated_at: string
          workspace_id: string
          yellow_score_min: number
        }
        Insert: {
          created_at?: string
          green_score_min?: number
          id?: string
          overrides?: Json
          preset_id?: string | null
          updated_at?: string
          workspace_id: string
          yellow_score_min?: number
        }
        Update: {
          created_at?: string
          green_score_min?: number
          id?: string
          overrides?: Json
          preset_id?: string | null
          updated_at?: string
          workspace_id?: string
          yellow_score_min?: number
        }
        Relationships: [
          {
            foreignKeyName: "workspace_kpi_settings_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "kpi_threshold_presets"
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
          auth_mode: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string | null
          updated_at: string
        }
        Insert: {
          auth_mode?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug?: string | null
          updated_at?: string
        }
        Update: {
          auth_mode?: string
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
      client_stripe_connections: {
        Row: {
          client_id: number | null
          connect_type: string | null
          connected_at: string | null
          disconnected_at: string | null
          id: string | null
          is_connected: boolean | null
          last_event_at: string | null
          last_event_type: string | null
          livemode: boolean | null
          publishable_key: string | null
          scope: string | null
          stripe_user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          client_id?: number | null
          connect_type?: string | null
          connected_at?: string | null
          disconnected_at?: string | null
          id?: string | null
          is_connected?: never
          last_event_at?: string | null
          last_event_type?: string | null
          livemode?: boolean | null
          publishable_key?: string | null
          scope?: string | null
          stripe_user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          client_id?: number | null
          connect_type?: string | null
          connected_at?: string | null
          disconnected_at?: string | null
          id?: string | null
          is_connected?: never
          last_event_at?: string | null
          last_event_type?: string | null
          livemode?: boolean | null
          publishable_key?: string | null
          scope?: string | null
          stripe_user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_stripe_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_stripe_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_write_workspace: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      compute_client_status: { Args: { _client_id: number }; Returns: string }
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
      is_portal_user_for_client: {
        Args: { _client_id: number; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      lookup_client_invite: { Args: { _code_or_token: string }; Returns: Json }
      notif_pref_enabled: {
        Args: { _event_type: string; _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      recompute_all_client_statuses: {
        Args: { _workspace_id: string }
        Returns: number
      }
      redeem_client_invite: { Args: { _code_or_token: string }; Returns: Json }
      resolve_client_kpi_config: { Args: { _client_id: number }; Returns: Json }
      resolve_lead_score_rule_set: {
        Args: {
          _campaign_id: string
          _client_id: number
          _workspace_id: string
        }
        Returns: {
          auto_tune_enabled: boolean
          created_at: string
          created_by: string | null
          grade_thresholds: Json
          id: string
          is_active: boolean
          last_tuned_at: string | null
          name: string
          qualifying_rules: Json
          scope: Database["public"]["Enums"]["lead_score_scope"]
          scope_id: string | null
          source_modifiers: Json
          updated_at: string
          version: number
          weights: Json
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "lead_score_rule_sets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      seed_default_status_phases: {
        Args: { _workspace_id: string }
        Returns: undefined
      }
      workspace_role_of: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin"
      bm_type: "Own BM" | "Agency BM"
      calibration_status: "pending" | "approved" | "rejected" | "superseded"
      campaign_status: "active" | "paused"
      client_status:
        | "GREEN"
        | "YELLOW"
        | "RED"
        | "BLOCKED"
        | "NEW"
        | "LAUNCHING"
        | "RELAUNCH"
        | "PENDING_APPROVAL"
        | "SETUP_COMPLETE"
        | "LEARNING"
        | "PENDING_CANCELLATION"
        | "CANCELLED"
      lead_outcome: "unknown" | "closed_won" | "closed_lost" | "disqualified"
      lead_score_grade: "A" | "B" | "C" | "D"
      lead_score_scope: "workspace" | "client" | "campaign"
      lead_source_type: "meta" | "google" | "linkedin" | "manual" | "ghl"
      lead_stage: "intake" | "in_progress" | "converted"
      rebill_assignment_level: "account" | "campaign" | "adset" | "ad"
      rebill_cadence: "monthly" | "weekly" | "custom"
      rebill_invoice_status: "draft" | "sent" | "paid" | "void"
      report_status: "draft" | "ready" | "delivered"
      wallet_txn_type:
        | "topup"
        | "invoice_charge"
        | "manual_credit"
        | "manual_debit"
        | "refund"
        | "adjustment"
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
      calibration_status: ["pending", "approved", "rejected", "superseded"],
      campaign_status: ["active", "paused"],
      client_status: [
        "GREEN",
        "YELLOW",
        "RED",
        "BLOCKED",
        "NEW",
        "LAUNCHING",
        "RELAUNCH",
        "PENDING_APPROVAL",
        "SETUP_COMPLETE",
        "LEARNING",
        "PENDING_CANCELLATION",
        "CANCELLED",
      ],
      lead_outcome: ["unknown", "closed_won", "closed_lost", "disqualified"],
      lead_score_grade: ["A", "B", "C", "D"],
      lead_score_scope: ["workspace", "client", "campaign"],
      lead_source_type: ["meta", "google", "linkedin", "manual", "ghl"],
      lead_stage: ["intake", "in_progress", "converted"],
      rebill_assignment_level: ["account", "campaign", "adset", "ad"],
      rebill_cadence: ["monthly", "weekly", "custom"],
      rebill_invoice_status: ["draft", "sent", "paid", "void"],
      report_status: ["draft", "ready", "delivered"],
      wallet_txn_type: [
        "topup",
        "invoice_charge",
        "manual_credit",
        "manual_debit",
        "refund",
        "adjustment",
      ],
      workspace_role: ["owner", "admin", "member", "viewer"],
    },
  },
} as const
