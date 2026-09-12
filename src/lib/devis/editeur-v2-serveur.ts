import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRODUCT_NAME } from "@/lib/brand";
import { nomClient } from "@/lib/chantier-statuts";
import type { ContexteEntreprise } from "@/lib/entreprise";
import { ENTETE_ENTREPRISE_COLONNES } from "@/lib/documents-commerciaux";
import { permissionsUtilisateur } from "@/lib/permissions";
import { enteteDepuisBase, etatDepuisBase, type DevisBase, type LigneDevisBase, type OuvrageDevisBase } from "@/lib/devis/brouillon-v2";
import type { EnteteDevisV2 } from "@/lib/devis/enregistrement-v2";
import type { EtatElements } from "@/lib/devis/editeur-etat";
import type { IdentiteEmetteur, StyleDocument } from "@/lib/devis/document-modele";
import type { ReglagesFiligraneEntreprise } from "@/lib/devis/filigrane";
import { emetteurDepuisEntreprise, styleDepuisEntreprise } from "@/lib/devis/rendu-source";

/**
 * Données de l'éditeur de devis v2, chargées côté serveur sous la RLS de l'utilisateur.
 * N'est appelé que si le moteur v2 est actif (schéma migré).
 */

export type ClientEditeurServeur = { id: string; label: string; adresse: string | null; codePostal: string | null; ville: string | null; siret: string | null };

export type DonneesEditeurV2 = {
  clients: ClientEditeurServeur[];
  chantiers: Array<{ id: string; label: string; clientId: string | null }>;
  emetteur: IdentiteEmetteur;
  style: Partial<StyleDocument>;
  filigranesEntreprise: ReglagesFiligraneEntreprise | null;
  logoDisponible: boolean;
  seuilTauxMarquePct: number | null;
  droits: { voirCouts: boolean; gererCouts: boolean; modifierPrix: boolean; modifierUnite: boolean };
  nomProduit: string;
  /** Salariés actifs pouvant être rattachés comme commercial (GP V1). */
  commerciaux: Array<{ id: string; label: string }>;
};

const possede = (p: string[] | null, cle: string) => p === null || p.includes(cle);

const COLONNES_LIGNES = [
  "cle_ligne", "ouvrage_cle", "ordre", "designation", "description", "type", "quantite", "unite", "prix_unitaire_ht",
  "remise_ligne", "taux_tva", "origine_ligne", "source_catalogue", "source_id", "reference_interne_instantane",
  "reference_fabricant_instantane", "nature", "parametres_quantite", "quantite_forcee", "visible_client",
  "afficher_quantite", "afficher_prix", "description_client_personnalisee", "motif_ajustement", "detail_calcul",
  "type_ligne", "remise_section_pct", "commentaire_interne", "famille_instantane", "fournisseur_instantane", "code_fournisseur_instantane",
].join(",");

const COLONNES_OUVRAGES = [
  "cle", "ordre", "ouvrage_id", "ouvrage_version", "ouvrage_reference", "ouvrage_nom", "categorie", "unite_principale",
  "quantite_principale", "options", "saisies", "libelle_client", "description_client", "mode_presentation",
  "instantane_modele", "modifications_manuelles",
].join(",");

