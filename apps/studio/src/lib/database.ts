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
      studio_workspaces: Table<StudioWorkspace>;
      studio_workspace_members: Table<StudioWorkspaceMember>;
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Functions: {
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
