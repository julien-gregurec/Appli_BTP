import { quitterEntreprisePlateformeAction } from "@/app/actions/plateforme";
import { CompteARebours } from "@/components/CompteARebours";
import type { BandeauAssistance } from "@elsatia/platform-support-comms";

/**
 * Bandeau permanent « Session d'assistance ELSATIA » (§4).
 *
 * Il est affiché au client comme à l'opérateur : son texte ne contient donc QUE le
 * motif public. Il rappelle en permanence que l'identité réelle reste celle de
 * l'assistance — le §4 interdit toute usurpation silencieuse, et un bandeau discret
 * la rendrait de fait silencieuse.
 *
 * `bandeau` est nul quand le contrat d'assistance n'est pas encore en base : on
 * retombe alors sur l'ancien bandeau minimal, qui reste préférable à aucun bandeau.
 */
export function SupportAccessBanner({
  entrepriseNom,
  bandeau,
}: {
  entrepriseNom: string;
  bandeau?: BandeauAssistance | null;
}) {
  const debut = bandeau
    ? new Date(bandeau.debutIso).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <div className="min-w-0 space-y-0.5">
        <p className="font-semibold">
          Session d’assistance ELSATIA — {bandeau?.entrepriseNom || entrepriseNom}
        </p>
        {bandeau ? (
          <p className="text-xs">
            Application : <strong>{bandeau.applicationNom}</strong> · Motif : {bandeau.motif} ·
            Ouverte le {debut} · Intervenant : {bandeau.acteurEmail}
          </p>
        ) : (
          <p className="text-xs">
            Vous intervenez dans cette entreprise en tant qu’administrateur plateforme.
            Toutes vos actions sont journalisées à votre nom.
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {bandeau && (
          <CompteARebours
            expireIso={bandeau.expireIso}
            libelleInitial={bandeau.tempsRestantLibelle}
          />
        )}
        <form action={quitterEntreprisePlateformeAction}>
          <button className="rounded-md bg-amber-900 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800">
            {bandeau?.actionQuitter ?? "Quitter l’assistance"}
          </button>
        </form>
      </div>
    </div>
  );
}
