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
      achievements: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          metric: string
          name: string
          organization_id: string
          period: string
          threshold: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          metric: string
          name: string
          organization_id: string
          period?: string
          threshold: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          metric?: string
          name?: string
          organization_id?: string
          period?: string
          threshold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          all_day: boolean
          assigned_to: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          end_at: string | null
          id: string
          location: string | null
          meeting_url: string | null
          notes: string | null
          organization_id: string
          prospect_id: string | null
          start_at: string
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          end_at?: string | null
          id?: string
          location?: string | null
          meeting_url?: string | null
          notes?: string | null
          organization_id: string
          prospect_id?: string | null
          start_at: string
          status?: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          end_at?: string | null
          id?: string
          location?: string | null
          meeting_url?: string | null
          notes?: string | null
          organization_id?: string
          prospect_id?: string | null
          start_at?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversation_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          organization_id: string
          role: string
          user_id?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          agent_type: string
          created_at: string
          id: string
          organization_id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_type: string
          created_at?: string
          id?: string
          organization_id: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          agent_type?: string
          created_at?: string
          id?: string
          organization_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_knowledge_entries: {
        Row: {
          category: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          organization_id: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_nudges: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          member_id: string
          nudge_date: string
          organization_id: string
          priority: string
          resolved_at: string | null
          status: string
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          member_id: string
          nudge_date?: string
          organization_id: string
          priority?: string
          resolved_at?: string | null
          status?: string
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          member_id?: string
          nudge_date?: string
          organization_id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_nudges_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_nudges_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_settings: {
        Row: {
          api_key: string | null
          id: string
          model: string | null
          organization_id: string
          provider: string
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          id?: string
          model?: string | null
          organization_id: string
          provider?: string
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          id?: string
          model?: string | null
          organization_id?: string
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_provider_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      class_upgrade_rules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          metric: string
          organization_id: string
          sort_order: number
          target_class_id: string
          threshold: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          metric: string
          organization_id: string
          sort_order?: number
          target_class_id: string
          threshold: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          metric?: string
          organization_id?: string
          sort_order?: number
          target_class_id?: string
          threshold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_upgrade_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_upgrade_rules_target_class_id_fkey"
            columns: ["target_class_id"]
            isOneToOne: false
            referencedRelation: "customer_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_adjustments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          label: string
          member_id: string
          notes: string | null
          organization_id: string
          period_end: string
          period_start: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          member_id: string
          notes?: string | null
          organization_id: string
          period_end: string
          period_start: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          member_id?: string
          notes?: string | null
          organization_id?: string
          period_end?: string
          period_start?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_adjustments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          applies_to: string
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          member_id: string | null
          name: string
          organization_id: string
          priority: number
          product_id: string | null
          rate_percent: number
          updated_at: string
        }
        Insert: {
          applies_to: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          member_id?: string | null
          name: string
          organization_id: string
          priority?: number
          product_id?: string | null
          rate_percent: number
          updated_at?: string
        }
        Update: {
          applies_to?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          member_id?: string | null
          name?: string
          organization_id?: string
          priority?: number
          product_id?: string | null
          rate_percent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_statements: {
        Row: {
          base_total: number
          commission_total: number
          created_at: string
          generated_at: string
          generated_by: string | null
          id: string
          member_id: string
          notes: string | null
          organization_id: string
          paid_at: string | null
          paid_by: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["commission_statement_status"]
          updated_at: string
        }
        Insert: {
          base_total?: number
          commission_total?: number
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          member_id: string
          notes?: string | null
          organization_id: string
          paid_at?: string | null
          paid_by?: string | null
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["commission_statement_status"]
          updated_at?: string
        }
        Update: {
          base_total?: number
          commission_total?: number
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          member_id?: string
          notes?: string | null
          organization_id?: string
          paid_at?: string | null
          paid_by?: string | null
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["commission_statement_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_statements_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_statements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_secrets: {
        Row: {
          ciphertext: string
          connection_id: string
          created_at: string
          id: string
          iv: string
          key: string
          updated_at: string
        }
        Insert: {
          ciphertext: string
          connection_id: string
          created_at?: string
          id?: string
          iv: string
          key: string
          updated_at?: string
        }
        Update: {
          ciphertext?: string
          connection_id?: string
          created_at?: string
          id?: string
          iv?: string
          key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_secrets_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          config: Json
          connector_key: string
          created_at: string
          created_by: string | null
          id: string
          last_error: string | null
          last_tested_at: string | null
          name: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          config?: Json
          connector_key: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          last_tested_at?: string | null
          name: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          connector_key?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          last_tested_at?: string | null
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connections_connector_key_fkey"
            columns: ["connector_key"]
            isOneToOne: false
            referencedRelation: "connector_definitions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_definitions: {
        Row: {
          category: Database["public"]["Enums"]["connector_category"]
          config_schema: Json
          created_at: string
          description: string | null
          is_active: boolean
          key: string
          logo_url: string | null
          name: string
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["connector_category"]
          config_schema?: Json
          created_at?: string
          description?: string | null
          is_active?: boolean
          key: string
          logo_url?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["connector_category"]
          config_schema?: Json
          created_at?: string
          description?: string | null
          is_active?: boolean
          key?: string
          logo_url?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_classes: {
        Row: {
          code: string | null
          created_at: string
          default_discount_percent: number
          id: string
          name: string
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          default_discount_percent?: number
          id?: string
          name: string
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          default_discount_percent?: number
          id?: string
          name?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_classes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_notes: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          note_type: string
          organization_id: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          note_type?: string
          organization_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          note_type?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tag_definitions: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          organization_id: string
          parent_id: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          parent_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_tag_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tag_definitions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "customer_tag_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tag_upgrade_rules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          metric: string
          name: string
          operator: string
          organization_id: string
          period: string
          remove_tag_id: string | null
          target_tag_id: string
          threshold: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          metric: string
          name: string
          operator?: string
          organization_id: string
          period?: string
          remove_tag_id?: string | null
          target_tag_id: string
          threshold: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          metric?: string
          name?: string
          operator?: string
          organization_id?: string
          period?: string
          remove_tag_id?: string | null
          target_tag_id?: string
          threshold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_tag_upgrade_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tag_upgrade_rules_remove_tag_id_fkey"
            columns: ["remove_tag_id"]
            isOneToOne: false
            referencedRelation: "customer_tag_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tag_upgrade_rules_target_tag_id_fkey"
            columns: ["target_tag_id"]
            isOneToOne: false
            referencedRelation: "customer_tag_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_wallet_transactions: {
        Row: {
          amount: number
          balance_after: number | null
          created_at: string
          created_by: string | null
          customer_id: string
          description: string | null
          id: string
          organization_id: string
          source_id: string | null
          source_type: string
          type: string
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          description?: string | null
          id?: string
          organization_id: string
          source_id?: string | null
          source_type?: string
          type: string
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          description?: string | null
          id?: string
          organization_id?: string
          source_id?: string | null
          source_type?: string
          type?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_wallet_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_wallet_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "customer_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_wallets: {
        Row: {
          balance: number
          created_at: string
          currency: string | null
          customer_id: string
          id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string | null
          customer_id: string
          id?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string | null
          customer_id?: string
          id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_wallets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_wallets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          assigned_member_id: string | null
          avg_recurrence_days: number | null
          churn_risk: string | null
          city: string | null
          company_name: string | null
          country: string | null
          created_at: string
          created_by: string | null
          customer_class_id: string | null
          customer_type: string | null
          email: string | null
          id: string
          is_active: boolean
          last_contact_at: string | null
          last_contact_outcome: string | null
          last_purchase_at: string | null
          last_purchase_value: number | null
          lifecycle_phase: string | null
          name: string
          next_purchase_expected_at: string | null
          notes_short: string | null
          orders_count: number
          organization_id: string
          overdue_days: number | null
          phone: string | null
          postal_code: string | null
          rfm_computed_at: string | null
          rfm_frequency: number | null
          rfm_monetary: number | null
          rfm_recency: number | null
          rfm_score: number | null
          segment: string | null
          shipping_address: string | null
          shipping_city: string | null
          shipping_country: string | null
          shipping_postal_code: string | null
          shipping_same_as_billing: boolean
          tags: string[]
          total_spent: number
          updated_at: string
          vat_number: string | null
          vat_valid: boolean | null
          vat_validated_at: string | null
          vat_validated_name: string | null
        }
        Insert: {
          address?: string | null
          assigned_member_id?: string | null
          avg_recurrence_days?: number | null
          churn_risk?: string | null
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          customer_class_id?: string | null
          customer_type?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          last_contact_at?: string | null
          last_contact_outcome?: string | null
          last_purchase_at?: string | null
          last_purchase_value?: number | null
          lifecycle_phase?: string | null
          name: string
          next_purchase_expected_at?: string | null
          notes_short?: string | null
          orders_count?: number
          organization_id: string
          overdue_days?: number | null
          phone?: string | null
          postal_code?: string | null
          rfm_computed_at?: string | null
          rfm_frequency?: number | null
          rfm_monetary?: number | null
          rfm_recency?: number | null
          rfm_score?: number | null
          segment?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_postal_code?: string | null
          shipping_same_as_billing?: boolean
          tags?: string[]
          total_spent?: number
          updated_at?: string
          vat_number?: string | null
          vat_valid?: boolean | null
          vat_validated_at?: string | null
          vat_validated_name?: string | null
        }
        Update: {
          address?: string | null
          assigned_member_id?: string | null
          avg_recurrence_days?: number | null
          churn_risk?: string | null
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          customer_class_id?: string | null
          customer_type?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          last_contact_at?: string | null
          last_contact_outcome?: string | null
          last_purchase_at?: string | null
          last_purchase_value?: number | null
          lifecycle_phase?: string | null
          name?: string
          next_purchase_expected_at?: string | null
          notes_short?: string | null
          orders_count?: number
          organization_id?: string
          overdue_days?: number | null
          phone?: string | null
          postal_code?: string | null
          rfm_computed_at?: string | null
          rfm_frequency?: number | null
          rfm_monetary?: number | null
          rfm_recency?: number | null
          rfm_score?: number | null
          segment?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_postal_code?: string | null
          shipping_same_as_billing?: boolean
          tags?: string[]
          total_spent?: number
          updated_at?: string
          vat_number?: string | null
          vat_valid?: boolean | null
          vat_validated_at?: string | null
          vat_validated_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_assigned_member_id_fkey"
            columns: ["assigned_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_customer_class_id_fkey"
            columns: ["customer_class_id"]
            isOneToOne: false
            referencedRelation: "customer_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_matrix: {
        Row: {
          created_at: string
          customer_class_id: string
          discount_percent: number
          id: string
          organization_id: string
          price_group_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_class_id: string
          discount_percent?: number
          id?: string
          organization_id: string
          price_group_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_class_id?: string
          discount_percent?: number
          id?: string
          organization_id?: string
          price_group_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_matrix_customer_class_id_fkey"
            columns: ["customer_class_id"]
            isOneToOne: false
            referencedRelation: "customer_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_matrix_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_matrix_price_group_id_fkey"
            columns: ["price_group_id"]
            isOneToOne: false
            referencedRelation: "price_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_contracts: {
        Row: {
          commission_pct: number | null
          created_at: string
          created_by: string | null
          discount_pct: number | null
          document_url: string | null
          end_date: string | null
          id: string
          organization_id: string
          partner_id: string
          start_date: string | null
          status: string
          terms: string | null
          title: string
          updated_at: string
        }
        Insert: {
          commission_pct?: number | null
          created_at?: string
          created_by?: string | null
          discount_pct?: number | null
          document_url?: string | null
          end_date?: string | null
          id?: string
          organization_id: string
          partner_id: string
          start_date?: string | null
          status?: string
          terms?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          commission_pct?: number | null
          created_at?: string
          created_by?: string | null
          discount_pct?: number | null
          document_url?: string | null
          end_date?: string | null
          id?: string
          organization_id?: string
          partner_id?: string
          start_date?: string | null
          status?: string
          terms?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribution_contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_contracts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "distribution_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_partners: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          region: string | null
          status: string
          type: string
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          region?: string | null
          status?: string
          type?: string
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          region?: string | null
          status?: string
          type?: string
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distribution_partners_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_partners_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_price_tiers: {
        Row: {
          created_at: string
          discount_pct: number
          id: string
          is_active: boolean
          min_quantity: number
          name: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_pct?: number
          id?: string
          is_active?: boolean
          min_quantity?: number
          name?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_pct?: number
          id?: string
          is_active?: boolean
          min_quantity?: number
          name?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribution_price_tiers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      eu_vat_rates: {
        Row: {
          country_code: string
          country_name: string
          standard_rate: number
        }
        Insert: {
          country_code: string
          country_name: string
          standard_rate: number
        }
        Update: {
          country_code?: string
          country_name?: string
          standard_rate?: number
        }
        Relationships: []
      }
      external_refs: {
        Row: {
          connector_key: string
          created_at: string
          entity_id: string
          entity_type: string
          external_data: Json | null
          external_id: string
          id: string
          organization_id: string
        }
        Insert: {
          connector_key: string
          created_at?: string
          entity_id: string
          entity_type: string
          external_data?: Json | null
          external_id: string
          id?: string
          organization_id: string
        }
        Update: {
          connector_key?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          external_data?: Json | null
          external_id?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_refs_connector_key_fkey"
            columns: ["connector_key"]
            isOneToOne: false
            referencedRelation: "connector_definitions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "external_refs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          connector_key: string
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          error_message: string | null
          external_id: string | null
          external_status: string
          id: string
          invoice_number: string | null
          issued_at: string | null
          order_id: string
          organization_id: string
          pdf_url: string | null
          status: string
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
          vat_exemption_reason: string | null
          vat_treatment: string | null
        }
        Insert: {
          connector_key?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          error_message?: string | null
          external_id?: string | null
          external_status?: string
          id?: string
          invoice_number?: string | null
          issued_at?: string | null
          order_id: string
          organization_id: string
          pdf_url?: string | null
          status?: string
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          vat_exemption_reason?: string | null
          vat_treatment?: string | null
        }
        Update: {
          connector_key?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          error_message?: string | null
          external_id?: string | null
          external_status?: string
          id?: string
          invoice_number?: string | null
          issued_at?: string | null
          order_id?: string
          organization_id?: string
          pdf_url?: string | null
          status?: string
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          vat_exemption_reason?: string | null
          vat_treatment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      issues: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string | null
          id: string
          order_id: string | null
          organization_id: string
          priority: string
          resolved_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          id?: string
          order_id?: string | null
          organization_id: string
          priority?: string
          resolved_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          id?: string
          order_id?: string | null
          organization_id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "issues_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_assignment_pool: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_assignment_pool_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_assignment_settings: {
        Row: {
          enabled: boolean
          id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          id?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_assignment_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_assignment_state: {
        Row: {
          id: string
          last_user_id: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          last_user_id?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          last_user_id?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_assignment_state_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_scoring_config: {
        Row: {
          id: string
          is_active: boolean
          organization_id: string
          updated_at: string
          weights: Json
        }
        Insert: {
          id?: string
          is_active?: boolean
          organization_id: string
          updated_at?: string
          weights?: Json
        }
        Update: {
          id?: string
          is_active?: boolean
          organization_id?: string
          updated_at?: string
          weights?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lead_scoring_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      member_achievements: {
        Row: {
          achievement_id: string
          earned_at: string
          id: string
          organization_id: string
          user_id: string
          value: number | null
        }
        Insert: {
          achievement_id: string
          earned_at?: string
          id?: string
          organization_id: string
          user_id: string
          value?: number | null
        }
        Update: {
          achievement_id?: string
          earned_at?: string
          id?: string
          organization_id?: string
          user_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "member_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_achievements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_lines: {
        Row: {
          created_at: string
          description: string
          discount_percent: number
          id: string
          line_subtotal: number | null
          line_tax: number | null
          line_total: number | null
          order_id: string
          organization_id: string
          product_id: string | null
          quantity: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          discount_percent?: number
          id?: string
          line_subtotal?: number | null
          line_tax?: number | null
          line_total?: number | null
          order_id: string
          organization_id: string
          product_id?: string | null
          quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          discount_percent?: number
          id?: string
          line_subtotal?: number | null
          line_tax?: number | null
          line_total?: number | null
          order_id?: string
          organization_id?: string
          product_id?: string | null
          quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          assigned_member_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string
          id: string
          notes: string | null
          order_date: string
          order_number: string
          organization_id: string
          paid_at: string | null
          payment_provider: string | null
          payment_ref: string | null
          payment_url: string | null
          ship_to_address: string | null
          ship_to_city: string | null
          ship_to_country: string | null
          ship_to_name: string | null
          ship_to_postal_code: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
          vat_destination_rate: number | null
          vat_exemption_reason: string | null
          vat_treatment: string
          wallet_balance_applied: number
        }
        Insert: {
          assigned_member_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id: string
          id?: string
          notes?: string | null
          order_date?: string
          order_number: string
          organization_id: string
          paid_at?: string | null
          payment_provider?: string | null
          payment_ref?: string | null
          payment_url?: string | null
          ship_to_address?: string | null
          ship_to_city?: string | null
          ship_to_country?: string | null
          ship_to_name?: string | null
          ship_to_postal_code?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          vat_destination_rate?: number | null
          vat_exemption_reason?: string | null
          vat_treatment?: string
          wallet_balance_applied?: number
        }
        Update: {
          assigned_member_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string
          id?: string
          notes?: string | null
          order_date?: string
          order_number?: string
          organization_id?: string
          paid_at?: string | null
          payment_provider?: string | null
          payment_ref?: string | null
          payment_url?: string | null
          ship_to_address?: string | null
          ship_to_city?: string | null
          ship_to_country?: string | null
          ship_to_name?: string | null
          ship_to_postal_code?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          vat_destination_rate?: number | null
          vat_exemption_reason?: string | null
          vat_treatment?: string
          wallet_balance_applied?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_assigned_member_id_fkey"
            columns: ["assigned_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invoice_counters: {
        Row: {
          last_number: number
          organization_id: string
        }
        Insert: {
          last_number?: number
          organization_id: string
        }
        Update: {
          last_number?: number
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invoice_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_order_counters: {
        Row: {
          last_number: number
          organization_id: string
        }
        Insert: {
          last_number?: number
          organization_id: string
        }
        Update: {
          last_number?: number
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_order_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_vat_settings: {
        Row: {
          organization_id: string
          oss_enabled: boolean
          text_export: string
          text_oss: string
          text_reverse_charge: string
          updated_at: string
        }
        Insert: {
          organization_id: string
          oss_enabled?: boolean
          text_export?: string
          text_oss?: string
          text_reverse_charge?: string
          updated_at?: string
        }
        Update: {
          organization_id?: string
          oss_enabled?: boolean
          text_export?: string
          text_oss?: string
          text_reverse_charge?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_vat_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_subscription: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          id: string
          organization_id: string
          plan_id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          organization_id: string
          plan_id: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          organization_id?: string
          plan_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscription_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscription_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          country: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          invoice_mode: Database["public"]["Enums"]["invoice_mode"]
          locale: string
          logo_url: string | null
          name: string
          primary_color: string
          slug: string | null
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          invoice_mode?: Database["public"]["Enums"]["invoice_mode"]
          locale?: string
          logo_url?: string | null
          name: string
          primary_color?: string
          slug?: string | null
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          invoice_mode?: Database["public"]["Enums"]["invoice_mode"]
          locale?: string
          logo_url?: string | null
          name?: string
          primary_color?: string
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      outreach_campaign_targets: {
        Row: {
          campaign_id: string
          created_at: string
          current_step: number
          id: string
          last_channel: string | null
          lead_id: string
          next_action_at: string | null
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          current_step?: number
          id?: string
          last_channel?: string | null
          lead_id: string
          next_action_at?: string | null
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          current_step?: number
          id?: string
          last_channel?: string | null
          lead_id?: string
          next_action_at?: string | null
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_campaign_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_campaign_targets_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_campaign_targets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_campaigns: {
        Row: {
          audience_filter: Json
          channels: string[]
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          schedule_mode: string
          scheduled_at: string | null
          status: string
          steps: Json
          updated_at: string
        }
        Insert: {
          audience_filter?: Json
          channels?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          schedule_mode?: string
          scheduled_at?: string | null
          status?: string
          steps?: Json
          updated_at?: string
        }
        Update: {
          audience_filter?: Json
          channels?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          schedule_mode?: string
          scheduled_at?: string | null
          status?: string
          steps?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_channel_state: {
        Row: {
          channel: string
          consecutive_failures: number
          daily_sent: number
          day: string | null
          id: string
          organization_id: string
          status: string
          updated_at: string
          week_start: string | null
          weekly_sent: number
        }
        Insert: {
          channel: string
          consecutive_failures?: number
          daily_sent?: number
          day?: string | null
          id?: string
          organization_id: string
          status?: string
          updated_at?: string
          week_start?: string | null
          weekly_sent?: number
        }
        Update: {
          channel?: string
          consecutive_failures?: number
          daily_sent?: number
          day?: string | null
          id?: string
          organization_id?: string
          status?: string
          updated_at?: string
          week_start?: string | null
          weekly_sent?: number
        }
        Relationships: [
          {
            foreignKeyName: "outreach_channel_state_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_email_domains: {
        Row: {
          created_at: string
          daily_cap: number
          domain: string
          from_name: string | null
          health_score: number
          id: string
          is_active: boolean
          organization_id: string
          resend_domain_id: string | null
          sent_today: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_cap?: number
          domain: string
          from_name?: string | null
          health_score?: number
          id?: string
          is_active?: boolean
          organization_id: string
          resend_domain_id?: string | null
          sent_today?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_cap?: number
          domain?: string
          from_name?: string | null
          health_score?: number
          id?: string
          is_active?: boolean
          organization_id?: string
          resend_domain_id?: string | null
          sent_today?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_email_domains_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_inbox_messages: {
        Row: {
          author_user_id: string | null
          body: string
          channel: string
          created_at: string
          direction: string
          id: string
          lead_id: string
          organization_id: string
          provider_message_id: string | null
          read: boolean
        }
        Insert: {
          author_user_id?: string | null
          body?: string
          channel?: string
          created_at?: string
          direction: string
          id?: string
          lead_id: string
          organization_id: string
          provider_message_id?: string | null
          read?: boolean
        }
        Update: {
          author_user_id?: string | null
          body?: string
          channel?: string
          created_at?: string
          direction?: string
          id?: string
          lead_id?: string
          organization_id?: string
          provider_message_id?: string | null
          read?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "outreach_inbox_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_inbox_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_leads: {
        Row: {
          city: string | null
          company: string | null
          country: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          email: string | null
          full_name: string | null
          has_whatsapp: boolean
          id: string
          name: string
          niche: string | null
          organization_id: string
          phone: string | null
          prospect_id: string | null
          quality_score: number | null
          source: string
          state: string | null
          status: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name?: string | null
          has_whatsapp?: boolean
          id?: string
          name: string
          niche?: string | null
          organization_id: string
          phone?: string | null
          prospect_id?: string | null
          quality_score?: number | null
          source?: string
          state?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name?: string | null
          has_whatsapp?: boolean
          id?: string
          name?: string
          niche?: string | null
          organization_id?: string
          phone?: string | null
          prospect_id?: string | null
          quality_score?: number | null
          source?: string
          state?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_leads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_leads_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_messages: {
        Row: {
          campaign_id: string | null
          channel: string
          clicked_at: string | null
          created_at: string
          delivered_at: string | null
          error: string | null
          id: string
          lead_id: string | null
          opened_at: string | null
          organization_id: string
          provider_message_id: string | null
          sent_at: string | null
          status: string
          target_id: string | null
          variation_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          channel: string
          clicked_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          id?: string
          lead_id?: string | null
          opened_at?: string | null
          organization_id: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          target_id?: string | null
          variation_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          channel?: string
          clicked_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          id?: string
          lead_id?: string | null
          opened_at?: string | null
          organization_id?: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          target_id?: string | null
          variation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_messages_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaign_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_messages_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "outreach_template_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_template_variations: {
        Row: {
          angle: string | null
          body: string
          channel: string
          created_at: string
          id: string
          organization_id: string
          responses: number
          sends: number
          subject: string | null
          template_id: string
          updated_at: string
          variation_index: number
        }
        Insert: {
          angle?: string | null
          body?: string
          channel: string
          created_at?: string
          id?: string
          organization_id: string
          responses?: number
          sends?: number
          subject?: string | null
          template_id: string
          updated_at?: string
          variation_index?: number
        }
        Update: {
          angle?: string | null
          body?: string
          channel?: string
          created_at?: string
          id?: string
          organization_id?: string
          responses?: number
          sends?: number
          subject?: string | null
          template_id?: string
          updated_at?: string
          variation_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "outreach_template_variations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_template_variations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "outreach_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_templates: {
        Row: {
          channels: string[]
          created_at: string
          created_by: string | null
          id: string
          language: string
          lead_stage: string | null
          name: string
          niche: string | null
          objective: string | null
          organization_id: string
          tone: string | null
          updated_at: string
        }
        Insert: {
          channels?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          language?: string
          lead_stage?: string | null
          name: string
          niche?: string | null
          objective?: string | null
          organization_id: string
          tone?: string | null
          updated_at?: string
        }
        Update: {
          channels?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          language?: string
          lead_stage?: string | null
          name?: string
          niche?: string | null
          objective?: string | null
          organization_id?: string
          tone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_whatsapp_instances: {
        Row: {
          connected_at: string | null
          created_at: string
          daily_sent: number
          day: string | null
          id: string
          name: string
          organization_id: string
          phone: string | null
          skip_warmup: boolean
          status: string
          updated_at: string
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          daily_sent?: number
          day?: string | null
          id?: string
          name: string
          organization_id: string
          phone?: string | null
          skip_warmup?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          daily_sent?: number
          day?: string | null
          id?: string
          name?: string
          organization_id?: string
          phone?: string | null
          skip_warmup?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_whatsapp_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_whatsapp_settings: {
        Row: {
          api_key: string | null
          base_url: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          base_url?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          base_url?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_whatsapp_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_features: {
        Row: {
          created_at: string
          enabled: boolean
          feature_key: string
          id: string
          limit_int: number | null
          plan_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature_key: string
          id?: string
          limit_int?: number | null
          plan_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          limit_int?: number | null
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          is_public: boolean
          key: string
          name: string
          price_monthly: number | null
          sort_order: number
          stripe_price_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          key: string
          name: string
          price_monthly?: number | null
          sort_order?: number
          stripe_price_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          key?: string
          name?: string
          price_monthly?: number | null
          sort_order?: number
          stripe_price_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      price_groups: {
        Row: {
          code: string | null
          created_at: string
          id: string
          name: string
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_components: {
        Row: {
          component_product_id: string
          created_at: string
          id: string
          kit_product_id: string
          organization_id: string
          quantity: number
        }
        Insert: {
          component_product_id: string
          created_at?: string
          id?: string
          kit_product_id: string
          organization_id: string
          quantity?: number
        }
        Update: {
          component_product_id?: string
          created_at?: string
          id?: string
          kit_product_id?: string
          organization_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_components_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_components_kit_product_id_fkey"
            columns: ["kit_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_components_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sales_channels: {
        Row: {
          channel_id: string
          channel_price: number | null
          channel_sku: string | null
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          product_id: string
        }
        Insert: {
          channel_id: string
          channel_price?: number | null
          channel_sku?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          product_id: string
        }
        Update: {
          channel_id?: string
          channel_price?: number | null
          channel_sku?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_sales_channels_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "sales_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_sales_channels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_sales_channels_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          is_active: boolean
          is_tax_exempt: boolean
          low_stock_threshold: number | null
          name: string
          organization_id: string
          parent_product_id: string | null
          price_group_id: string | null
          product_type: Database["public"]["Enums"]["product_type"]
          sku: string | null
          stock_quantity: number
          tax_rate: number
          tracks_stock: boolean
          unit_price: number
          updated_at: string
          variant_label: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_tax_exempt?: boolean
          low_stock_threshold?: number | null
          name: string
          organization_id: string
          parent_product_id?: string | null
          price_group_id?: string | null
          product_type?: Database["public"]["Enums"]["product_type"]
          sku?: string | null
          stock_quantity?: number
          tax_rate?: number
          tracks_stock?: boolean
          unit_price?: number
          updated_at?: string
          variant_label?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_tax_exempt?: boolean
          low_stock_threshold?: number | null
          name?: string
          organization_id?: string
          parent_product_id?: string | null
          price_group_id?: string | null
          product_type?: Database["public"]["Enums"]["product_type"]
          sku?: string | null
          stock_quantity?: number
          tax_rate?: number
          tracks_stock?: boolean
          unit_price?: number
          updated_at?: string
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_price_group_id_fkey"
            columns: ["price_group_id"]
            isOneToOne: false
            referencedRelation: "price_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      promo_campaigns: {
        Row: {
          created_at: string
          end_date: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_discount_cells: {
        Row: {
          campaign_id: string
          created_at: string
          customer_class_id: string
          discount_percent: number
          id: string
          organization_id: string
          price_group_id: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_class_id: string
          discount_percent?: number
          id?: string
          organization_id: string
          price_group_id: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_class_id?: string
          discount_percent?: number
          id?: string
          organization_id?: string
          price_group_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_discount_cells_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "promo_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_discount_cells_customer_class_id_fkey"
            columns: ["customer_class_id"]
            isOneToOne: false
            referencedRelation: "customer_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_discount_cells_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_discount_cells_price_group_id_fkey"
            columns: ["price_group_id"]
            isOneToOne: false
            referencedRelation: "price_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_interactions: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          interaction_type: string
          organization_id: string
          prospect_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          interaction_type?: string
          organization_id: string
          prospect_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          interaction_type?: string
          organization_id?: string
          prospect_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospect_interactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_interactions_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      prospects: {
        Row: {
          assigned_member_id: string | null
          company_name: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          email: string | null
          estimated_value: number | null
          expected_close_date: string | null
          id: string
          last_interaction_at: string | null
          lead_score: number
          lost_reason: string | null
          name: string
          notes_short: string | null
          organization_id: string
          phone: string | null
          pipeline_stage: Database["public"]["Enums"]["pipeline_stage"]
          source: string | null
          updated_at: string
          won_value: number | null
        }
        Insert: {
          assigned_member_id?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          email?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          last_interaction_at?: string | null
          lead_score?: number
          lost_reason?: string | null
          name: string
          notes_short?: string | null
          organization_id: string
          phone?: string | null
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          source?: string | null
          updated_at?: string
          won_value?: number | null
        }
        Update: {
          assigned_member_id?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          email?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          last_interaction_at?: string | null
          lead_score?: number
          lost_reason?: string | null
          name?: string
          notes_short?: string | null
          organization_id?: string
          phone?: string | null
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          source?: string | null
          updated_at?: string
          won_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prospects_assigned_member_id_fkey"
            columns: ["assigned_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_subscription_runs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          order_id: string | null
          organization_id: string
          run_date: string
          status: string
          subscription_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          order_id?: string | null
          organization_id: string
          run_date: string
          status: string
          subscription_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          order_id?: string | null
          organization_id?: string
          run_date?: string
          status?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_subscription_runs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_subscription_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_subscription_runs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "recurring_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_subscriptions: {
        Row: {
          assigned_member_id: string | null
          canceled_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          description: string | null
          discount_percent: number
          end_date: string | null
          id: string
          interval_count: number
          interval_unit: string
          last_run_at: string | null
          next_run_date: string
          notes: string | null
          organization_id: string
          paused_at: string | null
          product_id: string | null
          quantity: number
          runs_count: number
          start_date: string
          status: string
          tax_rate: number | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          assigned_member_id?: string | null
          canceled_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          description?: string | null
          discount_percent?: number
          end_date?: string | null
          id?: string
          interval_count?: number
          interval_unit: string
          last_run_at?: string | null
          next_run_date: string
          notes?: string | null
          organization_id: string
          paused_at?: string | null
          product_id?: string | null
          quantity?: number
          runs_count?: number
          start_date?: string
          status?: string
          tax_rate?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          assigned_member_id?: string | null
          canceled_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          description?: string | null
          discount_percent?: number
          end_date?: string | null
          id?: string
          interval_count?: number
          interval_unit?: string
          last_run_at?: string | null
          next_run_date?: string
          notes?: string | null
          organization_id?: string
          paused_at?: string | null
          product_id?: string | null
          quantity?: number
          runs_count?: number
          start_date?: string
          status?: string
          tax_rate?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_subscriptions_assigned_member_id_fkey"
            columns: ["assigned_member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_subscriptions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      rfm_segments: {
        Row: {
          color: string | null
          created_at: string
          f_max: number | null
          f_min: number | null
          id: string
          is_active: boolean
          m_max: number | null
          m_min: number | null
          name: string
          organization_id: string
          priority_for_calls: string
          r_max: number | null
          r_min: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          f_max?: number | null
          f_min?: number | null
          id?: string
          is_active?: boolean
          m_max?: number | null
          m_min?: number | null
          name: string
          organization_id: string
          priority_for_calls?: string
          r_max?: number | null
          r_min?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          f_max?: number | null
          f_min?: number | null
          id?: string
          is_active?: boolean
          m_max?: number | null
          m_min?: number | null
          name?: string
          organization_id?: string
          priority_for_calls?: string
          r_max?: number | null
          r_min?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfm_segments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rma: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          notes: string | null
          order_id: string | null
          organization_id: string
          reason: string | null
          resolution: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          organization_id: string
          reason?: string | null
          resolution?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          organization_id?: string
          reason?: string | null
          resolution?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rma_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rma_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rma_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_config: {
        Row: {
          edge_base_url: string | null
          id: boolean
          internal_secret: string
          updated_at: string
        }
        Insert: {
          edge_base_url?: string | null
          id?: boolean
          internal_secret?: string
          updated_at?: string
        }
        Update: {
          edge_base_url?: string | null
          id?: boolean
          internal_secret?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales_calls: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          duration_minutes: number | null
          generated: boolean
          id: string
          notes: string | null
          objective: string | null
          obtained_value: number | null
          organization_id: string
          outcome: string | null
          priority: string
          prospect_id: string | null
          reason: string | null
          scheduled_for: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          duration_minutes?: number | null
          generated?: boolean
          id?: string
          notes?: string | null
          objective?: string | null
          obtained_value?: number | null
          organization_id: string
          outcome?: string | null
          priority?: string
          prospect_id?: string | null
          reason?: string | null
          scheduled_for?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          duration_minutes?: number | null
          generated?: boolean
          id?: string
          notes?: string | null
          objective?: string | null
          obtained_value?: number | null
          organization_id?: string
          outcome?: string | null
          priority?: string
          prospect_id?: string | null
          reason?: string | null
          scheduled_for?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_calls_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_calls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_calls_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_channels: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_channels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_objective_months: {
        Row: {
          id: string
          month: number
          objective_id: string
          target: number
        }
        Insert: {
          id?: string
          month: number
          objective_id: string
          target?: number
        }
        Update: {
          id?: string
          month?: number
          objective_id?: string
          target?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_objective_months_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "sales_objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_objectives: {
        Row: {
          annual_target: number
          created_at: string
          created_by: string | null
          id: string
          member_id: string | null
          metric: string
          organization_id: string
          updated_at: string
          year: number
        }
        Insert: {
          annual_target?: number
          created_at?: string
          created_by?: string | null
          id?: string
          member_id?: string | null
          metric?: string
          organization_id: string
          updated_at?: string
          year: number
        }
        Update: {
          annual_target?: number
          created_at?: string
          created_by?: string | null
          id?: string
          member_id?: string | null
          metric?: string
          organization_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_objectives_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_objectives_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          balance_after: number | null
          created_at: string
          created_by: string | null
          delta: number
          id: string
          notes: string | null
          order_id: string | null
          organization_id: string
          product_id: string
          reason: string
        }
        Insert: {
          balance_after?: number | null
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          notes?: string | null
          order_id?: string | null
          organization_id: string
          product_id: string
          reason: string
        }
        Update: {
          balance_after?: number | null
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          notes?: string | null
          order_id?: string | null
          organization_id?: string
          product_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_logs: {
        Row: {
          action: string | null
          connector_key: string | null
          created_at: string
          direction: string
          entity_type: string | null
          id: string
          message: string | null
          organization_id: string
          payload: Json | null
          status: string
        }
        Insert: {
          action?: string | null
          connector_key?: string | null
          created_at?: string
          direction: string
          entity_type?: string | null
          id?: string
          message?: string | null
          organization_id: string
          payload?: Json | null
          status: string
        }
        Update: {
          action?: string | null
          connector_key?: string | null
          created_at?: string
          direction?: string
          entity_type?: string | null
          id?: string
          message?: string | null
          organization_id?: string
          payload?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          amount: number
          code: string
          created_at: string
          created_by: string | null
          currency: string | null
          customer_id: string | null
          expires_at: string | null
          id: string
          notes: string | null
          organization_id: string
          redeemed_at: string | null
          redeemed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          code: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          customer_id?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_campaigns: {
        Row: {
          basis: string
          created_at: string
          created_by: string | null
          eligible_tags: string[] | null
          ends_at: string | null
          id: string
          is_active: boolean
          max_credit: number | null
          name: string
          one_per_customer: boolean
          organization_id: string
          reward_type: string
          reward_value: number
          starts_at: string | null
          trigger_min_amount: number
          updated_at: string
        }
        Insert: {
          basis?: string
          created_at?: string
          created_by?: string | null
          eligible_tags?: string[] | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_credit?: number | null
          name: string
          one_per_customer?: boolean
          organization_id: string
          reward_type: string
          reward_value: number
          starts_at?: string | null
          trigger_min_amount?: number
          updated_at?: string
        }
        Update: {
          basis?: string
          created_at?: string
          created_by?: string | null
          eligible_tags?: string[] | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_credit?: number | null
          name?: string
          one_per_customer?: boolean
          organization_id?: string
          reward_type?: string
          reward_value?: number
          starts_at?: string | null
          trigger_min_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          organization_id: string
          secret: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          secret: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          secret?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _compute_vat_treatment: {
        Args: {
          p_customer_id: string
          p_org_id: string
          p_ship_country: string
        }
        Returns: {
          destination_rate: number
          reason: string
          treatment: string
        }[]
      }
      _generate_nudges_for_org: {
        Args: { _org_id: string }
        Returns: undefined
      }
      _wallet_credit_system: {
        Args: {
          _amount: number
          _customer_id: string
          _description: string
          _org_id: string
          _source_id: string
          _source_type: string
        }
        Returns: string
      }
      accept_invitation: { Args: { _token: string }; Returns: string }
      adjust_product_stock: {
        Args: { p_delta: number; p_product: string; p_reason?: string }
        Returns: number
      }
      apply_tag_upgrade_rules: { Args: { _org_id: string }; Returns: number }
      apply_wallet_campaigns: {
        Args: { _order_id: string }
        Returns: undefined
      }
      assign_next_rep: { Args: { _org_id: string }; Returns: string }
      bulk_customer_tags: {
        Args: { p_add: string[]; p_ids: string[]; p_remove: string[] }
        Returns: number
      }
      compute_customer_rfm: {
        Args: { _cust: string; _org: string }
        Returns: undefined
      }
      compute_prospect_score: {
        Args: {
          _email: string
          _estimated_value: number
          _org_id: string
          _phone: string
          _prospect_id: string
          _stage: Database["public"]["Enums"]["pipeline_stage"]
        }
        Returns: number
      }
      create_organization: {
        Args: {
          p_country?: string
          p_currency?: string
          p_locale?: string
          p_name: string
        }
        Returns: {
          country: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          invoice_mode: Database["public"]["Enums"]["invoice_mode"]
          locale: string
          logo_url: string | null
          name: string
          primary_color: string
          slug: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cron_generate_daily_call_tasks: { Args: never; Returns: undefined }
      cron_generate_daily_nudges: { Args: never; Returns: undefined }
      cron_generate_prospect_followups: { Args: never; Returns: undefined }
      cron_process_missed_calls: { Args: never; Returns: number }
      cron_recalculate_rfm_all: { Args: never; Returns: undefined }
      cron_refresh_prospect_scores: { Args: never; Returns: undefined }
      enroll_campaign: {
        Args: {
          _campaign_id: string
          _ids: string[]
          _source: string
          _when: string
        }
        Returns: number
      }
      generate_commission_statements: {
        Args: { _from: string; _org_id: string; _to: string }
        Returns: {
          base_total: number
          commission_total: number
          generated_at: string
          id: string
          member_id: string
          member_name: string
          paid_at: string
          status: Database["public"]["Enums"]["commission_statement_status"]
          was_skipped: boolean
        }[]
      }
      generate_daily_calls_for_org: {
        Args: { _date: string; _org: string }
        Returns: number
      }
      generate_prospect_followups_for_org: {
        Args: { _date: string; _org: string }
        Returns: number
      }
      get_ai_settings: {
        Args: { _org_id: string }
        Returns: {
          has_key: boolean
          model: string
          provider: string
        }[]
      }
      get_commission_by_product: {
        Args: { _from: string; _org_id: string; _to: string }
        Returns: {
          base_total: number
          category: string
          commission_total: number
          num_lines: number
          product_id: string
          product_name: string
        }[]
      }
      get_commission_detail: {
        Args: {
          _from: string
          _member_id: string
          _org_id: string
          _to: string
        }
        Returns: {
          base: number
          commission: number
          line_id: string
          order_date: string
          order_id: string
          order_number: string
          product_name: string
          rate_percent: number
        }[]
      }
      get_commissions_summary: {
        Args: { _from: string; _org_id: string; _to: string }
        Returns: {
          base_total: number
          commission_total: number
          member_id: string
          member_name: string
          num_orders: number
        }[]
      }
      get_dashboard_summary: {
        Args: { _from: string; _org_id: string; _to: string }
        Returns: Json
      }
      get_line_discount: {
        Args: { p_customer_id: string; p_product_id: string }
        Returns: number
      }
      get_objective_progress: {
        Args: {
          _member_id: string
          _metric: string
          _org_id: string
          _year: number
        }
        Returns: {
          actual: number
          actual_prev: number
          month: number
          target: number
        }[]
      }
      get_sales_evolution: {
        Args: { _months: number; _org_id: string }
        Returns: {
          faturado: number
          month_start: string
          vendas: number
        }[]
      }
      get_team_objective_attainment: {
        Args: { _metric: string; _org_id: string; _year: number }
        Returns: {
          member_id: string
          member_name: string
          meta: number
          pct: number
          realizado: number
        }[]
      }
      get_team_ranking: {
        Args: { _from: string; _org_id: string; _to: string }
        Returns: {
          member_email: string
          member_id: string
          member_name: string
          num_orders: number
          total: number
        }[]
      }
      get_top_customers: {
        Args: { _from: string; _limit?: number; _org_id: string; _to: string }
        Returns: {
          customer_id: string
          customer_name: string
          num_orders: number
          total: number
        }[]
      }
      get_top_products: {
        Args: { _from: string; _limit?: number; _org_id: string; _to: string }
        Returns: {
          abc_class: string
          cumulative_pct: number
          pct: number
          product_id: string
          product_name: string
          quantity: number
          revenue: number
        }[]
      }
      has_org_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      import_customers: {
        Args: {
          p_match?: string
          p_on_dup?: string
          p_org: string
          p_rows: Json
        }
        Returns: Json
      }
      import_orders: {
        Args: {
          p_match?: string
          p_org: string
          p_rows: Json
          p_status?: string
        }
        Returns: Json
      }
      is_org_admin: { Args: { _org_id: string }; Returns: boolean }
      is_org_member: { Args: { _org_id: string }; Returns: boolean }
      mark_commission_statement_paid: {
        Args: { _statement_id: string }
        Returns: {
          base_total: number
          commission_total: number
          created_at: string
          generated_at: string
          generated_by: string | null
          id: string
          member_id: string
          notes: string | null
          organization_id: string
          paid_at: string | null
          paid_by: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["commission_statement_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "commission_statements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      merge_customers: {
        Args: { p_primary: string; p_secondary: string }
        Returns: Json
      }
      next_class_upgrade: {
        Args: { p_customer_id: string }
        Returns: {
          class_name: string
          discount: number
          metric: string
          remaining: number
        }[]
      }
      next_invoice_number: { Args: { _org_id: string }; Returns: string }
      next_order_number: { Args: { _org_id: string }; Returns: string }
      org_connector_active: {
        Args: { _connector_key: string; _org_id: string }
        Returns: boolean
      }
      org_feature: {
        Args: { _feature_key: string; _org_id: string }
        Returns: {
          enabled: boolean
          limit_int: number
        }[]
      }
      org_within_user_limit: { Args: { _org_id: string }; Returns: boolean }
      outreach_can_write: { Args: { _org_id: string }; Returns: boolean }
      outreach_cron_tick: { Args: never; Returns: undefined }
      pay_order_with_wallet: { Args: { _order_id: string }; Returns: Json }
      preview_order_vat: {
        Args: {
          p_customer_id: string
          p_org_id: string
          p_ship_country?: string
        }
        Returns: {
          destination_rate: number
          reason: string
          treatment: string
        }[]
      }
      promote_lead_to_prospect: { Args: { _lead_id: string }; Returns: string }
      recalc_order_totals_for: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      recompute_achievements: { Args: { _org_id: string }; Returns: number }
      recompute_customer_class: {
        Args: { _cust: string; _org: string }
        Returns: undefined
      }
      recompute_customer_metrics: {
        Args: { _customer_id: string; _org_id: string }
        Returns: undefined
      }
      recompute_customer_segment: {
        Args: { _cust: string; _org: string }
        Returns: undefined
      }
      recompute_org_lead_scores: { Args: { _org_id: string }; Returns: number }
      recompute_org_rfm: { Args: { _org: string }; Returns: undefined }
      reconcile_order_stock: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      redeem_voucher: {
        Args: { _customer_id: string; _org_id: string; _voucher_id: string }
        Returns: string
      }
      refresh_daily_calls: {
        Args: { p_date: string; p_org: string }
        Returns: number
      }
      refresh_org_nudges: { Args: { _org_id: string }; Returns: undefined }
      refresh_org_segments: { Args: { p_org: string }; Returns: number }
      resolve_order_vat_treatment: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      run_due_subscription: {
        Args: { _subscription_id: string }
        Returns: string
      }
      run_due_subscriptions: {
        Args: { _org_id?: string }
        Returns: {
          created: number
          errors: number
          processed: number
        }[]
      }
      set_ai_settings: {
        Args: {
          _api_key?: string
          _model?: string
          _org_id: string
          _provider: string
        }
        Returns: undefined
      }
      set_kit_components: {
        Args: { p_components: Json; p_kit: string }
        Returns: number
      }
      set_plan_price: {
        Args: { _plan_id: string; _price_id: string }
        Returns: undefined
      }
      set_product_channels: {
        Args: { p_channels: Json; p_product: string }
        Returns: number
      }
      set_sales_objective: {
        Args: {
          _annual: number
          _member_id: string
          _metric: string
          _months: Json
          _org_id: string
          _year: number
        }
        Returns: string
      }
      wallet_credit: {
        Args: {
          _amount: number
          _customer_id: string
          _description: string
          _org_id: string
          _source_id: string
          _source_type: string
        }
        Returns: string
      }
      wallet_debit: {
        Args: {
          _amount: number
          _customer_id: string
          _description: string
          _org_id: string
          _source_id: string
          _source_type: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "sales_director" | "sales_rep" | "read_only"
      commission_statement_status: "pendente" | "paga"
      connector_category:
        | "online_store"
        | "invoicing"
        | "payments"
        | "accounting"
        | "calendar"
        | "email"
        | "other"
      invitation_status: "pending" | "accepted" | "expired"
      invoice_mode: "manual" | "on_confirm" | "on_paid"
      member_status: "active" | "invited"
      order_status:
        | "rascunho"
        | "confirmada"
        | "paga"
        | "faturada"
        | "cancelada"
      pipeline_stage:
        | "novo"
        | "contactado"
        | "qualificado"
        | "proposta"
        | "negociacao"
        | "ganho"
        | "perdido"
      product_type: "produto" | "servico" | "outro"
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
      app_role: ["owner", "admin", "sales_director", "sales_rep", "read_only"],
      commission_statement_status: ["pendente", "paga"],
      connector_category: [
        "online_store",
        "invoicing",
        "payments",
        "accounting",
        "calendar",
        "email",
        "other",
      ],
      invitation_status: ["pending", "accepted", "expired"],
      invoice_mode: ["manual", "on_confirm", "on_paid"],
      member_status: ["active", "invited"],
      order_status: ["rascunho", "confirmada", "paga", "faturada", "cancelada"],
      pipeline_stage: [
        "novo",
        "contactado",
        "qualificado",
        "proposta",
        "negociacao",
        "ganho",
        "perdido",
      ],
      product_type: ["produto", "servico", "outro"],
    },
  },
} as const
