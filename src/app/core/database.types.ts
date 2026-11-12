
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "local_live_tournaments": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"id": string,"owner_id": string,"read_token_hash": string,"state": NonNullable<Json>,"status": string,"updated_at": string,"write_token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"owner_id": string,"read_token_hash": string,"state": NonNullable<Json>,"status"?: string,"updated_at"?: string,"write_token_hash": string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"owner_id"?: string,"read_token_hash"?: string,"state"?: NonNullable<Json>,"status"?: string,"updated_at"?: string,"write_token_hash"?: string
                  }
                  Relationships: [
                    
                  ]
                },"local_tournament_archives": {
                  Row: {
                    "created_at": string,"finished_at": string | null,"live_tournament_id": string | null,"name": string,"owner_id": string,"started_at": string | null,"state": NonNullable<Json>,"status": string,"tournament_id": string,"tournament_mode": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"finished_at"?: string | null,"live_tournament_id"?: string | null,"name": string,"owner_id": string,"started_at"?: string | null,"state": NonNullable<Json>,"status": string,"tournament_id": string,"tournament_mode"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"finished_at"?: string | null,"live_tournament_id"?: string | null,"name"?: string,"owner_id"?: string,"started_at"?: string | null,"state"?: NonNullable<Json>,"status"?: string,"tournament_id"?: string,"tournament_mode"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"local_tournament_metrics": {
                  Row: {
                    "court_count": number,"created_at": string,"doubles_format": string,"duration_seconds": number | null,"finished_at": string | null,"games_to_win": number,"owner_id": string,"participant_count": number,"round_count": number,"started_at": string,"status": string,"tournament_id": string,"tournament_mode": string,"tournament_size": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "court_count": number,"created_at"?: string,"doubles_format"?: string,"duration_seconds"?: number | null,"finished_at"?: string | null,"games_to_win": number,"owner_id": string,"participant_count": number,"round_count": number,"started_at": string,"status": string,"tournament_id": string,"tournament_mode": string,"tournament_size": number,"updated_at"?: string
                  }
                  Update: {
                    "court_count"?: number,"created_at"?: string,"doubles_format"?: string,"duration_seconds"?: number | null,"finished_at"?: string | null,"games_to_win"?: number,"owner_id"?: string,"participant_count"?: number,"round_count"?: number,"started_at"?: string,"status"?: string,"tournament_id"?: string,"tournament_mode"?: string,"tournament_size"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"setpoint_dashboard_admins": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"shared_tournament_participants": {
                  Row: {
                    "created_at": string,"display_name": string,"gender": string,"join_id": string | null,"player_id": string,"role": string,"tournament_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"gender"?: string,"join_id"?: string | null,"player_id": string,"role": string,"tournament_id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"gender"?: string,"join_id"?: string | null,"player_id"?: string,"role"?: string,"tournament_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shared_tournament_participants_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "shared_tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"shared_tournaments": {
                  Row: {
                    "archived_at": string | null,"capacity": number,"created_at": string,"expires_at": string | null,"id": string,"invite_expires_at": string,"invite_token_hash": string,"name": string,"owner_id": string,"started_at": string | null,"state": NonNullable<Json>,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"capacity": number,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"invite_expires_at": string,"invite_token_hash": string,"name": string,"owner_id": string,"started_at"?: string | null,"state": NonNullable<Json>,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"capacity"?: number,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"invite_expires_at"?: string,"invite_token_hash"?: string,"name"?: string,"owner_id"?: string,"started_at"?: string | null,"state"?: NonNullable<Json>,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_shared_participant":
{ Args: { "p_display_name": string,"p_tournament_id": string }; Returns: Json
                           } |
{ Args: { "p_display_name": string,"p_gender": string,"p_tournament_id": string }; Returns: Json
                           } |
{ Args: { "p_avatar_data": string,"p_display_name": string,"p_gender": string,"p_tournament_id": string }; Returns: Json
                           },
"cancel_shared_tournament":
{ Args: { "p_tournament_id": string }; Returns: undefined
                           },
"cleanup_expired_shared_tournaments":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"create_local_live_tournament":
{ Args: { "p_state": Json }; Returns: Json
                           },
"create_shared_tournament":
{ Args: { "p_capacity": number,"p_initial_state": Json,"p_moderator_name": string,"p_name": string }; Returns: Json
                           } |
{ Args: { "p_capacity": number,"p_initial_state": Json,"p_moderator_gender": string,"p_moderator_name": string,"p_name": string }; Returns: Json
                           },
"get_dashboard_activity":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_dashboard_archived_local_tournaments":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_dashboard_insights":
{ Args: { "p_days"?: number,"p_tz"?: string }; Returns: Json
                           },
"get_dashboard_local_archives":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_dashboard_metrics":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_dashboard_tournament":
{ Args: { "p_source": string,"p_tournament_id": string }; Returns: Json
                           },
"get_local_live_tournament":
{ Args: { "p_read_token": string }; Returns: Json
                           },
"get_owned_shared_tournament":
{ Args: { "p_tournament_id": string }; Returns: Json
                           },
"get_shared_tournament":
{ Args: { "p_invite_token": string }; Returns: Json
                           },
"join_shared_tournament":
{ Args: { "p_display_name": string,"p_gender": string,"p_invite_token": string,"p_join_id": string }; Returns: Json
                           } |
{ Args: { "p_avatar_data": string,"p_display_name": string,"p_gender": string,"p_invite_token": string,"p_join_id": string }; Returns: Json
                           } |
{ Args: { "p_display_name": string,"p_invite_token": string,"p_join_id": string }; Returns: Json
                           },
"record_local_tournament_metrics":
{ Args: { "p_abandoned"?: boolean,"p_court_count": number,"p_doubles_format": string,"p_finished_at"?: string,"p_games_to_win": number,"p_participant_count": number,"p_round_count": number,"p_started_at": string,"p_tournament_id": string,"p_tournament_mode": string,"p_tournament_size": number }; Returns: undefined
                           },
"remove_shared_participant":
{ Args: { "p_player_id": string,"p_tournament_id": string }; Returns: Json
                           },
"rotate_shared_invite":
{ Args: { "p_tournament_id": string }; Returns: Json
                           },
"save_local_tournament_archive":
{ Args: { "p_live_tournament_id"?: string,"p_state": Json,"p_tournament_id": string }; Returns: undefined
                           },
"save_shared_tournament":
{ Args: { "p_state": Json,"p_tournament_id": string }; Returns: Json
                           },
"start_shared_tournament":
{ Args: { "p_state": Json,"p_tournament_id": string }; Returns: Json
                           },
"sync_local_live_tournament":
{ Args: { "p_base_state": Json,"p_state": Json,"p_write_token": string }; Returns: Json
                           },
"sync_shared_tournament":
{ Args: { "p_base_state": Json,"p_state": Json,"p_tournament_id": string }; Returns: Json
                           },
"update_local_live_tournament":
{ Args: { "p_state": Json,"p_write_token": string }; Returns: Json
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