export async function chargerDonneesEditeurV2(supabase: SupabaseClient, ctx: ContexteEntreprise): Promise<DonneesEditeurV2> {
  const permissions = await permissionsUtilisateur(ctx);
  const [{ data: clients }, { data: chantiers }, { data: entreprise }, { data: employes }] = await Promise.all([
    supabase.from("clients").select("id, nom, prenom, societe, adresse_facturation, code_postal, ville, siret")
      .eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }),
    supabase.from("chantiers").select("id, nom, client_id").eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }),
    supabase.from("entreprises").select([...ENTETE_ENTREPRISE_COLONNES, "filigranes_documents", "seuil_taux_marque_pct"].join(","))
      .eq("id", ctx.entrepriseId).maybeSingle(),
    supabase.from("employes").select("id, prenom, nom, statut").eq("entreprise_id", ctx.entrepriseId).eq("statut", "actif").order("nom"),
  ]);
  const e = (entreprise ?? null) as Record<string, unknown> | null;
  const filigranes = (e?.filigranes_documents ?? null) as ReglagesFiligraneEntreprise | null;
  return {
    clients: (clients ?? []).map((c) => ({
      id: c.id, label: nomClient(c), adresse: c.adresse_facturation, codePostal: c.code_postal, ville: c.ville, siret: c.siret,
    })),
    chantiers: (chantiers ?? []).map((c) => ({ id: c.id, label: c.nom, clientId: c.client_id })),
    emetteur: emetteurDepuisEntreprise(e),
    style: styleDepuisEntreprise(e),
    filigranesEntreprise: filigranes ? { defaut: filigranes.defaut ?? null, brouillon: filigranes.brouillon ?? null } : null,
    logoDisponible: typeof e?.logo_url === "string" && e.logo_url !== "",
    seuilTauxMarquePct: e?.seuil_taux_marque_pct === null || e?.seuil_taux_marque_pct === undefined ? null : Number(e.seuil_taux_marque_pct),
    droits: {
      voirCouts: possede(permissions, "voir_couts_devis"),
      gererCouts: possede(permissions, "gerer_couts_devis"),
      modifierPrix: possede(permissions, "gerer_devis"),
      modifierUnite: possede(permissions, "gerer_devis"),
    },
    nomProduit: PRODUCT_NAME,
    commerciaux: ((employes ?? []) as Array<{ id: string; prenom: string | null; nom: string | null }>)
      .map((emp) => ({ id: String(emp.id), label: [emp.prenom, emp.nom].filter(Boolean).join(" ") || "Salarié" })),
  };
}

/**
 * Brouillon existant, converti en état d'éditeur. `null` : introuvable ou pas un brouillon. Les
 * coûts ne sont lus que pour un utilisateur qui peut les voir (la RLS les masquerait de toute façon).
 */
export async function chargerBrouillonV2(
  supabase: SupabaseClient,
  ctx: ContexteEntreprise,
  devisId: string,
  voirCouts: boolean,
): Promise<{ entete: EnteteDevisV2; etat: EtatElements; revision: number } | null> {
  type CoutLu = { cle_ligne: string; prix_achat_ht: number; cout_main_oeuvre_ht?: number | null; coefficient?: number | null };
  const [{ data: devis }, { data: lignes }, { data: ouvrages }, couts] = await Promise.all([
    supabase.from("devis")
      .select("id, statut, client_id, chantier_id, date_emission, date_validite, conditions, notes_client, notes_internes, remise_globale, filigrane, revision, reference_interne, reference_client, mode_reglement, conditions_paiement, commercial_employe_id")
      .eq("id", devisId).eq("entreprise_id", ctx.entrepriseId).maybeSingle(),
    supabase.from("lignes_devis").select(COLONNES_LIGNES).eq("devis_id", devisId).order("ordre"),
    supabase.from("devis_ouvrages").select(COLONNES_OUVRAGES).eq("devis_id", devisId).order("ordre"),
    voirCouts
      ? supabase.from("lignes_devis_couts").select("cle_ligne, prix_achat_ht, cout_main_oeuvre_ht, coefficient").eq("devis_id", devisId)
      : Promise.resolve({ data: [] as CoutLu[] }),
  ]);
  if (!devis || devis.statut !== "brouillon") return null;
  const lus = (couts.data ?? []) as CoutLu[];
  const coutsParCle = Object.fromEntries(lus.map((c) => [c.cle_ligne, Number(c.prix_achat_ht)]));
  const detailParCle = Object.fromEntries(lus.map((c) => [c.cle_ligne, { cout_main_oeuvre_ht: c.cout_main_oeuvre_ht ?? null, coefficient: c.coefficient ?? null }]));
  return {
    entete: enteteDepuisBase(devis as unknown as DevisBase),
    etat: etatDepuisBase((lignes ?? []) as unknown as LigneDevisBase[], (ouvrages ?? []) as unknown as OuvrageDevisBase[], coutsParCle, detailParCle),
    revision: Number((devis as { revision?: number }).revision ?? 0),
  };
}
