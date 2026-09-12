import type { TimelineDocument } from "./timeline";
import type { StudioMediaAsset } from "./media";
export type RenderStatus =
  | "queued"
  | "preparing"
  | "rendering"
  | "encoding"
  | "uploading"
  | "completed"
  | "failed"
  | "cancelled";
export interface StudioRenderJob {
  id: string;
  workspace_id: string;
  project_id: string;
  timeline_id: string;
  requested_by: string;
  status: RenderStatus;
  progress_percent: number;
  profile: "preview" | "standard";
  width: number;
  height: number;
  fps: 30;
  retry_count: number;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  snapshot: { timeline: TimelineDocument; assets: StudioMediaAsset[] };
  lease_token: string | null;
}
export interface StudioRenderOutput {
  id: string;
  workspace_id: string;
  project_id: string;
  timeline_id: string;
  render_job_id: string;
  storage_bucket: string;
  storage_key: string;
  file_size_bytes: number;
  width: number;
  height: number;
  duration_ms: number;
  codec_video: "h264";
  codec_audio: "aac";
  fps: 30;
  deleted_at: string | null;
}
