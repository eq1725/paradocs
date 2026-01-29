export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type PhenomenonCategory =
  | 'ufos_aliens'              // UFOs and Aliens/NHIs
  | 'cryptids'                 // Cryptids
  | 'ghosts_hauntings'         // Ghosts and Hauntings
  | 'psychic_phenomena'        // Psychic Phenomena (ESP)
  | 'consciousness_practices'  // Consciousness Altering Practices
  | 'psychological_experiences' // Psychological Experiences
  | 'biological_factors'       // Biological Factors Influencing Experience
  | 'perception_sensory'       // Perception and Sensory Processes
  | 'religion_mythology'       // Comparative Religion and Mythology
  | 'esoteric_practices'       // Esoteric Practices and Beliefs
  | 'combination'              // Multiple categories apply

export type CredibilityLevel =
  | 'unverified'
  | 'low'
  | 'medium'
  | 'high'
  | 'confirmed'

export type ReportStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'flagged'
  | 'archived'

export type UserRole =
  | 'user'
  | 'contributor'
  | 'moderator'
  | 'admin'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          display_name: string | null
          avatar_url: string | null
          bio: string | null
          role: UserRole
          reputation_score: number
          reports_submitted: number
          reports_approved: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          display_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          role?: UserRole
          reputation_score?: number
          reports_submitted?: number
          reports_approved?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          display_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          role?: UserRole
          reputation_score?: number
          reports_submitted?: number
          reports_approved?: number
          created_at?: string
          updated_at?: string
        }
      }
      phenomenon_types: {
        Row: {
          id: string
          category: PhenomenonCategory
          name: string
          slug: string
          description: string | null
          icon: string | null
          parent_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          category: PhenomenonCategory
          name: string
          slug: string
          description?: string | null
          icon?: string | null
          parent_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          category?: PhenomenonCategory
          name?: string
          slug?: string
          description?: string | null
          icon?: string | null
          parent_id?: string | null
          created_at?: string
        }
      }
      reports: {
        Row: {
          id: string
          title: string
          slug: string
          summary: string
          description: string
          phenomenon_type_id: string | null
          category: PhenomenonCategory
          tags: string[]
          location_name: string | null
          location_description: string | null
          country: string | null
          state_province: string | null
          city: string | null
          latitude: number | null
          longitude: number | null
          event_date: string | null
          event_time: string | null
          event_date_approximate: boolean
          event_duration_minutes: number | null
          credibility: CredibilityLevel
          witness_count: number
          has_physical_evidence: boolean
          has_photo_video: boolean
          has_official_report: boolean
          evidence_summary: string | null
          source_type: string | null
          source_url: string | null
          source_reference: string | null
          original_report_id: string | null
          submitted_by: string | null
          anonymous_submission: boolean
          submitter_was_witness: boolean
          status: ReportStatus
          moderated_by: string | null
          moderation_notes: string | null
          featured: boolean
          view_count: number
          upvotes: number
          downvotes: number
          comment_count: number
          created_at: string
          updated_at: string
          published_at: string | null
        }
        Insert: {
          id?: string
          title: string
          slug: string
          summary: string
          description: string
          phenomenon_type_id?: string | null
          category: PhenomenonCategory
          tags?: string[]
          location_name?: string | null
          location_description?: string | null
          country?: string | null
          state_province?: string | null
          city?: string | null
          latitude?: number | null
          longitude?: number | null
          event_date?: string | null
          event_time?: string | null
          event_date_approximate?: boolean
          event_duration_minutes?: number | null
          credibility?: CredibilityLevel
          witness_count?: number
          has_physical_evidence?: boolean
          has_photo_video?: boolean
          has_official_report?: boolean
          evidence_summary?: string | null
          source_type?: string | null
          source_url?: string | null
          source_reference?: string | null
          original_report_id?: string | null
          submitted_by?: string | null
          anonymous_submission?: boolean
          submitter_was_witness?: boolean
          status?: ReportStatus
          moderated_by?: string | null
          moderation_notes?: string | null
          featured?: boolean
          view_count?: number
          upvotes?: number
          downvotes?: number
          comment_count?: number
          created_at?: string
          updated_at?: string
          published_at?: string | null
        }
        Update: {
          id?: string
          title?: string
          slug?: string
          summary?: string
          description?: string
          phenomenon_type_id?: string | null
          category?: PhenomenonCategory
          tags?: string[]
          location_name?: string | null
          location_description?: string | null
          country?: string | null
          state_province?: string | null
          city?: string | null
          latitude?: number | null
          longitude?: number | null
          event_date?: string | null
          event_time?: string | null
          event_date_approximate?: boolean
          event_duration_minutes?: number | null
          credibility?: CredibilityLevel
          witness_count?: number
          has_physical_evidence?: boolean
          has_photo_video?: boolean
          has_official_report?: boolean
          evidence_summary?: string | null
          source_type?: string | null
          source_url?: string | null
          source_reference?: string | null
          original_report_id?: string | null
          submitted_by?: string | null
          anonymous_submission?: boolean
          submitter_was_witness?: boolean
          status?: ReportStatus
          moderated_by?: string | null
          moderation_notes?: string | null
          featured?: boolean
          view_count?: number
          upvotes?: number
          downvotes?: number
          comment_count?: number
          created_at?: string
          updated_at?: string
          published_at?: string | null
        }
      }
      comments: {
        Row: {
          id: string
          report_id: string
          user_id: string
          parent_id: string | null
          content: string
          upvotes: number
          downvotes: number
          is_edited: boolean
          is_deleted: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          report_id: string
          user_id: string
          parent_id?: string | null
          content: string
          upvotes?: number
          downvotes?: number
          is_edited?: boolean
          is_deleted?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          report_id?: string
          user_id?: string
          parent_id?: string | null
          content?: string
          upvotes?: number
          downvotes?: number
          is_edited?: boolean
          is_deleted?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      votes: {
        Row: {
          id: string
          user_id: string
          report_id: string | null
          comment_id: string | null
          vote_type: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          report_id?: string | null
          comment_id?: string | null
          vote_type: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          report_id?: string | null
          comment_id?: string | null
          vote_type?: number
          created_at?: string
        }
      }
      saved_reports: {
        Row: {
          id: string
          user_id: string
          report_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          report_id: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          report_id?: string
          created_at?: string
        }
      }
      report_media: {
        Row: {
          id: string
          report_id: string
          media_type: string
          url: string
          thumbnail_url: string | null
          caption: string | null
          is_primary: boolean
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          report_id: string
          media_type: string
          url: string
          thumbnail_url?: string | null
          caption?: string | null
          is_primary?: boolean
          uploaded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          report_id?: string
          media_type?: string
          url?: string
          thumbnail_url?: string | null
          caption?: string | null
          is_primary?: boolean
          uploaded_by?: string | null
          created_at?: string
        }
      }
      data_sources: {
        Row: {
          id: string
          name: string
          slug: string
          description: string | null
          url: string | null
          last_synced_at: string | null
          total_records: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          description?: string | null
          url?: string | null
          last_synced_at?: string | null
          total_records?: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          description?: string | null
          url?: string | null
          last_synced_at?: string | null
          total_records?: number
          is_active?: boolean
          created_at?: string
        }
      }
    }
  }
}

