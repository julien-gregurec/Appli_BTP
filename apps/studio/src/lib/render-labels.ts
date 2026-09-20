/** User-facing French labels for render job states and worker error codes. */
export const renderStatusLabels: Record<string, string> = {
  queued: "En attente",
  preparing: "Préparation",
  rendering: "Rendu en cours",
  encoding: "Encodage",
  uploading: "Envoi",
  completed: "Terminé",
  failed: "Échec",
  cancelled: "Annulé",
};
export const renderErrorMessages: Record<string, string> = {
  ASSET_MISSING:
    "Un média du montage est introuvable. Vérifiez la médiathèque puis réessayez.",
  TIMELINE_INVALID:
    "Le montage n'est pas prêt à être rendu. Vérifiez ses durées puis réessayez.",
  RENDER_TIMEOUT:
    "Le rendu a pris trop de temps. Réessayez ; si cela se répète, raccourcissez le montage.",
  WORKER_LOST: "Le rendu a été interrompu. Relancez-le.",
  HEARTBEAT_LOST:
    "La connexion au service de rendu a été perdue. Relancez le rendu.",
  CANCELLED: "Le rendu a été annulé.",
  TEXT_UNSUPPORTED:
    "Un texte contient des caractères que la police ne sait pas dessiner (emoji, symboles rares). Modifiez-le puis relancez.",
  RESOURCE_LIMIT:
    "Les médias sont trop lourds pour être rendus. Utilisez des fichiers plus légers.",
};
const generic = "Le rendu a échoué. Vérifiez les médias puis réessayez.";
export function renderStatusLabel(status: string): string {
  return renderStatusLabels[status] ?? status;
}
export function renderErrorMessage(code: string | null): string {
  return (code && renderErrorMessages[code]) || generic;
}
export function renderProfileLabel(
  profile: string,
  width: number,
  height: number,
): string {
  return `${profile === "preview" ? "Aperçu" : "Vidéo finale"} ${width}×${height}`;
}
/** ASCII-only file name (letters, digits, dashes): safe in a Content-Disposition header. */
export function downloadFileName(
  projectName: string,
  width: number,
  height: number,
): string {
  const slug = projectName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .toLowerCase();
  return `${slug || "video"}-${width}x${height}.mp4`;
}
