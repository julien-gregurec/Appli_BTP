"use client";

import type { UpdateStatus } from "../lib/pwa/update-controller";

/*
 * Banniere « nouvelle version disponible » (lot PWA-UPDATE-UX).
 *
 * Presentation pure, SANS hook : aucune logique de service worker ici, uniquement l'affichage et
 * les deux actions. Ce choix la rend verifiable telle quelle par les tests Tools, qui tournent en
 * environnement `node` sans DOM ni moteur de rendu React.
 *
 * Elle ne bloque jamais l'application — pas d'overlay, pas de role de dialogue, pas de piege a
 * focus, pas de `focus()` automatique : l'utilisateur qui trace continue de tracer.
 *
 * Import relatif volontaire (pas d'alias `@/`) : ces memes tests n'ont pas de resolveur d'alias.
 */

export const UPDATE_BANNER_TEXT = "Une nouvelle version d’ELSATIA Tools est disponible.";
export const UPDATE_BANNER_APPLY_LABEL = "Mettre à jour";
export const UPDATE_BANNER_LATER_LABEL = "Plus tard";
export const UPDATE_BANNER_BUSY_LABEL = "Mise à jour…";
export const UPDATE_BANNER_APPLY_ARIA = "Mettre à jour ELSATIA Tools maintenant";
export const UPDATE_BANNER_LATER_ARIA = "Reporter la mise à jour d’ELSATIA Tools";

export type PwaUpdateBannerProps = {
  status: UpdateStatus;
  onApply: () => void;
  onLater: () => void;
};

export function isUpdateBannerVisible(status: UpdateStatus) {
  return status === "available" || status === "updating";
}

export function PwaUpdateBanner({ status, onApply, onLater }: PwaUpdateBannerProps) {
  if (!isUpdateBannerVisible(status)) return null;
  const updating = status === "updating";
  return (
    <div className="pwa-update" role="status" aria-live="polite">
      <p>{UPDATE_BANNER_TEXT}</p>
      <div className="pwa-update-actions">
        <button type="button" onClick={onApply} disabled={updating} aria-label={UPDATE_BANNER_APPLY_ARIA} aria-busy={updating || undefined}>
          {updating ? UPDATE_BANNER_BUSY_LABEL : UPDATE_BANNER_APPLY_LABEL}
        </button>
        <button type="button" onClick={onLater} disabled={updating} aria-label={UPDATE_BANNER_LATER_ARIA} className="ghost">
          {UPDATE_BANNER_LATER_LABEL}
        </button>
      </div>
    </div>
  );
}
