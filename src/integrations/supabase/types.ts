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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      allowlist_entries: {
        Row: {
          collection_id: string
          created_at: string
          created_by: string
          id: string
          max_mint: number | null
          notes: string | null
          phase_name: string
          wallet_address: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          created_by: string
          id?: string
          max_mint?: number | null
          notes?: string | null
          phase_name: string
          wallet_address: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          created_by?: string
          id?: string
          max_mint?: number | null
          notes?: string | null
          phase_name?: string
          wallet_address?: string
        }
        Relationships: []
      }
      banned_users: {
        Row: {
          banned_at: string
          banned_by: string | null
          expires_at: string | null
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          banned_at?: string
          banned_by?: string | null
          expires_at?: string | null
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          banned_at?: string
          banned_by?: string | null
          expires_at?: string | null
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      blocked_patterns: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          pattern: string
          pattern_type: string
          reason: Database["public"]["Enums"]["moderation_reason"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          pattern: string
          pattern_type?: string
          reason?: Database["public"]["Enums"]["moderation_reason"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          pattern?: string
          pattern_type?: string
          reason?: Database["public"]["Enums"]["moderation_reason"]
        }
        Relationships: []
      }
      buyback_events: {
        Row: {
          executed_at: string
          id: string
          mon_spent: number
          token_address: string | null
          tokens_bought: number
          trigger_volume: number
          tx_hash: string
        }
        Insert: {
          executed_at?: string
          id?: string
          mon_spent: number
          token_address?: string | null
          tokens_bought?: number
          trigger_volume: number
          tx_hash: string
        }
        Update: {
          executed_at?: string
          id?: string
          mon_spent?: number
          token_address?: string | null
          tokens_bought?: number
          trigger_volume?: number
          tx_hash?: string
        }
        Relationships: []
      }
      buyback_pool: {
        Row: {
          accumulated_volume: number
          buyback_threshold: number
          id: string
          last_buyback_at: string | null
          pool_balance: number
          total_buybacks_executed: number
          updated_at: string
        }
        Insert: {
          accumulated_volume?: number
          buyback_threshold?: number
          id?: string
          last_buyback_at?: string | null
          pool_balance?: number
          total_buybacks_executed?: number
          updated_at?: string
        }
        Update: {
          accumulated_volume?: number
          buyback_threshold?: number
          id?: string
          last_buyback_at?: string | null
          pool_balance?: number
          total_buybacks_executed?: number
          updated_at?: string
        }
        Relationships: []
      }
      buyback_program_collections: {
        Row: {
          added_at: string
          added_by: string
          collection_id: string
          id: string
          is_active: boolean
          notified_creator: boolean
          reason: string | null
        }
        Insert: {
          added_at?: string
          added_by: string
          collection_id: string
          id?: string
          is_active?: boolean
          notified_creator?: boolean
          reason?: string | null
        }
        Update: {
          added_at?: string
          added_by?: string
          collection_id?: string
          id?: string
          is_active?: boolean
          notified_creator?: boolean
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buyback_program_collections_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: true
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      card_stack_items: {
        Row: {
          created_at: string
          created_by: string | null
          cta_label: string | null
          description: string | null
          display_order: number
          href: string | null
          id: string
          image_url: string | null
          is_active: boolean
          tag: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          description?: string | null
          display_order?: number
          href?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          tag?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          description?: string | null
          display_order?: number
          href?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          tag?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      challenge_badges: {
        Row: {
          badge_icon: string
          badge_name: string
          badge_type: string
          challenge_id: string | null
          description: string | null
          earned_at: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          badge_icon: string
          badge_name: string
          badge_type: string
          challenge_id?: string | null
          description?: string | null
          earned_at?: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          badge_icon?: string
          badge_name?: string
          badge_type?: string
          challenge_id?: string | null
          description?: string | null
          earned_at?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_badges_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "streak_challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_emotes: {
        Row: {
          created_at: string
          id: string
          image_url: string
          is_active: boolean
          name: string
          streamer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          is_active?: boolean
          name: string
          streamer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          is_active?: boolean
          name?: string
          streamer_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "stream_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      clip_comments: {
        Row: {
          clip_id: string
          content: string
          created_at: string
          id: string
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          clip_id: string
          content: string
          created_at?: string
          id?: string
          parent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          clip_id?: string
          content?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clip_comments_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clip_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "clip_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      clip_events: {
        Row: {
          clip_id: string
          created_at: string
          event_type: string
          id: string
          platform: string | null
          viewer_id: string | null
        }
        Insert: {
          clip_id: string
          created_at?: string
          event_type: string
          id?: string
          platform?: string | null
          viewer_id?: string | null
        }
        Update: {
          clip_id?: string
          created_at?: string
          event_type?: string
          id?: string
          platform?: string | null
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clip_events_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
        ]
      }
      clip_reactions: {
        Row: {
          clip_id: string
          created_at: string
          emoji: string
          id: string
          user_id: string
        }
        Insert: {
          clip_id: string
          created_at?: string
          emoji: string
          id?: string
          user_id: string
        }
        Update: {
          clip_id?: string
          created_at?: string
          emoji?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clip_reactions_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
        ]
      }
      clips: {
        Row: {
          clip_url: string | null
          created_at: string
          description: string | null
          duration_seconds: number
          id: string
          start_time_seconds: number
          stream_id: string | null
          thumbnail_url: string | null
          title: string
          user_id: string
          views: number
        }
        Insert: {
          clip_url?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number
          id?: string
          start_time_seconds?: number
          stream_id?: string | null
          thumbnail_url?: string | null
          title: string
          user_id: string
          views?: number
        }
        Update: {
          clip_url?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number
          id?: string
          start_time_seconds?: number
          stream_id?: string | null
          thumbnail_url?: string | null
          title?: string
          user_id?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "clips_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_audio_metadata: {
        Row: {
          album: string | null
          artist: string | null
          artwork_id: string
          audio_url: string
          bpm: number | null
          collection_id: string
          cover_art_url: string
          created_at: string | null
          duration_seconds: number | null
          genre: string | null
          id: string
          track_number: number | null
          updated_at: string | null
        }
        Insert: {
          album?: string | null
          artist?: string | null
          artwork_id: string
          audio_url: string
          bpm?: number | null
          collection_id: string
          cover_art_url: string
          created_at?: string | null
          duration_seconds?: number | null
          genre?: string | null
          id?: string
          track_number?: number | null
          updated_at?: string | null
        }
        Update: {
          album?: string | null
          artist?: string | null
          artwork_id?: string
          audio_url?: string
          bpm?: number | null
          collection_id?: string
          cover_art_url?: string
          created_at?: string | null
          duration_seconds?: number | null
          genre?: string | null
          id?: string
          track_number?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collection_audio_metadata_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          artworks_metadata: Json | null
          banner_url: string | null
          chain: string
          collection_type: string
          contract_address: string | null
          created_at: string
          creator_address: string
          creator_id: string
          deleted_at: string | null
          description: string | null
          id: string
          image_url: string | null
          ipfs_base_cid: string | null
          is_revealed: boolean
          layers_metadata: Json | null
          media_type: string | null
          minted: number
          name: string
          phases: Json
          royalty_percent: number
          scheduled_permanent_delete_at: string | null
          scheduled_reveal_at: string | null
          social_discord: string | null
          social_telegram: string | null
          social_twitter: string | null
          social_website: string | null
          status: string
          symbol: string
          total_supply: number
          trait_rules: Json | null
          unrevealed_image_url: string | null
          updated_at: string
        }
        Insert: {
          artworks_metadata?: Json | null
          banner_url?: string | null
          chain?: string
          collection_type?: string
          contract_address?: string | null
          created_at?: string
          creator_address: string
          creator_id: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          ipfs_base_cid?: string | null
          is_revealed?: boolean
          layers_metadata?: Json | null
          media_type?: string | null
          minted?: number
          name: string
          phases?: Json
          royalty_percent?: number
          scheduled_permanent_delete_at?: string | null
          scheduled_reveal_at?: string | null
          social_discord?: string | null
          social_telegram?: string | null
          social_twitter?: string | null
          social_website?: string | null
          status?: string
          symbol: string
          total_supply?: number
          trait_rules?: Json | null
          unrevealed_image_url?: string | null
          updated_at?: string
        }
        Update: {
          artworks_metadata?: Json | null
          banner_url?: string | null
          chain?: string
          collection_type?: string
          contract_address?: string | null
          created_at?: string
          creator_address?: string
          creator_id?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          ipfs_base_cid?: string | null
          is_revealed?: boolean
          layers_metadata?: Json | null
          media_type?: string | null
          minted?: number
          name?: string
          phases?: Json
          royalty_percent?: number
          scheduled_permanent_delete_at?: string | null
          scheduled_reveal_at?: string | null
          social_discord?: string | null
          social_telegram?: string | null
          social_twitter?: string | null
          social_website?: string | null
          status?: string
          symbol?: string
          total_supply?: number
          trait_rules?: Json | null
          unrevealed_image_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      comment_reports: {
        Row: {
          comment_id: string
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string
          status: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id: string
          status?: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "clip_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_beta_applications: {
        Row: {
          admin_notes: string | null
          content_type: string
          created_at: string | null
          display_name: string
          email: string
          id: string
          interview_notes: string | null
          interview_room_id: string | null
          interview_scheduled_at: string | null
          motivation: string | null
          portfolio_urls: string[]
          reviewed_at: string | null
          reviewed_by: string | null
          social_links: Json | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          content_type: string
          created_at?: string | null
          display_name: string
          email: string
          id?: string
          interview_notes?: string | null
          interview_room_id?: string | null
          interview_scheduled_at?: string | null
          motivation?: string | null
          portfolio_urls?: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          social_links?: Json | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          content_type?: string
          created_at?: string | null
          display_name?: string
          email?: string
          id?: string
          interview_notes?: string | null
          interview_room_id?: string | null
          interview_scheduled_at?: string | null
          motivation?: string | null
          portfolio_urls?: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          social_links?: Json | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      earnings: {
        Row: {
          amount: number
          claimed_at: string | null
          created_at: string
          currency: string
          from_user_id: string | null
          from_username: string | null
          id: string
          is_claimed: boolean
          message: string | null
          stream_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount?: number
          claimed_at?: string | null
          created_at?: string
          currency?: string
          from_user_id?: string | null
          from_username?: string | null
          id?: string
          is_claimed?: boolean
          message?: string | null
          stream_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          claimed_at?: string | null
          created_at?: string
          currency?: string
          from_user_id?: string | null
          from_username?: string | null
          id?: string
          is_claimed?: boolean
          message?: string | null
          stream_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "earnings_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          category: string | null
          component_name: string | null
          component_stack: string | null
          created_at: string
          error_message: string
          error_stack: string | null
          id: string
          is_resolved: boolean | null
          metadata: Json | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
          wallet_address: string | null
        }
        Insert: {
          category?: string | null
          component_name?: string | null
          component_stack?: string | null
          created_at?: string
          error_message: string
          error_stack?: string | null
          id?: string
          is_resolved?: boolean | null
          metadata?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
          wallet_address?: string | null
        }
        Update: {
          category?: string | null
          component_name?: string | null
          component_stack?: string | null
          created_at?: string
          error_message?: string
          error_stack?: string | null
          id?: string
          is_resolved?: boolean | null
          metadata?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
          wallet_address?: string | null
        }
        Relationships: []
      }
      feature_locks: {
        Row: {
          created_at: string | null
          description: string | null
          feature_key: string
          feature_name: string
          id: string
          is_enabled: boolean | null
          required_followers: number | null
          required_subscribers: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          feature_key: string
          feature_name: string
          id?: string
          is_enabled?: boolean | null
          required_followers?: number | null
          required_subscribers?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          feature_key?: string
          feature_name?: string
          id?: string
          is_enabled?: boolean | null
          required_followers?: number | null
          required_subscribers?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      featured_collections: {
        Row: {
          collection_id: string
          created_at: string
          created_by: string | null
          display_order: number
          end_date: string
          feature_type: string
          id: string
          is_active: boolean
          start_date: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          created_by?: string | null
          display_order?: number
          end_date: string
          feature_type: string
          id?: string
          is_active?: boolean
          start_date: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          created_by?: string | null
          display_order?: number
          end_date?: string
          feature_type?: string
          id?: string
          is_active?: boolean
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "featured_collections_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      followers: {
        Row: {
          created_at: string
          follower_id: string
          id: string
          streamer_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          id?: string
          streamer_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          id?: string
          streamer_id?: string
        }
        Relationships: []
      }
      governance_config: {
        Row: {
          chain_id: number
          created_at: string
          governance_collection_id: string | null
          governance_type: string | null
          governor_address: string
          id: string
          is_active: boolean
          nft_voting_tiers: Json | null
          proposal_threshold: number
          quorum_percentage: number
          timelock_address: string
          timelock_delay_seconds: number
          token_address: string | null
          updated_at: string
          voting_delay_blocks: number
          voting_period_blocks: number
        }
        Insert: {
          chain_id: number
          created_at?: string
          governance_collection_id?: string | null
          governance_type?: string | null
          governor_address: string
          id?: string
          is_active?: boolean
          nft_voting_tiers?: Json | null
          proposal_threshold?: number
          quorum_percentage?: number
          timelock_address: string
          timelock_delay_seconds?: number
          token_address?: string | null
          updated_at?: string
          voting_delay_blocks?: number
          voting_period_blocks?: number
        }
        Update: {
          chain_id?: number
          created_at?: string
          governance_collection_id?: string | null
          governance_type?: string | null
          governor_address?: string
          id?: string
          is_active?: boolean
          nft_voting_tiers?: Json | null
          proposal_threshold?: number
          quorum_percentage?: number
          timelock_address?: string
          timelock_delay_seconds?: number
          token_address?: string | null
          updated_at?: string
          voting_delay_blocks?: number
          voting_period_blocks?: number
        }
        Relationships: [
          {
            foreignKeyName: "governance_config_governance_collection_id_fkey"
            columns: ["governance_collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_delegations: {
        Row: {
          created_at: string
          delegate_address: string
          delegator_address: string
          id: string
          tx_hash: string | null
          updated_at: string
          voting_power: number
        }
        Insert: {
          created_at?: string
          delegate_address: string
          delegator_address: string
          id?: string
          tx_hash?: string | null
          updated_at?: string
          voting_power?: number
        }
        Update: {
          created_at?: string
          delegate_address?: string
          delegator_address?: string
          id?: string
          tx_hash?: string | null
          updated_at?: string
          voting_power?: number
        }
        Relationships: []
      }
      governance_proposals: {
        Row: {
          abstain_votes: number
          against_votes: number
          calldatas: Json
          canceled_at: string | null
          created_at: string
          description: string
          end_block: number
          executed_at: string | null
          execution_tx_hash: string | null
          for_votes: number
          id: string
          proposal_id: string
          proposer_address: string
          queued_at: string | null
          quorum_votes: number
          start_block: number
          status: string
          targets: Json
          title: string
          tx_hash: string | null
          values: Json
        }
        Insert: {
          abstain_votes?: number
          against_votes?: number
          calldatas?: Json
          canceled_at?: string | null
          created_at?: string
          description: string
          end_block: number
          executed_at?: string | null
          execution_tx_hash?: string | null
          for_votes?: number
          id?: string
          proposal_id: string
          proposer_address: string
          queued_at?: string | null
          quorum_votes?: number
          start_block: number
          status?: string
          targets?: Json
          title: string
          tx_hash?: string | null
          values?: Json
        }
        Update: {
          abstain_votes?: number
          against_votes?: number
          calldatas?: Json
          canceled_at?: string | null
          created_at?: string
          description?: string
          end_block?: number
          executed_at?: string | null
          execution_tx_hash?: string | null
          for_votes?: number
          id?: string
          proposal_id?: string
          proposer_address?: string
          queued_at?: string | null
          quorum_votes?: number
          start_block?: number
          status?: string
          targets?: Json
          title?: string
          tx_hash?: string | null
          values?: Json
        }
        Relationships: []
      }
      governance_token_holders: {
        Row: {
          balance: number
          delegated_to: string | null
          delegators_count: number
          id: string
          is_delegate: boolean
          nft_count: number | null
          nft_ids: string[] | null
          rarity_breakdown: Json | null
          updated_at: string
          user_id: string | null
          voting_power: number
          wallet_address: string
        }
        Insert: {
          balance?: number
          delegated_to?: string | null
          delegators_count?: number
          id?: string
          is_delegate?: boolean
          nft_count?: number | null
          nft_ids?: string[] | null
          rarity_breakdown?: Json | null
          updated_at?: string
          user_id?: string | null
          voting_power?: number
          wallet_address: string
        }
        Update: {
          balance?: number
          delegated_to?: string | null
          delegators_count?: number
          id?: string
          is_delegate?: boolean
          nft_count?: number | null
          nft_ids?: string[] | null
          rarity_breakdown?: Json | null
          updated_at?: string
          user_id?: string | null
          voting_power?: number
          wallet_address?: string
        }
        Relationships: []
      }
      governance_votes: {
        Row: {
          created_at: string
          id: string
          proposal_id: string
          reason: string | null
          support: number
          tx_hash: string | null
          voter_address: string
          voter_id: string | null
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          proposal_id: string
          reason?: string | null
          support: number
          tx_hash?: string | null
          voter_address: string
          voter_id?: string | null
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          proposal_id?: string
          reason?: string | null
          support?: number
          tx_hash?: string | null
          voter_address?: string
          voter_id?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "governance_votes_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "governance_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      lily_blind_box_purchases: {
        Row: {
          blind_box_id: string
          created_at: string
          id: string
          quantity: number
          rewards_received: Json
          total_paid: number
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          blind_box_id: string
          created_at?: string
          id?: string
          quantity?: number
          rewards_received?: Json
          total_paid?: number
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          blind_box_id?: string
          created_at?: string
          id?: string
          quantity?: number
          rewards_received?: Json
          total_paid?: number
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lily_blind_box_purchases_blind_box_id_fkey"
            columns: ["blind_box_id"]
            isOneToOne: false
            referencedRelation: "lily_blind_boxes"
            referencedColumns: ["id"]
          },
        ]
      }
      lily_blind_boxes: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          end_date: string
          id: string
          image_url: string | null
          is_active: boolean
          max_per_user: number | null
          name: string
          price: number
          remaining_supply: number
          rewards: Json
          start_date: string
          total_supply: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          end_date: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          max_per_user?: number | null
          name: string
          price?: number
          remaining_supply?: number
          rewards?: Json
          start_date: string
          total_supply?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          max_per_user?: number | null
          name?: string
          price?: number
          remaining_supply?: number
          rewards?: Json
          start_date?: string
          total_supply?: number
          updated_at?: string
        }
        Relationships: []
      }
      lily_raffle_entries: {
        Row: {
          created_at: string
          id: string
          raffle_id: string
          ticket_count: number
          total_paid: number
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          raffle_id: string
          ticket_count?: number
          total_paid?: number
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          raffle_id?: string
          ticket_count?: number
          total_paid?: number
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lily_raffle_entries_raffle_id_fkey"
            columns: ["raffle_id"]
            isOneToOne: false
            referencedRelation: "lily_raffles"
            referencedColumns: ["id"]
          },
        ]
      }
      lily_raffles: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          drawn_at: string | null
          end_date: string
          entry_price: number
          id: string
          image_url: string | null
          is_active: boolean
          is_drawn: boolean
          max_tickets_per_user: number | null
          name: string
          prize_details: Json
          prize_type: string
          required_collection_id: string | null
          start_date: string
          total_tickets: number | null
          updated_at: string
          winner_count: number
          winners: Json | null
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          drawn_at?: string | null
          end_date: string
          entry_price?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_drawn?: boolean
          max_tickets_per_user?: number | null
          name: string
          prize_details?: Json
          prize_type?: string
          required_collection_id?: string | null
          start_date: string
          total_tickets?: number | null
          updated_at?: string
          winner_count?: number
          winners?: Json | null
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          drawn_at?: string | null
          end_date?: string
          entry_price?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_drawn?: boolean
          max_tickets_per_user?: number | null
          name?: string
          prize_details?: Json
          prize_type?: string
          required_collection_id?: string | null
          start_date?: string
          total_tickets?: number | null
          updated_at?: string
          winner_count?: number
          winners?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "lily_raffles_required_collection_id_fkey"
            columns: ["required_collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      linked_wallets: {
        Row: {
          chain: string
          id: string
          is_primary: boolean
          label: string | null
          linked_at: string
          profile_id: string
          wallet_address: string
        }
        Insert: {
          chain?: string
          id?: string
          is_primary?: boolean
          label?: string | null
          linked_at?: string
          profile_id: string
          wallet_address: string
        }
        Update: {
          chain?: string
          id?: string
          is_primary?: boolean
          label?: string | null
          linked_at?: string
          profile_id?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "linked_wallets_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_transactions: {
        Row: {
          action_type: string
          collection_id: string | null
          created_at: string
          deadline: string
          error_message: string | null
          gas_paid_by: string | null
          gas_used: number | null
          id: string
          nonce: number
          processed_at: string | null
          signature: string
          status: string
          tx_hash: string | null
          typed_data: Json
          user_address: string
          user_id: string
        }
        Insert: {
          action_type: string
          collection_id?: string | null
          created_at?: string
          deadline: string
          error_message?: string | null
          gas_paid_by?: string | null
          gas_used?: number | null
          id?: string
          nonce: number
          processed_at?: string | null
          signature: string
          status?: string
          tx_hash?: string | null
          typed_data: Json
          user_address: string
          user_id: string
        }
        Update: {
          action_type?: string
          collection_id?: string | null
          created_at?: string
          deadline?: string
          error_message?: string | null
          gas_paid_by?: string | null
          gas_used?: number | null
          id?: string
          nonce?: number
          processed_at?: string | null
          signature?: string
          status?: string
          tx_hash?: string | null
          typed_data?: Json
          user_address?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_transactions_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      minted_nfts: {
        Row: {
          attributes: Json | null
          collection_id: string | null
          description: string | null
          id: string
          image_url: string | null
          is_revealed: boolean
          minted_at: string
          name: string | null
          owner_address: string
          owner_id: string
          revealed_at: string | null
          token_id: number
          tx_hash: string
        }
        Insert: {
          attributes?: Json | null
          collection_id?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_revealed?: boolean
          minted_at?: string
          name?: string | null
          owner_address: string
          owner_id: string
          revealed_at?: string | null
          token_id: number
          tx_hash: string
        }
        Update: {
          attributes?: Json | null
          collection_id?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_revealed?: boolean
          minted_at?: string
          name?: string | null
          owner_address?: string
          owner_id?: string
          revealed_at?: string | null
          token_id?: number
          tx_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "minted_nfts_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_actions: {
        Row: {
          action_by: string | null
          action_type: string
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["moderation_status"] | null
          notes: string | null
          previous_status:
            | Database["public"]["Enums"]["moderation_status"]
            | null
          queue_id: string | null
        }
        Insert: {
          action_by?: string | null
          action_type: string
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["moderation_status"] | null
          notes?: string | null
          previous_status?:
            | Database["public"]["Enums"]["moderation_status"]
            | null
          queue_id?: string | null
        }
        Update: {
          action_by?: string | null
          action_type?: string
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["moderation_status"] | null
          notes?: string | null
          previous_status?:
            | Database["public"]["Enums"]["moderation_status"]
            | null
          queue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_actions_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "moderation_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_queue: {
        Row: {
          ai_details: Json | null
          ai_reasons: Database["public"]["Enums"]["moderation_reason"][] | null
          ai_score: number | null
          content_text: string | null
          content_type: Database["public"]["Enums"]["moderation_content_type"]
          content_url: string | null
          created_at: string
          id: string
          reference_id: string | null
          reference_table: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["moderation_status"]
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          ai_details?: Json | null
          ai_reasons?: Database["public"]["Enums"]["moderation_reason"][] | null
          ai_score?: number | null
          content_text?: string | null
          content_type: Database["public"]["Enums"]["moderation_content_type"]
          content_url?: string | null
          created_at?: string
          id?: string
          reference_id?: string | null
          reference_table?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["moderation_status"]
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          ai_details?: Json | null
          ai_reasons?: Database["public"]["Enums"]["moderation_reason"][] | null
          ai_score?: number | null
          content_text?: string | null
          content_type?: Database["public"]["Enums"]["moderation_content_type"]
          content_url?: string | null
          created_at?: string
          id?: string
          reference_id?: string | null
          reference_table?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["moderation_status"]
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      nft_listings: {
        Row: {
          buyer_address: string | null
          buyer_id: string | null
          created_at: string
          currency: string
          expires_at: string | null
          id: string
          nft_id: string
          price: number
          seller_address: string
          seller_claimed: boolean
          seller_claimed_at: string | null
          seller_id: string
          sold_at: string | null
          status: string
          tx_hash: string | null
        }
        Insert: {
          buyer_address?: string | null
          buyer_id?: string | null
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          nft_id: string
          price: number
          seller_address: string
          seller_claimed?: boolean
          seller_claimed_at?: string | null
          seller_id: string
          sold_at?: string | null
          status?: string
          tx_hash?: string | null
        }
        Update: {
          buyer_address?: string | null
          buyer_id?: string | null
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          nft_id?: string
          price?: number
          seller_address?: string
          seller_claimed?: boolean
          seller_claimed_at?: string | null
          seller_id?: string
          sold_at?: string | null
          status?: string
          tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nft_listings_nft_id_fkey"
            columns: ["nft_id"]
            isOneToOne: false
            referencedRelation: "minted_nfts"
            referencedColumns: ["id"]
          },
        ]
      }
      nft_mints: {
        Row: {
          collection_id: string | null
          created_at: string
          creator_amount_sol: number
          id: string
          mint_address: string
          minter_address: string
          phase_id: string | null
          platform_fee_sol: number
          price_sol: number
          transaction_signature: string
        }
        Insert: {
          collection_id?: string | null
          created_at?: string
          creator_amount_sol?: number
          id?: string
          mint_address: string
          minter_address: string
          phase_id?: string | null
          platform_fee_sol?: number
          price_sol?: number
          transaction_signature: string
        }
        Update: {
          collection_id?: string | null
          created_at?: string
          creator_amount_sol?: number
          id?: string
          mint_address?: string
          minter_address?: string
          phase_id?: string | null
          platform_fee_sol?: number
          price_sol?: number
          transaction_signature?: string
        }
        Relationships: [
          {
            foreignKeyName: "nft_mints_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      nft_offers: {
        Row: {
          created_at: string
          currency: string
          expires_at: string | null
          id: string
          listing_id: string | null
          message: string | null
          nft_id: string
          offer_price: number
          offerer_address: string
          offerer_id: string
          owner_address: string
          owner_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          listing_id?: string | null
          message?: string | null
          nft_id: string
          offer_price: number
          offerer_address: string
          offerer_id: string
          owner_address: string
          owner_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          listing_id?: string | null
          message?: string | null
          nft_id?: string
          offer_price?: number
          offerer_address?: string
          offerer_id?: string
          owner_address?: string
          owner_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nft_offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "nft_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nft_offers_nft_id_fkey"
            columns: ["nft_id"]
            isOneToOne: false
            referencedRelation: "minted_nfts"
            referencedColumns: ["id"]
          },
        ]
      }
      nft_transactions: {
        Row: {
          collection_id: string | null
          confirmed_at: string | null
          created_at: string
          id: string
          price_paid: number
          quantity: number
          status: string
          token_ids: number[] | null
          tx_hash: string
          tx_type: string
          user_id: string
        }
        Insert: {
          collection_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          price_paid?: number
          quantity?: number
          status?: string
          token_ids?: number[] | null
          tx_hash: string
          tx_type?: string
          user_id: string
        }
        Update: {
          collection_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          price_paid?: number
          quantity?: number
          status?: string
          token_ids?: number[] | null
          tx_hash?: string
          tx_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nft_transactions_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          message: string
          metadata: Json | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message: string
          metadata?: Json | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          metadata?: Json | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_fees: {
        Row: {
          chain: string
          collection_id: string | null
          contributed_to_buyback: number
          created_at: string
          fee_amount: number
          fee_type: string
          id: string
          shop_item_id: string | null
          source_volume: number
          tx_hash: string
        }
        Insert: {
          chain?: string
          collection_id?: string | null
          contributed_to_buyback?: number
          created_at?: string
          fee_amount?: number
          fee_type: string
          id?: string
          shop_item_id?: string | null
          source_volume?: number
          tx_hash: string
        }
        Update: {
          chain?: string
          collection_id?: string | null
          contributed_to_buyback?: number
          created_at?: string
          fee_amount?: number
          fee_type?: string
          id?: string
          shop_item_id?: string | null
          source_volume?: number
          tx_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_fees_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_fees_shop_item_id_fkey"
            columns: ["shop_item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_tracks: {
        Row: {
          added_at: string | null
          collection_id: string
          id: string
          playlist_id: string
          position: number
          track_id: string | null
        }
        Insert: {
          added_at?: string | null
          collection_id: string
          id?: string
          playlist_id: string
          position?: number
          track_id?: string | null
        }
        Update: {
          added_at?: string | null
          collection_id?: string
          id?: string
          playlist_id?: string
          position?: number
          track_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playlist_tracks_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_tracks_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "user_playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_signups: {
        Row: {
          created_at: string
          id: string
          referral_code: string
          referred_user_id: string
          referrer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          referral_code: string
          referred_user_id: string
          referrer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          referral_code?: string
          referred_user_id?: string
          referrer_id?: string
        }
        Relationships: []
      }
      shop_bundle_items: {
        Row: {
          bundle_id: string
          created_at: string
          id: string
          item_id: string
        }
        Insert: {
          bundle_id: string
          created_at?: string
          id?: string
          item_id: string
        }
        Update: {
          bundle_id?: string
          created_at?: string
          id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "shop_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_bundle_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_bundle_purchases: {
        Row: {
          bundle_id: string
          currency: string | null
          id: string
          price_paid: number
          purchased_at: string
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          bundle_id: string
          currency?: string | null
          id?: string
          price_paid: number
          purchased_at?: string
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          bundle_id?: string
          currency?: string | null
          id?: string
          price_paid?: number
          purchased_at?: string
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_bundle_purchases_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "shop_bundles"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_bundles: {
        Row: {
          bundle_price: number
          bundle_price_sol: number | null
          created_at: string
          created_by: string | null
          currency: string | null
          description: string | null
          discount_percent: number
          expires_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_limited_time: boolean
          name: string
          original_price: number
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          bundle_price?: number
          bundle_price_sol?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          discount_percent?: number
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_limited_time?: boolean
          name: string
          original_price?: number
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          bundle_price?: number
          bundle_price_sol?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          discount_percent?: number
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_limited_time?: boolean
          name?: string
          original_price?: number
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      shop_item_contents: {
        Row: {
          created_at: string
          display_order: number
          file_url: string
          id: string
          item_id: string
          name: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          file_url: string
          id?: string
          item_id: string
          name: string
        }
        Update: {
          created_at?: string
          display_order?: number
          file_url?: string
          id?: string
          item_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_item_contents_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_items: {
        Row: {
          category: string
          created_at: string
          creator_id: string
          creator_type: string
          currency: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price_mon: number
          price_sol: number | null
          required_collection_id: string | null
          tier: string
          total_sales: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          creator_id: string
          creator_type?: string
          currency?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price_mon?: number
          price_sol?: number | null
          required_collection_id?: string | null
          tier?: string
          total_sales?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          creator_id?: string
          creator_type?: string
          currency?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price_mon?: number
          price_sol?: number | null
          required_collection_id?: string | null
          tier?: string
          total_sales?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_items_required_collection_id_fkey"
            columns: ["required_collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_purchases: {
        Row: {
          creator_claimed: boolean
          creator_claimed_at: string | null
          currency: string | null
          id: string
          item_id: string
          price_paid: number
          purchased_at: string
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          creator_claimed?: boolean
          creator_claimed_at?: string | null
          currency?: string | null
          id?: string
          item_id: string
          price_paid: number
          purchased_at?: string
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          creator_claimed?: boolean
          creator_claimed_at?: string | null
          currency?: string | null
          id?: string
          item_id?: string
          price_paid?: number
          purchased_at?: string
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_purchases_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["id"]
          },
        ]
      }
      site_assets: {
        Row: {
          asset_key: string
          asset_type: string
          asset_url: string
          created_at: string
          description: string | null
          id: string
          page: string
          updated_at: string
        }
        Insert: {
          asset_key: string
          asset_type?: string
          asset_url: string
          created_at?: string
          description?: string | null
          id?: string
          page?: string
          updated_at?: string
        }
        Update: {
          asset_key?: string
          asset_type?: string
          asset_url?: string
          created_at?: string
          description?: string | null
          id?: string
          page?: string
          updated_at?: string
        }
        Relationships: []
      }
      streak_challenges: {
        Row: {
          challenged_id: string
          challenged_streak: number
          challenger_id: string
          challenger_streak: number
          created_at: string
          duration_days: number
          end_date: string | null
          id: string
          start_date: string
          status: string
          updated_at: string
          winner_id: string | null
        }
        Insert: {
          challenged_id: string
          challenged_streak?: number
          challenger_id: string
          challenger_streak?: number
          created_at?: string
          duration_days?: number
          end_date?: string | null
          id?: string
          start_date?: string
          status?: string
          updated_at?: string
          winner_id?: string | null
        }
        Update: {
          challenged_id?: string
          challenged_streak?: number
          challenger_id?: string
          challenger_streak?: number
          created_at?: string
          duration_days?: number
          end_date?: string | null
          id?: string
          start_date?: string
          status?: string
          updated_at?: string
          winner_id?: string | null
        }
        Relationships: []
      }
      stream_analytics: {
        Row: {
          chat_messages: number
          concurrent_viewers: number
          id: string
          new_followers: number
          recorded_at: string
          stream_id: string
          user_id: string
        }
        Insert: {
          chat_messages?: number
          concurrent_viewers?: number
          id?: string
          new_followers?: number
          recorded_at?: string
          stream_id: string
          user_id: string
        }
        Update: {
          chat_messages?: number
          concurrent_viewers?: number
          id?: string
          new_followers?: number
          recorded_at?: string
          stream_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stream_analytics_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_chat_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          message_type: string
          playback_id: string
          sticker_item_id: string | null
          sticker_name: string | null
          sticker_url: string | null
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          message_type?: string
          playback_id: string
          sticker_item_id?: string | null
          sticker_name?: string | null
          sticker_url?: string | null
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          message_type?: string
          playback_id?: string
          sticker_item_id?: string | null
          sticker_name?: string | null
          sticker_url?: string | null
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "stream_chat_messages_sticker_item_id_fkey"
            columns: ["sticker_item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_keys: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          stream_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          stream_key?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          stream_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      streamer_applications: {
        Row: {
          admin_notes: string | null
          content_type: string
          created_at: string | null
          display_name: string
          email: string
          id: string
          motivation: string | null
          platform_links: string[]
          reviewed_at: string | null
          reviewed_by: string | null
          schedule_description: string | null
          social_links: Json | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          content_type: string
          created_at?: string | null
          display_name: string
          email: string
          id?: string
          motivation?: string | null
          platform_links?: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          schedule_description?: string | null
          social_links?: Json | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          content_type?: string
          created_at?: string | null
          display_name?: string
          email?: string
          id?: string
          motivation?: string | null
          platform_links?: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          schedule_description?: string | null
          social_links?: Json | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      streamer_profiles: {
        Row: {
          avatar_url: string | null
          banner_url: string | null
          bio: string | null
          categories: string[] | null
          created_at: string
          display_name: string | null
          id: string
          is_verified: boolean
          payout_wallet_address: string | null
          playlist_ids: string[] | null
          preferred_currency: string | null
          schedule: Json | null
          social_discord: string | null
          social_instagram: string | null
          social_tiktok: string | null
          social_twitter: string | null
          social_youtube: string | null
          sol_wallet_address: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          categories?: string[] | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_verified?: boolean
          payout_wallet_address?: string | null
          playlist_ids?: string[] | null
          preferred_currency?: string | null
          schedule?: Json | null
          social_discord?: string | null
          social_instagram?: string | null
          social_tiktok?: string | null
          social_twitter?: string | null
          social_youtube?: string | null
          sol_wallet_address?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          categories?: string[] | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_verified?: boolean
          payout_wallet_address?: string | null
          playlist_ids?: string[] | null
          preferred_currency?: string | null
          schedule?: Json | null
          social_discord?: string | null
          social_instagram?: string | null
          social_tiktok?: string | null
          social_twitter?: string | null
          social_youtube?: string | null
          sol_wallet_address?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      streams: {
        Row: {
          category: string | null
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          is_live: boolean
          peak_viewers: number
          started_at: string
          stream_key_id: string | null
          thumbnail_url: string | null
          title: string
          total_views: number
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          is_live?: boolean
          peak_viewers?: number
          started_at?: string
          stream_key_id?: string | null
          thumbnail_url?: string | null
          title?: string
          total_views?: number
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          is_live?: boolean
          peak_viewers?: number
          started_at?: string
          stream_key_id?: string | null
          thumbnail_url?: string | null
          title?: string
          total_views?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "streams_stream_key_id_fkey"
            columns: ["stream_key_id"]
            isOneToOne: false
            referencedRelation: "stream_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonials: {
        Row: {
          avatar_url: string | null
          content: string
          created_at: string
          created_by: string | null
          display_order: number
          handle: string
          id: string
          is_active: boolean
          likes: number
          retweets: number
          tweet_url: string | null
          updated_at: string
          username: string
          verified: boolean
        }
        Insert: {
          avatar_url?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          display_order?: number
          handle: string
          id?: string
          is_active?: boolean
          likes?: number
          retweets?: number
          tweet_url?: string | null
          updated_at?: string
          username: string
          verified?: boolean
        }
        Update: {
          avatar_url?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          display_order?: number
          handle?: string
          id?: string
          is_active?: boolean
          likes?: number
          retweets?: number
          tweet_url?: string | null
          updated_at?: string
          username?: string
          verified?: boolean
        }
        Relationships: []
      }
      user_nonces: {
        Row: {
          nonce: number
          updated_at: string
          user_address: string
        }
        Insert: {
          nonce?: number
          updated_at?: string
          user_address: string
        }
        Update: {
          nonce?: number
          updated_at?: string
          user_address?: string
        }
        Relationships: []
      }
      user_playlists: {
        Row: {
          cover_image_url: string | null
          created_at: string | null
          description: string | null
          id: string
          is_public: boolean | null
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          banner_url: string | null
          bio: string | null
          categories: string[] | null
          created_at: string | null
          display_name: string | null
          id: string
          is_collector: boolean | null
          is_creator: boolean | null
          is_private: boolean
          is_streamer: boolean | null
          is_verified: boolean | null
          payout_wallet_address: string | null
          playlist_ids: string[] | null
          profile_setup_completed: boolean | null
          referred_by: string | null
          schedule: Json | null
          social_discord: string | null
          social_instagram: string | null
          social_tiktok: string | null
          social_twitter: string | null
          social_youtube: string | null
          updated_at: string | null
          user_id: string | null
          wallet_address: string
        }
        Insert: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          categories?: string[] | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_collector?: boolean | null
          is_creator?: boolean | null
          is_private?: boolean
          is_streamer?: boolean | null
          is_verified?: boolean | null
          payout_wallet_address?: string | null
          playlist_ids?: string[] | null
          profile_setup_completed?: boolean | null
          referred_by?: string | null
          schedule?: Json | null
          social_discord?: string | null
          social_instagram?: string | null
          social_tiktok?: string | null
          social_twitter?: string | null
          social_youtube?: string | null
          updated_at?: string | null
          user_id?: string | null
          wallet_address: string
        }
        Update: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          categories?: string[] | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_collector?: boolean | null
          is_creator?: boolean | null
          is_private?: boolean
          is_streamer?: boolean | null
          is_verified?: boolean | null
          payout_wallet_address?: string | null
          playlist_ids?: string[] | null
          profile_setup_completed?: boolean | null
          referred_by?: string | null
          schedule?: Json | null
          social_discord?: string | null
          social_instagram?: string | null
          social_tiktok?: string | null
          social_twitter?: string | null
          social_youtube?: string | null
          updated_at?: string | null
          user_id?: string | null
          wallet_address?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      volume_rewards: {
        Row: {
          claim_tx_hash: string | null
          claimed_at: string | null
          created_at: string
          id: string
          is_claimed: boolean
          rank: number
          reward_amount: number
          reward_period_end: string
          reward_period_start: string
          updated_at: string
          user_id: string
          weighted_volume: number
        }
        Insert: {
          claim_tx_hash?: string | null
          claimed_at?: string | null
          created_at?: string
          id?: string
          is_claimed?: boolean
          rank: number
          reward_amount?: number
          reward_period_end: string
          reward_period_start: string
          updated_at?: string
          user_id: string
          weighted_volume?: number
        }
        Update: {
          claim_tx_hash?: string | null
          claimed_at?: string | null
          created_at?: string
          id?: string
          is_claimed?: boolean
          rank?: number
          reward_amount?: number
          reward_period_end?: string
          reward_period_start?: string
          updated_at?: string
          user_id?: string
          weighted_volume?: number
        }
        Relationships: []
      }
      volume_tracking: {
        Row: {
          collection_id: string | null
          created_at: string
          id: string
          period_end: string
          period_start: string
          source_type: string
          tx_hash: string | null
          user_id: string | null
          volume_amount: number
          weight: number
          weighted_volume: number
        }
        Insert: {
          collection_id?: string | null
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          source_type: string
          tx_hash?: string | null
          user_id?: string | null
          volume_amount?: number
          weight?: number
          weighted_volume?: number
        }
        Update: {
          collection_id?: string | null
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          source_type?: string
          tx_hash?: string | null
          user_id?: string | null
          volume_amount?: number
          weight?: number
          weighted_volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "volume_tracking_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      waitroom_messages: {
        Row: {
          avatar_url: string | null
          content: string
          created_at: string
          display_name: string | null
          id: string
          user_id: string
          wallet_address: string
        }
        Insert: {
          avatar_url?: string | null
          content: string
          created_at?: string
          display_name?: string | null
          id?: string
          user_id: string
          wallet_address: string
        }
        Update: {
          avatar_url?: string | null
          content?: string
          created_at?: string
          display_name?: string | null
          id?: string
          user_id?: string
          wallet_address?: string
        }
        Relationships: []
      }
    }
    Views: {
      streamer_profiles_public: {
        Row: {
          avatar_url: string | null
          banner_url: string | null
          bio: string | null
          categories: string[] | null
          created_at: string | null
          display_name: string | null
          id: string | null
          is_verified: boolean | null
          playlist_ids: string[] | null
          preferred_currency: string | null
          schedule: Json | null
          social_discord: string | null
          social_instagram: string | null
          social_tiktok: string | null
          social_twitter: string | null
          social_youtube: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          categories?: string[] | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          is_verified?: boolean | null
          playlist_ids?: string[] | null
          preferred_currency?: string | null
          schedule?: Json | null
          social_discord?: string | null
          social_instagram?: string | null
          social_tiktok?: string | null
          social_twitter?: string | null
          social_youtube?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          categories?: string[] | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          is_verified?: boolean | null
          playlist_ids?: string[] | null
          preferred_currency?: string | null
          schedule?: Json | null
          social_discord?: string | null
          social_instagram?: string | null
          social_tiktok?: string | null
          social_twitter?: string | null
          social_youtube?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_launchpad_stats: { Args: never; Returns: Json }
      get_platform_stats: { Args: never; Returns: Json }
      get_profile_id_by_wallet: {
        Args: { wallet_addr: string }
        Returns: string
      }
      get_top_collections_stats: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_user_banned: { Args: { _user_id: string }; Returns: boolean }
      promote_to_creator: {
        Args: { p_admin_id: string; p_application_id: string }
        Returns: undefined
      }
      wallet_owns_profile: {
        Args: { profile_uuid: string; wallet_addr: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      moderation_content_type:
        | "text"
        | "image"
        | "collection_name"
        | "collection_description"
        | "trait_name"
        | "comment"
      moderation_reason:
        | "nsfw"
        | "violence"
        | "hate_speech"
        | "spam"
        | "harassment"
        | "illegal"
        | "other"
        | "clean"
      moderation_status:
        | "pending"
        | "approved"
        | "rejected"
        | "auto_rejected"
        | "auto_approved"
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
      app_role: ["admin", "moderator", "user"],
      moderation_content_type: [
        "text",
        "image",
        "collection_name",
        "collection_description",
        "trait_name",
        "comment",
      ],
      moderation_reason: [
        "nsfw",
        "violence",
        "hate_speech",
        "spam",
        "harassment",
        "illegal",
        "other",
        "clean",
      ],
      moderation_status: [
        "pending",
        "approved",
        "rejected",
        "auto_rejected",
        "auto_approved",
      ],
    },
  },
} as const
