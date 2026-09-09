"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LIBELLES_ETAT,
  estEnSuspens,
  peutAnnuler,
  peutReessayer,
  type MutationLocale,
} from "@/lib/mobile/offline/contrat";
import { changerEtat, lireMutations, ouvrirBase } from "@/lib/mobile/offline/base-locale";
import { viderLaFile } from "@/lib/mobile/offline/synchronisation";

const LIBELLES_TYPE: Record<string, string> = {
  pointage_arrivee: "Pointage — arrivée",
  pointage_depart: "Pointage — départ",
  note_frais_brouillon: "Note de frais (brouillon)",
};

const COULEURS: Record<string, string> = {
  en_attente: "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
  en_cours: "bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200",
  synchronise: "bg-green-100 text-green-900 dark:bg-green-950/60 dark:text-green-200",
  echec: "bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-200",
  conflit: "bg-amber-100 text-amber-950 dark:bg-amber-950/60 dark:text-amber-200",
  annule: "bg-neutral-100 text-neutral-500 dark:bg-neutral-900 dark:text-neutral-500",
};

const quand = (ms: number) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(new Date(ms));

/**
 * État visible de la file hors-ligne.
 *
 * Ce composant existe parce qu'une file INVISIBLE est pire que pas de file du tout. Un
 * salarié qui a pointé son arrivée dans un sous-sol veut savoir si c'est parti. Sans réponse,
 * il repointe — et se retrouve avec deux arrivées, ou avec la conviction que l'application
 * ne marche pas.
 *
 * Trois choix d'affichage méritent d'être expliqués :
 *
 * — **Rien ne s'affiche quand la file est vide.** Un bandeau permanent « 0 en attente » est
 *   du bruit, et le bruit finit par masquer le signal.
 * — **Le rejeu est un bouton, jamais une boucle.** Une mutation en échec attend un geste. Un
 *   réessai automatique sur un refus métier (permission révoquée, chantier clos) tournerait
 *   indéfiniment sans jamais aboutir.
 * — **Un conflit ne propose pas « Réessayer », seulement « Abandonner ».** L'état serveur a
 *   changé ; rejouer ne le résoudra pas. Proposer un bouton qui ne peut pas fonctionner est
 *   une promesse qu'on ne tient pas.
 */
export function FileHorsLigne({ entrepriseId, utilisateurId }: { entrepriseId: string; utilisateurId: string }) {
  const [mutations, setMutations] = useState<MutationLocale[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  const identite = { entrepriseId, utilisateurId };

  const relire = useCallback(async () => {
    const base = await ouvrirBase(identite);
    if (!base) return;
    try {
      setMutations(await lireMutations(base));
    } finally {
      base.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identité stable pour une session
  }, [entrepriseId, utilisateurId]);

  /**
   * Vidange AUTOMATIQUE — au montage et au retour du réseau.
   *
   * Ne touche pas à `envoiEnCours` : un indicateur d'envoi qui s'allume tout seul à
   * l'ouverture fait croire à un travail en cours alors qu'il n'y a peut-être rien à
   * transmettre. Le voyant est réservé au geste explicite.
   *
   * Techniquement, c'est aussi ce qui permet à l'effet de ne poser aucun état de façon
   * synchrone : tout ce qui suit est derrière un `await`.
   */
  const synchroniserSilencieusement = useCallback(async () => {
    await viderLaFile(identite);
    await relire();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identité stable pour une session
  }, [entrepriseId, utilisateurId, relire]);

  /** Vidange DEMANDÉE par l'utilisateur : elle, montre son avancement. */
  const synchroniser = useCallback(async () => {
    setEnvoiEnCours(true);
    try {
      await synchroniserSilencieusement();
    } finally {
      setEnvoiEnCours(false);
    }
  }, [synchroniserSilencieusement]);

  useEffect(() => {
    // À l'ouverture ET au retour du réseau — jamais en tâche de fond : `Background Sync`
    // n'existe pas sur iOS, et deux salariés de la même équipe doivent vivre la même règle.
    void synchroniserSilencieusement();
    const auRetour = () => { void synchroniserSilencieusement(); };
    window.addEventListener("online", auRetour);
    return () => window.removeEventListener("online", auRetour);
  }, [synchroniserSilencieusement]);

  const enSuspens = mutations.filter((m) => estEnSuspens(m.etat));
  const enConflit = enSuspens.filter((m) => m.etat === "conflit").length;
  const enEchec = enSuspens.filter((m) => m.etat === "echec").length;

  // File vide : on n'affiche rien. Voir la note de tête.
  if (enSuspens.length === 0) return null;

  const aArbitrer = enConflit + enEchec > 0;

  async function agir(id: string, etat: "en_attente" | "annule") {
    const base = await ouvrirBase(identite);
    if (!base) return;
    try {
      await changerEtat(base, id, etat);
    } finally {
      base.close();
    }
    await relire();
    if (etat === "en_attente") await synchroniser();
  }

  return (
    <section className="mx-4 my-3 rounded-lg border md:mx-0" aria-label="Saisies en attente d’envoi">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left text-sm ${
          aArbitrer ? "bg-amber-50 dark:bg-amber-950/30" : ""
        }`}
      >
        <span>
          <strong>{enSuspens.length}</strong> saisie{enSuspens.length > 1 ? "s" : ""} en attente d’envoi
          {aArbitrer && (
            <span className="block text-xs text-amber-900 dark:text-amber-300">
              {enConflit > 0 && `${enConflit} à arbitrer`}
              {enConflit > 0 && enEchec > 0 && " · "}
              {enEchec > 0 && `${enEchec} à renvoyer`}
            </span>
          )}
        </span>
        <span aria-hidden="true" className="text-neutral-500">{ouvert ? "▴" : "▾"}</span>
      </button>

      {ouvert && (
        <div className="border-t">
          <ul className="divide-y">
            {mutations.map((mutation) => (
              <li key={mutation.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{LIBELLES_TYPE[mutation.type] ?? mutation.type}</span>
                  <span className="block text-xs text-neutral-500">Saisi le {quand(mutation.capteA)}</span>
                  {mutation.motif && (
                    <span className="mt-1 block text-xs text-amber-900 dark:text-amber-300">{mutation.motif}</span>
                  )}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${COULEURS[mutation.etat] ?? ""}`}>
                  {LIBELLES_ETAT[mutation.etat]}
                </span>
                {peutReessayer(mutation.etat) && (
                  <button
                    type="button"
                    onClick={() => void agir(mutation.id, "en_attente")}
                    className="min-h-[44px] rounded-md border px-3 text-xs font-medium"
                  >
                    Renvoyer
                  </button>
                )}
                {peutAnnuler(mutation.etat) && (
                  <button
                    type="button"
                    onClick={() => void agir(mutation.id, "annule")}
                    className="min-h-[44px] rounded-md px-3 text-xs text-neutral-500 underline"
                  >
                    Abandonner
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="border-t px-4 py-3">
            <button
              type="button"
              disabled={envoiEnCours}
              onClick={() => void synchroniser()}
              className="min-h-[44px] w-full rounded-md bg-[#0d1b2a] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {envoiEnCours ? "Envoi en cours…" : "Tout envoyer maintenant"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
