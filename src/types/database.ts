export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AppRole =
  | "teacher"
  | "student"
  | "school_admin"
  | "academy_admin"
  | "superadmin";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type OrgType = "school" | "academy";

export type ClassLifecycle =
  | "requested"
  | "accepted"
  | "rejected"
  | "scheduled"
  | "postponed"
  | "completed"
  | "cancelled";

export type PreferredClassType = "school" | "academy" | "both";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          phone: string | null;
          whatsapp: string | null;
          avatar_url: string | null;
          role: AppRole;
          approval_status: ApprovalStatus;
          onboarding_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string;
          phone?: string | null;
          whatsapp?: string | null;
          avatar_url?: string | null;
          role?: AppRole;
          approval_status?: ApprovalStatus;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          phone?: string | null;
          whatsapp?: string | null;
          avatar_url?: string | null;
          role?: AppRole;
          approval_status?: ApprovalStatus;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      teachers: {
        Row: {
          id: string;
          profile_id: string;
          primary_skill: string | null;
          secondary_skills: string[];
          years_of_experience: number | null;
          bio: string | null;
          qualifications: string | null;
          city: string | null;
          area: string | null;
          place_id: string | null;
          latitude: number | null;
          longitude: number | null;
          residential_city: string | null;
          residential_address: string | null;
          preferred_class_types: PreferredClassType | null;
          travel_preference: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          primary_skill?: string | null;
          secondary_skills?: string[];
          years_of_experience?: number | null;
          bio?: string | null;
          qualifications?: string | null;
          city?: string | null;
          area?: string | null;
          place_id?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          residential_city?: string | null;
          residential_address?: string | null;
          preferred_class_types?: PreferredClassType | null;
          travel_preference?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          primary_skill?: string | null;
          secondary_skills?: string[];
          years_of_experience?: number | null;
          bio?: string | null;
          qualifications?: string | null;
          city?: string | null;
          area?: string | null;
          place_id?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          residential_city?: string | null;
          residential_address?: string | null;
          preferred_class_types?: PreferredClassType | null;
          travel_preference?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teachers_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      teacher_availability: {
        Row: {
          id: string;
          teacher_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          day_of_week?: number;
          start_time?: string;
          end_time?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_availability_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      teacher_documents: {
        Row: {
          id: string;
          teacher_id: string;
          file_path: string;
          file_name: string;
          document_type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          file_path: string;
          file_name: string;
          document_type?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          file_path?: string;
          file_name?: string;
          document_type?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_documents_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          id: string;
          type: OrgType;
          name: string;
          description: string | null;
          city: string | null;
          area: string | null;
          logo_url: string | null;
          approval_status: ApprovalStatus;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          type: OrgType;
          name: string;
          description?: string | null;
          city?: string | null;
          area?: string | null;
          logo_url?: string | null;
          approval_status?: ApprovalStatus;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          type?: OrgType;
          name?: string;
          description?: string | null;
          city?: string | null;
          area?: string | null;
          logo_url?: string | null;
          approval_status?: ApprovalStatus;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          profile_id: string;
          member_role: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          profile_id: string;
          member_role?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          profile_id?: string;
          member_role?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      classes: {
        Row: {
          id: string;
          organization_id: string | null;
          batch_id: string | null;
          teacher_id: string | null;
          title: string;
          skill: string | null;
          description: string | null;
          status: ClassLifecycle;
          is_recurring: boolean;
          starts_at: string | null;
          ends_at: string | null;
          recurrence_rule: string | null;
          enrollment_mode: string;
          proposed_day_of_week: number | null;
          proposed_start_time: string | null;
          proposed_end_time: string | null;
          proposed_slots: Json | null;
          cancellation_reason: string | null;
          location_type: string | null;
          location_note: string | null;
          rate_amount: number | null;
          rate_currency: string;
          rate_unit: string;
          max_students: number | null;
          is_home_studio: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          batch_id?: string | null;
          teacher_id?: string | null;
          title: string;
          skill?: string | null;
          description?: string | null;
          status?: ClassLifecycle;
          is_recurring?: boolean;
          starts_at?: string | null;
          ends_at?: string | null;
          recurrence_rule?: string | null;
          enrollment_mode?: string;
          proposed_day_of_week?: number | null;
          proposed_start_time?: string | null;
          proposed_end_time?: string | null;
          proposed_slots?: Json | null;
          cancellation_reason?: string | null;
          location_type?: string | null;
          location_note?: string | null;
          rate_amount?: number | null;
          rate_currency?: string;
          rate_unit?: string;
          max_students?: number | null;
          is_home_studio?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          batch_id?: string | null;
          teacher_id?: string | null;
          title?: string;
          skill?: string | null;
          description?: string | null;
          status?: ClassLifecycle;
          is_recurring?: boolean;
          starts_at?: string | null;
          ends_at?: string | null;
          recurrence_rule?: string | null;
          enrollment_mode?: string;
          proposed_day_of_week?: number | null;
          proposed_start_time?: string | null;
          proposed_end_time?: string | null;
          proposed_slots?: Json | null;
          cancellation_reason?: string | null;
          location_type?: string | null;
          location_note?: string | null;
          rate_amount?: number | null;
          rate_currency?: string;
          rate_unit?: string;
          max_students?: number | null;
          is_home_studio?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "classes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "classes_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      class_requests: {
        Row: {
          id: string;
          class_id: string;
          teacher_id: string;
          status: ClassLifecycle;
          message: string | null;
          proposed_day_of_week: number | null;
          proposed_start_time: string | null;
          proposed_end_time: string | null;
          proposed_slots: Json | null;
          created_at: string;
          responded_at: string | null;
        };
        Insert: {
          id?: string;
          class_id: string;
          teacher_id: string;
          status?: ClassLifecycle;
          message?: string | null;
          proposed_day_of_week?: number | null;
          proposed_start_time?: string | null;
          proposed_end_time?: string | null;
          proposed_slots?: Json | null;
          created_at?: string;
          responded_at?: string | null;
        };
        Update: {
          id?: string;
          class_id?: string;
          teacher_id?: string;
          status?: ClassLifecycle;
          message?: string | null;
          proposed_day_of_week?: number | null;
          proposed_start_time?: string | null;
          proposed_end_time?: string | null;
          proposed_slots?: Json | null;
          created_at?: string;
          responded_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "class_requests_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_requests_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      batches: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "batches_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      student_links: {
        Row: {
          id: string;
          student_profile_id: string;
          organization_id: string;
          batch_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_profile_id: string;
          organization_id: string;
          batch_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_profile_id?: string;
          organization_id?: string;
          batch_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_links_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_links_student_profile_id_fkey";
            columns: ["student_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_links_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
        ];
      };
      class_sessions: {
        Row: {
          id: string;
          class_id: string;
          starts_at: string;
          ends_at: string;
          status: ClassLifecycle;
          series_id: string | null;
          session_note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          class_id: string;
          starts_at: string;
          ends_at: string;
          status?: ClassLifecycle;
          series_id?: string | null;
          session_note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          class_id?: string;
          starts_at?: string;
          ends_at?: string;
          status?: ClassLifecycle;
          series_id?: string | null;
          session_note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_sessions_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
        ];
      };
      class_enrollments: {
        Row: {
          id: string;
          class_id: string;
          student_profile_id: string;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          class_id: string;
          student_profile_id: string;
          source?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          class_id?: string;
          student_profile_id?: string;
          source?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_enrollments_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
        ];
      };
      class_session_enrollments: {
        Row: {
          id: string;
          class_id: string;
          session_id: string;
          student_profile_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          class_id: string;
          session_id: string;
          student_profile_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          class_id?: string;
          session_id?: string;
          student_profile_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_session_enrollments_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_session_enrollments_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "class_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance: {
        Row: {
          id: string;
          session_id: string;
          student_profile_id: string;
          present: boolean;
          marked_by: string | null;
          marked_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          student_profile_id: string;
          present?: boolean;
          marked_by?: string | null;
          marked_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          student_profile_id?: string;
          present?: boolean;
          marked_by?: string | null;
          marked_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "class_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          organization_id: string;
          title: string;
          body: string;
          audience: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          title: string;
          body: string;
          audience?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          title?: string;
          body?: string;
          audience?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_classes: {
        Row: {
          notification_id: string;
          class_id: string;
        };
        Insert: {
          notification_id: string;
          class_id: string;
        };
        Update: {
          notification_id?: string;
          class_id?: string;
        };
        Relationships: [];
      };
      notification_recipients: {
        Row: {
          id: string;
          notification_id: string;
          student_profile_id: string;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          notification_id: string;
          student_profile_id: string;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          notification_id?: string;
          student_profile_id?: string;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_recipients_notification_id_fkey";
            columns: ["notification_id"];
            isOneToOne: false;
            referencedRelation: "notifications";
            referencedColumns: ["id"];
          },
        ];
      };
      class_notes: {
        Row: {
          id: string;
          class_id: string;
          author_id: string | null;
          body: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          class_id: string;
          author_id?: string | null;
          body: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          class_id?: string;
          author_id?: string | null;
          body?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_notes_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_notes_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          organization_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          organization_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          organization_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      teacher_needs_onboarding: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      org_admin_needs_onboarding: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      match_teachers_for_slot: {
        Args: {
          p_skill: string;
          p_day_of_week: number;
          p_start_time: string;
          p_end_time: string;
          p_city?: string | null;
        };
        Returns: {
          teacher_id: string;
          profile_id: string;
          full_name: string;
          primary_skill: string | null;
          city: string | null;
          years_of_experience: number | null;
          slot_start: string;
          slot_end: string;
        }[];
      };
      create_class_sessions: {
        Args: {
          p_class_id: string;
          p_starts_at: string;
          p_ends_at: string;
          p_recurring_weeks?: number;
        };
        Returns: Database["public"]["Tables"]["class_sessions"]["Row"][];
      };
      enroll_in_open_class: {
        Args: { p_class_id: string; p_session_ids?: string[] | null };
        Returns: undefined;
      };
      unenroll_from_open_class: {
        Args: { p_class_id: string };
        Returns: undefined;
      };
      update_session_status: {
        Args: {
          p_session_id: string;
          p_status: ClassLifecycle;
        };
        Returns: Database["public"]["Tables"]["class_sessions"]["Row"];
      };
      respond_to_class_request: {
        Args: {
          p_request_id: string;
          p_accept: boolean;
        };
        Returns: Database["public"]["Tables"]["class_requests"]["Row"];
      };
      cancel_class: {
        Args: {
          p_class_id: string;
          p_reason?: string | null;
        };
        Returns: Database["public"]["Tables"]["classes"]["Row"];
      };
      find_availability_conflicts: {
        Args: {
          p_teacher_id: string;
          p_day_of_week: number;
          p_start_time: string;
          p_end_time: string;
        };
        Returns: {
          class_id: string;
          class_title: string;
          class_status: ClassLifecycle;
          conflict_source: string;
          session_id: string | null;
          starts_at: string | null;
          ends_at: string | null;
        }[];
      };
      reschedule_session: {
        Args: {
          p_session_id: string;
          p_starts_at: string;
          p_ends_at: string;
          p_scope?: string;
        };
        Returns: Database["public"]["Tables"]["class_sessions"]["Row"][];
      };
      cancel_sessions_scoped: {
        Args: {
          p_session_id: string;
          p_scope?: string;
        };
        Returns: number;
      };
      mark_notification_read: {
        Args: {
          p_recipient_id: string;
        };
        Returns: undefined;
      };
      send_org_notification: {
        Args: {
          p_organization_id: string;
          p_title: string;
          p_body: string;
          p_class_ids?: string[] | null;
        };
        Returns: string;
      };
      enroll_student_into_org_assigned_classes: {
        Args: {
          p_student_id: string;
          p_organization_id: string;
        };
        Returns: number;
      };
    };
    Enums: {
      app_role: AppRole;
      approval_status: ApprovalStatus;
      org_type: OrgType;
      class_lifecycle: ClassLifecycle;
      preferred_class_type: PreferredClassType;
    };
    CompositeTypes: Record<string, never>;
  };
}

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Teacher = Database["public"]["Tables"]["teachers"]["Row"];
export type TeacherAvailability =
  Database["public"]["Tables"]["teacher_availability"]["Row"];
export type TeacherDocument =
  Database["public"]["Tables"]["teacher_documents"]["Row"];
export type Organization = Database["public"]["Tables"]["organizations"]["Row"];
export type Batch = Database["public"]["Tables"]["batches"]["Row"];
export type StudentLink = Database["public"]["Tables"]["student_links"]["Row"];
export type ClassSession = Database["public"]["Tables"]["class_sessions"]["Row"];
export type ClassEnrollment =
  Database["public"]["Tables"]["class_enrollments"]["Row"];
export type Attendance = Database["public"]["Tables"]["attendance"]["Row"];
export type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
export type ClassRequest = Database["public"]["Tables"]["class_requests"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];
export type NotificationClass =
  Database["public"]["Tables"]["notification_classes"]["Row"];
export type NotificationRecipient =
  Database["public"]["Tables"]["notification_recipients"]["Row"];
export type AuditLog = Database["public"]["Tables"]["audit_logs"]["Row"];
export type ClassNote = Database["public"]["Tables"]["class_notes"]["Row"];

export type AvailabilityConflict =
  Database["public"]["Functions"]["find_availability_conflicts"]["Returns"][number];

export type SessionScope = "one" | "series";

export type TeacherMatch =
  Database["public"]["Functions"]["match_teachers_for_slot"]["Returns"][number];

export type ProfileWithTeacher = Profile & {
  teachers: Teacher | Teacher[] | null;
};