// Convenience types
export type Profile = Database['public']['Tables']['profiles']['Row']
export type PhenomenonType = Database['public']['Tables']['phenomenon_types']['Row']
export type Report = Database['public']['Tables']['reports']['Row']
export type Comment = Database['public']['Tables']['comments']['Row']
export type Vote = Database['public']['Tables']['votes']['Row']
export type SavedReport = Database['public']['Tables']['saved_reports']['Row']
export type ReportMedia = Database['public']['Tables']['report_media']['Row']
export type DataSource = Database['public']['Tables']['data_sources']['Row']

// Report Tags for multi-tagging
export interface ReportTag {
  id: string
  report_id: string
  phenomenon_type_id: string
  is_primary: boolean
  relevance_score: number
  created_at: string
}

// Phenomenon Type with tag metadata
export interface PhenomenonTypeTag extends PhenomenonType {
  is_primary?: boolean
  relevance_score?: number
}

// Category with grouped types (from get_phenomenon_types_by_category)
export interface CategoryWithTypes {
  category: PhenomenonCategory
  category_label: string
  types: PhenomenonType[]
}

// Extended types with relations
export interface ReportWithDetails extends Report {
  phenomenon_type?: PhenomenonType | null
  submitter?: Profile | null
  media?: ReportMedia[]
  comments?: CommentWithUser[]
  report_tags?: PhenomenonTypeTag[]  // All phenomenon type tags
  related_categories?: string[]       // Array of category slugs for cross-disciplinary
}

export interface CommentWithUser extends Comment {
  user?: Profile
  replies?: CommentWithUser[]
}

// Search result with relevance
export interface SearchResult extends Report {
  tags?: PhenomenonTypeTag[]
  relevance_rank?: number
}
