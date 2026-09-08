/**
 * Chargement de la fiche plateforme d'une entreprise.
 *
 * Chaque bloc de la fiche est lu indépendamment et porte son propre état de
 * disponibilité : une table inaccessible fait afficher « Non disponible » sur
 * la seule section concernée, pas une page blanche ni — pire — une section
 * vide qui se lirait comme « rien à signaler ». C'est la même discipline que
 * l'annuaire : une panne n'est jamais une bonne nouvelle par défaut (§19).
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { construireLigneAnnuaire } from "@/lib/plateforme-annuaire-serveur";
import type { LigneAnnuaire } from "@/lib/plateforme-annuaire";

/** Une section chargée : ses données, ou la raison de leur absence. */
export type Section<T> = { donnees: T; disponible: true } | { donnees: null; disponible: false; raison: string };

function disponible<T>(donnees: T): Section<T> {
  return { donnees, disponible: true };
}

function indisponible<T>(raison: string): Section<T> {
  return { donnees: null, disponible: false, raison };
}

/** Nombre maximal de lignes rapatriées par section d'historique. */
const LIMITE_HISTORIQUE = 50;

export type OptionAbonnement = {
  option_id: string;
  quantite: number;
  prix_unitaire_contractuel_ht: number;
  active: boolean;
  debut_at: string | null;
  fin_at: string | null;
};

export type FactureAbonnement = {
  id: string;
  numero: string | null;
  periode_debut: string | null;
  periode_fin: string | null;
  montant_ht: number;
  montant_ttc: number;
  statut: string;
  url_facture: string | null;
  payee_at: string | null;
  created_at: string;
};

export type ModuleEntreprise = {
  module_code: string;
  origine: string;
  valide_du: string | null;
  valide_jusqu: string | null;
  motif: string | null;
};

export type ApplicationEntreprise = {
  application_code: string;
  nom: string;
  statut_produit: string;
  autorise: boolean;
  valide_du: string | null;
  valide_jusqu_au: string | null;
  source: string | null;
};

export type PosteEntreprise = {
  poste_id: string;
  poste_nom: string;
  nb_employes: number;
  permissions: string[];
};

export type TarifPoste = {
  poste_id: string;
  nom: string;
  code_offre: string;
  tarif_compte_mensuel: number;
  nb_comptes_facturables: number;
};

export type EvenementJournal = {
  id: string;
  quand: string;
  action: string;
  acteur: string | null;
  details: string | null;
};

export type SessionAssistance = {
  id: string;
  date: string;
  motif: string | null;
};

export type AbonnementFiche = {
  code_offre: string | null;
  periodicite: string | null;
  prix_contractuel_ht: number | null;
  statut: string | null;
  debut_periode: string | null;
  fin_periode: string | null;
  options: OptionAbonnement[];
};

export type FicheEntreprise = {
  ligne: LigneAnnuaire;
  abonnement: Section<AbonnementFiche>;
  factures: Section<FactureAbonnement[]>;
  modules: Section<ModuleEntreprise[]>;
  applications: Section<ApplicationEntreprise[]>;
  postes: Section<PosteEntreprise[]>;
  tarifsPostes: Section<TarifPoste[]>;
  assistance: Section<SessionAssistance[]>;
  historique: Section<EvenementJournal[]>;
  /** Sections demandées au §11 pour lesquelles aucune source n'existe. */
  sectionsNonModelisees: readonly { titre: string; raison: string }[];
};

/**
 * Sections du cahier des charges qui n'ont, à ce jour, aucune table derrière
 * elles. Les énumérer à l'écran vaut mieux que de dessiner une section vide
 * dont l'opérateur croirait qu'elle est simplement inutilisée.
 */
