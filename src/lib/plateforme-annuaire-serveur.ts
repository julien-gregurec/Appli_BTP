/**
 * Accès aux données de l'annuaire plateforme.
 *
 * Deux chemins, choisis à l'exécution :
 *
 *  1. « index serveur » — la RPC `plateforme_annuaire_entreprises` filtre,
 *     trie et pagine EN BASE. C'est le seul chemin qui tient l'exigence §8
 *     (aucune requête non bornée) sur plusieurs milliers d'entreprises. Le SQL
 *     est livré prêt dans `docs/migrations-proposees/` ; aucune migration
 *     canonique n'est réservée par ce lot.
 *
 *  2. « dégradé » — tant que cette RPC n'est pas déployée, l'annuaire retombe
 *     sur `plateforme_entreprises()`, qui renvoie l'intégralité des lignes, et
 *     applique recherche, filtres, tri et pagination DANS LE PROCESSUS SERVEUR.
 *     Le navigateur ne reçoit jamais plus d'une page, mais la base, elle, est
 *     lue sans borne : c'est une dette explicitement affichée à l'opérateur,
 *     pas un mode nominal.
 *
 * `entreprises` n'est pas lisible en RLS par un administrateur plateforme (les
 * seules politiques de SELECT visent les membres de l'entreprise) : la liste
 * passe donc obligatoirement par une fonction SECURITY DEFINER. Les tables
 * d'enrichissement (abonnements, modules, applications), elles, autorisent la
 * lecture plateforme et sont interrogées directement.
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import {
  CHAMPS_RECHERCHE_ANNUAIRE,
  ONGLETS_ANNUAIRE,
  PLAFOND_LIGNES_PAR_REQUETE,
  comparerLignes,
  ligneAppartientALOnglet,
  ligneCorrespondALaRecherche,
  ligneCorrespondAuxFiltres,
  resumeAnnuaire,
  type CleOngletAnnuaire,
  type IndicateurResume,
  type LigneAnnuaire,
  type RequeteAnnuaire,
} from "@/lib/plateforme-annuaire";

export type ModeAnnuaire = "index_serveur" | "degrade";

export type ResultatAnnuaire = {
  lignes: LigneAnnuaire[];
  total: number;
  page: number;
  pages: number;
  mode: ModeAnnuaire;
  /** Champs réellement interrogés par la recherche dans ce mode. */
  champsRecherche: readonly string[];
  /** Compteurs d'onglets ; `null` pour un onglet sans donnée source. */
  compteursOnglets: Record<string, number | null>;
  /** Indicateurs de tête de page ; `null` si non calculables sur ce chemin. */
  resume: IndicateurResume[] | null;
  /** Faux dès qu'un état de facturation n'a pas pu être lu. */
  facturationLisible: boolean;
  avertissements: string[];
  erreur: string | null;
};

/**
 * Champs couverts par la recherche en mode dégradé. `plateforme_entreprises()`
 * ne renvoie ni raison sociale, ni SIRET, ni ville, ni contact : chercher sur
 * ces champs est IMPOSSIBLE tant que l'index serveur n'est pas déployé. On le
 * dit à l'opérateur plutôt que de lui rendre silencieusement zéro résultat.
 */
