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
          audio_mode: string | null
          audio_rms_db: number | null
          audio_state: string
          batch_id: string | null
          brand_slug: string
          bucket: string | null
          campaign_first: boolean
          caption: string | null
          caption_issue: string | null
          caption_source: string | null
          classification_source: string | null
          cover_path: string | null
          created_at: string
          duration_s: number | null
          file_name: string
          finish_in_instagram: boolean
          height: number | null
          hooks: string[]
          id: string
          kind: string
          mime: string | null
          motion_confidence: number | null
          motion_label: string | null
          motion_score: number | null
          motion_stats: Json | null
          objective: string | null
          rel_path: string
          rendered_path: string | null
          rendered_verified: Json | null
          review_status: string
          scheduled_at: string | null
          seasonal: boolean
          sha256: string
          size_bytes: number
          skipped: boolean
          sort_index: number
          source_group: string | null
          storage_path: string | null
          style_tags: string[]
          topics: string[]
          upload_state: string
          user_id: string
          width: number | null
        }
        Insert: {
          approved?: boolean
          audio_mode?: string | null
          audio_rms_db?: number | null
          audio_state?: string
          batch_id?: string | null
          brand_slug?: string
          bucket?: string | null
          campaign_first?: boolean
          caption?: string | null
          caption_issue?: string | null
          caption_source?: string | null
          classification_source?: string | null
          cover_path?: string | null
          created_at?: string
          duration_s?: number | null
          file_name: string
          finish_in_instagram?: boolean
          height?: number | null
          hooks?: string[]
          id?: string
          kind: string
          mime?: string | null
          motion_confidence?: number | null
          motion_label?: string | null
          motion_score?: number | null
          motion_stats?: Json | null
          objective?: string | null
          rel_path: string
          rendered_path?: string | null
          rendered_verified?: Json | null
          review_status?: string
          scheduled_at?: string | null
          seasonal?: boolean
          sha256: string
          size_bytes?: number
          skipped?: boolean
          sort_index?: number
          source_group?: string | null
          storage_path?: string | null
          style_tags?: string[]
          topics?: string[]
          upload_state?: string
          user_id?: string
          width?: number | null
        }
        Update: {
          approved?: boolean
          audio_mode?: string | null
          audio_rms_db?: number | null
          audio_state?: string
          batch_id?: string | null
          brand_slug?: string
          bucket?: string | null
          campaign_first?: boolean
          caption?: string | null
          caption_issue?: string | null
          caption_source?: string | null
          classification_source?: string | null
          cover_path?: string | null
          created_at?: string
          duration_s?: number | null
          file_name?: string
          finish_in_instagram?: boolean
          height?: number | null
          hooks?: string[]
          id?: string
          kind?: string
          mime?: string | null
          motion_confidence?: number | null
          motion_label?: string | null
          motion_score?: number | null
          motion_stats?: Json | null
          objective?: string | null
          rel_path?: string
          rendered_path?: string | null
          rendered_verified?: Json | null
          review_status?: string
          scheduled_at?: string | null
          seasonal?: boolean
          sha256?: string
          size_bytes?: number
          skipped?: boolean
          sort_index?: number
          source_group?: string | null
          storage_path?: string | null
          style_tags?: string[]
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
      brands: {
        Row: {
          created_at: string
          focus: string | null
          id: string
          language: string
          name: string
          slug: string
          strategy: Json
          updated_at: string
          user_id: string
          verified_offers: string | null
          voice: string | null
        }
        Insert: {
          created_at?: string
          focus?: string | null
          id?: string
          language?: string
          name: string
          slug: string
          strategy?: Json
          updated_at?: string
          user_id?: string
          verified_offers?: string | null
          voice?: string | null
        }
        Update: {
          created_at?: string
          focus?: string | null
          id?: string
          language?: string
          name?: string
          slug?: string
          strategy?: Json
          updated_at?: string
          user_id?: string
          verified_offers?: string | null
          voice?: string | null
        }
        Relationships: []
      }
      content_drafts: {
        Row: {
          brand_slug: string
          brief: string
          bucket: string | null
          caption_draft: string | null
          created_at: string
          generator: string
          hook: string
          id: string
          objective: string | null
          render_job_id: string | null
          source_asset_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_slug?: string
          brief: string
          bucket?: string | null
          caption_draft?: string | null
          created_at?: string
          generator?: string
          hook: string
          id?: string
          objective?: string | null
          render_job_id?: string | null
          source_asset_id: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          brand_slug?: string
          brief?: string
          bucket?: string | null
          caption_draft?: string | null
          created_at?: string
          generator?: string
          hook?: string
          id?: string
          objective?: string | null
          render_job_id?: string | null
          source_asset_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_drafts_render_job_id_fkey"
            columns: ["render_job_id"]
            isOneToOne: false
            referencedRelation: "render_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_drafts_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      job_tokens: {
        Row: {
          created_at: string
          name: string
          secret: string
        }
        Insert: {
          created_at?: string
          name: string
          secret: string
        }
        Update: {
          created_at?: string
          name?: string
          secret?: string
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
      metric_snapshots: {
        Row: {
          asset_id: string
          brand_slug: string
          captured_at: string
          clicks: number | null
          hours_since_publish: number | null
          id: string
          inquiries: number | null
          note: string | null
          platform: string
          profile_actions: number | null
          reach: number | null
          saves: number | null
          shares: number | null
          source: string
          unavailable: string[]
          user_id: string
          views: number | null
        }
        Insert: {
          asset_id: string
          brand_slug?: string
          captured_at?: string
          clicks?: number | null
          hours_since_publish?: number | null
          id?: string
          inquiries?: number | null
          note?: string | null
          platform: string
          profile_actions?: number | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          source?: string
          unavailable?: string[]
          user_id?: string
          views?: number | null
        }
        Update: {
          asset_id?: string
          brand_slug?: string
          captured_at?: string
          clicks?: number | null
          hours_since_publish?: number | null
          id?: string
          inquiries?: number | null
          note?: string | null
          platform?: string
          profile_actions?: number | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          source?: string
          unavailable?: string[]
          user_id?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "metric_snapshots_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
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
          active_brand: string
          post_time: string
          post_times: string[]
          publishing_active: boolean
          reel_audio_mode: string
          reel_time: string
          start_date: string | null
          timezone: string
          topic_mixing: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          active_brand?: string
          post_time?: string
          post_times?: string[]
          publishing_active?: boolean
          reel_audio_mode?: string
          reel_time?: string
          start_date?: string | null
          timezone?: string
          topic_mixing?: boolean
          updated_at?: string
          user_id?: string
        }
        Update: {
          active_brand?: string
          post_time?: string
          post_times?: string[]
          publishing_active?: boolean
          reel_audio_mode?: string
          reel_time?: string
          start_date?: string | null
          timezone?: string
          topic_mixing?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      strategy_changes: {
        Row: {
          after: Json
          applied_at: string
          before: Json
          brand_slug: string
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          after: Json
          applied_at?: string
          before: Json
          brand_slug: string
          id?: string
          reason: string
          user_id?: string
        }
        Update: {
          after?: Json
          applied_at?: string
          before?: Json
          brand_slug?: string
          id?: string
          reason?: string
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
      commit_schedule: {
        Args: { _brand: string; _items: Json }
        Returns: number
      }
      mark_missed_publications: {
        Args: never
        Returns: {
          asset_id: string
          file_name: string
          scheduled_at: string
          user_id: string
        }[]
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
