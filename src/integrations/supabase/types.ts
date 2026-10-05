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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          created_at: string
          id: string
          level: string
          message: string
          read: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          level?: string
          message: string
          read?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          level?: string
          message?: string
          read?: boolean
          user_id?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          approved: boolean
          audio_rms_db: number | null
          audio_state: string
          batch_id: string | null
          campaign_first: boolean
          caption: string | null
          caption_issue: string | null
          caption_source: string | null
          cover_path: string | null
          created_at: string
          duration_s: number | null
          file_name: string
          height: number | null
          id: string
          kind: string
          mime: string | null
          rel_path: string
          rendered_path: string | null
          rendered_verified: Json | null
          scheduled_at: string | null
          seasonal: boolean
          sha256: string
          size_bytes: number
          skipped: boolean
          sort_index: number
          storage_path: string | null
          topics: string[]
          upload_state: string
          user_id: string
          width: number | null
        }
        Insert: {
          approved?: boolean
          audio_rms_db?: number | null
          audio_state?: string
          batch_id?: string | null
          campaign_first?: boolean
          caption?: string | null
          caption_issue?: string | null
          caption_source?: string | null
          cover_path?: string | null
          created_at?: string
          duration_s?: number | null
          file_name: string
          height?: number | null
          id?: string
          kind: string
          mime?: string | null
          rel_path: string
          rendered_path?: string | null
          rendered_verified?: Json | null
          scheduled_at?: string | null
          seasonal?: boolean
          sha256: string
          size_bytes?: number
          skipped?: boolean
          sort_index?: number
          storage_path?: string | null
          topics?: string[]
          upload_state?: string
          user_id?: string
          width?: number | null
        }
        Update: {
          approved?: boolean
          audio_rms_db?: number | null
          audio_state?: string
          batch_id?: string | null
          campaign_first?: boolean
          caption?: string | null
          caption_issue?: string | null
          caption_source?: string | null
          cover_path?: string | null
          created_at?: string
          duration_s?: number | null
          file_name?: string
          height?: number | null
          id?: string
          kind?: string
          mime?: string | null
          rel_path?: string
          rendered_path?: string | null
          rendered_verified?: Json | null
          scheduled_at?: string | null
          seasonal?: boolean
          sha256?: string
          size_bytes?: number
          skipped?: boolean
          sort_index?: number
          storage_path?: string | null
          topics?: string[]
          upload_state?: string
          user_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_tracks: {
        Row: {
          created_at: string
          duration_s: number | null
          id: string
          license_note: string | null
          name: string
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_s?: number | null
          id?: string
          license_note?: string | null
          name: string
          storage_path: string
          user_id?: string
        }
        Update: {
          created_at?: string
          duration_s?: number | null
          id?: string
          license_note?: string | null
          name?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      batches: {
        Row: {
          allow_repeat: boolean
          created_at: string
          id: string
          import_state: Json
          name: string
          processed_files: number
          source: string
          status: string
          total_files: number
          user_id: string
        }
        Insert: {
          allow_repeat?: boolean
          created_at?: string
          id?: string
          import_state?: Json
          name: string
          processed_files?: number
          source?: string
          status?: string
          total_files?: number
          user_id?: string
        }
        Update: {
          allow_repeat?: boolean
          created_at?: string
          id?: string
          import_state?: Json
          name?: string
          processed_files?: number
          source?: string
          status?: string
          total_files?: number
          user_id?: string
        }
        Relationships: []
      }
      meta_connection: {
        Row: {
          checked_at: string | null
          ig_user_id: string | null
          ig_username: string | null
          last_error: string | null
          page_id: string | null
          page_name: string | null
          scopes: string[] | null
          status: string
          token_expires_at: string | null
          user_id: string
        }
        Insert: {
          checked_at?: string | null
          ig_user_id?: string | null
          ig_username?: string | null
          last_error?: string | null
          page_id?: string | null
          page_name?: string | null
          scopes?: string[] | null
          status?: string
          token_expires_at?: string | null
          user_id: string
        }
        Update: {
          checked_at?: string | null
          ig_user_id?: string | null
          ig_username?: string | null
          last_error?: string | null
          page_id?: string | null
          page_name?: string | null
          scopes?: string[] | null
          status?: string
          token_expires_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      publications: {
        Row: {
          asset_id: string
          attempts: number
          container_id: string | null
          id: string
          intent_at: string | null
          last_error: string | null
          lease_owner: string | null
          lease_until: string | null
          next_attempt_at: string | null
          permalink: string | null
          platform: string
          published_at: string | null
          remote_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_id: string
          attempts?: number
          container_id?: string | null
          id?: string
          intent_at?: string | null
          last_error?: string | null
          lease_owner?: string | null
          lease_until?: string | null
          next_attempt_at?: string | null
          permalink?: string | null
          platform: string
          published_at?: string | null
          remote_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asset_id?: string
          attempts?: number
          container_id?: string | null
          id?: string
          intent_at?: string | null
          last_error?: string | null
          lease_owner?: string | null
          lease_until?: string | null
          next_attempt_at?: string | null
          permalink?: string | null
          platform?: string
          published_at?: string | null
          remote_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publications_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      render_jobs: {
        Row: {
          asset_id: string
          cancel_requested: boolean
          created_at: string
          error: string | null
          id: string
          lease_owner: string | null
          lease_until: string | null
          mode: string
          music_volume: number
          output_path: string | null
          progress: number
          status: string
          track_id: string | null
          updated_at: string
          user_id: string
          verification: Json | null
        }
        Insert: {
          asset_id: string
          cancel_requested?: boolean
          created_at?: string
          error?: string | null
          id?: string
          lease_owner?: string | null
          lease_until?: string | null
          mode?: string
          music_volume?: number
          output_path?: string | null
          progress?: number
          status?: string
          track_id?: string | null
          updated_at?: string
          user_id?: string
          verification?: Json | null
        }
        Update: {
          asset_id?: string
          cancel_requested?: boolean
          created_at?: string
          error?: string | null
          id?: string
          lease_owner?: string | null
          lease_until?: string | null
          mode?: string
          music_volume?: number
          output_path?: string | null
          progress?: number
          status?: string
          track_id?: string | null
          updated_at?: string
          user_id?: string
          verification?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "render_jobs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_jobs_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "audio_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          post_time: string
          post_times: string[]
          publishing_active: boolean
          reel_time: string
          start_date: string | null
          timezone: string
          topic_mixing: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          post_time?: string
          post_times?: string[]
          publishing_active?: boolean
          reel_time?: string
          start_date?: string | null
          timezone?: string
          topic_mixing?: boolean
          updated_at?: string
          user_id?: string
        }
        Update: {
          post_time?: string
          post_times?: string[]
          publishing_active?: boolean
          reel_time?: string
          start_date?: string | null
          timezone?: string
          topic_mixing?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_publications: {
        Args: { _limit: number; _owner: string }
        Returns: {
          asset_id: string
          attempts: number
          container_id: string | null
          id: string
          intent_at: string | null
          last_error: string | null
          lease_owner: string | null
          lease_until: string | null
          next_attempt_at: string | null
          permalink: string | null
          platform: string
          published_at: string | null
          remote_id: string | null
          status: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "publications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_render_job: {
        Args: { _owner: string }
        Returns: {
          asset_id: string
          cancel_requested: boolean
          created_at: string
          error: string | null
          id: string
          lease_owner: string | null
          lease_until: string | null
          mode: string
          music_volume: number
          output_path: string | null
          progress: number
          status: string
          track_id: string | null
          updated_at: string
          user_id: string
          verification: Json | null
        }[]
        SetofOptions: {
          from: "*"
          to: "render_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