const CHAMPS_RECHERCHE_DEGRADE = ["nom", "reference_interne", "code_adhesion"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Source de données injectable (testable sans base)
// ─────────────────────────────────────────────────────────────────────────────

export type PageIndexee = { lignes: LigneAnnuaire[]; total: number; resume: IndicateurResume[] | null };

export type SourceAnnuaire = {
  /**
   * Chemin indexé. Renvoie `null` — et non une erreur — quand la RPC n'est pas
   * déployée, ce qui déclenche la bascule en mode dégradé.
   */
  annuaireIndexe(requete: RequeteAnnuaire): Promise<PageIndexee | null>;
  /** Chemin dégradé : la totalité des entreprises visibles. */
  toutesLesEntreprises(): Promise<LigneAnnuaire[]>;
};

/** Nombre de lignes au-delà duquel le mode dégradé refuse de continuer. */
export const PLAFOND_MODE_DEGRADE = 2_000;

/**
 * Compose le résultat d'annuaire à partir d'une source. Extrait du transport
 * pour être testable avec une source factice, y compris sur 5 000 lignes.
 */
export async function composerAnnuaire(
  source: SourceAnnuaire,
  requete: RequeteAnnuaire,
  maintenant: Date = new Date(),
): Promise<ResultatAnnuaire> {
  const avertissements: string[] = [];

  const indexee = await source.annuaireIndexe(requete);
  if (indexee) {
    const pages = Math.max(1, Math.ceil(indexee.total / requete.taille));
    return {
      lignes: indexee.lignes.slice(0, PLAFOND_LIGNES_PAR_REQUETE),
      total: indexee.total,
      page: Math.min(requete.page, pages),
      pages,
      mode: "index_serveur",
      champsRecherche: CHAMPS_RECHERCHE_ANNUAIRE,
      compteursOnglets: compteursDepuisLignes(indexee.lignes, maintenant, false),
      resume: indexee.resume,
      facturationLisible: indexee.lignes.every((l) => l.facturation_lisible),
      avertissements,
      erreur: null,
    };
  }

  avertissements.push(
    "Index serveur non déployé : la recherche, les filtres et le tri sont appliqués dans le processus serveur après lecture complète de la table. La recherche ne couvre alors que le nom, la référence client et le code d'adhésion.",
  );

  const toutes = await source.toutesLesEntreprises();

  if (toutes.length > PLAFOND_MODE_DEGRADE) {
    return {
      lignes: [],
      total: toutes.length,
      page: 1,
      pages: 1,
      mode: "degrade",
      champsRecherche: CHAMPS_RECHERCHE_DEGRADE,
      compteursOnglets: compteursIndisponibles(),
      resume: null,
      facturationLisible: false,
      avertissements,
      erreur:
        `Annuaire indisponible : ${toutes.length.toLocaleString("fr-FR")} entreprises dépassent le plafond de ` +
        `${PLAFOND_MODE_DEGRADE.toLocaleString("fr-FR")} lignes du mode dégradé. Déployez l'index serveur ` +
        "(docs/migrations-proposees) avant d'exploiter cette liste.",
    };
  }

  const filtrees = toutes.filter(
    (ligne) =>
      ligneCorrespondALaRecherche(champsRecherchablesDegrades(ligne), requete.q) &&
      ligneAppartientALOnglet(ligne, requete.onglet, maintenant) &&
      ligneCorrespondAuxFiltres(ligne, requete.filtres, maintenant),
  );

  const triees = [...filtrees].sort(comparerLignes(requete.tri, requete.sens));
  const total = triees.length;
  const pages = Math.max(1, Math.ceil(total / requete.taille));
  const page = Math.min(Math.max(1, requete.page), pages);
  const debut = (page - 1) * requete.taille;
  const lignes = triees.slice(debut, debut + Math.min(requete.taille, PLAFOND_LIGNES_PAR_REQUETE));

  // Les compteurs d'onglets et le résumé portent sur le jeu FILTRÉ complet,
  // jamais sur la page affichée : c'est ce que l'opérateur croit lire.
  const jeuPourCompteurs = toutes.filter(
    (ligne) =>
      ligneCorrespondALaRecherche(champsRecherchablesDegrades(ligne), requete.q) &&
      ligneCorrespondAuxFiltres(ligne, requete.filtres, maintenant),
  );

  return {
    lignes,
    total,
    page,
    pages,
    mode: "degrade",
    champsRecherche: CHAMPS_RECHERCHE_DEGRADE,
    compteursOnglets: compteursDepuisLignes(jeuPourCompteurs, maintenant, true),
    resume: resumeAnnuaire(jeuPourCompteurs, maintenant),
    facturationLisible: jeuPourCompteurs.every((l) => l.facturation_lisible),
    avertissements,
    erreur: null,
  };
}

function champsRecherchablesDegrades(ligne: LigneAnnuaire) {
  return {
    nom: ligne.nom,
    raison_sociale: ligne.raison_sociale,
    siret: ligne.siret,
    email: ligne.proprietaire_email,
    telephone: ligne.telephone,
    proprietaire: ligne.proprietaire_nom,
    ville: ligne.ville,
    code_postal: ligne.code_postal,
    reference_interne: ligne.reference_interne,
    code_adhesion: ligne.code_adhesion,
  };
}

function compteursIndisponibles(): Record<string, number | null> {
  return Object.fromEntries(ONGLETS_ANNUAIRE.map((o) => [o.cle, null]));
}

function compteursDepuisLignes(
  lignes: readonly LigneAnnuaire[],
  maintenant: Date,
  jeuComplet: boolean,
): Record<string, number | null> {
  const compteurs: Record<string, number | null> = {};
  for (const onglet of ONGLETS_ANNUAIRE) {
    if (onglet.couverture === "absente") {
      compteurs[onglet.cle] = null;
      continue;
    }
    // Sur le chemin indexé, la page ne suffit pas à compter : la RPC porte ses
    // propres compteurs. Tant qu'elle n'est pas déployée, on ne compte que
    // lorsqu'on détient réellement le jeu complet.
    compteurs[onglet.cle] = jeuComplet
      ? lignes.filter((l) => ligneAppartientALOnglet(l, onglet.cle as CleOngletAnnuaire, maintenant)).length
      : null;
  }
  return compteurs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Adaptateur Supabase
// ─────────────────────────────────────────────────────────────────────────────

type EntrepriseBrute = Record<string, unknown>;

function texte(valeur: unknown): string | null {
  return typeof valeur === "string" && valeur.length > 0 ? valeur : null;
}

function nombre(valeur: unknown): number {
  const n = Number(valeur);
  return Number.isFinite(n) ? n : 0;
}

function nombreOuNul(valeur: unknown): number | null {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  const n = Number(valeur);
  return Number.isFinite(n) ? n : null;
}

/** Codes PostgREST/PostgreSQL signalant une fonction absente du schéma. */
const CODES_RPC_ABSENTE = new Set(["42883", "PGRST202", "PGRST203"]);

function estRpcAbsente(erreur: { code?: string; message?: string } | null): boolean {
  if (!erreur) return false;
  if (erreur.code && CODES_RPC_ABSENTE.has(erreur.code)) return true;
  const message = (erreur.message ?? "").toLowerCase();
  return message.includes("could not find the function") || message.includes("does not exist");
}

type ClientSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Construit une ligne d'annuaire à partir des enregistrements bruts.
 * Exportée pour être testée sur les cas limites (champs absents, montants
 * illisibles) sans passer par le réseau.
 */
export function construireLigneAnnuaire(
  entreprise: EntrepriseBrute,
  enrichissement: {
    usage?: Record<string, unknown>;
    abonnement?: Record<string, unknown>;
    modules?: string[];
    applications?: string[];
    facturationLisible: boolean;
  },
): LigneAnnuaire {
  const usage = enrichissement.usage ?? {};
  const abonnement = enrichissement.abonnement ?? {};

  return {
    id: String(entreprise.id),
    nom: String(entreprise.nom ?? ""),
    raison_sociale: texte(entreprise.raison_sociale),
    siret: texte(entreprise.siret),
    ville: texte(entreprise.ville),
    code_postal: texte(entreprise.code_postal),
    reference_interne: texte(entreprise.reference_interne),
    code_adhesion: texte(entreprise.code_adhesion),
    proprietaire_nom: texte(entreprise.proprietaire_nom),
    proprietaire_email: texte(entreprise.proprietaire_email),
    telephone: texte(entreprise.telephone),
    created_at: String(entreprise.created_at ?? ""),

    abonnement_statut: String(entreprise.abonnement_statut ?? "essai"),
    abonnement_offre: texte(entreprise.abonnement_offre) ?? texte(abonnement.code_offre),
    abonnement_periodicite: texte(entreprise.abonnement_periodicite) ?? texte(abonnement.periodicite),
    abonnement_echeance: texte(entreprise.abonnement_echeance),
    abonnement_essai_fin: texte(entreprise.abonnement_essai_fin),
    abonnement_annulation_prevue_at: texte(entreprise.abonnement_annulation_prevue_at),

    prix_contractuel_ht: nombreOuNul(abonnement.prix_contractuel_ht),
    remise_type: texte(entreprise.remise_type),
    remise_valeur: nombreOuNul(entreprise.remise_valeur),
    remise_description: texte(entreprise.remise_description),
    remise_duree_mois: nombreOuNul(entreprise.remise_duree_mois),
    remise_appliquee_at: texte(entreprise.remise_appliquee_at),

    suspension_prevue_at: texte(entreprise.suspension_prevue_at),
    derniere_facture_statut: texte(entreprise.derniere_facture_statut),
    derniere_facture_url: texte(entreprise.derniere_facture_url),
    // Aucun montant d'impayé n'est agrégé en base : le déduire d'une facture
    // ouverte serait une invention. Il reste `null` jusqu'à l'index serveur.
    montant_impaye_ht: nombreOuNul(entreprise.montant_impaye_ht),

    nb_comptes_actifs: nombre(usage.nb_comptes_actives ?? entreprise.nb_membres_actifs),
    nb_comptes_facturables: nombre(usage.nb_comptes_facturables ?? usage.nb_comptes_actives),
    nb_salaries: nombre(usage.nb_fiches_employes),
    modules_actifs: enrichissement.modules ?? [],
    applications_actives: enrichissement.applications ?? [],
    option_ia_statut: texte(entreprise.option_ia_statut),
    derniere_activite: texte(usage.derniere_connexion),

    facturation_lisible: enrichissement.facturationLisible,
  };
}

async function lireEnrichissements(supabase: ClientSupabase) {
  const [abonnements, modules, applications] = await Promise.all([
    supabase.from("abonnements_entreprises").select("entreprise_id, code_offre, periodicite, prix_contractuel_ht, statut"),
    supabase.from("modules_entreprises").select("entreprise_id, module_code").eq("actif", true),
    supabase.from("acces_applications_entreprises").select("entreprise_id, application_code").eq("autorise", true),
  ]);

  const parEntreprise = new Map<string, Record<string, unknown>>();
  for (const ligne of abonnements.data ?? []) {
    parEntreprise.set(String((ligne as { entreprise_id: string }).entreprise_id), ligne as Record<string, unknown>);
  }

  const grouper = (donnees: unknown[] | null, cle: string) => {
    const carte = new Map<string, string[]>();
    for (const ligne of donnees ?? []) {
      const item = ligne as Record<string, unknown>;
      const id = String(item.entreprise_id);
      const liste = carte.get(id) ?? [];
      liste.push(String(item[cle]));
      carte.set(id, liste);
    }
    return carte;
  };

  return {
    abonnements: parEntreprise,
    modules: grouper(modules.data, "module_code"),
    applications: grouper(applications.data, "application_code"),
    // L'état de facturation n'est réputé lisible que si la lecture a abouti.
    // Une erreur ici ne doit jamais se lire comme « aucun impayé » (§19).
    facturationLisible: !abonnements.error,
  };
}

/** Source Supabase réelle. */
export async function sourceSupabase(): Promise<SourceAnnuaire> {
  const supabase = await createClient();
  const demonstration = isEmailLoginDisabled();

  return {
    async annuaireIndexe(requete) {
      const { data, error } = await supabase.rpc("plateforme_annuaire_entreprises", {
        p_recherche: requete.q,
        p_onglet: requete.onglet,
        p_tri: requete.tri,
        p_sens: requete.sens,
        p_page: requete.page,
        p_taille: requete.taille,
        p_filtres: requete.filtres,
      });
      if (error) {
        if (estRpcAbsente(error)) return null;
        throw new Error(error.message);
      }
      const resultat = (data ?? {}) as { lignes?: unknown[]; total?: number; resume?: IndicateurResume[] };
      return {
        lignes: (resultat.lignes ?? []).map((ligne) =>
          construireLigneAnnuaire(ligne as EntrepriseBrute, { facturationLisible: true }),
        ),
        total: Number(resultat.total ?? 0),
        resume: resultat.resume ?? null,
      };
    },

    async toutesLesEntreprises() {
      const [entreprises, usages] = await Promise.all([
        demonstration
          ? supabase
              .from("entreprises")
              .select(
                "id, nom, raison_sociale, siret, ville, code_postal, code_adhesion, reference_interne, abonnement_statut, abonnement_echeance, abonnement_offre, abonnement_periodicite, abonnement_essai_fin, abonnement_annulation_prevue_at, suspension_prevue_at, derniere_facture_statut, derniere_facture_url, remise_type, remise_valeur, remise_description, remise_duree_mois, remise_appliquee_at, option_ia_statut, created_at",
              )
              .order("created_at", { ascending: false })
          : supabase.rpc("plateforme_entreprises"),
        supabase.rpc("plateforme_usage_entreprises"),
      ]);

      if (entreprises.error) throw new Error(entreprises.error.message);

      const usageParEntreprise = new Map<string, Record<string, unknown>>();
      for (const usage of (usages.data ?? []) as Record<string, unknown>[]) {
        usageParEntreprise.set(String(usage.entreprise_id), usage);
      }

      const enrichissements = await lireEnrichissements(supabase);

      return ((entreprises.data ?? []) as EntrepriseBrute[]).map((entreprise) =>
        construireLigneAnnuaire(entreprise, {
          usage: usageParEntreprise.get(String(entreprise.id)),
          abonnement: enrichissements.abonnements.get(String(entreprise.id)),
          modules: enrichissements.modules.get(String(entreprise.id)) ?? [],
          applications: enrichissements.applications.get(String(entreprise.id)) ?? [],
          facturationLisible: enrichissements.facturationLisible,
        }),
      );
    },
  };
}

/** Point d'entrée de la page : charge l'annuaire et absorbe les pannes. */
export async function chargerAnnuaire(
  requete: RequeteAnnuaire,
  maintenant: Date = new Date(),
): Promise<ResultatAnnuaire> {
  try {
    const source = await sourceSupabase();
    return await composerAnnuaire(source, requete, maintenant);
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    return {
      lignes: [],
      total: 0,
      page: 1,
      pages: 1,
      mode: "degrade",
      champsRecherche: CHAMPS_RECHERCHE_DEGRADE,
      compteursOnglets: compteursIndisponibles(),
      resume: null,
      facturationLisible: false,
      avertissements: [],
      erreur: `L'annuaire n'a pas pu être chargé : ${message}`,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Plafond de lignes exportables en une fois. Un export n'est pas une
 * sauvegarde : au-delà, l'opérateur doit resserrer ses filtres plutôt que
 * d'extraire le parc entier.
 */
export const PLAFOND_EXPORT = 5_000;

export type ResultatExport = {
  lignes: LigneAnnuaire[];
  total: number;
  tronque: boolean;
  mode: ModeAnnuaire;
};

/**
 * Rassemble les lignes à exporter en appliquant EXACTEMENT la recherche, les
 * filtres, l'onglet et le tri de l'écran — mais sans se limiter à la page
 * affichée. Un export de 500 clients ne doit jamais être reconstitué à partir
 * des lignes visibles (§15).
 */
export async function chargerAnnuairePourExport(
  requete: RequeteAnnuaire,
  maintenant: Date = new Date(),
): Promise<ResultatExport> {
  const source = await sourceSupabase();

  // Chemin indexé : on pagine la RPC jusqu'au plafond.
  const premierePage = await source.annuaireIndexe({ ...requete, page: 1, taille: PLAFOND_LIGNES_PAR_REQUETE });
  if (premierePage) {
    const lignes = [...premierePage.lignes];
    const total = premierePage.total;
    const pagesNecessaires = Math.ceil(Math.min(total, PLAFOND_EXPORT) / PLAFOND_LIGNES_PAR_REQUETE);
    for (let page = 2; page <= pagesNecessaires; page += 1) {
      const suivante = await source.annuaireIndexe({ ...requete, page, taille: PLAFOND_LIGNES_PAR_REQUETE });
      if (!suivante) break;
      lignes.push(...suivante.lignes);
    }
    return { lignes: lignes.slice(0, PLAFOND_EXPORT), total, tronque: total > PLAFOND_EXPORT, mode: "index_serveur" };
  }

  // Chemin dégradé : une seule lecture, filtrée et triée dans le processus.
  const toutes = await source.toutesLesEntreprises();
  const filtrees = toutes
    .filter(
      (ligne) =>
        ligneCorrespondALaRecherche(champsRecherchablesDegrades(ligne), requete.q) &&
        ligneAppartientALOnglet(ligne, requete.onglet, maintenant) &&
        ligneCorrespondAuxFiltres(ligne, requete.filtres, maintenant),
    )
    .sort(comparerLignes(requete.tri, requete.sens));

  return {
    lignes: filtrees.slice(0, PLAFOND_EXPORT),
    total: filtrees.length,
    tronque: filtrees.length > PLAFOND_EXPORT,
    mode: "degrade",
  };
}
