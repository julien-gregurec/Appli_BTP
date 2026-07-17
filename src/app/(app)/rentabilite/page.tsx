import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { euros } from "@/lib/devis";
import { Lien as Link } from "@/components/Lien";

type PointageRentabilite = { chantier_id: string; heures_normales: number; heures_supplementaires: number; employe: { cout_horaire: number | null } | { cout_horaire: number | null }[] | null };
const un = <T,>(valeur: T | T[] | null): T | null => Array.isArray(valeur) ? valeur[0] ?? null : valeur;

export default async function RentabilitePage() {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const [{ data: chantiers }, { data: factures }, { data: devis }, { data: donneesPointages }, { data: depenses }] = await Promise.all([
    supabase.from("chantiers").select("id, reference_interne, nom, statut, client:clients(nom, prenom, societe)").eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false }),
    supabase.from("factures").select("chantier_id, montant_ht, statut, type").eq("entreprise_id", ctx.entrepriseId),
    supabase.from("devis").select("chantier_id, montant_ht, statut").eq("entreprise_id", ctx.entrepriseId).eq("statut", "accepte"),
    supabase.from("pointages").select("chantier_id, heures_normales, heures_supplementaires, employe:employes(cout_horaire)").eq("entreprise_id", ctx.entrepriseId),
    supabase.from("depenses_fournisseurs").select("chantier_id, montant_ht, statut").eq("entreprise_id", ctx.entrepriseId),
  ]);
  const pointages = (donneesPointages ?? []) as PointageRentabilite[];
  const lignes = (chantiers ?? []).map((chantier) => {
    const budgetHt = (devis ?? []).filter((item) => item.chantier_id === chantier.id).reduce((s, item) => s + Number(item.montant_ht), 0);
    const factureHt = (factures ?? []).filter((item) => item.chantier_id === chantier.id && !["annulee", "avoir_emis"].includes(item.statut) && item.type !== "avoir").reduce((s, item) => s + Number(item.montant_ht), 0);
    let heures = 0; let coutMainOeuvre = 0;
    for (const pointage of pointages.filter((item) => item.chantier_id === chantier.id)) {
      const total = Number(pointage.heures_normales) + Number(pointage.heures_supplementaires);
      const cout = Number(un(pointage.employe)?.cout_horaire ?? 0);
      heures += total; coutMainOeuvre += total * cout;
    }
    const coutAchats = (depenses ?? []).filter((item) => item.chantier_id === chantier.id && item.statut !== "annulee").reduce((s, item) => s + Number(item.montant_ht), 0);
    const marge = factureHt - coutMainOeuvre - coutAchats;
    const taux = factureHt > 0 ? (marge / factureHt) * 100 : null;
    const client = un(chantier.client);
    const clientNom = client ? client.societe || [client.prenom, client.nom].filter(Boolean).join(" ") : "—";
    return { ...chantier, clientNom, budgetHt, factureHt, heures, coutMainOeuvre, coutAchats, marge, taux };
  });
  const totalFacture = lignes.reduce((s, ligne) => s + ligne.factureHt, 0);
  const totalCoutMo = lignes.reduce((s, ligne) => s + ligne.coutMainOeuvre, 0); const totalAchats = lignes.reduce((s, ligne) => s + ligne.coutAchats, 0); const totalCout = totalCoutMo + totalAchats;
  const totalMarge = totalFacture - totalCout;
  const tauxGlobal = totalFacture > 0 ? totalMarge / totalFacture * 100 : 0;

  return <main className="p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div><h1 className="text-xl font-semibold">Rentabilité des chantiers</h1><p className="text-sm text-neutral-500">Chiffre d’affaires moins main-d’œuvre pointée et dépenses fournisseurs réelles.</p></div>
    <div className="grid grid-cols-5 gap-3"><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">CA HT</div><div className="mt-1 font-mono text-lg font-semibold">{euros(totalFacture)}</div></div><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">Main-d’œuvre</div><div className="mt-1 font-mono text-lg font-semibold">{euros(totalCoutMo)}</div></div><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">Achats / charges</div><div className="mt-1 font-mono text-lg font-semibold">{euros(totalAchats)}</div></div><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">Marge</div><div className={`mt-1 font-mono text-lg font-semibold ${totalMarge>=0?"text-green-700":"text-red-700"}`}>{euros(totalMarge)}</div></div><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">Taux</div><div className="mt-1 font-mono text-lg font-semibold">{tauxGlobal.toFixed(1)} %</div></div></div>
    <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">La marge inclut désormais les factures fournisseurs rattachées au chantier. Les frais généraux non affectés restent hors marge chantier.</div>
    <div className="overflow-hidden rounded-md border"><table className="w-full text-sm"><thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500"><tr><th className="px-3 py-2">Chantier</th><th>Client</th><th className="text-right">Facturé HT</th><th className="text-right">Heures</th><th className="text-right">Coût MO</th><th className="text-right">Achats</th><th className="text-right">Marge</th><th className="px-3 text-right">Taux</th></tr></thead><tbody>{lignes.map(ligne=><tr key={ligne.id} className="border-t"><td className="px-3 py-2"><Link href={`/chantiers/${ligne.id}`} className="font-medium hover:underline">{ligne.nom}</Link><div className="font-mono text-xs text-neutral-400">{ligne.reference_interne}</div></td><td>{ligne.clientNom}</td><td className="text-right">{euros(ligne.factureHt)}</td><td className="text-right">{ligne.heures} h</td><td className="text-right">{euros(ligne.coutMainOeuvre)}</td><td className="text-right">{euros(ligne.coutAchats)}</td><td className={`text-right font-medium ${ligne.marge>=0?"text-green-700":"text-red-700"}`}>{euros(ligne.marge)}</td><td className="px-3 text-right">{ligne.taux===null?"—":`${ligne.taux.toFixed(1)} %`}</td></tr>)}</tbody></table></div>
  </div></main>;
}
