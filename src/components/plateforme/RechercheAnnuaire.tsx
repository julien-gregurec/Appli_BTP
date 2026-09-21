"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Barre de recherche de l'annuaire plateforme.
 *
 * La saisie ne déclenche pas une requête par frappe : elle attend un silence
 * de `DELAI_MS` avant de naviguer. La navigation elle-même passe par le
 * routeur, ce qui annule la charge serveur précédente lorsqu'une nouvelle
 * saisie arrive — sans quoi une frappe rapide empilerait des rendus dont seul
 * le dernier compte.
 *
 * L'URL reste la source de vérité : elle porte la recherche, elle est
 * partageable, et le retour arrière rejoue exactement la même liste.
 */
const DELAI_MS = 350;

export function RechercheAnnuaire({
  valeurInitiale,
  base,
  parametres,
  champs,
  placeholder,
}: {
  valeurInitiale: string;
  /** Chemin de l'annuaire, sans requête. */
  base: string;
  /**
   * Paramètres de la requête courante SANS `q` ni `page`, déjà sérialisés par
   * le serveur. Le client se contente d'y insérer le terme : la grammaire de
   * l'URL reste définie à un seul endroit, côté domaine.
   */
  parametres: string;
  /** Champs réellement interrogés, affichés sous le champ. */
  champs: string;
  placeholder: string;
}) {
  const router = useRouter();
  const [terme, setTerme] = useState(valeurInitiale);
  const [termeDeLUrl, setTermeDeLUrl] = useState(valeurInitiale);
  const [enCours, demarrerTransition] = useTransition();

  // Une navigation extérieure (retour arrière, clic sur un onglet, effacement
  // des filtres) doit reprendre la main sur l'état local du champ. L'ajustement
  // se fait pendant le rendu, pas dans un effet : React réexécute simplement le
  // composant, sans passe de rendu supplémentaire ni scintillement.
  if (termeDeLUrl !== valeurInitiale) {
    setTermeDeLUrl(valeurInitiale);
    setTerme(valeurInitiale);
  }

  const construireUrl = useCallback(
    (valeur: string) => {
      const sp = new URLSearchParams(parametres);
      const nettoye = valeur.trim();
      if (nettoye) sp.set("q", nettoye);
      else sp.delete("q");
      const chaine = sp.toString();
      return chaine ? `${base}?${chaine}` : base;
    },
    [base, parametres],
  );

  useEffect(() => {
    // `termeDeLUrl` est la dernière valeur réellement portée par l'adresse :
    // tant que la saisie lui est identique, il n'y a rien à envoyer, et dès que
    // la navigation aboutit la comparaison redevient vraie d'elle-même.
    if (terme.trim() === termeDeLUrl.trim()) return;
    const minuteur = setTimeout(() => {
      demarrerTransition(() => router.replace(construireUrl(terme), { scroll: false }));
    }, DELAI_MS);
    return () => clearTimeout(minuteur);
  }, [terme, termeDeLUrl, construireUrl, router]);

  return (
    <div className="space-y-1">
      <label htmlFor="recherche-annuaire" className="sr-only">
        Rechercher une entreprise cliente
      </label>
      <div className="relative">
        <input
          id="recherche-annuaire"
          type="search"
          value={terme}
          onChange={(evenement) => setTerme(evenement.target.value)}
          onKeyDown={(evenement) => {
            if (evenement.key === "Enter") {
              evenement.preventDefault();
              demarrerTransition(() => router.replace(construireUrl(terme), { scroll: false }));
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 pr-24 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          aria-describedby="recherche-annuaire-champs"
        />
        <span
          aria-live="polite"
          className="absolute inset-y-0 right-3 flex items-center text-xs text-neutral-500"
        >
          {enCours ? "Recherche…" : ""}
        </span>
      </div>
      <p id="recherche-annuaire-champs" className="text-xs text-neutral-500">
        {champs}
      </p>
    </div>
  );
}
