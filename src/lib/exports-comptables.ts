import type { SupabaseClient } from "@supabase/supabase-js";
import { nomClientDocument } from "@/lib/client-snapshot";

// Construction des exports comptables (journal des ventes, règlements, achats,
// TVA collectée, TVA déductible), indépendante de la requête HTTP : la route
// /api/exports/comptabilite vérifie la session et la permission, puis délègue
// ici avec le client Supabase de l'utilisateur (RLS actives).

export const TYPES_EXPORT_COMPTABLE = ["ventes", "reglements", "tva", "achats", "tva-achats"] as const;
export type TypeExportComptable = (typeof TYPES_EXPORT_COMPTABLE)[number];
export type ExportComptable = { lignes: unknown[][]; nom: string; feuille: string };

// Un export comptable rejoue des documents DÉJÀ ÉMIS : il doit restituer le
// destinataire tel qu'il figurait sur la facture, pas la fiche client
// d'aujourd'hui (ELSATIA-GP-CLIENT-DOCUMENT-SNAPSHOT-P0-V1). La fiche reste
// la source de repli pour les rares lignes sans identité figée.
const client_snapshot_reference = (snapshot: unknown): string | null =>
  typeof snapshot === "object" && snapshot !== null && !Array.isArray(snapshot)
    ? ((snapshot as { reference_interne?: string | null }).reference_interne ?? null)
    : null;
const un = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;

type ClientJoint = { reference_interne: string | null; nom: string | null; prenom: string | null; societe: string | null } | null;
type FactureVente = { numero: string; date_emission: string; date_echeance: string | null; type: string; statut: string; montant_ht: number; montant_tva: number; montant_ttc: number; montant_paye: number; client_snapshot: unknown; client: ClientJoint };
type Reglement = { date: string; montant: number; mode: string; reference: string | null; facture: { numero: string | null; type: string; client_snapshot: unknown; client: ClientJoint } | null };
type Achat = { numero_piece: string; date_piece: string; date_echeance: string | null; categorie: string; statut: string; montant_ht: number; taux_tva: number; montant_tva: number; montant_ttc: number; montant_regle: number; fournisseur: { nom: string } | null; chantier: { nom: string } | null };
type TvaCollectee = { date_emission: string; numero: string; taux_tva: number; base_ht: number; tva: number };

// Chaque export est produit en base, en une seule valeur jsonb (RPC
// `export_comptable_*`, migration 20260928000813) : il n'est donc jamais
// plafonné par `max_rows` et porte toutes les lignes de la période, avec les
// mêmes filtres et contrôles d'accès que les lectures RLS qu'il remplace.
// ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1.
async function lireExport<T>(supabase: SupabaseClient, fonction: string, entrepriseId: string, periode: { debut: string; fin: string }) {
  const { data, error } = await supabase.rpc(fonction, { p_entreprise_id: entrepriseId, p_debut: periode.debut, p_fin: periode.fin });
  if (error) return { data: null, error };
  if (!Array.isArray(data)) return { data: null, error: new Error(`Réponse inattendue de ${fonction}`) };
  return { data: data as T[], error: null };
}

export const exportTropVolumineux = (error: unknown) =>
  typeof error === "object" && error !== null && "message" in error && String((error as { message: unknown }).message).includes("EXPORT_TROP_VOLUMINEUX");

