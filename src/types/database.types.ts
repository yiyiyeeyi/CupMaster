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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      brews: {
        Row: {
          accumulated_pause_seconds: number
          actual_total_time_seconds: number | null
          actual_total_water: number | null
          analysis: Json | null
          analysis_attempt: Json | null
          analysis_status: string
          brew_plan: Json
          completed_at: string | null
          created_at: string
          current_stage_order: number
          current_stage_started_at: string | null
          deleted_at: string | null
          execution_status: string
          feedback_status: string
          flavor_feedback: Json | null
          id: string
          paused_at: string | null
          quick_rating: string | null
          recipe_snapshot: Json
          record_details: Json | null
          record_status: string
          revision: number
          source_analysis_id: string | null
          source_brew_id: string | null
          source_fingerprint: string | null
          source_recipe_id: string
          source_recommendation_id: string | null
          source_suggested_plan_id: string | null
          source_type: string
          stage_results: Json
          started_at: string | null
          suggested_plan_handoff: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accumulated_pause_seconds?: number
          actual_total_time_seconds?: number | null
          actual_total_water?: number | null
          analysis?: Json | null
          analysis_attempt?: Json | null
          analysis_status: string
          brew_plan: Json
          completed_at?: string | null
          created_at: string
          current_stage_order?: number
          current_stage_started_at?: string | null
          deleted_at?: string | null
          execution_status: string
          feedback_status: string
          flavor_feedback?: Json | null
          id: string
          paused_at?: string | null
          quick_rating?: string | null
          recipe_snapshot: Json
          record_details?: Json | null
          record_status: string
          revision?: number
          source_analysis_id?: string | null
          source_brew_id?: string | null
          source_fingerprint?: string | null
          source_recipe_id: string
          source_recommendation_id?: string | null
          source_suggested_plan_id?: string | null
          source_type: string
          stage_results?: Json
          started_at?: string | null
          suggested_plan_handoff?: Json | null
          updated_at: string
          user_id: string
        }
        Update: {
          accumulated_pause_seconds?: number
          actual_total_time_seconds?: number | null
          actual_total_water?: number | null
          analysis?: Json | null
          analysis_attempt?: Json | null
          analysis_status?: string
          brew_plan?: Json
          completed_at?: string | null
          created_at?: string
          current_stage_order?: number
          current_stage_started_at?: string | null
          deleted_at?: string | null
          execution_status?: string
          feedback_status?: string
          flavor_feedback?: Json | null
          id?: string
          paused_at?: string | null
          quick_rating?: string | null
          recipe_snapshot?: Json
          record_details?: Json | null
          record_status?: string
          revision?: number
          source_analysis_id?: string | null
          source_brew_id?: string | null
          source_fingerprint?: string | null
          source_recipe_id?: string
          source_recommendation_id?: string | null
          source_suggested_plan_id?: string | null
          source_type?: string
          stage_results?: Json
          started_at?: string | null
          suggested_plan_handoff?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brews_source_suggested_plan_fk"
            columns: ["source_suggested_plan_id", "user_id"]
            isOneToOne: false
            referencedRelation: "suggested_plans"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          display_name: string
          experience_level: string
          id: string
          onboarding_completed: boolean
          preferences: Json
          revision: number
          selected_needs: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          display_name: string
          experience_level: string
          id: string
          onboarding_completed?: boolean
          preferences?: Json
          revision?: number
          selected_needs?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          experience_level?: string
          id?: string
          onboarding_completed?: boolean
          preferences?: Json
          revision?: number
          selected_needs?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      suggested_plans: {
        Row: {
          adjustments: Json
          base_recipe_snapshot: Json
          confidence: string
          created_at: string
          deleted_at: string | null
          evidence: Json
          id: string
          keep_unchanged: string[]
          rationale: string
          resulting_brew_id: string | null
          revision: number
          source_analysis_generated_at: string
          source_analysis_id: string
          source_brew_id: string
          source_fingerprint: string
          source_recommendation_id: string
          status: string
          title: string
          updated_at: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          adjustments: Json
          base_recipe_snapshot: Json
          confidence: string
          created_at: string
          deleted_at?: string | null
          evidence: Json
          id: string
          keep_unchanged: string[]
          rationale: string
          resulting_brew_id?: string | null
          revision?: number
          source_analysis_generated_at: string
          source_analysis_id: string
          source_brew_id: string
          source_fingerprint: string
          source_recommendation_id: string
          status: string
          title: string
          updated_at: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          adjustments?: Json
          base_recipe_snapshot?: Json
          confidence?: string
          created_at?: string
          deleted_at?: string | null
          evidence?: Json
          id?: string
          keep_unchanged?: string[]
          rationale?: string
          resulting_brew_id?: string | null
          revision?: number
          source_analysis_generated_at?: string
          source_analysis_id?: string
          source_brew_id?: string
          source_fingerprint?: string
          source_recommendation_id?: string
          status?: string
          title?: string
          updated_at?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggested_plans_resulting_brew_fk"
            columns: ["resulting_brew_id", "user_id"]
            isOneToOne: false
            referencedRelation: "brews"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "suggested_plans_source_brew_fk"
            columns: ["source_brew_id", "user_id"]
            isOneToOne: false
            referencedRelation: "brews"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
