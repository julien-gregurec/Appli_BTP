import Link from "next/link";
import type { NiveauPreavisEssai } from "@/lib/acces-socle-essai";

// ELSATIA-GP-TRIAL-EXPIRY-P1-CLOSURE-V1 — préavis de fin d'essai et bandeau de
// sortie d'essai. Affichage purement local (aucun envoi, aucune notification
// poussée) : le contexte entreprise porte déjà la fenêtre d'essai.

const STYLE_PREAVIS: Record<NiveauPreavisEssai, string> = {
  info: "border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100",
  attention: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
  urgent: "border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100",
};

function libelleReste(joursRestants: number): string {
  if (joursRestants <= 0) return "se termine aujourd’hui";
  if (joursRestants === 1) return "se termine demain";
  return `se termine dans ${joursRestants} jours`;
}

/** Préavis affiché dès J-7, renforcé à J-3 puis J-1. */
export function EssaiPreavisBanner({
  joursRestants,
  niveau,
  finEssai,
  peutSouscrire,
}: {
  joursRestants: number;
  niveau: NiveauPreavisEssai;
  finEssai: string | null;
  peutSouscrire: boolean;
}) {
  const dateFin = finEssai ? new Date(`${finEssai}T00:00:00`).toLocaleDateString("fr-FR") : null;
  return (
    <div role="status" className={`border-b px-4 py-3 text-sm ${STYLE_PREAVIS[niveau]}`}>
      <strong>Votre essai gratuit {libelleReste(joursRestants)}{dateFin ? ` (${dateFin})` : ""}.</strong>{" "}
      Sans offre choisie, les fonctionnalités métier seront bloquées à la fin de l’essai. Vos données
      restent conservées, et l’export reste possible à tout moment depuis{" "}
      <Link href="/parametres/donnees" className="font-semibold underline">Mes données</Link>.
      {peutSouscrire && (
        <>
          {" "}
          <Link href="/abonnement" className="font-semibold underline">Choisir une offre</Link>.
        </>
      )}
    </div>
  );
}

/** Essai terminé : affiché sur les seules pages restées accessibles après J30. */
export function EssaiExpireBanner({ peutSouscrire }: { peutSouscrire: boolean }) {
  return (
    <div role="alert" className={`border-b px-4 py-3 text-sm ${STYLE_PREAVIS.urgent}`}>
      <strong>Votre essai gratuit est terminé.</strong> Les fonctionnalités métier sont bloquées, mais
      vos données sont conservées : vous pouvez toujours{" "}
      <Link href="/parametres/donnees" className="font-semibold underline">exporter vos données</Link>{" "}
      et <Link href="/aide" className="font-semibold underline">contacter le support</Link>.
      {peutSouscrire && (
        <>
          {" "}
          <Link href="/abonnement" className="font-semibold underline">Choisir une offre</Link> pour tout réactiver.
        </>
      )}
    </div>
  );
}
