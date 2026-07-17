import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { nombreCsv, periodeDepuisUrl, reponseCsv } from "@/lib/csv";
const nomClient = (client: { nom: string | null; prenom: string | null; societe: string | null } | null) => client?.societe || [client?.prenom, client?.nom].filter(Boolean).join(" ") || "";
const un = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;
export async function GET(request: Request) {
  const periode = periodeDepuisUrl(request.url); if (!periode) return Response.json({ error: "Période invalide" }, { status: 400 });
  const type = new URL(request.url).searchParams.get("type") ?? "ventes"; if (!["ventes", "reglements", "tva", "achats", "tva-achats"].includes(type)) return Response.json({ error: "Export inconnu" }, { status: 400 });
  const ctx = await getContexteEntreprise(); const supabase = await createClient();
  if (type === "ventes") {
    const { data, error } = await supabase.from("factures").select("numero,date_emission,date_echeance,type,statut,montant_ht,montant_tva,montant_ttc,montant_paye,client:clients(reference_interne,nom,prenom,societe)").eq("entreprise_id", ctx.entrepriseId).not("numero", "is", null).gte("date_emission", periode.debut).lte("date_emission", periode.fin).order("date_emission").order("numero");
    if (error) return Response.json({ error: error.message }, { status: 503 }); const lignes: unknown[][] = [["Date", "N° facture", "Type", "Statut", "Réf. client", "Client", "HT", "TVA", "TTC", "Encaissé", "Reste dû", "Échéance"]];
    for (const facture of data ?? []) { const client = un(facture.client); const signe = facture.type === "avoir" ? -1 : 1; lignes.push([facture.date_emission, facture.numero, facture.type, facture.statut, client?.reference_interne ?? "", nomClient(client), nombreCsv(signe * Number(facture.montant_ht)), nombreCsv(signe * Number(facture.montant_tva)), nombreCsv(signe * Number(facture.montant_ttc)), nombreCsv(signe * Number(facture.montant_paye)), nombreCsv(signe * Math.max(0, Number(facture.montant_ttc) - Number(facture.montant_paye))), facture.date_echeance ?? ""]); }
    return reponseCsv(lignes, `journal-ventes-${periode.debut}-${periode.fin}.csv`);
  }
  if (type === "reglements") {
    const { data, error } = await supabase.from("paiements").select("date,montant,mode,reference,facture:factures!inner(numero,entreprise_id,type,client:clients(reference_interne,nom,prenom,societe))").eq("facture.entreprise_id", ctx.entrepriseId).gte("date", periode.debut).lte("date", periode.fin).order("date");
    if (error) return Response.json({ error: error.message }, { status: 503 }); const lignes: unknown[][] = [["Date", "N° facture", "Réf. client", "Client", "Mode", "Référence règlement", "Montant"]];
    for (const paiement of data ?? []) { const facture = un(paiement.facture); const client = facture ? un(facture.client) : null; lignes.push([paiement.date, facture?.numero ?? "", client?.reference_interne ?? "", nomClient(client), paiement.mode, paiement.reference ?? "", nombreCsv((facture?.type === "avoir" ? -1 : 1) * Number(paiement.montant))]); }
    return reponseCsv(lignes, `reglements-${periode.debut}-${periode.fin}.csv`);
  }
  if (type === "achats") {
    const { data, error } = await supabase.from("depenses_fournisseurs").select("numero_piece,date_piece,date_echeance,categorie,statut,montant_ht,taux_tva,montant_tva,montant_ttc,montant_regle,fournisseur:fournisseurs(nom),chantier:chantiers(nom)").eq("entreprise_id", ctx.entrepriseId).gte("date_piece", periode.debut).lte("date_piece", periode.fin).neq("statut", "annulee").order("date_piece").order("numero_piece");
    if (error) return Response.json({ error: error.message }, { status: 503 });
    const lignes: unknown[][] = [["Date", "N° facture fournisseur", "Fournisseur", "Catégorie", "Chantier", "Statut", "HT", "Taux TVA", "TVA déductible", "TTC", "Réglé", "Reste à payer", "Échéance"]];
    for (const depense of data ?? []) {
      const fournisseur = un(depense.fournisseur); const chantier = un(depense.chantier);
      lignes.push([depense.date_piece, depense.numero_piece, fournisseur?.nom ?? "", depense.categorie, chantier?.nom ?? "", depense.statut, nombreCsv(Number(depense.montant_ht)), nombreCsv(Number(depense.taux_tva)), nombreCsv(Number(depense.montant_tva)), nombreCsv(Number(depense.montant_ttc)), nombreCsv(Number(depense.montant_regle)), nombreCsv(Math.max(0, Number(depense.montant_ttc) - Number(depense.montant_regle))), depense.date_echeance ?? ""]);
    }
    return reponseCsv(lignes, `journal-achats-${periode.debut}-${periode.fin}.csv`);
  }
  if (type === "tva-achats") {
    const { data, error } = await supabase.from("depenses_fournisseurs").select("numero_piece,date_piece,montant_ht,taux_tva,montant_tva,montant_ttc,fournisseur:fournisseurs(nom)").eq("entreprise_id", ctx.entrepriseId).gte("date_piece", periode.debut).lte("date_piece", periode.fin).neq("statut", "annulee").order("date_piece").order("numero_piece");
    if (error) return Response.json({ error: error.message }, { status: 503 });
    const lignes: unknown[][] = [["Date", "N° facture fournisseur", "Fournisseur", "Taux TVA", "Base HT", "TVA déductible", "TTC"]];
    const totaux = new Map<number, { ht: number; tva: number; ttc: number }>();
    for (const depense of data ?? []) {
      const fournisseur = un(depense.fournisseur); const taux = Number(depense.taux_tva); const ht = Number(depense.montant_ht); const tva = Number(depense.montant_tva); const ttc = Number(depense.montant_ttc);
      lignes.push([depense.date_piece, depense.numero_piece, fournisseur?.nom ?? "", nombreCsv(taux), nombreCsv(ht), nombreCsv(tva), nombreCsv(ttc)]);
      const total = totaux.get(taux) ?? { ht: 0, tva: 0, ttc: 0 }; total.ht += ht; total.tva += tva; total.ttc += ttc; totaux.set(taux, total);
    }
    lignes.push([]); lignes.push(["SYNTHÈSE PAR TAUX", "", "", "Taux TVA", "Base HT", "TVA déductible", "TTC"]);
    for (const [taux, total] of [...totaux].sort(([a], [b]) => a - b)) lignes.push(["TOTAL", "", "", nombreCsv(taux), nombreCsv(total.ht), nombreCsv(total.tva), nombreCsv(total.ttc)]);
    return reponseCsv(lignes, `tva-deductible-achats-${periode.debut}-${periode.fin}.csv`);
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
    lignes.push([detail.date, detail.numero, nombreCsv(detail.taux), nombreCsv(detail.ht), nombreCsv(detail.tva), nombreCsv(detail.ht + detail.tva)]);
    const total = totaux.get(detail.taux) ?? { ht: 0, tva: 0 }; total.ht += detail.ht; total.tva += detail.tva; totaux.set(detail.taux, total);
  }
  lignes.push([]); lignes.push(["SYNTHÈSE PAR TAUX", "", "Taux TVA", "Base HT", "TVA", "TTC"]); for (const [taux, total] of [...totaux].sort(([a], [b]) => a - b)) lignes.push(["TOTAL", "", nombreCsv(taux), nombreCsv(total.ht), nombreCsv(total.tva), nombreCsv(total.ht + total.tva)]);
  return reponseCsv(lignes, `tva-${periode.debut}-${periode.fin}.csv`);
}
