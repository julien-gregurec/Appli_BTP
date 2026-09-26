export type { ProjectType, StudioProject } from "./projects";
export interface MediaLimits {
  id: boolean;
  image_bytes: number;
  video_bytes: number;
  project_bytes: number;
  workspace_bytes: number;
  project_assets: number;
  concurrency: number;
}
export interface StudioMediaAsset {
  id: string;
  sort_order?: number;
  workspace_id: string;
  project_id: string;
  uploaded_by: string;
  request_id: string;
  storage_provider: "supabase";
  storage_bucket: "studio-originals";
  storage_key: string;
  original_filename: string;
  mime_type: string;
  media_type: "image" | "video";
  file_size_bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  orientation: string | null;
  captured_at: string | null;
  metadata_json: Record<string, unknown>;
  upload_status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  purged_at: string | null;
  upload_expires_at: string;
  purge_after: string;
}
export const formats: Record<string, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "video/mp4": ["mp4"],
  "video/quicktime": ["mov"],
};
export function validateFile(
  name: string,
  mime: string,
  size: number,
  limits: Pick<MediaLimits, "image_bytes" | "video_bytes">,
) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (
    !name ||
    name.length > 255 ||
    /[\u0000-\u001f\u007f/\\]/.test(name) ||
    !formats[mime]?.includes(ext)
  )
    throw new Error(
      "Format refusé : JPG, PNG, WEBP, MP4 ou MOV H.264 uniquement.",
    );
  if (!Number.isSafeInteger(size) || size <= 0)
    throw new Error("Le fichier est vide ou sa taille est invalide.");
  if (
    size > (mime.startsWith("image/") ? limits.image_bytes : limits.video_bytes)
  )
    throw new Error("Le fichier dépasse la taille autorisée.");
}
export function writable(role: string) {
  return ["owner", "admin", "editor"].includes(role);
}
export function bytes(value: number) {
  return `${(value / 1024 / 1024).toFixed(1)} Mio`;
}
export interface UploadAuthorization {
  asset: StudioMediaAsset;
  token?: string;
  endpoint?: string;
  complete: boolean;
}