export async function construireExportComptable(
  supabase: SupabaseClient,
  entrepriseId: string,
  type: TypeExportComptable,
  periode: { debut: string; fin: string },
): Promise<{ data: ExportComptable; error: null } | { data: null; error: unknown }> {
  if (type === "ventes") {
    const { data, error } = await lireExport<FactureVente>(supabase, "export_comptable_ventes", entrepriseId, periode);
    if (error) return { data: null, error }; const lignes: unknown[][] = [["Date", "N° facture", "Type", "Statut", "Réf. client", "Client", "HT", "TVA", "TTC", "Encaissé", "Reste dû", "Échéance"]];
    for (const facture of data) { const client = un(facture.client); const ttc = Number(facture.montant_ttc), paye = Number(facture.montant_paye); lignes.push([facture.date_emission, facture.numero, facture.type, facture.statut, client_snapshot_reference(facture.client_snapshot) ?? client?.reference_interne ?? "", nomClientDocument(facture.client_snapshot, client), Number(facture.montant_ht), Number(facture.montant_tva), ttc, paye, Math.max(0, ttc - paye), facture.date_echeance ?? ""]); }
    return { data: { lignes, nom: `journal-ventes-${periode.debut}-${periode.fin}`, feuille: "Journal des ventes" }, error: null };
  }
  if (type === "reglements") {
    const { data, error } = await lireExport<Reglement>(supabase, "export_comptable_reglements", entrepriseId, periode);
    if (error) return { data: null, error }; const lignes: unknown[][] = [["Date", "N° facture", "Réf. client", "Client", "Mode", "Référence règlement", "Montant"]];
    for (const paiement of data) { const facture = un(paiement.facture); const client = facture ? un(facture.client) : null; lignes.push([paiement.date, facture?.numero ?? "", client_snapshot_reference(facture?.client_snapshot) ?? client?.reference_interne ?? "", nomClientDocument(facture?.client_snapshot, client), paiement.mode, paiement.reference ?? "", (facture?.type === "avoir" ? -1 : 1) * Number(paiement.montant)]); }
    return { data: { lignes, nom: `reglements-${periode.debut}-${periode.fin}`, feuille: "Règlements clients" }, error: null };
  }
  if (type === "achats") {
    const { data, error } = await lireExport<Achat>(supabase, "export_comptable_achats", entrepriseId, periode);
    if (error) return { data: null, error };
    const lignes: unknown[][] = [["Date", "N° facture fournisseur", "Fournisseur", "Catégorie", "Chantier", "Statut", "HT", "Taux TVA", "TVA déductible", "TTC", "Réglé", "Reste à payer", "Échéance"]];
    for (const depense of data) {
      const fournisseur = un(depense.fournisseur); const chantier = un(depense.chantier);
      lignes.push([depense.date_piece, depense.numero_piece, fournisseur?.nom ?? "", depense.categorie, chantier?.nom ?? "", depense.statut, Number(depense.montant_ht), Number(depense.taux_tva), Number(depense.montant_tva), Number(depense.montant_ttc), Number(depense.montant_regle), Math.max(0, Number(depense.montant_ttc) - Number(depense.montant_regle)), depense.date_echeance ?? ""]);
    }
    return { data: { lignes, nom: `journal-achats-${periode.debut}-${periode.fin}`, feuille: "Journal des achats" }, error: null };
  }
  if (type === "tva-achats") {
    const { data, error } = await lireExport<Achat>(supabase, "export_comptable_achats", entrepriseId, periode);
    if (error) return { data: null, error };
    const lignes: unknown[][] = [["Date", "N° facture fournisseur", "Fournisseur", "Taux TVA", "Base HT", "TVA déductible", "TTC"]];
    const totaux = new Map<number, { ht: number; tva: number; ttc: number }>();
    for (const depense of data) {
      const fournisseur = un(depense.fournisseur); const taux = Number(depense.taux_tva); const ht = Number(depense.montant_ht); const tva = Number(depense.montant_tva); const ttc = Number(depense.montant_ttc);
      lignes.push([depense.date_piece, depense.numero_piece, fournisseur?.nom ?? "", taux, ht, tva, ttc]);
      const total = totaux.get(taux) ?? { ht: 0, tva: 0, ttc: 0 }; total.ht += ht; total.tva += tva; total.ttc += ttc; totaux.set(taux, total);
    }
    lignes.push([]); lignes.push(["SYNTHÈSE PAR TAUX", "", "", "Taux TVA", "Base HT", "TVA déductible", "TTC"]);
    for (const [taux, total] of [...totaux].sort(([a], [b]) => a - b)) lignes.push(["TOTAL", "", "", taux, total.ht, total.tva, total.ttc]);
    return { data: { lignes, nom: `tva-deductible-achats-${periode.debut}-${periode.fin}`, feuille: "TVA déductible" }, error: null };
  }
  // TVA collectée : base HT et TVA agrégées en base par facture et par taux,
  // selon la formule inchangée (quantité × PU HT × (1 − remise/100), puis
  // × taux/100, sans arrondi intermédiaire) ; la synthèse par taux est sommée
  // en `numeric` exact côté base, pas en flottant ici.
  const { data, error } = await supabase.rpc("export_comptable_tva_collectee", { p_entreprise_id: entrepriseId, p_debut: periode.debut, p_fin: periode.fin });
  if (error) return { data: null, error };
  const resultat = data as { details?: TvaCollectee[]; synthese?: { taux_tva: number; base_ht: number; tva: number; ttc: number }[] } | null;
  if (!Array.isArray(resultat?.details) || !Array.isArray(resultat?.synthese)) return { data: null, error: new Error("Réponse inattendue de export_comptable_tva_collectee") };
  const lignes: unknown[][] = [["Date", "N° facture", "Taux TVA", "Base HT", "TVA", "TTC"]];
  const details = resultat.details.map((g) => ({ date: g.date_emission, numero: g.numero ?? "", taux: Number(g.taux_tva), ht: Number(g.base_ht), tva: Number(g.tva) }));
  for (const detail of details.sort((a, b) => a.date.localeCompare(b.date) || a.numero.localeCompare(b.numero) || a.taux - b.taux)) lignes.push([detail.date, detail.numero, detail.taux, detail.ht, detail.tva, detail.ht + detail.tva]);
  lignes.push([]); lignes.push(["SYNTHÈSE PAR TAUX", "", "Taux TVA", "Base HT", "TVA", "TTC"]);
  for (const total of [...resultat.synthese].sort((a, b) => Number(a.taux_tva) - Number(b.taux_tva))) lignes.push(["TOTAL", "", Number(total.taux_tva), Number(total.base_ht), Number(total.tva), Number(total.ttc)]);
  return { data: { lignes, nom: `tva-${periode.debut}-${periode.fin}`, feuille: "TVA collectée" }, error: null };
}
