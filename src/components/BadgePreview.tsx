import { devisV2Actif } from "@/lib/devis/v2-serveur";
import { planningV2Actif } from "@/lib/planning/v2-serveur";

/**
 * Indicateur discret d'environnement de PREVIEW (GP V1). Rendu uniquement si la variable
 * `NEXT_PUBLIC_GP_PREVIEW_BADGE` vaut « 1 » (posée sur l'environnement Preview seulement, jamais en
 * Production). Il affiche l'état RÉEL des drapeaux tels que le serveur les lit : c'est la preuve
 * runtime que Devis V2 et Planning V2 sont actifs sur cet environnement.
 */
export function BadgePreview() {
  if (process.env.NEXT_PUBLIC_GP_PREVIEW_BADGE !== "1") return null;
  const devis = devisV2Actif();
  const planning = planningV2Actif();
  return (
    <div
      role="status"
      aria-label="Environnement de preview GP V1"
      data-testid="badge-preview"
      data-devis-v2={devis ? "1" : "0"}
      data-planning-v2={planning ? "1" : "0"}
      className="pointer-events-none fixed bottom-2 left-2 z-[60] rounded-md border border-amber-400 bg-amber-50/95 px-2 py-1 font-mono text-[11px] leading-tight text-amber-900 shadow print:hidden"
    >
      GP V1 PREVIEW · Devis V2 {devis ? "actif" : "INACTIF"} · Planning V2 {planning ? "actif" : "INACTIF"}
    </div>
  );
}
