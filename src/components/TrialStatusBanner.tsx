import Link from "next/link";
import { ctaAbonnementVisible, type NiveauEssai, type StatutEssai } from "@/lib/essai-statut";

/**
 * Statut de la période d'essai — composant CENTRAL (bandeau d'application, carte du tableau de bord).
 * Ne calcule rien : reçoit `statutEssai(...)` résolu côté serveur depuis le contexte entreprise
 * (source de vérité, fuseau et niveaux documentés dans `src/lib/essai-statut.ts`).
 *
 * - `bandeau` : barre pleine largeur sous l'en-tête, réservée à J-7 et moins et à l'expiration
 *   (jamais de modale bloquante avant l'expiration) ;
 * - `carte` : encart du tableau de bord, visible pendant tout l'essai (discret au-delà de J-7).
 * Le bouton d'abonnement (parcours `/abonnement` existant) n'est proposé qu'aux profils qui peuvent
 * souscrire ; un employé voit l'information sans être renvoyé vers une page qu'il ne gère pas.
 */
const STYLE: Record<NiveauEssai, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100",
  avertissement: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
  renforce: "border-orange-400 bg-orange-50 text-orange-950 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100",
  fort: "border-red-400 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100",
  expire: "border-red-500 bg-red-100 text-red-950 dark:border-red-700 dark:bg-red-950/60 dark:text-red-100",
};

export const LIBELLE_CTA_ABONNEMENT = "Choisir mon abonnement";

export function TrialStatusBanner({ statut, peutSouscrire, variante }: { statut: StatutEssai; peutSouscrire: boolean; variante: "bandeau" | "carte" }) {
  if (statut.etat !== "essai" && statut.etat !== "expire") return null;
  if (variante === "bandeau" && !statut.bandeau) return null;
  const cta = ctaAbonnementVisible(statut, peutSouscrire);
  const urgent = statut.niveau === "fort" || statut.niveau === "expire";
  const cadre = variante === "bandeau" ? "border-b px-4 py-3" : "rounded-md border px-4 py-3";
  return (
    <div
      role={urgent ? "alert" : "status"}
      data-testid={`essai-${variante}`}
      data-niveau={statut.niveau}
      data-jours={statut.etat === "essai" ? statut.joursRestants : "expire"}
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm ${cadre} ${STYLE[statut.niveau]}`}
    >
      <div className="min-w-0">
        <p className="font-semibold">{statut.titre}</p>
        <p className="text-[13px] opacity-90">{statut.detail}</p>
      </div>
      {cta && (
        <Link href="/abonnement" className="inline-flex min-h-9 shrink-0 items-center rounded-md bg-neutral-900 px-3 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
          {LIBELLE_CTA_ABONNEMENT}
        </Link>
      )}
      {!cta && statut.etat === "expire" && (
        <span className="text-[13px] opacity-90">Contactez votre administrateur pour choisir une offre.</span>
      )}
    </div>
  );
}
