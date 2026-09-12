import type {
  ProjectAsset,
  StudioTimeline,
  StudioTimelineClip,
  TimelineDraft,
  TimelineDocument,
  ProjectList,
  DashboardStats,
  ProjectInput,
} from "@elsatia/studio-domain";
import type {
  StudioProject,
  StudioMediaAsset,
  MediaLimits,
} from "./media-contract";
import type {
  StudioWorkspace,
  StudioWorkspaceMember,
} from "@elsatia/studio-domain";
// Deliberately restricted schema: Studio cannot type-check queries to Gestion Pro tables.
type Table<Row> = {
  Row: { [Key in keyof Row]: Row[Key] };
  Insert: never;
  Update: never;
  Relationships: [];
};
export type Database = {
  public: {
    Tables: {
      studio_timelines: Table<StudioTimeline>;
      studio_timeline_clips: Table<StudioTimelineClip>;
      studio_projects: Table<StudioProject>;
      studio_project_assets: Table<ProjectAsset>;
      studio_media_assets: Table<StudioMediaAsset>;
      studio_media_limits: Table<MediaLimits>;
      studio_workspaces: Table<StudioWorkspace>;
      studio_workspace_members: Table<StudioWorkspaceMember>;
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Functions: {
      studio_get_timeline: {
        Args: { p_project: string; p_timeline: string };
        Returns: TimelineDocument | null;
      };
      studio_save_timeline: {
        Args: {
          p_project: string;
          p_timeline: string | null;
          p_revision: number | null;
          p_project_revision: number;
          p_draft: TimelineDraft;
        };
        Returns: string;
      };
      studio_activate_timeline: {
        Args: { p_project: string; p_timeline: string };
        Returns: undefined;
      };
      studio_delete_timeline: {
        Args: { p_project: string; p_timeline: string };
        Returns: undefined;
      };
      studio_project_media_stats: {
        Args: { p_project: string };
        Returns: { photos: number; videos: number; bytes: number };
      };
      studio_save_project: {
        Args: {
          p_workspace: string;
          p_project: string | null;
          p_data: ProjectInput;
          p_revision: number | null;
        };
        Returns: string;
      };
      studio_project_lifecycle: {
        Args: { p_project: string; p_action: string };
        Returns: undefined;
      };
      studio_duplicate_project: {
        Args: { p_project: string };
        Returns: string;
      };
      studio_set_project_cover: {
        Args: { p_project: string; p_asset: string | null };
        Returns: undefined;
      };
      studio_remove_project_media: {
        Args: { p_project: string; p_asset: string };
        Returns: undefined;
      };
      studio_order_project_media: {
        Args: {
          p_project: string;
          p_ids: string[];
          p_chronological: boolean;
          p_revision: number;
        };
        Returns: undefined;
      };
      studio_list_project_media: {
        Args: { p_project: string; p_offset?: number; p_limit?: number };
        Returns: StudioMediaAsset[];
      };
      studio_project_summaries: {
        Args: {
          p_workspace: string;
          p_query?: string;
          p_type?: string;
          p_status?: string;
          p_since?: string | null;
          p_sort?: string;
          p_offset?: number;
        };
        Returns: ProjectList;
      };
      studio_dashboard_stats: {
        Args: { p_workspace: string };
        Returns: DashboardStats;
      };
      studio_create_project: {
        Args: { p_workspace: string; p_name: string; p_type: string };
        Returns: string;
      };
      studio_reserve_media: {
        Args: {
          p_project: string;
          p_request: string;
          p_name: string;
          p_mime: string;
          p_bytes: number;
        };
        Returns: string;
      };
      studio_delete_media: { Args: { p_asset: string }; Returns: undefined };
      studio_create_workspace: {
        Args: { p_name: string; p_type: string };
        Returns: string;
      };
      studio_my_role: {
        Args: { p_workspace_id: string };
        Returns: string | null;
      };
      studio_rename_workspace: {
        Args: { p_workspace_id: string; p_name: string };
        Returns: undefined;
      };
      studio_archive_workspace: {
        Args: { p_workspace_id: string };
        Returns: undefined;
      };
      studio_set_member: {
        Args: {
          p_workspace_id: string;
          p_user_id: string;
          p_role: string | null;
        };
        Returns: undefined;
      };
    };
  };
};
