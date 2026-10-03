// Garde globale contre la double soumission d'un formulaire pendant qu'une
// action serveur Next.js est en cours (recette métier GP, B29 : deux clics à
// une seconde d'intervalle sur un réseau lent créaient deux clients ; la quasi-
// totalité des formulaires ne désactivent pas leur bouton pendant l'envoi).
//
// Principe (repris de la branche de recette, durci pour V9.1) :
//   * une soumission (non GET) marque aussitôt le formulaire « en cours » et le
//     désigne « candidat » (Next encode la requête de façon asynchrone avant de
//     l'envoyer : le marquage immédiat ferme cette fenêtre) ;
//   * la prochaine requête fetch portant l'en-tête Next-Action (Next 16 : fetch
//     global, en-tête « next-action ») est rattachée au candidat, qui reste « en
//     cours » jusqu'à la réponse (succès OU erreur) ;
//   * pendant ce temps, toute nouvelle soumission de CE formulaire est ignorée ;
//     les autres formulaires restent libres ;
//   * aucun blocage permanent : libération à la réponse, à l'erreur réseau, après
//     DELAI_SECURITE_MS au plus, et au retour arrière (page restaurée du cache).
//   * un formulaire sans action serveur (navigation classique) n'est retenu que
//     DELAI_CANDIDAT_MS : le candidat expire s'il n'a déclenché aucune action.

export const DELAI_SECURITE_MS = 60_000;
export const DELAI_CANDIDAT_MS = 1_000;

type Minuteur = ReturnType<typeof setTimeout>;

export type FenetreGarde = {
  fetch: typeof fetch;
  document: Pick<Document, "addEventListener" | "removeEventListener">;
  addEventListener: Window["addEventListener"];
  removeEventListener: Window["removeEventListener"];
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
};

type FormulaireLike = { tagName?: string; method?: string; getAttribute?: (nom: string) => string | null };

function estFormulaire(cible: unknown): cible is FormulaireLike & object {
  return typeof cible === "object" && cible !== null && String((cible as FormulaireLike).tagName ?? "").toUpperCase() === "FORM";
}

function methode(formulaire: FormulaireLike): string {
  return String(formulaire.method ?? formulaire.getAttribute?.("method") ?? "get").toLowerCase();
}

export function estRequeteActionServeur(init?: RequestInit): boolean {
  const entetes = init?.headers;
  if (!entetes) return false;
  if (typeof Headers !== "undefined" && entetes instanceof Headers) return entetes.has("next-action");
  if (Array.isArray(entetes)) return entetes.some(([cle]) => String(cle).toLowerCase() === "next-action");
  return Object.keys(entetes).some((cle) => cle.toLowerCase() === "next-action");
}

export function installerGardeDoubleSoumission(fenetre: FenetreGarde): () => void {
  let enCours = new Map<object, Minuteur>();
  let candidat: { formulaire: object; minuteur: Minuteur } | null = null;
  // enCours : formulaire → minuteur de libération (candidat ou délai de sécurité).
  const fetchOriginal = fenetre.fetch;

  const liberer = (formulaire: object) => {
    const minuteur = enCours.get(formulaire);
    if (minuteur !== undefined) fenetre.clearTimeout(minuteur);
    enCours.delete(formulaire);
  };

  const fetchGarde = (async (...args: Parameters<typeof fetch>) => {
    let formulaire: object | null = null;
    if (candidat && estRequeteActionServeur(args[1])) {
      formulaire = candidat.formulaire;
      candidat = null;
      liberer(formulaire);
      const f = formulaire;
      enCours.set(f, fenetre.setTimeout(() => enCours.delete(f), DELAI_SECURITE_MS));
    }
    try {
      return await fetchOriginal(...args);
    } finally {
      if (formulaire) liberer(formulaire);
    }
  }) as typeof fetch;
  fenetre.fetch = fetchGarde;

  const surSoumission = (event: Event) => {
    const formulaire = event.target;
    if (!estFormulaire(formulaire) || methode(formulaire) === "get") return;
    if (enCours.has(formulaire)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    // Marquage immédiat ; expiration courte si aucune action serveur ne part.
    const minuteur = fenetre.setTimeout(() => {
      if (candidat?.formulaire === formulaire) candidat = null;
      if (enCours.get(formulaire) === minuteur) enCours.delete(formulaire);
    }, DELAI_CANDIDAT_MS);
    enCours.set(formulaire, minuteur);
    candidat = { formulaire, minuteur };
  };

  // Retour arrière vers une page restaurée du cache : aucun envoi n'y est plus en cours.
  const surRetour = (event: Event) => {
    if ((event as PageTransitionEvent).persisted) {
      for (const minuteur of enCours.values()) fenetre.clearTimeout(minuteur);
      enCours = new Map();
      candidat = null;
    }
  };

  fenetre.document.addEventListener("submit", surSoumission, true);
  fenetre.addEventListener("pageshow", surRetour);
  return () => {
    fenetre.document.removeEventListener("submit", surSoumission, true);
    fenetre.removeEventListener("pageshow", surRetour);
    if (fenetre.fetch === fetchGarde) fenetre.fetch = fetchOriginal;
    for (const minuteur of enCours.values()) fenetre.clearTimeout(minuteur);
    enCours = new Map();
    candidat = null;
  };
}