export const SECTIONS_NON_MODELISEES = [
  {
    titre: "Communications ciblées et acquittements",
    raison:
      "Aucune table de campagne, d'information ciblée ni d'acquittement client n'existe. Le support message-à-message (`plateforme_support_*`) est la seule voie sortante disponible.",
  },
  {
    titre: "Notes internes sur un client",
    raison:
      "Aucune table de notes n'existe. `entreprises.abonnement_note` est un champ libre unique, écrasé à chaque modification, et n'est pas un journal.",
  },
  {
    titre: "Tentatives de paiement",
    raison:
      "Les tentatives sont conservées par Stripe, pas répliquées en base. Seul le statut de la dernière facture est visible ici.",
  },
] as const;

type ClientSupabase = Awaited<ReturnType<typeof createClient>>;

async function chargerLigne(supabase: ClientSupabase, entrepriseId: string): Promise<LigneAnnuaire | null> {
  const demonstration = isEmailLoginDisabled();

  if (demonstration) {
    const { data } = await supabase
      .from("entreprises")
      .select(
        "id, nom, raison_sociale, siret, ville, code_postal, code_adhesion, reference_interne, abonnement_statut, abonnement_echeance, abonnement_offre, abonnement_periodicite, abonnement_essai_fin, abonnement_annulation_prevue_at, suspension_prevue_at, derniere_facture_statut, derniere_facture_url, remise_type, remise_valeur, remise_description, remise_duree_mois, remise_appliquee_at, option_ia_statut, created_at",
      )
      .eq("id", entrepriseId)
      .maybeSingle();
    if (!data) return null;
    return construireLigneAnnuaire(data as Record<string, unknown>, { facturationLisible: true });
  }

  // `entreprises` n'est pas lisible en RLS par la plateforme : on passe par la
  // fonction SECURITY DEFINER et on retient la ligne demandée. Coûteux tant que
  // l'index serveur (docs/migrations-proposees) n'est pas déployé.
  const { data, error } = await supabase.rpc("plateforme_entreprises");
  if (error) throw new Error(error.message);
  const brute = ((data ?? []) as Record<string, unknown>[]).find((e) => String(e.id) === entrepriseId);
  if (!brute) return null;
  return construireLigneAnnuaire(brute, { facturationLisible: true });
}

