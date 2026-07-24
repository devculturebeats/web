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
  | "parent"
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

export type SessionOutcome = "held" | "teacher_no_show" | "student_no_show";

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
          username: string | null;
          is_provisioned: boolean;
          lookup_code: string | null;
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
          username?: string | null;
          is_provisioned?: boolean;
          lookup_code?: string | null;
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
          username?: string | null;
          is_provisioned?: boolean;
          lookup_code?: string | null;
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
          discoverable_by_academies: boolean;
          lookup_code: string;
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
          discoverable_by_academies?: boolean;
          lookup_code?: string;
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
          discoverable_by_academies?: boolean;
          lookup_code?: string;
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
          incharge_name: string | null;
          activities: string[];
          place_id: string | null;
          latitude: number | null;
          longitude: number | null;
          contact_email: string | null;
          contact_phone: string | null;
          contact_whatsapp: string | null;
          lookup_code: string;
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
          incharge_name?: string | null;
          activities?: string[];
          place_id?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          contact_whatsapp?: string | null;
          lookup_code?: string;
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
          incharge_name?: string | null;
          activities?: string[];
          place_id?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          contact_whatsapp?: string | null;
          lookup_code?: string;
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
          recurrence_mode: "once" | "until_date" | "ongoing";
          recurrence_until: string | null;
          enrollment_mode: string;
          proposed_day_of_week: number | null;
          proposed_start_time: string | null;
          proposed_end_time: string | null;
          proposed_slots: Json | null;
          cancellation_reason: string | null;
          needs_rematch: boolean;
          rematch_reason: string | null;
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
          recurrence_mode?: "once" | "until_date" | "ongoing";
          recurrence_until?: string | null;
          enrollment_mode?: string;
          proposed_day_of_week?: number | null;
          proposed_start_time?: string | null;
          proposed_end_time?: string | null;
          proposed_slots?: Json | null;
          cancellation_reason?: string | null;
          needs_rematch?: boolean;
          rematch_reason?: string | null;
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
          recurrence_mode?: "once" | "until_date" | "ongoing";
          recurrence_until?: string | null;
          enrollment_mode?: string;
          proposed_day_of_week?: number | null;
          proposed_start_time?: string | null;
          proposed_end_time?: string | null;
          proposed_slots?: Json | null;
          cancellation_reason?: string | null;
          needs_rematch?: boolean;
          rematch_reason?: string | null;
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
          request_kind: "assign" | "schedule";
          recurrence_mode: "once" | "until_date" | "ongoing";
          recurrence_until: string | null;
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
          request_kind?: "assign" | "schedule";
          recurrence_mode?: "once" | "until_date" | "ongoing";
          recurrence_until?: string | null;
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
          request_kind?: "assign" | "schedule";
          recurrence_mode?: "once" | "until_date" | "ongoing";
          recurrence_until?: string | null;
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
      class_request_messages: {
        Row: {
          id: string;
          request_id: string;
          author_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          author_id: string;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          request_id?: string;
          author_id?: string;
          body?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_request_messages_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "class_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_request_messages_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
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
      student_link_requests: {
        Row: {
          id: string;
          organization_id: string;
          student_profile_id: string | null;
          student_email: string;
          batch_id: string | null;
          status: "requested" | "accepted" | "rejected";
          created_by: string | null;
          created_at: string;
          responded_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          student_profile_id?: string | null;
          student_email: string;
          batch_id?: string | null;
          status?: "requested" | "accepted" | "rejected";
          created_by?: string | null;
          created_at?: string;
          responded_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          student_profile_id?: string | null;
          student_email?: string;
          batch_id?: string | null;
          status?: "requested" | "accepted" | "rejected";
          created_by?: string | null;
          created_at?: string;
          responded_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "student_link_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_link_requests_student_profile_id_fkey";
            columns: ["student_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_link_requests_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
        ];
      };
      parent_student_links: {
        Row: {
          id: string;
          parent_profile_id: string;
          student_profile_id: string;
          organization_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          parent_profile_id: string;
          student_profile_id: string;
          organization_id?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          parent_profile_id?: string;
          student_profile_id?: string;
          organization_id?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "parent_student_links_parent_profile_id_fkey";
            columns: ["parent_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "parent_student_links_student_profile_id_fkey";
            columns: ["student_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "parent_student_links_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      parent_link_requests: {
        Row: {
          id: string;
          initiator: "parent" | "student" | "school";
          parent_profile_id: string | null;
          parent_email: string | null;
          student_profile_id: string | null;
          student_email: string | null;
          organization_id: string | null;
          status: ClassLifecycle;
          message: string | null;
          created_by: string | null;
          created_at: string;
          responded_at: string | null;
        };
        Insert: {
          id?: string;
          initiator: "parent" | "student" | "school";
          parent_profile_id?: string | null;
          parent_email?: string | null;
          student_profile_id?: string | null;
          student_email?: string | null;
          organization_id?: string | null;
          status?: ClassLifecycle;
          message?: string | null;
          created_by?: string | null;
          created_at?: string;
          responded_at?: string | null;
        };
        Update: {
          id?: string;
          initiator?: "parent" | "student" | "school";
          parent_profile_id?: string | null;
          parent_email?: string | null;
          student_profile_id?: string | null;
          student_email?: string | null;
          organization_id?: string | null;
          status?: ClassLifecycle;
          message?: string | null;
          created_by?: string | null;
          created_at?: string;
          responded_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "parent_link_requests_parent_profile_id_fkey";
            columns: ["parent_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "parent_link_requests_student_profile_id_fkey";
            columns: ["student_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "parent_link_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      teacher_links: {
        Row: {
          id: string;
          organization_id: string;
          teacher_id: string;
          teacher_profile_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          teacher_id: string;
          teacher_profile_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          teacher_id?: string;
          teacher_profile_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_links_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_links_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_links_teacher_profile_id_fkey";
            columns: ["teacher_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      teacher_link_requests: {
        Row: {
          id: string;
          organization_id: string;
          teacher_id: string | null;
          teacher_profile_id: string | null;
          teacher_email: string;
          status: "requested" | "accepted" | "rejected";
          created_by: string | null;
          created_at: string;
          responded_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          teacher_id?: string | null;
          teacher_profile_id?: string | null;
          teacher_email: string;
          status?: "requested" | "accepted" | "rejected";
          created_by?: string | null;
          created_at?: string;
          responded_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          teacher_id?: string | null;
          teacher_profile_id?: string | null;
          teacher_email?: string;
          status?: "requested" | "accepted" | "rejected";
          created_by?: string | null;
          created_at?: string;
          responded_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_link_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_link_requests_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_link_requests_teacher_profile_id_fkey";
            columns: ["teacher_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      teacher_link_request_messages: {
        Row: {
          id: string;
          request_id: string;
          author_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          author_id: string;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          request_id?: string;
          author_id?: string;
          body?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_link_request_messages_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "teacher_link_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_link_request_messages_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
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
          cancellation_reason: string | null;
          outcome: SessionOutcome | null;
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
          cancellation_reason?: string | null;
          outcome?: SessionOutcome | null;
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
          cancellation_reason?: string | null;
          outcome?: SessionOutcome | null;
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
      search_academy_member_teachers: {
        Args: {
          p_organization_id: string;
          p_name?: string | null;
          p_skill?: string | null;
          p_email?: string | null;
          p_phone?: string | null;
          p_day_of_week?: number | null;
          p_start_time?: string | null;
          p_end_time?: string | null;
        };
        Returns: {
          teacher_id: string;
          profile_id: string;
          full_name: string;
          email: string;
          phone: string | null;
          primary_skill: string | null;
          secondary_skills: string[] | null;
          city: string | null;
          years_of_experience: number | null;
          slot_start: string | null;
          slot_end: string | null;
        }[];
      };
      search_discoverable_teachers_for_academy: {
        Args: {
          p_organization_id: string;
          p_email?: string | null;
          p_lookup_code?: string | null;
        };
        Returns: {
          teacher_id: string;
          profile_id: string;
          full_name: string;
          email: string;
          phone: string | null;
          lookup_code: string;
          primary_skill: string | null;
          secondary_skills: string[] | null;
          city: string | null;
          years_of_experience: number | null;
          already_linked: boolean;
          invite_pending: boolean;
        }[];
      };
      respond_to_teacher_link_request: {
        Args: { p_request_id: string; p_accept: boolean };
        Returns: Database["public"]["Tables"]["teacher_link_requests"]["Row"];
      };
      claim_teacher_link_invites: {
        Args: Record<string, never>;
        Returns: number;
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
      create_sessions_from_proposed_slots: {
        Args: { p_class_id: string };
        Returns: undefined;
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
      respond_to_student_link_request: {
        Args: {
          p_request_id: string;
          p_accept: boolean;
        };
        Returns: Database["public"]["Tables"]["student_link_requests"]["Row"];
      };
      claim_student_link_invites: {
        Args: Record<string, never>;
        Returns: number;
      };
      claim_parent_link_invites: {
        Args: Record<string, never>;
        Returns: number;
      };
      respond_to_parent_link_request: {
        Args: {
          p_request_id: string;
          p_accept: boolean;
        };
        Returns: Database["public"]["Tables"]["parent_link_requests"]["Row"];
      };
      request_parent_student_link: {
        Args: {
          p_as: "parent" | "student";
          p_counterpart_email?: string | null;
          p_counterpart_lookup_code?: string | null;
          p_message?: string | null;
        };
        Returns: Database["public"]["Tables"]["parent_link_requests"]["Row"];
      };
      school_attach_parent: {
        Args: {
          p_organization_id: string;
          p_student_profile_id: string;
          p_parent_email: string;
          p_parent_full_name?: string | null;
          p_auto_accept?: boolean;
        };
        Returns: Json;
      };
      provision_org_parent: {
        Args: {
          p_organization_id: string;
          p_student_profile_id: string;
          p_full_name: string;
          p_email?: string | null;
        };
        Returns: Json;
      };
      issue_parent_login: {
        Args: {
          p_organization_id: string;
          p_parent_profile_id: string;
        };
        Returns: Json;
      };
      is_synthetic_student_email: {
        Args: { p_email: string };
        Returns: boolean;
      };
      resolve_login_email: {
        Args: { p_identifier: string };
        Returns: string | null;
      };
      provision_org_student: {
        Args: {
          p_organization_id: string;
          p_full_name: string;
          p_email?: string | null;
          p_batch_name?: string | null;
          p_batch_id?: string | null;
        };
        Returns: string;
      };
      import_org_students: {
        Args: {
          p_organization_id: string;
          p_students: Json;
        };
        Returns: Json;
      };
      issue_student_login: {
        Args: {
          p_organization_id: string;
          p_student_profile_id: string;
        };
        Returns: Json;
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
          p_reason?: string | null;
        };
        Returns: number;
      };
      mark_session_outcome: {
        Args: {
          p_session_id: string;
          p_outcome: SessionOutcome;
          p_reason?: string | null;
        };
        Returns: Database["public"]["Tables"]["class_sessions"]["Row"];
      };
      replace_class_teacher: {
        Args: {
          p_class_id: string;
          p_new_teacher_id: string;
          p_reason?: string | null;
          p_require_consent?: boolean;
        };
        Returns: Database["public"]["Tables"]["classes"]["Row"];
      };
      request_school_rematch: {
        Args: {
          p_class_id: string;
          p_reason?: string | null;
        };
        Returns: Database["public"]["Tables"]["classes"]["Row"];
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
export type ParentStudentLink =
  Database["public"]["Tables"]["parent_student_links"]["Row"];
export type ParentLinkRequest =
  Database["public"]["Tables"]["parent_link_requests"]["Row"];
export type TeacherLink = Database["public"]["Tables"]["teacher_links"]["Row"];
export type TeacherLinkRequest =
  Database["public"]["Tables"]["teacher_link_requests"]["Row"];
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

export type AcademyMemberTeacher =
  Database["public"]["Functions"]["search_academy_member_teachers"]["Returns"][number];

export type DiscoverableTeacher =
  Database["public"]["Functions"]["search_discoverable_teachers_for_academy"]["Returns"][number];

export type ProfileWithTeacher = Profile & {
  teachers: Teacher | Teacher[] | null;
};
