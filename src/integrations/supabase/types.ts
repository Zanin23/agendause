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
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          times?: string[]
          updated_at?: string
          user_id: string
          weekdays?: number[]
        }
        Update: {
          created_at?: string
          enabled?: boolean
          times?: string[]
          updated_at?: string
          user_id?: string
          weekdays?: number[]
        }
        Relationships: []
      }
      billing_request_updates: {
        Row: {
          content: string
          created_at: string
          id: string
          request_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          request_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_request_updates_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "billing_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_requests: {
        Row: {
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
        }
        Insert: {
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
        }
        Update: {
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
        }
        Relationships: []
      }
      guest_acceptances: {
        Row: {
          accepted_at: string
          email: string | null
          full_name: string
          id: string
          training_id: string
        }
        Insert: {
          accepted_at?: string
          email?: string | null
          full_name: string
          id?: string
          training_id: string
        }
        Update: {
          accepted_at?: string
          email?: string | null
          full_name?: string
          id?: string
          training_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_acceptances_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
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
        }
        Relationships: []
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
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
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
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          body: string
          created_at?: string
          id?: string
          item_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          body?: string
          created_at?: string
          id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_comments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "schedule_items"
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
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          schedule_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          schedule_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_phases_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "implementation_schedules"
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
        }
        Insert: {
          accepted_at?: string
          id?: string
          training_id: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          id?: string
          training_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_acceptances_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
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
        }
        Relationships: [
          {
            foreignKeyName: "training_attachments_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
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
        }
        Relationships: [
          {
            foreignKeyName: "training_reschedules_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
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
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_schedule_by_token: {
        Args: { _ip: string; _name: string; _token: string }
        Returns: boolean
      }
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
    }
    Enums: {
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
