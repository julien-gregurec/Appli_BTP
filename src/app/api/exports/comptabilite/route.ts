import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { periodeDepuisUrl, reponseCsv } from "@/lib/csv";
import { reponseXlsx } from "@/lib/xlsx";
const nomClient = (client: { nom: string | null; prenom: string | null; societe: string | null } | null) => client?.societe || [client?.prenom, client?.nom].filter(Boolean).join(" ") || "";
const un = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;
const reponseExport = (lignes: unknown[][], nom: string, feuille: string, format: string) => format === "csv"
  ? reponseCsv(lignes, `${nom}.csv`)
  : reponseXlsx(lignes, `${nom}.xlsx`, { nomFeuille: feuille });
export async function GET(request: Request) {
  const periode = periodeDepuisUrl(request.url); if (!periode) return Response.json({ error: "Période invalide" }, { status: 400 });
  const url = new URL(request.url); const type = url.searchParams.get("type") ?? "ventes"; const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx"; if (!["ventes", "reglements", "tva", "achats", "tva-achats"].includes(type)) return Response.json({ error: "Export inconnu" }, { status: 400 });
  const ctx = await getContexteEntreprise(); const supabase = await createClient();
  if (type === "ventes") {
    const { data, error } = await supabase.from("factures").select("numero,date_emission,date_echeance,type,statut,montant_ht,montant_tva,montant_ttc,montant_paye,client:clients(reference_interne,nom,prenom,societe)").eq("entreprise_id", ctx.entrepriseId).not("numero", "is", null).gte("date_emission", periode.debut).lte("date_emission", periode.fin).order("date_emission").order("numero");
    if (error) return Response.json({ error: error.message }, { status: 503 }); const lignes: unknown[][] = [["Date", "N° facture", "Type", "Statut", "Réf. client", "Client", "HT", "TVA", "TTC", "Encaissé", "Reste dû", "Échéance"]];
    for (const facture of data ?? []) { const client = un(facture.client); const signe = facture.type === "avoir" ? -1 : 1; lignes.push([facture.date_emission, facture.numero, facture.type, facture.statut, client?.reference_interne ?? "", nomClient(client), signe * Number(facture.montant_ht), signe * Number(facture.montant_tva), signe * Number(facture.montant_ttc), signe * Number(facture.montant_paye), signe * Math.max(0, Number(facture.montant_ttc) - Number(facture.montant_paye)), facture.date_echeance ?? ""]); }
    return reponseExport(lignes, `journal-ventes-${periode.debut}-${periode.fin}`, "Journal des ventes", format);
  }
  if (type === "reglements") {
    const { data, error } = await supabase.from("paiements").select("date,montant,mode,reference,facture:factures!inner(numero,entreprise_id,type,client:clients(reference_interne,nom,prenom,societe))").eq("facture.entreprise_id", ctx.entrepriseId).gte("date", periode.debut).lte("date", periode.fin).order("date");
    if (error) return Response.json({ error: error.message }, { status: 503 }); const lignes: unknown[][] = [["Date", "N° facture", "Réf. client", "Client", "Mode", "Référence règlement", "Montant"]];
    for (const paiement of data ?? []) { const facture = un(paiement.facture); const client = facture ? un(facture.client) : null; lignes.push([paiement.date, facture?.numero ?? "", client?.reference_interne ?? "", nomClient(client), paiement.mode, paiement.reference ?? "", (facture?.type === "avoir" ? -1 : 1) * Number(paiement.montant)]); }
    return reponseExport(lignes, `reglements-${periode.debut}-${periode.fin}`, "Règlements clients", format);
  }
  if (type === "achats") {
    const { data, error } = await supabase.from("depenses_fournisseurs").select("numero_piece,date_piece,date_echeance,categorie,statut,montant_ht,taux_tva,montant_tva,montant_ttc,montant_regle,fournisseur:fournisseurs(nom),chantier:chantiers(nom)").eq("entreprise_id", ctx.entrepriseId).gte("date_piece", periode.debut).lte("date_piece", periode.fin).neq("statut", "annulee").order("date_piece").order("numero_piece");
    if (error) return Response.json({ error: error.message }, { status: 503 });
    const lignes: unknown[][] = [["Date", "N° facture fournisseur", "Fournisseur", "Catégorie", "Chantier", "Statut", "HT", "Taux TVA", "TVA déductible", "TTC", "Réglé", "Reste à payer", "Échéance"]];
    for (const depense of data ?? []) {
      const fournisseur = un(depense.fournisseur); const chantier = un(depense.chantier);
      lignes.push([depense.date_piece, depense.numero_piece, fournisseur?.nom ?? "", depense.categorie, chantier?.nom ?? "", depense.statut, Number(depense.montant_ht), Number(depense.taux_tva), Number(depense.montant_tva), Number(depense.montant_ttc), Number(depense.montant_regle), Math.max(0, Number(depense.montant_ttc) - Number(depense.montant_regle)), depense.date_echeance ?? ""]);
    }
    return reponseExport(lignes, `journal-achats-${periode.debut}-${periode.fin}`, "Journal des achats", format);
  }
  if (type === "tva-achats") {
    const { data, error } = await supabase.from("depenses_fournisseurs").select("numero_piece,date_piece,montant_ht,taux_tva,montant_tva,montant_ttc,fournisseur:fournisseurs(nom)").eq("entreprise_id", ctx.entrepriseId).gte("date_piece", periode.debut).lte("date_piece", periode.fin).neq("statut", "annulee").order("date_piece").order("numero_piece");
    if (error) return Response.json({ error: error.message }, { status: 503 });
    const lignes: unknown[][] = [["Date", "N° facture fournisseur", "Fournisseur", "Taux TVA", "Base HT", "TVA déductible", "TTC"]];
    const totaux = new Map<number, { ht: number; tva: number; ttc: number }>();
    for (const depense of data ?? []) {
      const fournisseur = un(depense.fournisseur); const taux = Number(depense.taux_tva); const ht = Number(depense.montant_ht); const tva = Number(depense.montant_tva); const ttc = Number(depense.montant_ttc);
      lignes.push([depense.date_piece, depense.numero_piece, fournisseur?.nom ?? "", taux, ht, tva, ttc]);
      const total = totaux.get(taux) ?? { ht: 0, tva: 0, ttc: 0 }; total.ht += ht; total.tva += tva; total.ttc += ttc; totaux.set(taux, total);
    }
    lignes.push([]); lignes.push(["SYNTHÈSE PAR TAUX", "", "", "Taux TVA", "Base HT", "TVA déductible", "TTC"]);
    for (const [taux, total] of [...totaux].sort(([a], [b]) => a - b)) lignes.push(["TOTAL", "", "", taux, total.ht, total.tva, total.ttc]);
    return reponseExport(lignes, `tva-deductible-achats-${periode.debut}-${periode.fin}`, "TVA déductible", format);
  }
  const { data, error } = await supabase.from("lignes_factures").select("quantite,prix_unitaire_ht,remise_ligne,taux_tva,facture:factures!inner(numero,date_emission,entreprise_id,type,statut)").eq("facture.entreprise_id", ctx.entrepriseId).not("facture.numero", "is", null).gte("facture.date_emission", periode.debut).lte("facture.date_emission", periode.fin).neq("facture.statut", "annulee").order("date_emission", { referencedTable: "factures" });
  if (error) return Response.json({ error: error.message }, { status: 503 });
  const lignes: unknown[][] = [["Date", "N° facture", "Taux TVA", "Base HT", "TVA", "TTC"]];
  const details = new Map<string, { date: string; numero: string; taux: number; ht: number; tva: number }>();
  for (const ligne of data ?? []) {
    const facture = un(ligne.facture); if (!facture) continue;
    const signe = facture.type === "avoir" ? -1 : 1; const taux = Number(ligne.taux_tva);
    const ht = signe * Number(ligne.quantite) * Number(ligne.prix_unitaire_ht) * (1 - Number(ligne.remise_ligne) / 100); const tva = ht * taux / 100;
    const cle = `${facture.numero}|${taux}`; const detail = details.get(cle) ?? { date: facture.date_emission, numero: facture.numero ?? "", taux, ht: 0, tva: 0 };
    detail.ht += ht; detail.tva += tva; details.set(cle, detail);
  }
  const totaux = new Map<number, { ht: number; tva: number }>();
  for (const detail of [...details.values()].sort((a, b) => a.date.localeCompare(b.date) || a.numero.localeCompare(b.numero) || a.taux - b.taux)) {
    lignes.push([detail.date, detail.numero, detail.taux, detail.ht, detail.tva, detail.ht + detail.tva]);
    const total = totaux.get(detail.taux) ?? { ht: 0, tva: 0 }; total.ht += detail.ht; total.tva += detail.tva; totaux.set(detail.taux, total);
  }
  lignes.push([]); lignes.push(["SYNTHÈSE PAR TAUX", "", "Taux TVA", "Base HT", "TVA", "TTC"]); for (const [taux, total] of [...totaux].sort(([a], [b]) => a - b)) lignes.push(["TOTAL", "", taux, total.ht, total.tva, total.ht + total.tva]);
  return reponseExport(lignes, `tva-${periode.debut}-${periode.fin}`, "TVA collectée", format);
}