export async function chargerFicheEntreprise(entrepriseId: string): Promise<FicheEntreprise | null> {
  const supabase = await createClient();

  const ligne = await chargerLigne(supabase, entrepriseId);
  if (!ligne) return null;

  const [abonnements, options, factures, modules, acces, catalogueApps, postes, support, journal, tarifs] =
    await Promise.all([
      supabase
        .from("abonnements_entreprises")
        .select("code_offre, periodicite, prix_contractuel_ht, statut, debut_periode, fin_periode")
        .eq("entreprise_id", entrepriseId)
        .maybeSingle(),
      supabase
        .from("options_abonnement_entreprises")
        .select("option_id, quantite, prix_unitaire_contractuel_ht, active, debut_at, fin_at")
        .eq("entreprise_id", entrepriseId),
      supabase
        .from("factures_abonnement")
        .select("id, numero, periode_debut, periode_fin, montant_ht, montant_ttc, statut, url_facture, payee_at, created_at")
        .eq("entreprise_id", entrepriseId)
        .order("created_at", { ascending: false })
        .limit(LIMITE_HISTORIQUE),
      supabase
        .from("modules_entreprises")
        .select("module_code, origine, valide_du, valide_jusqu, motif")
        .eq("entreprise_id", entrepriseId)
        .eq("actif", true),
      supabase
        .from("acces_applications_entreprises")
        .select("application_code, autorise, valide_du, valide_jusqu_au, source")
        .eq("entreprise_id", entrepriseId),
      supabase.from("applications_elsatia").select("code, nom, statut_produit").order("ordre"),
      supabase.rpc("plateforme_roles_entreprise", { p_entreprise_id: entrepriseId }),
      supabase
        .from("acces_support_log")
        .select("id, date, motif")
        .eq("entreprise_id", entrepriseId)
        .order("date", { ascending: false })
        .limit(LIMITE_HISTORIQUE),
      supabase
        .from("plateforme_journal_actions")
        .select("id, action, acteur_email, details, created_at")
        .eq("cible_id", entrepriseId)
        .order("created_at", { ascending: false })
        .limit(LIMITE_HISTORIQUE),
      supabase.rpc("plateforme_postes_tarifs"),
    ]);

  const nomsApplications = new Map<string, { nom: string; statut_produit: string }>(
    ((catalogueApps.data ?? []) as { code: string; nom: string; statut_produit: string }[]).map((app) => [
      app.code,
      { nom: app.nom, statut_produit: app.statut_produit },
    ]),
  );

  return {
    ligne: { ...ligne, facturation_lisible: !abonnements.error && !factures.error },

    abonnement: abonnements.error
      ? indisponible(`Abonnement illisible : ${abonnements.error.message}`)
      : abonnements.data
        ? disponible({
            ...(abonnements.data as unknown as Omit<AbonnementFiche, "options">),
            options: (options.data ?? []) as OptionAbonnement[],
          })
        : indisponible(
            "Aucun abonnement contractuel n'est enregistré pour cette entreprise : ni prix souscrit, ni périodicité, ni période en cours.",
          ),

    factures: factures.error
      ? indisponible(`Factures illisibles : ${factures.error.message}`)
      : disponible((factures.data ?? []) as FactureAbonnement[]),

    modules: modules.error
      ? indisponible(`Modules illisibles : ${modules.error.message}`)
      : disponible((modules.data ?? []) as ModuleEntreprise[]),

    applications: acces.error
      ? indisponible(`Applications illisibles : ${acces.error.message}`)
      : disponible(
          ((acces.data ?? []) as Record<string, unknown>[]).map((item) => {
            const code = String(item.application_code);
            const reference = nomsApplications.get(code);
            return {
              application_code: code,
              nom: reference?.nom ?? code,
              statut_produit: reference?.statut_produit ?? "inconnu",
              autorise: Boolean(item.autorise),
              valide_du: (item.valide_du as string | null) ?? null,
              valide_jusqu_au: (item.valide_jusqu_au as string | null) ?? null,
              source: (item.source as string | null) ?? null,
            };
          }),
        ),

    postes: postes.error
      ? indisponible(`Postes illisibles : ${postes.error.message}`)
      : disponible((postes.data ?? []) as PosteEntreprise[]),

    // `plateforme_postes_tarifs` exige la permission `consulter_facturation` :
    // un rôle support reçoit ici une erreur, qui est affichée telle quelle.
    tarifsPostes: tarifs.error
      ? indisponible(`Tarifs par poste illisibles : ${tarifs.error.message}`)
      : disponible(
          ((tarifs.data ?? []) as Record<string, unknown>[])
            .filter((item) => String(item.entreprise_id) === entrepriseId)
            .map((item) => ({
              poste_id: String(item.poste_id),
              nom: String(item.nom),
              code_offre: String(item.code_offre ?? ""),
              tarif_compte_mensuel: Number(item.tarif_compte_mensuel ?? 0),
              nb_comptes_facturables: Number(item.nb_comptes_facturables ?? 0),
            })),
        ),

    assistance: support.error
      ? indisponible(`Journal d'assistance illisible : ${support.error.message}`)
      : disponible(
          ((support.data ?? []) as Record<string, unknown>[]).map((item) => ({
            id: String(item.id),
            date: String(item.date),
            motif: (item.motif as string | null) ?? null,
          })),
        ),

    historique: journal.error
      ? indisponible(
          `Journal d'actions illisible : ${journal.error.message}. Ce journal est réservé au rôle « Accès total ».`,
        )
      : disponible(
          ((journal.data ?? []) as Record<string, unknown>[]).map((item) => ({
            id: String(item.id),
            quand: String(item.created_at),
            action: String(item.action),
            acteur: (item.acteur_email as string | null) ?? null,
            details: item.details ? JSON.stringify(item.details) : null,
          })),
        ),

    sectionsNonModelisees: SECTIONS_NON_MODELISEES,
  };
}
