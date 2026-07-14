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
    PostgrestVersion: "13.0.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      _backup_2026_06_02_ai_agents: {
        Row: {
          artifact_type: string | null
          context_profile_slug: string | null
          created_at: string | null
          default_output_contract: Json | null
          enabled: boolean | null
          executor_group: string | null
          id: string | null
          is_published: boolean | null
          model: string | null
          name: string | null
          prompt_version: number | null
          slug: string | null
          system_prompt: string | null
          temperature: number | null
          updated_at: string | null
          version: number | null
          web_search_enabled: boolean | null
        }
        Insert: {
          artifact_type?: string | null
          context_profile_slug?: string | null
          created_at?: string | null
          default_output_contract?: Json | null
          enabled?: boolean | null
          executor_group?: string | null
          id?: string | null
          is_published?: boolean | null
          model?: string | null
          name?: string | null
          prompt_version?: number | null
          slug?: string | null
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string | null
          version?: number | null
          web_search_enabled?: boolean | null
        }
        Update: {
          artifact_type?: string | null
          context_profile_slug?: string | null
          created_at?: string | null
          default_output_contract?: Json | null
          enabled?: boolean | null
          executor_group?: string | null
          id?: string | null
          is_published?: boolean | null
          model?: string | null
          name?: string | null
          prompt_version?: number | null
          slug?: string | null
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string | null
          version?: number | null
          web_search_enabled?: boolean | null
        }
        Relationships: []
      }
      _backup_2026_06_02_body_metrics: {
        Row: {
          activity: string | null
          age: number | null
          bmi: number | null
          calories_target: number | null
          cardio_minutes: number | null
          created_at: string | null
          diet_type: string | null
          dietary_restrictions: string | null
          email: string | null
          foods_to_avoid: string | null
          freq_choice: string | null
          gender: string | null
          goal: string | null
          height_cm: number | null
          id: string | null
          lead_source: string | null
          name: string | null
          notes: string | null
          occupation: string | null
          plan: string | null
          program: string | null
          stress_level: string | null
          tdee: number | null
          user_id: string | null
          volume_modifier: number | null
          weekly_sessions: number | null
          weekly_sessions_user: number | null
          weight_kg: number | null
          workout_days: string | null
        }
        Insert: {
          activity?: string | null
          age?: number | null
          bmi?: number | null
          calories_target?: number | null
          cardio_minutes?: number | null
          created_at?: string | null
          diet_type?: string | null
          dietary_restrictions?: string | null
          email?: string | null
          foods_to_avoid?: string | null
          freq_choice?: string | null
          gender?: string | null
          goal?: string | null
          height_cm?: number | null
          id?: string | null
          lead_source?: string | null
          name?: string | null
          notes?: string | null
          occupation?: string | null
          plan?: string | null
          program?: string | null
          stress_level?: string | null
          tdee?: number | null
          user_id?: string | null
          volume_modifier?: number | null
          weekly_sessions?: number | null
          weekly_sessions_user?: number | null
          weight_kg?: number | null
          workout_days?: string | null
        }
        Update: {
          activity?: string | null
          age?: number | null
          bmi?: number | null
          calories_target?: number | null
          cardio_minutes?: number | null
          created_at?: string | null
          diet_type?: string | null
          dietary_restrictions?: string | null
          email?: string | null
          foods_to_avoid?: string | null
          freq_choice?: string | null
          gender?: string | null
          goal?: string | null
          height_cm?: number | null
          id?: string | null
          lead_source?: string | null
          name?: string | null
          notes?: string | null
          occupation?: string | null
          plan?: string | null
          program?: string | null
          stress_level?: string | null
          tdee?: number | null
          user_id?: string | null
          volume_modifier?: number | null
          weekly_sessions?: number | null
          weekly_sessions_user?: number | null
          weight_kg?: number | null
          workout_days?: string | null
        }
        Relationships: []
      }
      _backup_2026_06_02_exercise_cache: {
        Row: {
          body_part: string | null
          created_at: string | null
          equipment: string | null
          exercise_name: string | null
          gif_url: string | null
          id: string | null
          image_url: string | null
          source: string | null
          target: string | null
        }
        Insert: {
          body_part?: string | null
          created_at?: string | null
          equipment?: string | null
          exercise_name?: string | null
          gif_url?: string | null
          id?: string | null
          image_url?: string | null
          source?: string | null
          target?: string | null
        }
        Update: {
          body_part?: string | null
          created_at?: string | null
          equipment?: string | null
          exercise_name?: string | null
          gif_url?: string | null
          id?: string | null
          image_url?: string | null
          source?: string | null
          target?: string | null
        }
        Relationships: []
      }
      _backup_2026_06_02_meal_cache: {
        Row: {
          calcium_mg: number | null
          calories: number | null
          carbs_g: number | null
          cholesterol_mg: number | null
          confidence_score: number | null
          created_at: string | null
          diets: Json | null
          dish_types: Json | null
          exact_source: string | null
          fat_g: number | null
          fiber_g: number | null
          health_score: number | null
          id: string | null
          illustrative_source: string | null
          image_trust_level: string | null
          image_url: string | null
          ingredients: Json | null
          iron_mg: number | null
          magnesium_mg: number | null
          meal_name: string | null
          name: string | null
          name_key: string | null
          nutrition_json: Json | null
          potassium_mg: number | null
          price_per_serving: number | null
          protein_g: number | null
          ready_in_minutes: number | null
          saturated_fat_g: number | null
          servings: number | null
          sodium_mg: number | null
          source: string | null
          spoonacular_id: number | null
          sugar_g: number | null
          updated_at: string | null
          vitamin_b12_ug: number | null
          vitamin_c_mg: number | null
          vitamin_d_ug: number | null
          zinc_mg: number | null
        }
        Insert: {
          calcium_mg?: number | null
          calories?: number | null
          carbs_g?: number | null
          cholesterol_mg?: number | null
          confidence_score?: number | null
          created_at?: string | null
          diets?: Json | null
          dish_types?: Json | null
          exact_source?: string | null
          fat_g?: number | null
          fiber_g?: number | null
          health_score?: number | null
          id?: string | null
          illustrative_source?: string | null
          image_trust_level?: string | null
          image_url?: string | null
          ingredients?: Json | null
          iron_mg?: number | null
          magnesium_mg?: number | null
          meal_name?: string | null
          name?: string | null
          name_key?: string | null
          nutrition_json?: Json | null
          potassium_mg?: number | null
          price_per_serving?: number | null
          protein_g?: number | null
          ready_in_minutes?: number | null
          saturated_fat_g?: number | null
          servings?: number | null
          sodium_mg?: number | null
          source?: string | null
          spoonacular_id?: number | null
          sugar_g?: number | null
          updated_at?: string | null
          vitamin_b12_ug?: number | null
          vitamin_c_mg?: number | null
          vitamin_d_ug?: number | null
          zinc_mg?: number | null
        }
        Update: {
          calcium_mg?: number | null
          calories?: number | null
          carbs_g?: number | null
          cholesterol_mg?: number | null
          confidence_score?: number | null
          created_at?: string | null
          diets?: Json | null
          dish_types?: Json | null
          exact_source?: string | null
          fat_g?: number | null
          fiber_g?: number | null
          health_score?: number | null
          id?: string | null
          illustrative_source?: string | null
          image_trust_level?: string | null
          image_url?: string | null
          ingredients?: Json | null
          iron_mg?: number | null
          magnesium_mg?: number | null
          meal_name?: string | null
          name?: string | null
          name_key?: string | null
          nutrition_json?: Json | null
          potassium_mg?: number | null
          price_per_serving?: number | null
          protein_g?: number | null
          ready_in_minutes?: number | null
          saturated_fat_g?: number | null
          servings?: number | null
          sodium_mg?: number | null
          source?: string | null
          spoonacular_id?: number | null
          sugar_g?: number | null
          updated_at?: string | null
          vitamin_b12_ug?: number | null
          vitamin_c_mg?: number | null
          vitamin_d_ug?: number | null
          zinc_mg?: number | null
        }
        Relationships: []
      }
      _backup_2026_06_02_memberships: {
        Row: {
          created_at: string | null
          id: string | null
          notes: string | null
          started_at: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string | null
          trial_ends_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          notes?: string | null
          started_at?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          notes?: string | null
          started_at?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      _backup_2026_06_02_plans: {
        Row: {
          created_at: string | null
          daily_calories: number | null
          email: string | null
          email_sent: boolean | null
          exercises_data: Json | null
          generated_by: string | null
          generation_prompt: string | null
          id: string | null
          is_active: boolean | null
          macros: Json | null
          meal_plan: Json | null
          nutrition_daily_targets: Json | null
          plan_html: string | null
          plan_markdown: string | null
          plan_type: string | null
          shopping_list_structured: Json | null
          structured_plan_json: Json | null
          user_context: Json | null
          user_id: string | null
          valid_from: string | null
          valid_until: string | null
          workout_plan: Json | null
        }
        Insert: {
          created_at?: string | null
          daily_calories?: number | null
          email?: string | null
          email_sent?: boolean | null
          exercises_data?: Json | null
          generated_by?: string | null
          generation_prompt?: string | null
          id?: string | null
          is_active?: boolean | null
          macros?: Json | null
          meal_plan?: Json | null
          nutrition_daily_targets?: Json | null
          plan_html?: string | null
          plan_markdown?: string | null
          plan_type?: string | null
          shopping_list_structured?: Json | null
          structured_plan_json?: Json | null
          user_context?: Json | null
          user_id?: string | null
          valid_from?: string | null
          valid_until?: string | null
          workout_plan?: Json | null
        }
        Update: {
          created_at?: string | null
          daily_calories?: number | null
          email?: string | null
          email_sent?: boolean | null
          exercises_data?: Json | null
          generated_by?: string | null
          generation_prompt?: string | null
          id?: string | null
          is_active?: boolean | null
          macros?: Json | null
          meal_plan?: Json | null
          nutrition_daily_targets?: Json | null
          plan_html?: string | null
          plan_markdown?: string | null
          plan_type?: string | null
          shopping_list_structured?: Json | null
          structured_plan_json?: Json | null
          user_context?: Json | null
          user_id?: string | null
          valid_from?: string | null
          valid_until?: string | null
          workout_plan?: Json | null
        }
        Relationships: []
      }
      _backup_2026_06_02_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          daily_email: boolean | null
          email: string | null
          id: string | null
          name: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          daily_email?: boolean | null
          email?: string | null
          id?: string | null
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          daily_email?: boolean | null
          email?: string | null
          id?: string | null
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      _backup_2026_06_02_user_habits: {
        Row: {
          created_at: string | null
          habit_id: string | null
          id: string | null
          is_positive: boolean | null
          sort_order: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          habit_id?: string | null
          id?: string | null
          is_positive?: boolean | null
          sort_order?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          habit_id?: string | null
          id?: string | null
          is_positive?: boolean | null
          sort_order?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      _backup_2026_06_02_users: {
        Row: {
          aud: string | null
          banned_until: string | null
          confirmation_sent_at: string | null
          confirmation_token: string | null
          confirmed_at: string | null
          created_at: string | null
          deleted_at: string | null
          email: string | null
          email_change: string | null
          email_change_confirm_status: number | null
          email_change_sent_at: string | null
          email_change_token_current: string | null
          email_change_token_new: string | null
          email_confirmed_at: string | null
          encrypted_password: string | null
          id: string | null
          instance_id: string | null
          invited_at: string | null
          is_anonymous: boolean | null
          is_sso_user: boolean | null
          is_super_admin: boolean | null
          last_sign_in_at: string | null
          phone: string | null
          phone_change: string | null
          phone_change_sent_at: string | null
          phone_change_token: string | null
          phone_confirmed_at: string | null
          raw_app_meta_data: Json | null
          raw_user_meta_data: Json | null
          reauthentication_sent_at: string | null
          reauthentication_token: string | null
          recovery_sent_at: string | null
          recovery_token: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          aud?: string | null
          banned_until?: string | null
          confirmation_sent_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          email_change?: string | null
          email_change_confirm_status?: number | null
          email_change_sent_at?: string | null
          email_change_token_current?: string | null
          email_change_token_new?: string | null
          email_confirmed_at?: string | null
          encrypted_password?: string | null
          id?: string | null
          instance_id?: string | null
          invited_at?: string | null
          is_anonymous?: boolean | null
          is_sso_user?: boolean | null
          is_super_admin?: boolean | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_change?: string | null
          phone_change_sent_at?: string | null
          phone_change_token?: string | null
          phone_confirmed_at?: string | null
          raw_app_meta_data?: Json | null
          raw_user_meta_data?: Json | null
          reauthentication_sent_at?: string | null
          reauthentication_token?: string | null
          recovery_sent_at?: string | null
          recovery_token?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          aud?: string | null
          banned_until?: string | null
          confirmation_sent_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          email_change?: string | null
          email_change_confirm_status?: number | null
          email_change_sent_at?: string | null
          email_change_token_current?: string | null
          email_change_token_new?: string | null
          email_confirmed_at?: string | null
          encrypted_password?: string | null
          id?: string | null
          instance_id?: string | null
          invited_at?: string | null
          is_anonymous?: boolean | null
          is_sso_user?: boolean | null
          is_super_admin?: boolean | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_change?: string | null
          phone_change_sent_at?: string | null
          phone_change_token?: string | null
          phone_confirmed_at?: string | null
          raw_app_meta_data?: Json | null
          raw_user_meta_data?: Json | null
          reauthentication_sent_at?: string | null
          reauthentication_token?: string | null
          recovery_sent_at?: string | null
          recovery_token?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_agent_settings: {
        Row: {
          agent_slug: string
          created_at: string | null
          id: string
          key: string
          updated_at: string | null
          value: string | null
        }
        Insert: {
          agent_slug: string
          created_at?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          agent_slug?: string
          created_at?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      ai_agent_tools: {
        Row: {
          agent_slug: string
          created_at: string | null
          enabled: boolean | null
          id: string
          tool_name: string
        }
        Insert: {
          agent_slug: string
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          tool_name: string
        }
        Update: {
          agent_slug?: string
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          tool_name?: string
        }
        Relationships: []
      }
      ai_agent_versions: {
        Row: {
          agent_slug: string
          created_at: string | null
          id: string
          model: string | null
          notes: string | null
          published_at: string | null
          system_prompt: string | null
          temperature: number | null
          version: number
        }
        Insert: {
          agent_slug: string
          created_at?: string | null
          id?: string
          model?: string | null
          notes?: string | null
          published_at?: string | null
          system_prompt?: string | null
          temperature?: number | null
          version: number
        }
        Update: {
          agent_slug?: string
          created_at?: string | null
          id?: string
          model?: string | null
          notes?: string | null
          published_at?: string | null
          system_prompt?: string | null
          temperature?: number | null
          version?: number
        }
        Relationships: []
      }
      ai_agents: {
        Row: {
          artifact_type: string | null
          context_profile_slug: string | null
          created_at: string | null
          default_output_contract: Json | null
          enabled: boolean | null
          executor_group: string | null
          id: string
          is_published: boolean | null
          model: string
          name: string
          prompt_version: number | null
          slug: string
          system_prompt: string
          temperature: number | null
          updated_at: string | null
          version: number | null
          web_search_enabled: boolean | null
        }
        Insert: {
          artifact_type?: string | null
          context_profile_slug?: string | null
          created_at?: string | null
          default_output_contract?: Json | null
          enabled?: boolean | null
          executor_group?: string | null
          id?: string
          is_published?: boolean | null
          model?: string
          name: string
          prompt_version?: number | null
          slug: string
          system_prompt: string
          temperature?: number | null
          updated_at?: string | null
          version?: number | null
          web_search_enabled?: boolean | null
        }
        Update: {
          artifact_type?: string | null
          context_profile_slug?: string | null
          created_at?: string | null
          default_output_contract?: Json | null
          enabled?: boolean | null
          executor_group?: string | null
          id?: string
          is_published?: boolean | null
          model?: string
          name?: string
          prompt_version?: number | null
          slug?: string
          system_prompt?: string
          temperature?: number | null
          updated_at?: string | null
          version?: number | null
          web_search_enabled?: boolean | null
        }
        Relationships: []
      }
      ai_agents_logs: {
        Row: {
          action_type: string | null
          agent_type: string | null
          api_used: string | null
          cost_usd: number | null
          created_at: string | null
          error_message: string | null
          execution_time_ms: number | null
          id: string
          input_data: Json | null
          notes: string | null
          output_data: Json | null
          run_id: string | null
          success: boolean | null
          tokens_used: number | null
          user_id: string | null
        }
        Insert: {
          action_type?: string | null
          agent_type?: string | null
          api_used?: string | null
          cost_usd?: number | null
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          input_data?: Json | null
          notes?: string | null
          output_data?: Json | null
          run_id?: string | null
          success?: boolean | null
          tokens_used?: number | null
          user_id?: string | null
        }
        Update: {
          action_type?: string | null
          agent_type?: string | null
          api_used?: string | null
          cost_usd?: number | null
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          input_data?: Json | null
          notes?: string | null
          output_data?: Json | null
          run_id?: string | null
          success?: boolean | null
          tokens_used?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_config: {
        Row: {
          id: string
          model: string
          system_prompt: string
          temperature: number | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          model?: string
          system_prompt: string
          temperature?: number | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          model?: string
          system_prompt?: string
          temperature?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_content_drafts: {
        Row: {
          agent_slug: string
          content: Json
          created_at: string
          id: string
          status: string
          task_type: string
          title: string | null
          user_id: string | null
        }
        Insert: {
          agent_slug: string
          content?: Json
          created_at?: string
          id?: string
          status?: string
          task_type: string
          title?: string | null
          user_id?: string | null
        }
        Update: {
          agent_slug?: string
          content?: Json
          created_at?: string
          id?: string
          status?: string
          task_type?: string
          title?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_context_profiles: {
        Row: {
          created_at: string | null
          id: string
          include_checkins: boolean | null
          include_memory: boolean | null
          include_plans: boolean | null
          include_progress: boolean | null
          runtime_capabilities_json: Json | null
          slug: string
          sources_json: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          include_checkins?: boolean | null
          include_memory?: boolean | null
          include_plans?: boolean | null
          include_progress?: boolean | null
          runtime_capabilities_json?: Json | null
          slug: string
          sources_json?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          include_checkins?: boolean | null
          include_memory?: boolean | null
          include_plans?: boolean | null
          include_progress?: boolean | null
          runtime_capabilities_json?: Json | null
          slug?: string
          sources_json?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_events: {
        Row: {
          attempts: number
          created_at: string | null
          dead_lettered_at: string | null
          event_type: string
          id: string
          last_error: string | null
          max_attempts: number
          next_retry_at: string | null
          payload: Json | null
          processed_at: string | null
          result: Json | null
          status: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string | null
          dead_lettered_at?: string | null
          event_type: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json | null
          processed_at?: string | null
          result?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string | null
          dead_lettered_at?: string | null
          event_type?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json | null
          processed_at?: string | null
          result?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_executor_bindings: {
        Row: {
          artifact_kind: string | null
          artifact_table: string | null
          created_at: string | null
          enabled: boolean | null
          executor_slug: string
          id: string
          side_effect_type: string
          updated_at: string | null
        }
        Insert: {
          artifact_kind?: string | null
          artifact_table?: string | null
          created_at?: string | null
          enabled?: boolean | null
          executor_slug: string
          id?: string
          side_effect_type: string
          updated_at?: string | null
        }
        Update: {
          artifact_kind?: string | null
          artifact_table?: string | null
          created_at?: string | null
          enabled?: boolean | null
          executor_slug?: string
          id?: string
          side_effect_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_generated_plans: {
        Row: {
          created_at: string | null
          daily_calories: number | null
          email: string | null
          email_sent: boolean | null
          exercises_data: Json | null
          generated_by: string | null
          generation_prompt: string | null
          id: string
          is_active: boolean | null
          macros: Json | null
          meal_plan: Json | null
          nutrition_daily_targets: Json | null
          plan_html: string | null
          plan_markdown: string | null
          plan_type: string | null
          shopping_list_structured: Json | null
          structured_plan_json: Json | null
          user_context: Json | null
          user_id: string | null
          valid_from: string | null
          valid_until: string | null
          workout_plan: Json | null
        }
        Insert: {
          created_at?: string | null
          daily_calories?: number | null
          email?: string | null
          email_sent?: boolean | null
          exercises_data?: Json | null
          generated_by?: string | null
          generation_prompt?: string | null
          id?: string
          is_active?: boolean | null
          macros?: Json | null
          meal_plan?: Json | null
          nutrition_daily_targets?: Json | null
          plan_html?: string | null
          plan_markdown?: string | null
          plan_type?: string | null
          shopping_list_structured?: Json | null
          structured_plan_json?: Json | null
          user_context?: Json | null
          user_id?: string | null
          valid_from?: string | null
          valid_until?: string | null
          workout_plan?: Json | null
        }
        Update: {
          created_at?: string | null
          daily_calories?: number | null
          email?: string | null
          email_sent?: boolean | null
          exercises_data?: Json | null
          generated_by?: string | null
          generation_prompt?: string | null
          id?: string
          is_active?: boolean | null
          macros?: Json | null
          meal_plan?: Json | null
          nutrition_daily_targets?: Json | null
          plan_html?: string | null
          plan_markdown?: string | null
          plan_type?: string | null
          shopping_list_structured?: Json | null
          structured_plan_json?: Json | null
          user_context?: Json | null
          user_id?: string | null
          valid_from?: string | null
          valid_until?: string | null
          workout_plan?: Json | null
        }
        Relationships: []
      }
      ai_logs: {
        Row: {
          action: string | null
          agent_slug: string | null
          cache_hit: boolean
          created_at: string
          duration_ms: number | null
          error: string | null
          estimated_cost_usd: number | null
          event_id: string | null
          id: string
          input_tokens: number | null
          message: string | null
          output_tokens: number | null
          payload: Json | null
          result: Json | null
          status: string
          task_id: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          agent_slug?: string | null
          cache_hit?: boolean
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          estimated_cost_usd?: number | null
          event_id?: string | null
          id?: string
          input_tokens?: number | null
          message?: string | null
          output_tokens?: number | null
          payload?: Json | null
          result?: Json | null
          status: string
          task_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          agent_slug?: string | null
          cache_hit?: boolean
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          estimated_cost_usd?: number | null
          event_id?: string | null
          id?: string
          input_tokens?: number | null
          message?: string | null
          output_tokens?: number | null
          payload?: Json | null
          result?: Json | null
          status?: string
          task_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          agent_slug: string
          content: string
          created_at: string
          delivered_at: string | null
          delivery_channel: string
          id: string
          payload: Json | null
          status: string
          task_id: string | null
          task_type: string
          title: string | null
          user_id: string
        }
        Insert: {
          agent_slug: string
          content: string
          created_at?: string
          delivered_at?: string | null
          delivery_channel?: string
          id?: string
          payload?: Json | null
          status?: string
          task_id?: string | null
          task_type: string
          title?: string | null
          user_id: string
        }
        Update: {
          agent_slug?: string
          content?: string
          created_at?: string
          delivered_at?: string | null
          delivery_channel?: string
          id?: string
          payload?: Json | null
          status?: string
          task_id?: string | null
          task_type?: string
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_supporting_documents: {
        Row: {
          agent_slug: string
          created_at: string
          enabled: boolean
          id: string
          key_facts: Json | null
          sort_order: number
          source_id: string | null
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          agent_slug: string
          created_at?: string
          enabled?: boolean
          id?: string
          key_facts?: Json | null
          sort_order?: number
          source_id?: string | null
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          agent_slug?: string
          created_at?: string
          enabled?: boolean
          id?: string
          key_facts?: Json | null
          sort_order?: number
          source_id?: string | null
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_task_types: {
        Row: {
          agent_slug: string
          cooldown_hours: number | null
          created_at: string | null
          description: string | null
          enabled: boolean | null
          id: string
          output_schema_json: Json | null
          retry_policy: string | null
          side_effect_type: string
          task_type: string
          updated_at: string | null
        }
        Insert: {
          agent_slug: string
          cooldown_hours?: number | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          id?: string
          output_schema_json?: Json | null
          retry_policy?: string | null
          side_effect_type: string
          task_type: string
          updated_at?: string | null
        }
        Update: {
          agent_slug?: string
          cooldown_hours?: number | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          id?: string
          output_schema_json?: Json | null
          retry_policy?: string | null
          side_effect_type?: string
          task_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_tasks: {
        Row: {
          agent_slug: string
          artifact_id: string | null
          attempts: number
          created_at: string | null
          dead_lettered_at: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          max_attempts: number
          next_retry_at: string | null
          payload: Json | null
          processed_at: string | null
          processing_started_at: string | null
          result: Json | null
          source_event_id: string | null
          status: string | null
          task_type: string
          user_id: string | null
        }
        Insert: {
          agent_slug: string
          artifact_id?: string | null
          attempts?: number
          created_at?: string | null
          dead_lettered_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json | null
          processed_at?: string | null
          processing_started_at?: string | null
          result?: Json | null
          source_event_id?: string | null
          status?: string | null
          task_type: string
          user_id?: string | null
        }
        Update: {
          agent_slug?: string
          artifact_id?: string | null
          attempts?: number
          created_at?: string | null
          dead_lettered_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json | null
          processed_at?: string | null
          processing_started_at?: string | null
          result?: Json | null
          source_event_id?: string | null
          status?: string | null
          task_type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ai_trigger_rules: {
        Row: {
          agent_slug: string
          conditions_json: Json | null
          created_at: string | null
          enabled: boolean | null
          id: string
          priority: number | null
          task_type: string
          trigger_type: string
          trigger_value: string | null
          updated_at: string | null
        }
        Insert: {
          agent_slug: string
          conditions_json?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          priority?: number | null
          task_type: string
          trigger_type: string
          trigger_value?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_slug?: string
          conditions_json?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          priority?: number | null
          task_type?: string
          trigger_type?: string
          trigger_value?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      apple_health_connections: {
        Row: {
          api_key_hash: string
          api_key_prefix: string
          connected_at: string
          device_label: string
          id: string
          last_sync_at: string | null
          last_sync_error: string | null
          revoked_at: string | null
          status: string
          sync_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key_hash: string
          api_key_prefix: string
          connected_at?: string
          device_label?: string
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          revoked_at?: string | null
          status?: string
          sync_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key_hash?: string
          api_key_prefix?: string
          connected_at?: string
          device_label?: string
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          revoked_at?: string | null
          status?: string
          sync_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      apple_health_metric_defs: {
        Row: {
          agg: string
          canonical_unit: string | null
          category: string
          created_at: string
          factor: number | null
          from_unit: string | null
          is_key: boolean
          label_cs: string
          metric_name: string
        }
        Insert: {
          agg?: string
          canonical_unit?: string | null
          category: string
          created_at?: string
          factor?: number | null
          from_unit?: string | null
          is_key?: boolean
          label_cs: string
          metric_name: string
        }
        Update: {
          agg?: string
          canonical_unit?: string | null
          category?: string
          created_at?: string
          factor?: number | null
          from_unit?: string | null
          is_key?: boolean
          label_cs?: string
          metric_name?: string
        }
        Relationships: []
      }
      apple_health_metrics: {
        Row: {
          avg_value: number | null
          created_at: string
          id: string
          local_date: string
          max_value: number | null
          measured_at: string
          metric_name: string
          min_value: number | null
          qty: number | null
          raw: Json
          source: string
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_value?: number | null
          created_at?: string
          id?: string
          local_date: string
          max_value?: number | null
          measured_at: string
          metric_name: string
          min_value?: number | null
          qty?: number | null
          raw?: Json
          source?: string
          unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_value?: number | null
          created_at?: string
          id?: string
          local_date?: string
          max_value?: number | null
          measured_at?: string
          metric_name?: string
          min_value?: number | null
          qty?: number | null
          raw?: Json
          source?: string
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      apple_health_raw_payloads: {
        Row: {
          byte_size: number | null
          connection_id: string | null
          id: string
          metrics_count: number
          payload: Json
          process_error: string | null
          processed_at: string | null
          received_at: string
          user_id: string
          workouts_count: number
        }
        Insert: {
          byte_size?: number | null
          connection_id?: string | null
          id?: string
          metrics_count?: number
          payload: Json
          process_error?: string | null
          processed_at?: string | null
          received_at?: string
          user_id: string
          workouts_count?: number
        }
        Update: {
          byte_size?: number | null
          connection_id?: string | null
          id?: string
          metrics_count?: number
          payload?: Json
          process_error?: string | null
          processed_at?: string | null
          received_at?: string
          user_id?: string
          workouts_count?: number
        }
        Relationships: []
      }
      apple_health_sleep: {
        Row: {
          asleep_min: number | null
          awake_min: number | null
          core_min: number | null
          created_at: string
          deep_min: number | null
          efficiency_pct: number | null
          id: string
          in_bed_min: number | null
          local_date: string
          raw: Json
          rem_min: number | null
          sleep_end: string | null
          sleep_start: string
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asleep_min?: number | null
          awake_min?: number | null
          core_min?: number | null
          created_at?: string
          deep_min?: number | null
          efficiency_pct?: number | null
          id?: string
          in_bed_min?: number | null
          local_date: string
          raw?: Json
          rem_min?: number | null
          sleep_end?: string | null
          sleep_start: string
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asleep_min?: number | null
          awake_min?: number | null
          core_min?: number | null
          created_at?: string
          deep_min?: number | null
          efficiency_pct?: number | null
          id?: string
          in_bed_min?: number | null
          local_date?: string
          raw?: Json
          rem_min?: number | null
          sleep_end?: string | null
          sleep_start?: string
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      apple_health_workouts: {
        Row: {
          active_kcal: number | null
          avg_hr: number | null
          created_at: string
          distance_m: number | null
          duration_s: number | null
          elevation_m: number | null
          ended_at: string | null
          external_id: string
          id: string
          local_date: string
          max_hr: number | null
          raw: Json
          source: string | null
          started_at: string
          total_kcal: number | null
          updated_at: string
          user_id: string
          workout_type: string | null
        }
        Insert: {
          active_kcal?: number | null
          avg_hr?: number | null
          created_at?: string
          distance_m?: number | null
          duration_s?: number | null
          elevation_m?: number | null
          ended_at?: string | null
          external_id: string
          id?: string
          local_date: string
          max_hr?: number | null
          raw?: Json
          source?: string | null
          started_at: string
          total_kcal?: number | null
          updated_at?: string
          user_id: string
          workout_type?: string | null
        }
        Update: {
          active_kcal?: number | null
          avg_hr?: number | null
          created_at?: string
          distance_m?: number | null
          duration_s?: number | null
          elevation_m?: number | null
          ended_at?: string | null
          external_id?: string
          id?: string
          local_date?: string
          max_hr?: number | null
          raw?: Json
          source?: string | null
          started_at?: string
          total_kcal?: number | null
          updated_at?: string
          user_id?: string
          workout_type?: string | null
        }
        Relationships: []
      }
      beta_cohorts: {
        Row: {
          code: string
          created_at: string
          ends_at: string | null
          id: string
          max_participants: number
          name: string
          starts_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          ends_at?: string | null
          id?: string
          max_participants?: number
          name: string
          starts_at?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          max_participants?: number
          name?: string
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      beta_decisions: {
        Row: {
          cohort_id: string
          created_at: string
          decided_by: string | null
          decision: string
          evidence_summary: string | null
          id: string
          rationale: string
        }
        Insert: {
          cohort_id: string
          created_at?: string
          decided_by?: string | null
          decision: string
          evidence_summary?: string | null
          id?: string
          rationale: string
        }
        Update: {
          cohort_id?: string
          created_at?: string
          decided_by?: string | null
          decision?: string
          evidence_summary?: string | null
          id?: string
          rationale?: string
        }
        Relationships: [
          {
            foreignKeyName: "beta_decisions_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "beta_cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_email_automation_state: {
        Row: {
          automation_paused: boolean
          created_at: string
          day3_feedback_sent_at: string | null
          day7_feedback_sent_at: string | null
          id: string
          last_email_sent_at: string | null
          next_action_at: string | null
          no_first_action_sent_at: string | null
          no_plan_view_sent_at: string | null
          participant_id: string
          plan_ready_sent_at: string | null
          updated_at: string
          user_id: string
          welcome_sent_at: string | null
        }
        Insert: {
          automation_paused?: boolean
          created_at?: string
          day3_feedback_sent_at?: string | null
          day7_feedback_sent_at?: string | null
          id?: string
          last_email_sent_at?: string | null
          next_action_at?: string | null
          no_first_action_sent_at?: string | null
          no_plan_view_sent_at?: string | null
          participant_id: string
          plan_ready_sent_at?: string | null
          updated_at?: string
          user_id: string
          welcome_sent_at?: string | null
        }
        Update: {
          automation_paused?: boolean
          created_at?: string
          day3_feedback_sent_at?: string | null
          day7_feedback_sent_at?: string | null
          id?: string
          last_email_sent_at?: string | null
          next_action_at?: string | null
          no_first_action_sent_at?: string | null
          no_plan_view_sent_at?: string | null
          participant_id?: string
          plan_ready_sent_at?: string | null
          updated_at?: string
          user_id?: string
          welcome_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "beta_email_automation_state_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: true
            referencedRelation: "beta_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_email_messages: {
        Row: {
          attempt_count: number
          created_at: string
          error_code: string | null
          failed_at: string | null
          id: string
          participant_id: string
          processing_started_at: string | null
          provider_message_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
          trigger_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          error_code?: string | null
          failed_at?: string | null
          id?: string
          participant_id: string
          processing_started_at?: string | null
          provider_message_id?: string | null
          scheduled_at: string
          sent_at?: string | null
          status?: string
          trigger_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          error_code?: string | null
          failed_at?: string | null
          id?: string
          participant_id?: string
          processing_started_at?: string | null
          provider_message_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          trigger_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beta_email_messages_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "beta_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_feedback: {
        Row: {
          app_version: string | null
          category: string | null
          context: string
          created_at: string
          id: string
          message: string | null
          resolved: boolean
          score: number | null
          user_id: string
        }
        Insert: {
          app_version?: string | null
          category?: string | null
          context: string
          created_at?: string
          id?: string
          message?: string | null
          resolved?: boolean
          score?: number | null
          user_id: string
        }
        Update: {
          app_version?: string | null
          category?: string | null
          context?: string
          created_at?: string
          id?: string
          message?: string | null
          resolved?: boolean
          score?: number | null
          user_id?: string
        }
        Relationships: []
      }
      beta_issues: {
        Row: {
          affected_step: string | null
          category: string
          cohort_id: string
          created_at: string
          evidence: string | null
          id: string
          occurrence_count: number
          owner: string | null
          participant_id: string | null
          resolution: string | null
          resolved_at: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          affected_step?: string | null
          category: string
          cohort_id: string
          created_at?: string
          evidence?: string | null
          id?: string
          occurrence_count?: number
          owner?: string | null
          participant_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          severity: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          affected_step?: string | null
          category?: string
          cohort_id?: string
          created_at?: string
          evidence?: string | null
          id?: string
          occurrence_count?: number
          owner?: string | null
          participant_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "beta_issues_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "beta_cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beta_issues_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "beta_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_participants: {
        Row: {
          beta_terms_accepted_at: string | null
          beta_terms_version: string | null
          cohort_id: string
          created_at: string
          exit_reason: string | null
          exited_at: string | null
          first_action_at: string | null
          first_plan_viewed_at: string | null
          first_return_at: string | null
          id: string
          internal_alias: string | null
          invite_code_hash: string | null
          invited_at: string | null
          onboarding_completed_at: string | null
          registered_at: string | null
          session_completed_at: string | null
          source: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          beta_terms_accepted_at?: string | null
          beta_terms_version?: string | null
          cohort_id: string
          created_at?: string
          exit_reason?: string | null
          exited_at?: string | null
          first_action_at?: string | null
          first_plan_viewed_at?: string | null
          first_return_at?: string | null
          id?: string
          internal_alias?: string | null
          invite_code_hash?: string | null
          invited_at?: string | null
          onboarding_completed_at?: string | null
          registered_at?: string | null
          session_completed_at?: string | null
          source?: string | null
          status: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          beta_terms_accepted_at?: string | null
          beta_terms_version?: string | null
          cohort_id?: string
          created_at?: string
          exit_reason?: string | null
          exited_at?: string | null
          first_action_at?: string | null
          first_plan_viewed_at?: string | null
          first_return_at?: string | null
          id?: string
          internal_alias?: string | null
          invite_code_hash?: string | null
          invited_at?: string | null
          onboarding_completed_at?: string | null
          registered_at?: string | null
          session_completed_at?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "beta_participants_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "beta_cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_research_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          mode: string
          moderator_notes: string | null
          participant_id: string
          recording_consent: boolean
          recording_reference: string | null
          scheduled_at: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          mode?: string
          moderator_notes?: string | null
          participant_id: string
          recording_consent?: boolean
          recording_reference?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          mode?: string
          moderator_notes?: string | null
          participant_id?: string
          recording_consent?: boolean
          recording_reference?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "beta_research_sessions_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "beta_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      body_measurements: {
        Row: {
          arm_cm: number | null
          chest_cm: number | null
          created_at: string
          hips_cm: number | null
          id: string
          measured_at: string
          source: string
          source_record_id: string | null
          user_id: string
          waist_cm: number | null
          weight_kg: number | null
        }
        Insert: {
          arm_cm?: number | null
          chest_cm?: number | null
          created_at?: string
          hips_cm?: number | null
          id?: string
          measured_at?: string
          source?: string
          source_record_id?: string | null
          user_id: string
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Update: {
          arm_cm?: number | null
          chest_cm?: number | null
          created_at?: string
          hips_cm?: number | null
          id?: string
          measured_at?: string
          source?: string
          source_record_id?: string | null
          user_id?: string
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      body_metrics: {
        Row: {
          activity: string | null
          age: number
          birth_date: string | null
          bmi: number | null
          calories_target: number | null
          cardio_minutes: number | null
          created_at: string | null
          diet_type: string | null
          dietary_restrictions: string | null
          email: string | null
          foods_to_avoid: string | null
          freq_choice: string | null
          gender: string | null
          goal: string | null
          height_cm: number
          id: string
          lead_source: string | null
          name: string | null
          notes: string | null
          occupation: string | null
          plan: string | null
          program: string | null
          stress_level: string | null
          tdee: number | null
          user_id: string | null
          volume_modifier: number | null
          weekly_sessions: number | null
          weekly_sessions_user: number | null
          weight_kg: number
          workout_days: string | null
        }
        Insert: {
          activity?: string | null
          age: number
          birth_date?: string | null
          bmi?: number | null
          calories_target?: number | null
          cardio_minutes?: number | null
          created_at?: string | null
          diet_type?: string | null
          dietary_restrictions?: string | null
          email?: string | null
          foods_to_avoid?: string | null
          freq_choice?: string | null
          gender?: string | null
          goal?: string | null
          height_cm: number
          id?: string
          lead_source?: string | null
          name?: string | null
          notes?: string | null
          occupation?: string | null
          plan?: string | null
          program?: string | null
          stress_level?: string | null
          tdee?: number | null
          user_id?: string | null
          volume_modifier?: number | null
          weekly_sessions?: number | null
          weekly_sessions_user?: number | null
          weight_kg: number
          workout_days?: string | null
        }
        Update: {
          activity?: string | null
          age?: number
          birth_date?: string | null
          bmi?: number | null
          calories_target?: number | null
          cardio_minutes?: number | null
          created_at?: string | null
          diet_type?: string | null
          dietary_restrictions?: string | null
          email?: string | null
          foods_to_avoid?: string | null
          freq_choice?: string | null
          gender?: string | null
          goal?: string | null
          height_cm?: number
          id?: string
          lead_source?: string | null
          name?: string | null
          notes?: string | null
          occupation?: string | null
          plan?: string | null
          program?: string | null
          stress_level?: string | null
          tdee?: number | null
          user_id?: string | null
          volume_modifier?: number | null
          weekly_sessions?: number | null
          weekly_sessions_user?: number | null
          weight_kg?: number
          workout_days?: string | null
        }
        Relationships: []
      }
      community_categories: {
        Row: {
          description: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          description?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          description?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      community_posts: {
        Row: {
          author_name: string
          category_id: string | null
          content: string
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          author_name: string
          category_id?: string | null
          content: string
          created_at?: string
          id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          author_name?: string
          category_id?: string | null
          content?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "community_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      community_replies: {
        Row: {
          author_name: string
          content: string
          created_at: string
          id: string
          topic_id: string
          user_id: string
        }
        Insert: {
          author_name: string
          content: string
          created_at?: string
          id?: string
          topic_id: string
          user_id: string
        }
        Update: {
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          topic_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_replies_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_activity_completions: {
        Row: {
          activity_key: string
          activity_type: string
          completed_at: string
          created_at: string
          id: string
          plan_day: number
          plan_id: string | null
          user_id: string
        }
        Insert: {
          activity_key: string
          activity_type: string
          completed_at?: string
          created_at?: string
          id?: string
          plan_day: number
          plan_id?: string | null
          user_id: string
        }
        Update: {
          activity_key?: string
          activity_type?: string
          completed_at?: string
          created_at?: string
          id?: string
          plan_day?: number
          plan_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      daily_checkins: {
        Row: {
          blocker: string | null
          checkin_date: string
          created_at: string
          id: string
          rating: string
          updated_at: string
          user_id: string
        }
        Insert: {
          blocker?: string | null
          checkin_date: string
          created_at?: string
          id?: string
          rating: string
          updated_at?: string
          user_id: string
        }
        Update: {
          blocker?: string | null
          checkin_date?: string
          created_at?: string
          id?: string
          rating?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      exercise_asset_registry: {
        Row: {
          body_part: string | null
          canonical_key: string
          created_at: string | null
          display_name_cs: string | null
          equipment: string | null
          exercisedb_name: string | null
          gif_url: string | null
          id: string
          image_url: string | null
          source: string | null
          target: string | null
          trust_level: string | null
          updated_at: string | null
          wger_category: string | null
          wger_exercise_id: number | null
          wger_exercise_image_url: string | null
          wger_name_en: string | null
        }
        Insert: {
          body_part?: string | null
          canonical_key: string
          created_at?: string | null
          display_name_cs?: string | null
          equipment?: string | null
          exercisedb_name?: string | null
          gif_url?: string | null
          id?: string
          image_url?: string | null
          source?: string | null
          target?: string | null
          trust_level?: string | null
          updated_at?: string | null
          wger_category?: string | null
          wger_exercise_id?: number | null
          wger_exercise_image_url?: string | null
          wger_name_en?: string | null
        }
        Update: {
          body_part?: string | null
          canonical_key?: string
          created_at?: string | null
          display_name_cs?: string | null
          equipment?: string | null
          exercisedb_name?: string | null
          gif_url?: string | null
          id?: string
          image_url?: string | null
          source?: string | null
          target?: string | null
          trust_level?: string | null
          updated_at?: string | null
          wger_category?: string | null
          wger_exercise_id?: number | null
          wger_exercise_image_url?: string | null
          wger_name_en?: string | null
        }
        Relationships: []
      }
      exercise_metadata_cache: {
        Row: {
          body_part: string | null
          created_at: string | null
          equipment: string | null
          exercise_name: string
          gif_url: string | null
          id: string
          image_url: string | null
          source: string | null
          target: string | null
        }
        Insert: {
          body_part?: string | null
          created_at?: string | null
          equipment?: string | null
          exercise_name: string
          gif_url?: string | null
          id?: string
          image_url?: string | null
          source?: string | null
          target?: string | null
        }
        Update: {
          body_part?: string | null
          created_at?: string | null
          equipment?: string | null
          exercise_name?: string
          gif_url?: string | null
          id?: string
          image_url?: string | null
          source?: string | null
          target?: string | null
        }
        Relationships: []
      }
      fitness_goals: {
        Row: {
          activity_level: string | null
          allergies: string[] | null
          created_at: string | null
          dietary_restrictions: string[] | null
          id: string
          is_active: boolean | null
          preferred_workout_duration: number | null
          primary_goal: string
          target_body_fat_percentage: number | null
          target_date: string | null
          target_muscle_mass_kg: number | null
          target_weight_kg: number | null
          user_id: string | null
          weekly_goal_kg: number | null
          workouts_per_week: number | null
        }
        Insert: {
          activity_level?: string | null
          allergies?: string[] | null
          created_at?: string | null
          dietary_restrictions?: string[] | null
          id?: string
          is_active?: boolean | null
          preferred_workout_duration?: number | null
          primary_goal: string
          target_body_fat_percentage?: number | null
          target_date?: string | null
          target_muscle_mass_kg?: number | null
          target_weight_kg?: number | null
          user_id?: string | null
          weekly_goal_kg?: number | null
          workouts_per_week?: number | null
        }
        Update: {
          activity_level?: string | null
          allergies?: string[] | null
          created_at?: string | null
          dietary_restrictions?: string[] | null
          id?: string
          is_active?: boolean | null
          preferred_workout_duration?: number | null
          primary_goal?: string
          target_body_fat_percentage?: number | null
          target_date?: string | null
          target_muscle_mass_kg?: number | null
          target_weight_kg?: number | null
          user_id?: string | null
          weekly_goal_kg?: number | null
          workouts_per_week?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fitness_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_logs: {
        Row: {
          completed: boolean
          created_at: string
          habit_id: string
          id: string
          log_date: string
          notes: string | null
          user_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          habit_id: string
          id?: string
          log_date: string
          notes?: string | null
          user_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          habit_id?: string
          id?: string
          log_date?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      lifecycle_emails: {
        Row: {
          attempt_count: number
          created_at: string
          error_code: string | null
          id: string
          provider_message_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
          trigger_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          error_code?: string | null
          id?: string
          provider_message_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          trigger_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          error_code?: string | null
          id?: string
          provider_message_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          trigger_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meal_metadata_cache: {
        Row: {
          calcium_mg: number | null
          calories: number | null
          carbs_g: number | null
          cholesterol_mg: number | null
          confidence_score: number | null
          created_at: string | null
          diets: Json | null
          dish_types: Json | null
          exact_source: string | null
          fat_g: number | null
          fiber_g: number | null
          health_score: number | null
          id: string
          illustrative_source: string | null
          image_trust_level: string | null
          image_url: string | null
          ingredients: Json | null
          iron_mg: number | null
          magnesium_mg: number | null
          meal_name: string
          name: string | null
          name_key: string | null
          nutrition_json: Json | null
          potassium_mg: number | null
          price_per_serving: number | null
          protein_g: number | null
          ready_in_minutes: number | null
          saturated_fat_g: number | null
          servings: number | null
          sodium_mg: number | null
          source: string | null
          spoonacular_id: number | null
          sugar_g: number | null
          updated_at: string | null
          vitamin_b12_ug: number | null
          vitamin_c_mg: number | null
          vitamin_d_ug: number | null
          zinc_mg: number | null
        }
        Insert: {
          calcium_mg?: number | null
          calories?: number | null
          carbs_g?: number | null
          cholesterol_mg?: number | null
          confidence_score?: number | null
          created_at?: string | null
          diets?: Json | null
          dish_types?: Json | null
          exact_source?: string | null
          fat_g?: number | null
          fiber_g?: number | null
          health_score?: number | null
          id?: string
          illustrative_source?: string | null
          image_trust_level?: string | null
          image_url?: string | null
          ingredients?: Json | null
          iron_mg?: number | null
          magnesium_mg?: number | null
          meal_name: string
          name?: string | null
          name_key?: string | null
          nutrition_json?: Json | null
          potassium_mg?: number | null
          price_per_serving?: number | null
          protein_g?: number | null
          ready_in_minutes?: number | null
          saturated_fat_g?: number | null
          servings?: number | null
          sodium_mg?: number | null
          source?: string | null
          spoonacular_id?: number | null
          sugar_g?: number | null
          updated_at?: string | null
          vitamin_b12_ug?: number | null
          vitamin_c_mg?: number | null
          vitamin_d_ug?: number | null
          zinc_mg?: number | null
        }
        Update: {
          calcium_mg?: number | null
          calories?: number | null
          carbs_g?: number | null
          cholesterol_mg?: number | null
          confidence_score?: number | null
          created_at?: string | null
          diets?: Json | null
          dish_types?: Json | null
          exact_source?: string | null
          fat_g?: number | null
          fiber_g?: number | null
          health_score?: number | null
          id?: string
          illustrative_source?: string | null
          image_trust_level?: string | null
          image_url?: string | null
          ingredients?: Json | null
          iron_mg?: number | null
          magnesium_mg?: number | null
          meal_name?: string
          name?: string | null
          name_key?: string | null
          nutrition_json?: Json | null
          potassium_mg?: number | null
          price_per_serving?: number | null
          protein_g?: number | null
          ready_in_minutes?: number | null
          saturated_fat_g?: number | null
          servings?: number | null
          sodium_mg?: number | null
          source?: string | null
          spoonacular_id?: number | null
          sugar_g?: number | null
          updated_at?: string | null
          vitamin_b12_ug?: number | null
          vitamin_c_mg?: number | null
          vitamin_d_ug?: number | null
          zinc_mg?: number | null
        }
        Relationships: []
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          started_at: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          started_at?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          started_at?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nutrition_logs: {
        Row: {
          calories: number | null
          carbs_g: number | null
          czech_food_id: string | null
          fat_g: number | null
          fiber_g: number | null
          food_item: string
          id: string
          logged_at: string | null
          meal_date: string | null
          meal_type: string | null
          protein_g: number | null
          quantity: number | null
          sodium_mg: number | null
          sugar_g: number | null
          unit: string | null
          user_id: string | null
        }
        Insert: {
          calories?: number | null
          carbs_g?: number | null
          czech_food_id?: string | null
          fat_g?: number | null
          fiber_g?: number | null
          food_item: string
          id?: string
          logged_at?: string | null
          meal_date?: string | null
          meal_type?: string | null
          protein_g?: number | null
          quantity?: number | null
          sodium_mg?: number | null
          sugar_g?: number | null
          unit?: string | null
          user_id?: string | null
        }
        Update: {
          calories?: number | null
          carbs_g?: number | null
          czech_food_id?: string | null
          fat_g?: number | null
          fiber_g?: number | null
          food_item?: string
          id?: string
          logged_at?: string | null
          meal_date?: string | null
          meal_type?: string | null
          protein_g?: number | null
          quantity?: number | null
          sodium_mg?: number | null
          sugar_g?: number | null
          unit?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      openai_daily_usage: {
        Row: {
          input_tokens: number
          output_tokens: number
          requests_count: number
          spent_usd: number
          updated_at: string
          usage_date: string
        }
        Insert: {
          input_tokens?: number
          output_tokens?: number
          requests_count?: number
          spent_usd?: number
          updated_at?: string
          usage_date: string
        }
        Update: {
          input_tokens?: number
          output_tokens?: number
          requests_count?: number
          spent_usd?: number
          updated_at?: string
          usage_date?: string
        }
        Relationships: []
      }
      openai_response_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          raw_content: string
          updated_at: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at: string
          raw_content: string
          updated_at?: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          raw_content?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_events: {
        Row: {
          anonymous_id: string | null
          created_at: string
          event_name: string
          event_version: number
          id: string
          page_path: string | null
          properties: Json
          session_id: string | null
          source: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          anonymous_id?: string | null
          created_at?: string
          event_name: string
          event_version?: number
          id?: string
          page_path?: string | null
          properties?: Json
          session_id?: string | null
          source?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          anonymous_id?: string | null
          created_at?: string
          event_name?: string
          event_version?: number
          id?: string
          page_path?: string | null
          properties?: Json
          session_id?: string | null
          source?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          daily_email: boolean
          email: string | null
          id: string
          name: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          daily_email?: boolean
          email?: string | null
          id: string
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          daily_email?: boolean
          email?: string | null
          id?: string
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      progress_tracking: {
        Row: {
          ai_analysis: string | null
          back_photo_url: string | null
          bmi: number | null
          body_fat_percentage: number | null
          created_at: string | null
          date_recorded: string | null
          endurance_score: number | null
          energy_level: number | null
          flexibility_score: number | null
          front_photo_url: string | null
          id: string
          mood: number | null
          motivation: number | null
          muscle_mass_kg: number | null
          recommendations: string | null
          side_photo_url: string | null
          sleep_quality: number | null
          strength_score: number | null
          user_id: string | null
          weight_kg: number | null
        }
        Insert: {
          ai_analysis?: string | null
          back_photo_url?: string | null
          bmi?: number | null
          body_fat_percentage?: number | null
          created_at?: string | null
          date_recorded?: string | null
          endurance_score?: number | null
          energy_level?: number | null
          flexibility_score?: number | null
          front_photo_url?: string | null
          id?: string
          mood?: number | null
          motivation?: number | null
          muscle_mass_kg?: number | null
          recommendations?: string | null
          side_photo_url?: string | null
          sleep_quality?: number | null
          strength_score?: number | null
          user_id?: string | null
          weight_kg?: number | null
        }
        Update: {
          ai_analysis?: string | null
          back_photo_url?: string | null
          bmi?: number | null
          body_fat_percentage?: number | null
          created_at?: string | null
          date_recorded?: string | null
          endurance_score?: number | null
          energy_level?: number | null
          flexibility_score?: number | null
          front_photo_url?: string | null
          id?: string
          mood?: number | null
          motivation?: number | null
          muscle_mass_kg?: number | null
          recommendations?: string | null
          side_photo_url?: string | null
          sleep_quality?: number | null
          strength_score?: number | null
          user_id?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "progress_tracking_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes_catalog: {
        Row: {
          active: boolean
          carbs_g: number | null
          created_at: string
          diet_tags: string[]
          fat_g: number | null
          id: number
          image_url: string | null
          ingredients: Json | null
          instructions: Json | null
          instructions_cs: Json | null
          kcal: number
          meal_type: string
          name_cs: string
          name_en: string | null
          protein_g: number | null
          servings: number | null
          source: string
          source_id: string | null
          spoonacular_url: string | null
        }
        Insert: {
          active?: boolean
          carbs_g?: number | null
          created_at?: string
          diet_tags?: string[]
          fat_g?: number | null
          id?: never
          image_url?: string | null
          ingredients?: Json | null
          instructions?: Json | null
          instructions_cs?: Json | null
          kcal: number
          meal_type: string
          name_cs: string
          name_en?: string | null
          protein_g?: number | null
          servings?: number | null
          source?: string
          source_id?: string | null
          spoonacular_url?: string | null
        }
        Update: {
          active?: boolean
          carbs_g?: number | null
          created_at?: string
          diet_tags?: string[]
          fat_g?: number | null
          id?: never
          image_url?: string | null
          ingredients?: Json | null
          instructions?: Json | null
          instructions_cs?: Json | null
          kcal?: number
          meal_type?: string
          name_cs?: string
          name_en?: string | null
          protein_g?: number | null
          servings?: number | null
          source?: string
          source_id?: string | null
          spoonacular_url?: string | null
        }
        Relationships: []
      }
      registrations: {
        Row: {
          activity: string | null
          age: string | null
          created_at: string
          email: string
          frequency: string | null
          gender: string | null
          goal: string | null
          height: string | null
          id: number
          name: string | null
          notes: string | null
          program: string | null
          stress: string | null
          weight: string | null
          worktype: string | null
        }
        Insert: {
          activity?: string | null
          age?: string | null
          created_at?: string
          email: string
          frequency?: string | null
          gender?: string | null
          goal?: string | null
          height?: string | null
          id?: number
          name?: string | null
          notes?: string | null
          program?: string | null
          stress?: string | null
          weight?: string | null
          worktype?: string | null
        }
        Update: {
          activity?: string | null
          age?: string | null
          created_at?: string
          email?: string
          frequency?: string | null
          gender?: string | null
          goal?: string | null
          height?: string | null
          id?: number
          name?: string | null
          notes?: string | null
          program?: string | null
          stress?: string | null
          weight?: string | null
          worktype?: string | null
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          handler_result: string | null
          id: string
          processed_at: string
          processing_started_at: string | null
          status: string
          stripe_event_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          handler_result?: string | null
          id?: string
          processed_at?: string
          processing_started_at?: string | null
          status?: string
          stripe_event_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          handler_result?: string | null
          id?: string
          processed_at?: string
          processing_started_at?: string | null
          status?: string
          stripe_event_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_cycle: string | null
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_name: string | null
          price_czk: number | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          billing_cycle?: string | null
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_name?: string | null
          price_czk?: number | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          billing_cycle?: string | null
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_name?: string | null
          price_czk?: number | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_alert_state: {
        Row: {
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      trainer_calendar_tokens: {
        Row: {
          access_token: string | null
          calendar_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          refresh_token: string
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          calendar_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          refresh_token: string
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          calendar_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          refresh_token?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_ai_memory: {
        Row: {
          agent_slug: string
          content: string
          created_at: string | null
          id: string
          memory_type: string | null
          source_agent_slug: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          agent_slug: string
          content: string
          created_at?: string | null
          id?: string
          memory_type?: string | null
          source_agent_slug?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          agent_slug?: string
          content?: string
          created_at?: string | null
          id?: string
          memory_type?: string | null
          source_agent_slug?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_checkins: {
        Row: {
          adherence_score: number | null
          created_at: string | null
          id: string
          notes: string | null
          stress_level: string | null
          user_id: string
          weight: number | null
        }
        Insert: {
          adherence_score?: number | null
          created_at?: string | null
          id?: string
          notes?: string | null
          stress_level?: string | null
          user_id: string
          weight?: number | null
        }
        Update: {
          adherence_score?: number | null
          created_at?: string | null
          id?: string
          notes?: string | null
          stress_level?: string | null
          user_id?: string
          weight?: number | null
        }
        Relationships: []
      }
      user_habits: {
        Row: {
          created_at: string
          habit_id: string
          id: string
          is_positive: boolean
          sort_order: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          habit_id: string
          id?: string
          is_positive: boolean
          sort_order?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          habit_id?: string
          id?: string
          is_positive?: boolean
          sort_order?: number | null
          user_id?: string
        }
        Relationships: []
      }
      user_meal_pins: {
        Row: {
          created_at: string | null
          id: string
          meal_text: string
          meal_type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          meal_text: string
          meal_type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          meal_text?: string
          meal_type?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string | null
          date_of_birth: string | null
          email: string
          gender: string | null
          id: string
          is_active: boolean | null
          name: string
          password_hash: string | null
          phone: string | null
          subscription_expires_at: string | null
          subscription_plan: string | null
          surname: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date_of_birth?: string | null
          email: string
          gender?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          password_hash?: string | null
          phone?: string | null
          subscription_expires_at?: string | null
          subscription_plan?: string | null
          surname?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date_of_birth?: string | null
          email?: string
          gender?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          password_hash?: string | null
          phone?: string | null
          subscription_expires_at?: string | null
          subscription_plan?: string | null
          surname?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          created_at: string
          device_preference: string | null
          email: string
          id: string
          name: string | null
          source: string
        }
        Insert: {
          created_at?: string
          device_preference?: string | null
          email: string
          id?: string
          name?: string | null
          source: string
        }
        Update: {
          created_at?: string
          device_preference?: string | null
          email?: string
          id?: string
          name?: string | null
          source?: string
        }
        Relationships: []
      }
      withings_body_snapshots: {
        Row: {
          basal_metabolic_rate: number | null
          bmi: number | null
          bone_mass_kg: number | null
          connection_id: string | null
          created_at: string
          fat_mass_kg: number | null
          fat_percent: number | null
          hydration_kg: number | null
          hydration_percent: number | null
          id: string
          measured_at: string
          muscle_mass_kg: number | null
          pulse: number | null
          raw_payload: Json
          source: string
          updated_at: string
          user_id: string
          visceral_fat: number | null
          weight_kg: number | null
          withings_measure_group_id: string | null
        }
        Insert: {
          basal_metabolic_rate?: number | null
          bmi?: number | null
          bone_mass_kg?: number | null
          connection_id?: string | null
          created_at?: string
          fat_mass_kg?: number | null
          fat_percent?: number | null
          hydration_kg?: number | null
          hydration_percent?: number | null
          id?: string
          measured_at: string
          muscle_mass_kg?: number | null
          pulse?: number | null
          raw_payload?: Json
          source?: string
          updated_at?: string
          user_id: string
          visceral_fat?: number | null
          weight_kg?: number | null
          withings_measure_group_id?: string | null
        }
        Update: {
          basal_metabolic_rate?: number | null
          bmi?: number | null
          bone_mass_kg?: number | null
          connection_id?: string | null
          created_at?: string
          fat_mass_kg?: number | null
          fat_percent?: number | null
          hydration_kg?: number | null
          hydration_percent?: number | null
          id?: string
          measured_at?: string
          muscle_mass_kg?: number | null
          pulse?: number | null
          raw_payload?: Json
          source?: string
          updated_at?: string
          user_id?: string
          visceral_fat?: number | null
          weight_kg?: number | null
          withings_measure_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "withings_body_snapshots_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "withings_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      withings_connections: {
        Row: {
          access_token_ciphertext: Json
          connected_at: string
          csrf_token: string | null
          expires_at: string
          id: string
          last_sync_at: string | null
          last_sync_error: string | null
          refresh_token_ciphertext: Json
          refresh_token_expires_at: string | null
          scope: string | null
          token_type: string
          updated_at: string
          user_id: string
          withings_userid: string | null
        }
        Insert: {
          access_token_ciphertext: Json
          connected_at?: string
          csrf_token?: string | null
          expires_at: string
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          refresh_token_ciphertext: Json
          refresh_token_expires_at?: string | null
          scope?: string | null
          token_type?: string
          updated_at?: string
          user_id: string
          withings_userid?: string | null
        }
        Update: {
          access_token_ciphertext?: Json
          connected_at?: string
          csrf_token?: string | null
          expires_at?: string
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          refresh_token_ciphertext?: Json
          refresh_token_expires_at?: string | null
          scope?: string | null
          token_type?: string
          updated_at?: string
          user_id?: string
          withings_userid?: string | null
        }
        Relationships: []
      }
      withings_measurements: {
        Row: {
          attrib: number | null
          category: number | null
          created_at: string
          id: string
          measure_type: number
          measure_type_label: string
          measured_at: string
          raw: Json
          unit: string | null
          updated_at: string
          user_id: string
          value: number
          withings_measure_group_id: string
          withings_userid: string | null
        }
        Insert: {
          attrib?: number | null
          category?: number | null
          created_at?: string
          id?: string
          measure_type: number
          measure_type_label: string
          measured_at: string
          raw?: Json
          unit?: string | null
          updated_at?: string
          user_id: string
          value: number
          withings_measure_group_id: string
          withings_userid?: string | null
        }
        Update: {
          attrib?: number | null
          category?: number | null
          created_at?: string
          id?: string
          measure_type?: number
          measure_type_label?: string
          measured_at?: string
          raw?: Json
          unit?: string | null
          updated_at?: string
          user_id?: string
          value?: number
          withings_measure_group_id?: string
          withings_userid?: string | null
        }
        Relationships: []
      }
      withings_oauth_states: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          return_to: string
          state_hash: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          return_to?: string
          state_hash: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          return_to?: string
          state_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      workout_replacements: {
        Row: {
          confirmed_at: string | null
          created_at: string
          duration_minutes: number | null
          equipment_level: string | null
          expires_at: string | null
          generation_attempt: number
          id: string
          intensity: string | null
          location: string | null
          original_workout: Json
          plan_day: string
          plan_id: string
          prompt_version: string | null
          replacement_workout: Json
          restored_at: string | null
          selected_muscle_groups: string[]
          status: string
          training_location: string | null
          user_id: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          equipment_level?: string | null
          expires_at?: string | null
          generation_attempt?: number
          id?: string
          intensity?: string | null
          location?: string | null
          original_workout: Json
          plan_day: string
          plan_id: string
          prompt_version?: string | null
          replacement_workout: Json
          restored_at?: string | null
          selected_muscle_groups: string[]
          status?: string
          training_location?: string | null
          user_id: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          equipment_level?: string | null
          expires_at?: string | null
          generation_attempt?: number
          id?: string
          intensity?: string | null
          location?: string | null
          original_workout?: Json
          plan_day?: string
          plan_id?: string
          prompt_version?: string | null
          replacement_workout?: Json
          restored_at?: string | null
          selected_muscle_groups?: string[]
          status?: string
          training_location?: string | null
          user_id?: string
        }
        Relationships: []
      }
      workout_type_map: {
        Row: {
          canonical: string
          category: string
          label_cs: string
          raw_type: string
        }
        Insert: {
          canonical: string
          category: string
          label_cs: string
          raw_type: string
        }
        Update: {
          canonical?: string
          category?: string
          label_cs?: string
          raw_type?: string
        }
        Relationships: []
      }
      workouts: {
        Row: {
          ai_feedback: string | null
          calories_burned: number | null
          completed_at: string | null
          completion_percentage: number | null
          created_at: string | null
          difficulty_rating: number | null
          duration_min: number | null
          duration_minutes: number | null
          exercises: Json | null
          form_analysis: Json | null
          form_score: number | null
          id: string
          notes: string | null
          perceived_difficulty: string | null
          plan_id: string | null
          started_at: string | null
          user_id: string | null
          user_notes: string | null
          workout_date: string | null
          workout_name: string
          workout_type: string | null
        }
        Insert: {
          ai_feedback?: string | null
          calories_burned?: number | null
          completed_at?: string | null
          completion_percentage?: number | null
          created_at?: string | null
          difficulty_rating?: number | null
          duration_min?: number | null
          duration_minutes?: number | null
          exercises?: Json | null
          form_analysis?: Json | null
          form_score?: number | null
          id?: string
          notes?: string | null
          perceived_difficulty?: string | null
          plan_id?: string | null
          started_at?: string | null
          user_id?: string | null
          user_notes?: string | null
          workout_date?: string | null
          workout_name: string
          workout_type?: string | null
        }
        Update: {
          ai_feedback?: string | null
          calories_burned?: number | null
          completed_at?: string | null
          completion_percentage?: number | null
          created_at?: string | null
          difficulty_rating?: number | null
          duration_min?: number | null
          duration_minutes?: number | null
          exercises?: Json | null
          form_analysis?: Json | null
          form_score?: number | null
          id?: string
          notes?: string | null
          perceived_difficulty?: string | null
          plan_id?: string | null
          started_at?: string | null
          user_id?: string | null
          user_notes?: string | null
          workout_date?: string | null
          workout_name?: string
          workout_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workouts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "ai_generated_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "v_user_plan_status"
            referencedColumns: ["plan_id"]
          },
        ]
      }
    }
    Views: {
      apple_health_daily: {
        Row: {
          active_kcal: number | null
          ah_body_fat_pct: number | null
          ah_weight_kg: number | null
          avg_hr: number | null
          basal_kcal: number | null
          cardio_recovery: number | null
          cycling_km: number | null
          daylight_min: number | null
          distance_km: number | null
          exercise_min: number | null
          flights: number | null
          hrv_ms: number | null
          local_date: string | null
          max_hr: number | null
          min_hr: number | null
          respiratory_rate: number | null
          resting_hr: number | null
          sleep_asleep_min: number | null
          sleep_core_min: number | null
          sleep_deep_min: number | null
          sleep_efficiency_pct: number | null
          sleep_rem_min: number | null
          spo2: number | null
          stand_hours: number | null
          steps: number | null
          swimming_m: number | null
          user_id: string | null
          vo2max: number | null
          walking_hr: number | null
          workout_avg_hr: number | null
          workout_categories: string[] | null
          workout_count: number | null
          workout_kcal: number | null
          workout_km: number | null
          workout_labels: string | null
          workout_max_hr: number | null
          workout_min: number | null
          workout_types: string[] | null
        }
        Relationships: []
      }
      apple_health_metrics_daily: {
        Row: {
          agg: string | null
          category: string | null
          is_key: boolean | null
          label_cs: string | null
          last_measured_at: string | null
          local_date: string | null
          max_value: number | null
          metric_name: string | null
          min_value: number | null
          samples: number | null
          unit: string | null
          user_id: string | null
          value: number | null
        }
        Relationships: []
      }
      apple_health_recovery: {
        Row: {
          active_kcal: number | null
          exercise_min: number | null
          has_sleep: boolean | null
          hrv_baseline7: number | null
          hrv_delta_pct: number | null
          hrv_ms: number | null
          local_date: string | null
          recovery_score: number | null
          recovery_status: string | null
          resting_hr: number | null
          rhr_baseline7: number | null
          rhr_delta_bpm: number | null
          sleep_asleep_min: number | null
          steps: number | null
          user_id: string | null
          workout_count: number | null
          workout_labels: string | null
          workout_min: number | null
        }
        Relationships: []
      }
      apple_health_unknown_metrics: {
        Row: {
          metric_name: string | null
          naposledy: string | null
          radku: number | null
          unit: string | null
        }
        Relationships: []
      }
      v_membership_funnel: {
        Row: {
          count: number | null
          first_started: string | null
          last_started: string | null
          status: string | null
          tier: string | null
        }
        Relationships: []
      }
      v_plan_quality_dashboard: {
        Row: {
          avg_ex_resolved: number | null
          avg_meals_resolved: number | null
          avg_spoon_req: number | null
          plan_date: string | null
          plans_generated: number | null
          plans_high_quality: number | null
          plans_with_jidlo_bug: number | null
          total_spoon_requests: number | null
        }
        Relationships: []
      }
      v_user_plan_status: {
        Row: {
          daily_calories: number | null
          email: string | null
          is_active: boolean | null
          plan_created_at: string | null
          plan_id: string | null
          plan_status: string | null
          plan_type: string | null
          task_attempts: number | null
          task_created_at: string | null
          task_error: string | null
          task_id: string | null
          task_status: string | null
          user_id: string | null
        }
        Relationships: []
      }
      withings_daily: {
        Row: {
          bmi: number | null
          bmr_kcal: number | null
          body_fat_pct: number | null
          bone_mass_kg: number | null
          fat_mass_kg: number | null
          hydration_percent: number | null
          local_date: string | null
          measured_at: string | null
          muscle_mass_kg: number | null
          pulse: number | null
          user_id: string | null
          visceral_fat: number | null
          weight_kg: number | null
        }
        Relationships: []
      }
      workout_types_unmapped: {
        Row: {
          naposledy: string | null
          pocet: number | null
          workout_type: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_tdee: {
        Args: {
          activity_level?: string
          age: number
          gender: string
          height_cm: number
          weight_kg: number
        }
        Returns: number
      }
      cancel_beta_participant_emails: {
        Args: { p_participant_id: string }
        Returns: number
      }
      claim_beta_email_batch: {
        Args: { p_limit?: number; p_stale_minutes?: number }
        Returns: {
          attempt_count: number
          created_at: string
          error_code: string | null
          failed_at: string | null
          id: string
          participant_id: string
          processing_started_at: string | null
          provider_message_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
          trigger_key: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "beta_email_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_beta_invite: {
        Args: {
          p_beta_terms_version: string
          p_invite_hash: string
          p_user_id: string
        }
        Returns: Json
      }
      delete_user_data: { Args: { target_user_id: string }; Returns: Json }
      get_beta_participant_for_user: {
        Args: { p_user_id: string }
        Returns: Json
      }
      insert_product_event_server: {
        Args: {
          p_event_name: string
          p_event_version?: number
          p_page_path?: string
          p_properties?: Json
          p_source?: string
          p_user_id: string
          p_utm_campaign?: string
          p_utm_medium?: string
          p_utm_source?: string
        }
        Returns: string
      }
      join_beta_cohort: {
        Args: {
          p_beta_terms_version: string
          p_cohort_code: string
          p_source?: string
          p_user_id: string
        }
        Returns: Json
      }
      list_beta_email_participants: {
        Args: { p_cohort_code?: string }
        Returns: Json
      }
      mark_beta_email_failed: {
        Args: {
          p_error_code: string
          p_message_id: string
          p_retry_at?: string
        }
        Returns: boolean
      }
      mark_beta_email_sent: {
        Args: { p_message_id: string; p_provider_message_id?: string }
        Returns: boolean
      }
      mark_beta_email_skipped: {
        Args: { p_error_code?: string; p_message_id: string }
        Returns: boolean
      }
      patch_beta_participant_milestone: {
        Args: { p_patch: Json; p_user_id: string }
        Returns: boolean
      }
      queue_beta_email_message: {
        Args: {
          p_participant_id: string
          p_scheduled_at: string
          p_trigger_key: string
          p_user_id: string
        }
        Returns: Json
      }
      validate_beta_invite: { Args: { p_invite_hash: string }; Returns: Json }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
