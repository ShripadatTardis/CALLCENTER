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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      chat_messages: {
        Row: {
          created_at: string | null
          id: string
          message_text: string
          role: string
          session_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message_text: string
          role: string
          session_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message_text?: string
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          created_at: string | null
          last_active_at: string | null
          session_id: string
        }
        Insert: {
          created_at?: string | null
          last_active_at?: string | null
          session_id: string
        }
        Update: {
          created_at?: string | null
          last_active_at?: string | null
          session_id?: string
        }
        Relationships: []
      }
      chat_traces: {
        Row: {
          appended_context: Json
          citations: Json
          created_at: string | null
          id: string
          message_id: string
          model_meta: Json
          options: Json
          retrieval_trace: Json
          session_id: string
        }
        Insert: {
          appended_context: Json
          citations: Json
          created_at?: string | null
          id?: string
          message_id: string
          model_meta: Json
          options: Json
          retrieval_trace: Json
          session_id: string
        }
        Update: {
          appended_context?: Json
          citations?: Json
          created_at?: string | null
          id?: string
          message_id?: string
          model_meta?: Json
          options?: Json
          retrieval_trace?: Json
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_traces_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_traces_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      kb_chunks: {
        Row: {
          content: string
          created_at: string | null
          embedding: string | null
          id: string
          metadata: Json
          source_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json
          source_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json
          source_id?: string
        }
        Relationships: []
      }
      kb_facts: {
        Row: {
          authority_level: string
          channel: string
          country: string
          created_at: string
          cs_permission_level: string
          customer_segment: string
          effective_from: string
          effective_to: string | null
          fact_key: string
          fact_type: string
          id: string
          metadata: Json
          product: string
          required_inputs: Json
          source_clause: string | null
          source_doc: string
          source_id: string | null
          topic: string
          updated_at: string
          value: Json | null
          value_type: string
          version: string | null
        }
        Insert: {
          authority_level?: string
          channel?: string
          country: string
          created_at?: string
          cs_permission_level?: string
          customer_segment?: string
          effective_from: string
          effective_to?: string | null
          fact_key: string
          fact_type: string
          id?: string
          metadata?: Json
          product: string
          required_inputs?: Json
          source_clause?: string | null
          source_doc: string
          source_id?: string | null
          topic: string
          updated_at?: string
          value?: Json | null
          value_type: string
          version?: string | null
        }
        Update: {
          authority_level?: string
          channel?: string
          country?: string
          created_at?: string
          cs_permission_level?: string
          customer_segment?: string
          effective_from?: string
          effective_to?: string | null
          fact_key?: string
          fact_type?: string
          id?: string
          metadata?: Json
          product?: string
          required_inputs?: Json
          source_clause?: string | null
          source_doc?: string
          source_id?: string | null
          topic?: string
          updated_at?: string
          value?: Json | null
          value_type?: string
          version?: string | null
        }
        Relationships: []
      }
      kb_graph_edges: {
        Row: {
          channel: string
          conditions: Json
          country: string
          created_at: string
          cs_permission_level: string
          customer_segment: string
          effective_from: string
          effective_to: string | null
          from_entity_id: string
          id: string
          metadata: Json
          product: string
          relationship_type: string
          source_clause: string | null
          source_doc: string
          source_id: string | null
          to_entity_id: string
          topic: string
          updated_at: string
          version: string | null
          weight: number
        }
        Insert: {
          channel?: string
          conditions?: Json
          country: string
          created_at?: string
          cs_permission_level?: string
          customer_segment?: string
          effective_from: string
          effective_to?: string | null
          from_entity_id: string
          id?: string
          metadata?: Json
          product: string
          relationship_type: string
          source_clause?: string | null
          source_doc: string
          source_id?: string | null
          to_entity_id: string
          topic: string
          updated_at?: string
          version?: string | null
          weight?: number
        }
        Update: {
          channel?: string
          conditions?: Json
          country?: string
          created_at?: string
          cs_permission_level?: string
          customer_segment?: string
          effective_from?: string
          effective_to?: string | null
          from_entity_id?: string
          id?: string
          metadata?: Json
          product?: string
          relationship_type?: string
          source_clause?: string | null
          source_doc?: string
          source_id?: string | null
          to_entity_id?: string
          topic?: string
          updated_at?: string
          version?: string | null
          weight?: number
        }
        Relationships: []
      }
      orchestrator_approvals: {
        Row: {
          action: string
          comment: string | null
          created_at: string | null
          flow_id: string
          id: string
          reviewer_id: string
          version: number
        }
        Insert: {
          action: string
          comment?: string | null
          created_at?: string | null
          flow_id: string
          id?: string
          reviewer_id: string
          version: number
        }
        Update: {
          action?: string
          comment?: string | null
          created_at?: string | null
          flow_id?: string
          id?: string
          reviewer_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "orchestrator_approvals_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "orchestrator_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      orchestrator_flows: {
        Row: {
          channels: Database["public"]["Enums"]["flow_channel"][]
          created_at: string | null
          created_by: string
          current_version: number
          description: string | null
          id: string
          industry: string
          name: string
          status: Database["public"]["Enums"]["flow_status"]
          tags: string[] | null
          updated_at: string | null
          updated_by: string
        }
        Insert: {
          channels: Database["public"]["Enums"]["flow_channel"][]
          created_at?: string | null
          created_by: string
          current_version?: number
          description?: string | null
          id?: string
          industry: string
          name: string
          status?: Database["public"]["Enums"]["flow_status"]
          tags?: string[] | null
          updated_at?: string | null
          updated_by: string
        }
        Update: {
          channels?: Database["public"]["Enums"]["flow_channel"][]
          created_at?: string | null
          created_by?: string
          current_version?: number
          description?: string | null
          id?: string
          industry?: string
          name?: string
          status?: Database["public"]["Enums"]["flow_status"]
          tags?: string[] | null
          updated_at?: string | null
          updated_by?: string
        }
        Relationships: []
      }
      orchestrator_integrations: {
        Row: {
          config: Json
          created_at: string | null
          created_by: string
          env: string
          id: string
          last_test_status: string | null
          last_tested_at: string | null
          name: string
          type: Database["public"]["Enums"]["integration_type"]
          updated_at: string | null
          updated_by: string
        }
        Insert: {
          config: Json
          created_at?: string | null
          created_by: string
          env?: string
          id?: string
          last_test_status?: string | null
          last_tested_at?: string | null
          name: string
          type: Database["public"]["Enums"]["integration_type"]
          updated_at?: string | null
          updated_by: string
        }
        Update: {
          config?: Json
          created_at?: string | null
          created_by?: string
          env?: string
          id?: string
          last_test_status?: string | null
          last_tested_at?: string | null
          name?: string
          type?: Database["public"]["Enums"]["integration_type"]
          updated_at?: string | null
          updated_by?: string
        }
        Relationships: []
      }
      orchestrator_runs: {
        Row: {
          created_at: string | null
          created_by: string | null
          duration_ms: number | null
          flow_id: string
          id: string
          input: Json | null
          outcome: Database["public"]["Enums"]["run_outcome"] | null
          run_type: Database["public"]["Enums"]["run_type"]
          trace: Json | null
          version: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          duration_ms?: number | null
          flow_id: string
          id?: string
          input?: Json | null
          outcome?: Database["public"]["Enums"]["run_outcome"] | null
          run_type: Database["public"]["Enums"]["run_type"]
          trace?: Json | null
          version: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          duration_ms?: number | null
          flow_id?: string
          id?: string
          input?: Json | null
          outcome?: Database["public"]["Enums"]["run_outcome"] | null
          run_type?: Database["public"]["Enums"]["run_type"]
          trace?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "orchestrator_runs_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "orchestrator_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      orchestrator_snippets: {
        Row: {
          created_at: string | null
          id: string
          name: string
          owner: string
          shared: boolean | null
          snippet_json: Json
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          owner: string
          shared?: boolean | null
          snippet_json: Json
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          owner?: string
          shared?: boolean | null
          snippet_json?: Json
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      orchestrator_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          changelog: string | null
          created_at: string | null
          flow_id: string
          flow_json: Json
          id: string
          published_at: string | null
          published_by: string | null
          status_at_version: Database["public"]["Enums"]["flow_status"]
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          changelog?: string | null
          created_at?: string | null
          flow_id: string
          flow_json: Json
          id?: string
          published_at?: string | null
          published_by?: string | null
          status_at_version: Database["public"]["Enums"]["flow_status"]
          version: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          changelog?: string | null
          created_at?: string | null
          flow_id?: string
          flow_json?: Json
          id?: string
          published_at?: string | null
          published_by?: string | null
          status_at_version?: Database["public"]["Enums"]["flow_status"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "orchestrator_versions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "orchestrator_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_messages: {
        Row: {
          body: string
          created_at: string
          direction: string
          from_number: string
          id: string
          status: string
          to_number: string
          twilio_message_sid: string | null
        }
        Insert: {
          body: string
          created_at?: string
          direction: string
          from_number: string
          id?: string
          status?: string
          to_number: string
          twilio_message_sid?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          direction?: string
          from_number?: string
          id?: string
          status?: string
          to_number?: string
          twilio_message_sid?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vapi_response_logs: {
        Row: {
          created_at: string
          format_strategy: string
          formatted_text: string
          id: number
          original_text: string
          session_id: string | null
          whatsapp_number: string
        }
        Insert: {
          created_at?: string
          format_strategy: string
          formatted_text: string
          id?: number
          original_text: string
          session_id?: string | null
          whatsapp_number: string
        }
        Update: {
          created_at?: string
          format_strategy?: string
          formatted_text?: string
          id?: number
          original_text?: string
          session_id?: string | null
          whatsapp_number?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          from_number: string
          id: string
          message_body: string
          processed: boolean | null
          session_id: string | null
          status: string
          timestamp: string
          to_number: string
          twilio_message_sid: string | null
        }
        Insert: {
          created_at?: string
          direction: Database["public"]["Enums"]["message_direction"]
          from_number: string
          id?: string
          message_body: string
          processed?: boolean | null
          session_id?: string | null
          status?: string
          timestamp?: string
          to_number: string
          twilio_message_sid?: string | null
        }
        Update: {
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          from_number?: string
          id?: string
          message_body?: string
          processed?: boolean | null
          session_id?: string | null
          status?: string
          timestamp?: string
          to_number?: string
          twilio_message_sid?: string | null
        }
        Relationships: []
      }
      whatsapp_sessions: {
        Row: {
          authenticated: boolean | null
          created_at: string
          hashed_password: string | null
          last_active: string | null
          otp_attempts: number | null
          otp_code: string | null
          otp_expires_at: string | null
          phone_number: string
          session_id: string
          updated_at: string
        }
        Insert: {
          authenticated?: boolean | null
          created_at?: string
          hashed_password?: string | null
          last_active?: string | null
          otp_attempts?: number | null
          otp_code?: string | null
          otp_expires_at?: string | null
          phone_number: string
          session_id: string
          updated_at?: string
        }
        Update: {
          authenticated?: boolean | null
          created_at?: string
          hashed_password?: string | null
          last_active?: string | null
          otp_attempts?: number | null
          otp_code?: string | null
          otp_expires_at?: string | null
          phone_number?: string
          session_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fetch_kb_facts: {
        Args: {
          p_as_of: string
          p_channel: string
          p_country: string
          p_customer_segment: string
          p_product: string
          p_topic: string
        }
        Returns: {
          authority_level: string
          channel: string
          country: string
          created_at: string
          cs_permission_level: string
          customer_segment: string
          effective_from: string
          effective_to: string | null
          fact_key: string
          fact_type: string
          id: string
          metadata: Json
          product: string
          required_inputs: Json
          source_clause: string | null
          source_doc: string
          source_id: string | null
          topic: string
          updated_at: string
          value: Json | null
          value_type: string
          version: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "kb_facts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fetch_kb_graph_edges: {
        Args: {
          p_as_of: string
          p_channel: string
          p_country: string
          p_customer_segment: string
          p_product: string
          p_topic: string
        }
        Returns: {
          channel: string
          conditions: Json
          country: string
          created_at: string
          cs_permission_level: string
          customer_segment: string
          effective_from: string
          effective_to: string | null
          from_entity_id: string
          id: string
          metadata: Json
          product: string
          relationship_type: string
          source_clause: string | null
          source_doc: string
          source_id: string | null
          to_entity_id: string
          topic: string
          updated_at: string
          version: string | null
          weight: number
        }[]
        SetofOptions: {
          from: "*"
          to: "kb_graph_edges"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "qa_reviewer"
        | "product_manager"
        | "ai_operations_specialist"
      flow_channel: "voice" | "text" | "whatsapp"
      flow_status: "draft" | "approved" | "live" | "archived"
      integration_type: "kb" | "product" | "api"
      message_direction: "inbound" | "outbound"
      run_outcome: "success" | "failure" | "timeout" | "escalated"
      run_type: "simulate" | "live"
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
    Enums: {
      app_role: [
        "admin",
        "qa_reviewer",
        "product_manager",
        "ai_operations_specialist",
      ],
      flow_channel: ["voice", "text", "whatsapp"],
      flow_status: ["draft", "approved", "live", "archived"],
      integration_type: ["kb", "product", "api"],
      message_direction: ["inbound", "outbound"],
      run_outcome: ["success", "failure", "timeout", "escalated"],
      run_type: ["simulate", "live"],
    },
  },
} as const
