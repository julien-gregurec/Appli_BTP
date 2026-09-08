/**
 * Posture d'assistance : STRICTE par défaut, et non négociable en Production.
 *
 * Ce module remplace l'interrupteur permissif de la première version, où l'absence de
 * `ELSATIA_ASSISTANCE_STRICTE` conservait « tous les droits ». La règle est inversée :
 * **tout ce qui n'est pas une demande explicite et valide de mode hérité donne le mode
 * strict.** Une variable absente, mal orthographiée, vide, ou renseignée avec une
 * valeur inconnue produit donc la posture la plus sûre — jamais la plus permissive.
 *
 * Le mode hérité subsiste pour une seule raison : pouvoir reproduire hors Production le
 * comportement d'une base où le contrat d'assistance n'est pas encore appliqué. Il exige
 * une activation explicite, il est **impossible en Production**, et il produit toujours
 * un avertissement de sécurité.
 */

export type RaisonModeAssistance =
  /** Variable absente : le défaut est strict. */
  | "defaut_absent"
  /** `1` / `true` : strict demandé explicitement. */
  | "demande_explicite"
  /** Valeur non reconnue : on retombe sur strict, avec un avertissement. */
  | "valeur_invalide"
  /** Mode hérité demandé en Production : refusé, strict imposé. */
  | "production_verrouillee"
  /** Mode hérité explicitement demandé, hors Production. */
  | "herite_explicite";

export type ModeAssistance = {
  strict: boolean;
  raison: RaisonModeAssistance;
  /** Message de sécurité à journaliser. `null` quand la posture est nominale. */
  avertissement: string | null;
};

export type EntreeModeAssistance = {
  /** Valeur brute de `ELSATIA_ASSISTANCE_STRICTE`, telle que lue dans l'environnement. */
  valeurBrute: string | undefined | null;
  /** Vrai dès que l'exécution a lieu sur un déploiement de Production. */
  production: boolean;
};

const VALEURS_STRICTES = new Set(["1", "true"]);
const VALEURS_HERITEES = new Set(["0", "false"]);

/**
 * Seules deux valeurs demandent le mode hérité, et seulement hors Production. Toute
 * autre entrée — y compris `""`, `"oui"`, `"no"`, `"strict"` — est traitée comme
 * invalide, donc stricte : refuser de deviner évite qu'une faute de frappe ouvre les
 * droits.
 */
export function resoudreModeAssistance(entree: EntreeModeAssistance): ModeAssistance {
  const valeur = (entree.valeurBrute ?? "").trim().toLowerCase();

  // Variable absente : strict, en Production comme ailleurs. C'est le cas le plus
  // fréquent, et c'est celui qui doit être le plus sûr.
  if (valeur === "") {
    return { strict: true, raison: "defaut_absent", avertissement: null };
  }
  if (VALEURS_STRICTES.has(valeur)) {
    return { strict: true, raison: "demande_explicite", avertissement: null };
  }
  if (VALEURS_HERITEES.has(valeur)) {
    if (entree.production) {
      return {
        strict: true,
        raison: "production_verrouillee",
        avertissement:
          "Tentative de désactivation du mode strict d’assistance en Production : " +
          "refusée. Le mode strict reste appliqué.",
      };
    }
    return {
      strict: false,
      raison: "herite_explicite",
      avertissement:
        "Mode d’assistance HÉRITÉ activé : une session support conserve tous les droits. " +
        "Réservé au diagnostic hors Production.",
    };
  }
  return {
    strict: true,
    raison: "valeur_invalide",
    avertissement:
      `Valeur ELSATIA_ASSISTANCE_STRICTE non reconnue (« ${entree.valeurBrute} ») : ` +
      "mode strict appliqué par défaut.",
  };
}

// ── Résolution des permissions ────────────────────────────────────────────────

export type EntreePermissionsAssistance = {
  /**
   * Réponse du contrat serveur : la liste exacte du périmètre, `null` s'il n'y a pas de
   * session d'assistance sur cette application et cette entreprise, `undefined` si le
   * contrat n'est pas encore appliqué en base.
   */
  perimetreServeur: readonly string[] | null | undefined;
  mode: ModeAssistance;
  /** Permissions de consultation du catalogue (`acces_*`, `voir_*`). */
  permissionsLectureSeule: readonly string[];
};

export type ResolutionPermissionsAssistance =
  /** Le contrat serveur a répondu : c'est lui qui fait autorité. */
  | { source: "contrat"; permissions: string[] }
  /** Contrat absent, mode strict : lecture seule. */
  | { source: "strict"; permissions: string[] }
  /**
   * Contrat absent, mode hérité explicitement autorisé hors Production.
   * `permissions: null` reprend la convention interne de Gestion Pro : « tous les droits ».
   */
  | { source: "herite"; permissions: null };

/**
 * Décide des permissions d'une session d'assistance dans Gestion Pro.
 *
 * L'ordre est délibéré : le contrat serveur d'abord — c'est la seule source qui connaît
 * le périmètre réellement choisi à l'ouverture. Ce n'est qu'en son absence que la
 * posture d'environnement tranche, et elle tranche par défaut dans le sens restrictif.
 */
export function resoudrePermissionsAssistance(
  entree: EntreePermissionsAssistance,
): ResolutionPermissionsAssistance {
  if (entree.perimetreServeur !== undefined) {
    return { source: "contrat", permissions: [...(entree.perimetreServeur ?? [])] };
  }
  if (entree.mode.strict) {
    return { source: "strict", permissions: [...entree.permissionsLectureSeule] };
  }
  return { source: "herite", permissions: null };
}

/**
 * Une permission de consultation ne donne jamais d'écriture : le filtre est explicite
 * plutôt que déduit d'une absence de préfixe `gerer_`, pour qu'une clé future mal
 * nommée ne se glisse pas dans la lecture seule.
 */
export function permissionsDeConsultation(catalogue: readonly string[]): string[] {
  return catalogue.filter((cle) => cle.startsWith("acces_") || cle.startsWith("voir_"));
}
