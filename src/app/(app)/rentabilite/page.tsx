import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur, aAccesIA } from "@/lib/permissions";
import { euros } from "@/lib/devis";
import { Lien as Link } from "@/components/Lien";
import { AnalyseRentabiliteIA } from "@/components/AnalyseRentabiliteIA";
import { iaEstActive } from "@/lib/preview-features";

type PointageRentabilite = { chantier_id: string; heures_normales: number; heures_supplementaires: number; employe: { cout_horaire: number | null } | { cout_horaire: number | null }[] | null };
type MouvementStockRentabilite = { chantier_id: string; quantite: number; article: { prix_achat_ht: number } | { prix_achat_ht: number }[] | null };
const un = <T,>(valeur: T | T[] | null): T | null => Array.isArray(valeur) ? valeur[0] ?? null : valeur;

export default async function RentabilitePage() {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const peutUtiliserIA = iaEstActive() && aAccesIA(await permissionsUtilisateur(ctx));
  const [{ data: chantiers }, { data: factures }, { data: devis }, { data: donneesPointages }, { data: depenses }, { data: donneesIndemnites }, { data: donneesMouvementsStock }, { data: donneesNotesFrais }] = await Promise.all([
    supabase.from("chantiers").select("id, reference_interne, nom, statut, client:clients(nom, prenom, societe)").eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }),
    supabase.from("factures").select("chantier_id, montant_ht, statut, type").eq("entreprise_id", ctx.entrepriseId),
    supabase.from("devis").select("chantier_id, montant_ht, statut").eq("entreprise_id", ctx.entrepriseId).eq("statut", "accepte"),
    supabase.from("pointages").select("chantier_id, heures_normales, heures_supplementaires, employe:employes(cout_horaire)").eq("entreprise_id", ctx.entrepriseId).eq("verification_statut", "valide"),
    supabase.from("depenses_fournisseurs").select("chantier_id, montant_ht, statut, categorie").eq("entreprise_id", ctx.entrepriseId),
    supabase.rpc("couts_indemnites_paie_par_chantier", { p_entreprise_id: ctx.entrepriseId }),
    supabase.from("mouvements_stock").select("chantier_id, quantite, article:articles_stock(prix_achat_ht)").eq("entreprise_id", ctx.entrepriseId).eq("type", "sortie").not("chantier_id", "is", null),
    supabase.from("notes_frais").select("chantier_id, montant_ttc, statut").eq("entreprise_id", ctx.entrepriseId).not("chantier_id", "is", null).in("statut", ["valide", "exporte_comptabilite", "verrouille", "archive", "validee", "remboursee"]),
  ]);
  const pointages = (donneesPointages ?? []) as PointageRentabilite[];
  const indemnitesPaie = (donneesIndemnites ?? []) as { chantier_id: string; total: number }[];
  const mouvementsStock = (donneesMouvementsStock ?? []) as MouvementStockRentabilite[];
  const notesFrais = (donneesNotesFrais ?? []) as { chantier_id: string; montant_ttc: number }[];
  const lignes = (chantiers ?? []).map((chantier) => {
    const budgetHt = (devis ?? []).filter((item) => item.chantier_id === chantier.id).reduce((s, item) => s + Number(item.montant_ht), 0);
    const factureHt = (factures ?? []).filter((item) => item.chantier_id === chantier.id && !["annulee", "avoir_emis"].includes(item.statut)).reduce((s, item) => s + Number(item.montant_ht), 0);
    let heures = 0; let coutMainOeuvre = 0; let coutHoraireManquant = false;
    for (const pointage of pointages.filter((item) => item.chantier_id === chantier.id)) {
      const total = Number(pointage.heures_normales) + Number(pointage.heures_supplementaires);
      const coutHoraire = un(pointage.employe)?.cout_horaire;
      if (!coutHoraire && total > 0) coutHoraireManquant = true;
      heures += total; coutMainOeuvre += total * Number(coutHoraire ?? 0);
    }
    const depensesChantier = (depenses ?? []).filter((item) => item.chantier_id === chantier.id && item.statut !== "annulee");
    const coutSousTraitance = depensesChantier.filter((item) => item.categorie === "sous_traitance").reduce((s, item) => s + Number(item.montant_ht), 0);
    const coutAchats = depensesChantier.filter((item) => item.categorie !== "sous_traitance").reduce((s, item) => s + Number(item.montant_ht), 0);
    const coutIndemnitesPaie = Number(indemnitesPaie.find((item) => item.chantier_id === chantier.id)?.total ?? 0);
    const coutStock = mouvementsStock.filter((item) => item.chantier_id === chantier.id).reduce((s, item) => s + Number(item.quantite) * Number(un(item.article)?.prix_achat_ht ?? 0), 0);
    const coutNotesFrais = notesFrais.filter((item) => item.chantier_id === chantier.id).reduce((s, item) => s + Number(item.montant_ttc), 0);
    const marge = factureHt - coutMainOeuvre - coutAchats - coutSousTraitance - coutIndemnitesPaie - coutStock - coutNotesFrais;
    const taux = factureHt > 0 ? (marge / factureHt) * 100 : null;
    const client = un(chantier.client);
    const clientNom = client ? client.societe || [client.prenom, client.nom].filter(Boolean).join(" ") : "—";
    return { ...chantier, clientNom, budgetHt, factureHt, heures, coutMainOeuvre, coutHoraireManquant, coutAchats, coutSousTraitance, coutIndemnitesPaie, coutStock, coutNotesFrais, marge, taux };
  });
  const chantiersCoutHoraireManquant = lignes.filter((l) => l.coutHoraireManquant).length;
  const totalFacture = lignes.reduce((s, ligne) => s + ligne.factureHt, 0);
  const totalCoutMo = lignes.reduce((s, ligne) => s + ligne.coutMainOeuvre, 0); const totalAchats = lignes.reduce((s, ligne) => s + ligne.coutAchats, 0); const totalSousTraitance = lignes.reduce((s, ligne) => s + ligne.coutSousTraitance, 0); const totalIndemnitesPaie = lignes.reduce((s, ligne) => s + ligne.coutIndemnitesPaie, 0); const totalStock = lignes.reduce((s, ligne) => s + ligne.coutStock, 0); const totalNotesFrais = lignes.reduce((s, ligne) => s + ligne.coutNotesFrais, 0); const totalCout = totalCoutMo + totalAchats + totalSousTraitance + totalIndemnitesPaie + totalStock + totalNotesFrais;
  const totalMarge = totalFacture - totalCout;
  const tauxGlobal = totalFacture > 0 ? totalMarge / totalFacture * 100 : 0;
  const chantiersAvecActivite = lignes.filter((ligne) => ligne.factureHt > 0 || ligne.heures > 0 || ligne.budgetHt > 0);
  const meilleursChantiers = [...chantiersAvecActivite].sort((a, b) => b.marge - a.marge).slice(0, 8);
  const plusGrandVolume = Math.max(1, ...meilleursChantiers.map((ligne) => Math.max(ligne.factureHt, ligne.factureHt - ligne.marge)));

  return <main className="p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div><h1 className="text-xl font-semibold">Rentabilité des chantiers</h1><p className="text-sm text-neutral-500">Chiffre d’affaires moins main-d’œuvre pointée et dépenses fournisseurs réelles.</p></div>
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-9"><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">CA HT</div><div className="mt-1 font-mono text-lg font-semibold">{euros(totalFacture)}</div></div><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">Main-d’œuvre</div><div className="mt-1 font-mono text-lg font-semibold">{euros(totalCoutMo)}</div></div><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">Achats / charges</div><div className="mt-1 font-mono text-lg font-semibold">{euros(totalAchats)}</div></div><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">Stock consommé</div><div className="mt-1 font-mono text-lg font-semibold">{euros(totalStock)}</div></div><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">Sous-traitance</div><div className="mt-1 font-mono text-lg font-semibold">{euros(totalSousTraitance)}</div></div><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">Notes de frais</div><div className="mt-1 font-mono text-lg font-semibold">{euros(totalNotesFrais)}</div></div><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">Indemnités paie</div><div className="mt-1 font-mono text-lg font-semibold">{euros(totalIndemnitesPaie)}</div></div><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">Marge</div><div className={`mt-1 font-mono text-lg font-semibold ${totalMarge>=0?"text-green-700":"text-red-700"}`}>{euros(totalMarge)}</div></div><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">Taux</div><div className="mt-1 font-mono text-lg font-semibold">{tauxGlobal.toFixed(1)} %</div></div></div>
    <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">La marge inclut désormais les factures fournisseurs rattachées au chantier, le stock sorti vers le chantier, les notes de frais validées, ainsi que les indemnités de trajet, panier et grand déplacement issues de la paie. Les frais généraux non affectés restent hors marge chantier.</div>
    {chantiersCoutHoraireManquant > 0 && <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">⚠ {chantiersCoutHoraireManquant} chantier(s) ont des heures pointées par un salarié sans coût horaire renseigné : leur coût de main-d’œuvre est sous-estimé (compté à 0 €/h). <Link href="/employes" className="font-semibold underline">Renseigner le coût horaire</Link> dans la fiche du salarié concerné.</div>}
    {peutUtiliserIA && <AnalyseRentabiliteIA chantiers={lignes.map((l) => ({ id: l.id, nom: l.nom }))} />}
    <section className="rounded-md border p-4 dark:border-neutral-800">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><h2 className="font-semibold">Lecture rapide des chantiers</h2><p className="text-xs text-neutral-500">Les huit chantiers ayant le plus de marge. Bleu : chiffre d’affaires, orange : coûts engagés.</p></div><div className="flex gap-3 text-xs text-neutral-500"><span><i className="mr-1 inline-block h-2 w-2 bg-blue-500"/>CA HT</span><span><i className="mr-1 inline-block h-2 w-2 bg-orange-400"/>Coûts</span></div></div>
      <div className="space-y-3">{meilleursChantiers.length ? meilleursChantiers.map((ligne) => { const cout = ligne.factureHt-ligne.marge; return <Link key={ligne.id} href={`/chantiers/${ligne.id}`} className="grid gap-2 rounded-md p-2 hover:bg-neutral-50 dark:hover:bg-neutral-900 sm:grid-cols-[180px_1fr_110px] sm:items-center"><div className="min-w-0"><p className="truncate text-sm font-medium">{ligne.nom}</p><p className="truncate text-xs text-neutral-500">{ligne.clientNom}</p></div><div className="space-y-1"><div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800"><div className="h-2 rounded-full bg-blue-500" style={{width:`${ligne.factureHt/plusGrandVolume*100}%`}}/></div><div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800"><div className="h-2 rounded-full bg-orange-400" style={{width:`${Math.max(0,cout)/plusGrandVolume*100}%`}}/></div></div><div className={`text-right text-sm font-semibold ${ligne.marge>=0?"text-green-700":"text-red-700"}`}>{euros(ligne.marge)}<p className="text-xs font-normal text-neutral-500">{ligne.taux===null?"non facturé":`${ligne.taux.toFixed(1)} %`}</p></div></Link> }) : <p className="py-8 text-center text-sm text-neutral-500">Aucune activité chiffrée à afficher.</p>}</div>
    </section>
    <div>
      <h2 className="mb-2 font-semibold">Détail de tous les chantiers</h2>
      <p className="mb-3 text-xs text-neutral-500">Faites glisser le tableau horizontalement sur téléphone.</p>
      <div className="overflow-x-auto rounded-md border dark:border-neutral-800"><table className="w-full min-w-[1380px] table-fixed text-sm"><thead className="sticky top-0 bg-neutral-100 text-left text-xs uppercase text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300"><tr><th className="w-52 px-3 py-3">Chantier</th><th className="w-40 px-3">Client</th><th className="w-28 px-3 text-right">Facturé HT</th><th className="w-20 px-3 text-right">Heures</th><th className="w-28 px-3 text-right">Coût MO</th><th className="w-28 px-3 text-right">Achats</th><th className="w-28 px-3 text-right">Stock</th><th className="w-32 px-3 text-right">Sous-traitance</th><th className="w-28 px-3 text-right">Frais</th><th className="w-28 px-3 text-right">Indemnités</th><th className="w-28 px-3 text-right">Marge</th><th className="w-24 px-3 text-right">Taux</th></tr></thead><tbody>{lignes.map((ligne,index)=><tr key={ligne.id} className={`border-t dark:border-neutral-800 ${index%2?"bg-neutral-50/60 dark:bg-neutral-900/40":""}`}><td className="px-3 py-3"><Link href={`/chantiers/${ligne.id}`} className="font-medium hover:underline">{ligne.nom}</Link><div className="font-mono text-xs text-neutral-400">{ligne.reference_interne}</div></td><td className="truncate px-3" title={ligne.clientNom}>{ligne.clientNom}</td><td className="px-3 text-right font-mono">{euros(ligne.factureHt)}</td><td className="px-3 text-right font-mono">{ligne.heures} h</td><td className="px-3 text-right font-mono">{euros(ligne.coutMainOeuvre)}{ligne.coutHoraireManquant && <span title="Coût horaire manquant pour au moins un salarié : coût sous-estimé" className="ml-1 text-amber-600">⚠</span>}</td><td className="px-3 text-right font-mono">{euros(ligne.coutAchats)}</td><td className="px-3 text-right font-mono">{euros(ligne.coutStock)}</td><td className="px-3 text-right font-mono">{euros(ligne.coutSousTraitance)}</td><td className="px-3 text-right font-mono">{euros(ligne.coutNotesFrais)}</td><td className="px-3 text-right font-mono">{euros(ligne.coutIndemnitesPaie)}</td><td className={`px-3 text-right font-mono font-semibold ${ligne.marge>=0?"bg-green-50 text-green-700 dark:bg-green-950/30":"bg-red-50 text-red-700 dark:bg-red-950/30"}`}>{euros(ligne.marge)}</td><td className="px-3 text-right"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${ligne.taux===null?"bg-neutral-100 text-neutral-500":ligne.taux>=20?"bg-green-100 text-green-800":ligne.taux>=0?"bg-amber-100 text-amber-800":"bg-red-100 text-red-800"}`}>{ligne.taux===null?"—":`${ligne.taux.toFixed(1)} %`}</span></td></tr>)}</tbody></table></div>
    </div>
  </div></main>;
}
