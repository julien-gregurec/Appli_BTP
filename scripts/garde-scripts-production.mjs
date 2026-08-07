// Garde-fou programmatique pour les scripts SQL de recette de supabase/production/.
//
// Ces scripts créent ou modifient des données de démonstration/recette (entreprises
// fictives, jeux de données de plusieurs mois) ou suppriment des sociétés de test.
// Ils n'ont, par construction, aucun moyen fiable de savoir sur quel projet Supabase
// ils sont réellement exécutés une fois collés dans un éditeur SQL : un commentaire
// en tête de fichier ne protège personne. Ce module fournit donc une vérification
// programmatique, côté exécution Node, avant de laisser passer le SQL vers la base.
//
// Toutes les fonctions ici sont pures (aucun accès réseau, aucune écriture) afin de
// rester testables sans jamais toucher à Supabase — voir garde-scripts-production.test.mjs.

export const REF_PREVIEW_AUTORISEE = "pgvvpqyjziyapbbkydmc"; // ELSATIA PREVIEW ONLY

/**
 * Registre exhaustif des scripts de recette autorisés à passer par le garde-fou.
 * Toute cible absente de cette liste est refusée d'office : ceci empêche aussi bien
 * une faute de frappe qu'une tentative de cibler un fichier arbitraire du dépôt.
 */
export const REGISTRE_SCRIPTS = Object.freeze({
  "creer_entreprise_demo_18_mois.sql": { destructif: false },
  "seed_entreprise_test_5_ans.sql": { destructif: false },
  "seed_entreprise_test_suivi_terrain.sql": { destructif: false },
  "seed_entreprise_test_tous_onglets.sql": { destructif: false },
  "seed_juju_6_mois.sql": { destructif: false },
  "corriger_encodage_juju.sql": { destructif: false },
  "supprimer_entreprises_test.sql": { destructif: true, cleConfirmation: "CONFIRM_DELETE_TEST_DATA", valeurAttendue: "YES" },
});

function extraireRefDepuisUrl(url) {
  if (!url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const correspondance = /^([a-z0-9]+)\.supabase\.co$/.exec(parsed.hostname);
  return correspondance ? correspondance[1] : null;
}

/**
 * Vérifie que l'environnement d'exécution pointe sans ambiguïté vers le projet
 * Preview autorisé, jamais vers une autre cible (y compris une future Production
 * dont la référence n'est pas encore connue au moment où ce module est écrit).
 * Deux sources indépendantes doivent concorder : la variable dédiée
 * SUPABASE_PROJECT_REF et l'hôte réel de NEXT_PUBLIC_SUPABASE_URL.
 */
export function verifierCiblePreview(environnement = {}) {
  const refDeclaree = environnement.SUPABASE_PROJECT_REF;
  const refDepuisUrl = extraireRefDepuisUrl(environnement.NEXT_PUBLIC_SUPABASE_URL);

  if (!refDeclaree) {
    return { autorise: false, motif: "SUPABASE_PROJECT_REF absente : cible non identifiable." };
  }
  if (!refDepuisUrl) {
    return { autorise: false, motif: "NEXT_PUBLIC_SUPABASE_URL absente ou de forme inattendue : cible non identifiable." };
  }
  if (refDeclaree !== refDepuisUrl) {
    return { autorise: false, motif: `Incohérence entre SUPABASE_PROJECT_REF (${refDeclaree}) et NEXT_PUBLIC_SUPABASE_URL (${refDepuisUrl}).` };
  }
  if (refDeclaree !== REF_PREVIEW_AUTORISEE) {
    return { autorise: false, motif: `Cible refusée (${refDeclaree}) : seule la référence Preview ${REF_PREVIEW_AUTORISEE} est autorisée. Toute autre cible, y compris une future Production, est refusée par défaut.` };
  }
  return { autorise: true, ref: refDeclaree };
}

/**
 * Vérifie que la référence de projet réellement liée par la CLI Supabase
 * (celle que `supabase db query --linked` ciblera concrètement, indépendamment
 * des variables d'environnement de l'application) est bien la Preview autorisée.
 * Défense en profondeur : les variables d'environnement et le lien CLI sont deux
 * mécanismes distincts qui doivent concorder tous les deux.
 */
export function verifierRefLieeCli(refLiee) {
  if (!refLiee) {
    return { autorise: false, motif: "Aucun projet Supabase lié via la CLI (supabase/.temp/project-ref introuvable ou vide) : cible non identifiable." };
  }
  if (refLiee.trim() !== REF_PREVIEW_AUTORISEE) {
    return { autorise: false, motif: `Le projet lié par la CLI Supabase (${refLiee.trim()}) n'est pas la Preview autorisée (${REF_PREVIEW_AUTORISEE}).` };
  }
  return { autorise: true, ref: refLiee.trim() };
}

/** Vérifie qu'un nom de script demandé fait bien partie du registre autorisé. */
export function verifierScriptConnu(nomFichier) {
  const entree = REGISTRE_SCRIPTS[nomFichier];
  if (!entree) {
    return { autorise: false, motif: `Script inconnu du registre : ${nomFichier}. Aucun script hors de cette liste explicite n'est exécutable via ce garde-fou.` };
  }
  return { autorise: true, entree };
}

/**
 * Pour les scripts destructifs, exige une confirmation explicite et dédiée,
 * distincte du simple ciblage Preview. Aucune valeur par défaut permissive :
 * l'absence de la variable de confirmation est un refus, jamais une autorisation.
 */
export function verifierConfirmationDestructive(environnement = {}, entreeRegistre) {
  if (!entreeRegistre.destructif) return { autorise: true };
  const { cleConfirmation, valeurAttendue } = entreeRegistre;
  const valeurFournie = environnement[cleConfirmation];
  if (valeurFournie !== valeurAttendue) {
    return {
      autorise: false,
      motif: `Script destructif : confirmation explicite requise via ${cleConfirmation}=${valeurAttendue}. ${valeurFournie === undefined ? "Variable absente." : "Valeur fournie incorrecte."}`,
    };
  }
  return { autorise: true };
}

/**
 * Vérification complète pour un script donné : registre, cible (variables d'env
 * ET, si fournie, référence liée par la CLI), puis confirmation destructive si
 * applicable. Ne fait toujours aucune connexion réseau.
 */
export function verifierAutorisationComplete(nomFichier, environnement = {}, refLieeCli = undefined) {
  const registre = verifierScriptConnu(nomFichier);
  if (!registre.autorise) return registre;

  const cible = verifierCiblePreview(environnement);
  if (!cible.autorise) return cible;

  if (refLieeCli !== undefined) {
    const cibleCli = verifierRefLieeCli(refLieeCli);
    if (!cibleCli.autorise) return cibleCli;
  }

  const confirmation = verifierConfirmationDestructive(environnement, registre.entree);
  if (!confirmation.autorise) return confirmation;

  return { autorise: true, ref: cible.ref, destructif: registre.entree.destructif };
}
