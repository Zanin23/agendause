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
      billing_notification_settings: {
        Row: {
          created_at: string
          enabled: boolean
          times: string[]
          updated_at: string
          user_id: string
          weekdays: number[]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          times?: string[]
          updated_at?: string
          user_id: string
          weekdays?: number[]
          workspace_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          times?: string[]
          updated_at?: string
          user_id?: string
          weekdays?: number[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_notification_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_request_updates: {
        Row: {
          content: string
          created_at: string
          id: string
          request_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          request_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          request_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_request_updates_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "billing_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_request_updates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_requests: {
        Row: {
          carried_over_from_id: string | null
          carried_over_to: string | null
          client: string
          created_at: string
          delivered_at: string | null
          description: string | null
          id: string
          number: string
          status: string
          title: string
          updated_at: string
          user_id: string
          week_start: string
          workspace_id: string
        }
        Insert: {
          carried_over_from_id?: string | null
          carried_over_to?: string | null
          client: string
          created_at?: string
          delivered_at?: string | null
          description?: string | null
          id?: string
          number: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
          week_start?: string
          workspace_id: string
        }
        Update: {
          carried_over_from_id?: string | null
          carried_over_to?: string | null
          client?: string
          created_at?: string
          delivered_at?: string | null
          description?: string | null
          id?: string
          number?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          week_start?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_requests_carried_over_from_id_fkey"
            columns: ["carried_over_from_id"]
            isOneToOne: false
            referencedRelation: "billing_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      company_notes: {
        Row: {
          company: string
          content: string
          created_at: string
          id: string
          note_date: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          company: string
          content: string
          created_at?: string
          id?: string
          note_date: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          company?: string
          content?: string
          created_at?: string
          id?: string
          note_date?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_acceptances: {
        Row: {
          accepted_at: string
          email: string | null
          full_name: string
          id: string
          signature: string | null
          training_id: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string
          email?: string | null
          full_name: string
          id?: string
          signature?: string | null
          training_id: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string
          email?: string | null
          full_name?: string
          id?: string
          signature?: string | null
          training_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_acceptances_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_acceptances_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      handoff_terms: {
        Row: {
          client_accepted_at: string | null
          client_accepted_ip: string | null
          client_accepted_name: string | null
          client_name: string
          client_signature: string | null
          created_at: string
          created_by: string | null
          id: string
          modules: Json
          notes: string | null
          public_token: string | null
          schedule_id: string
          support_accepted_at: string | null
          support_accepted_by: string | null
          support_accepted_name: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          client_accepted_at?: string | null
          client_accepted_ip?: string | null
          client_accepted_name?: string | null
          client_name: string
          client_signature?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          modules?: Json
          notes?: string | null
          public_token?: string | null
          schedule_id: string
          support_accepted_at?: string | null
          support_accepted_by?: string | null
          support_accepted_name?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          client_accepted_at?: string | null
          client_accepted_ip?: string | null
          client_accepted_name?: string | null
          client_name?: string
          client_signature?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          modules?: Json
          notes?: string | null
          public_token?: string | null
          schedule_id?: string
          support_accepted_at?: string | null
          support_accepted_by?: string | null
          support_accepted_name?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "handoff_terms_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: true
            referencedRelation: "implementation_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handoff_terms_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      implementation_schedules: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          accepted_ip: string | null
          cadence: Database["public"]["Enums"]["schedule_cadence"]
          client_email: string | null
          client_name: string
          created_at: string
          id: string
          modality: Database["public"]["Enums"]["schedule_modality"]
          observations: string | null
          owner_id: string
          public_token: string | null
          start_date: string
          status: string
          updated_at: string
          use_team: string[]
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          accepted_ip?: string | null
          cadence?: Database["public"]["Enums"]["schedule_cadence"]
          client_email?: string | null
          client_name: string
          created_at?: string
          id?: string
          modality?: Database["public"]["Enums"]["schedule_modality"]
          observations?: string | null
          owner_id: string
          public_token?: string | null
          start_date: string
          status?: string
          updated_at?: string
          use_team?: string[]
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          accepted_ip?: string | null
          cadence?: Database["public"]["Enums"]["schedule_cadence"]
          client_email?: string | null
          client_name?: string
          created_at?: string
          id?: string
          modality?: Database["public"]["Enums"]["schedule_modality"]
          observations?: string | null
          owner_id?: string
          public_token?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          use_team?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "implementation_schedules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      implementation_templates: {
        Row: {
          content: Json
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          is_global: boolean
          name: string
          owner_id: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          content: Json
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          is_global?: boolean
          name: string
          owner_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          content?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          is_global?: boolean
          name?: string
          owner_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "implementation_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      note_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mime_type: string | null
          note_id: string
          size_bytes: number | null
          storage_path: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mime_type?: string | null
          note_id: string
          size_bytes?: number | null
          storage_path: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          note_id?: string
          size_bytes?: number | null
          storage_path?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "note_attachments_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "company_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_workspace_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          active_workspace_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          active_workspace_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_workspace_id_fkey"
            columns: ["active_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      schedule_comments: {
        Row: {
          author_id: string | null
          author_name: string | null
          body: string
          created_at: string
          id: string
          item_id: string
          workspace_id: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          body: string
          created_at?: string
          id?: string
          item_id: string
          workspace_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          body?: string
          created_at?: string
          id?: string
          item_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_comments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "schedule_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_comments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_items: {
        Row: {
          assignee: string | null
          created_at: string
          description: string | null
          done_date: string | null
          id: string
          notes: string | null
          phase_id: string
          planned_date: string | null
          position: number
          status: Database["public"]["Enums"]["schedule_item_status"]
          title: string
          training_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assignee?: string | null
          created_at?: string
          description?: string | null
          done_date?: string | null
          id?: string
          notes?: string | null
          phase_id: string
          planned_date?: string | null
          position?: number
          status?: Database["public"]["Enums"]["schedule_item_status"]
          title: string
          training_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assignee?: string | null
          created_at?: string
          description?: string | null
          done_date?: string | null
          id?: string
          notes?: string | null
          phase_id?: string
          planned_date?: string | null
          position?: number
          status?: Database["public"]["Enums"]["schedule_item_status"]
          title?: string
          training_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_items_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "schedule_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_items_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_phases: {
        Row: {
          created_at: string
          description: string | null
          id: string
          position: number
          schedule_id: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          schedule_id: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          schedule_id?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_phases_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "implementation_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_phases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      training_acceptances: {
        Row: {
          accepted_at: string
          id: string
          training_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          training_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string
          id?: string
          training_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_acceptances_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_acceptances_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      training_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          training_id: string
          uploaded_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          training_id: string
          uploaded_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          training_id?: string
          uploaded_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_attachments_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      training_reschedules: {
        Row: {
          changed_by: string | null
          changed_by_name: string | null
          created_at: string
          id: string
          new_duration_minutes: number
          new_scheduled_at: string
          previous_duration_minutes: number
          previous_scheduled_at: string
          reason: string
          training_id: string
          workspace_id: string
        }
        Insert: {
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          id?: string
          new_duration_minutes: number
          new_scheduled_at: string
          previous_duration_minutes: number
          previous_scheduled_at: string
          reason: string
          training_id: string
          workspace_id: string
        }
        Update: {
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          id?: string
          new_duration_minutes?: number
          new_scheduled_at?: string
          previous_duration_minutes?: number
          previous_scheduled_at?: string
          reason?: string
          training_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_reschedules_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_reschedules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      trainings: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          client: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string
          description: string | null
          duration_minutes: number
          id: string
          internal_notes: string | null
          location: string | null
          scheduled_at: string
          status: string
          title: string
          updated_at: string
          visit_type: string
          workspace_id: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          client?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          duration_minutes?: number
          id?: string
          internal_notes?: string | null
          location?: string | null
          scheduled_at: string
          status?: string
          title: string
          updated_at?: string
          visit_type?: string
          workspace_id: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          client?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          internal_notes?: string | null
          location?: string | null
          scheduled_at?: string
          status?: string
          title?: string
          updated_at?: string
          visit_type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      workspace_members: {
        Row: {
          created_at: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: string
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
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_handoff_as_support: {
        Args: { _handoff_id: string; _name: string }
        Returns: boolean
      }
      accept_handoff_by_token: {
        Args: {
          _ip: string
          _name: string
          _signature?: string
          _token: string
        }
        Returns: boolean
      }
      accept_schedule_by_token: {
        Args: { _ip: string; _name: string; _token: string }
        Returns: boolean
      }
      complete_schedule_for_handoff: {
        Args: { _schedule_id: string }
        Returns: boolean
      }
      current_workspace: { Args: never; Returns: string }
      get_handoff_by_token: { Args: { _token: string }; Returns: Json }
      get_public_training: {
        Args: { _id: string }
        Returns: {
          client: string
          description: string
          duration_minutes: number
          id: string
          location: string
          scheduled_at: string
          title: string
        }[]
      }
      get_public_training_attachments: {
        Args: { _training_id: string }
        Returns: {
          file_name: string
          id: string
          mime_type: string
          size_bytes: number
        }[]
      }
      get_schedule_by_token: { Args: { _token: string }; Returns: Json }
      get_training_user_acceptances: {
        Args: { _training_id: string }
        Returns: {
          accepted_at: string
          email: string
          full_name: string
          id: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_workspace_member: { Args: { _workspace_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "member"
      schedule_cadence: "semanal" | "quinzenal" | "mensal" | "customizada"
      schedule_item_status:
        | "pending"
        | "in_progress"
        | "done"
        | "blocked"
        | "rescheduled"
        | "not_applicable"
      schedule_modality: "presencial" | "remoto" | "hibrido"
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
      app_role: ["admin", "member"],
      schedule_cadence: ["semanal", "quinzenal", "mensal", "customizada"],
      schedule_item_status: [
        "pending",
        "in_progress",
        "done",
        "blocked",
        "rescheduled",
        "not_applicable",
      ],
      schedule_modality: ["presencial", "remoto", "hibrido"],
    },
  },
} as const
