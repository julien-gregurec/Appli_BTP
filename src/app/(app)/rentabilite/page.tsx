import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { permissionsUtilisateur, aAccesIA } from "@/lib/permissions";
import { euros } from "@/lib/devis";
import { Lien as Link } from "@/components/Lien";
import { AnalyseRentabiliteIA } from "@/components/AnalyseRentabiliteIA";
import { iaEstActive } from "@/lib/preview-features";
import { lireRentabilitePage, lireRentabiliteTotaux, type RentabiliteLigne, type RentabiliteTotaux } from "@/lib/rentabilite";

const TAILLE_PAGE = 50;
type ChantierAffiche = { id: string; reference_interne: string | null; nom: string; statut: string; client: { nom: string | null; prenom: string | null; societe: string | null } | { nom: string | null; prenom: string | null; societe: string | null }[] | null };
const un = <T,>(valeur: T | T[] | null): T | null => Array.isArray(valeur) ? valeur[0] ?? null : valeur;

// Totaux et marges calculés par PostgreSQL (RPC rentabilite_chantiers_*,
// 20260930000301) : la page ne lit plus pointages, factures, dépenses… ligne à
// ligne (PostgREST les tronquait à 1 000 lignes sans erreur). Liste paginée.
export default async function RentabilitePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Math.floor(Number(pageParam)) || 1);
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const peutUtiliserIA = iaEstActive() && aAccesIA(await permissionsUtilisateur(ctx));
  let donnees: [RentabiliteTotaux, RentabiliteLigne[], RentabiliteLigne[]] | null = null;
  try {
    donnees = await Promise.all([
      lireRentabiliteTotaux(supabase, ctx.entrepriseId),
      lireRentabilitePage(supabase, ctx.entrepriseId, { tri: "recent", limite: TAILLE_PAGE, decalage: (page - 1) * TAILLE_PAGE }),
      lireRentabilitePage(supabase, ctx.entrepriseId, { tri: "marge_desc", limite: 8, decalage: 0, avecActivite: true }),
    ]);
  } catch (err) {
    console.error("[rentabilite] totaux indisponibles", err instanceof Error ? err.message : err);
  }
  if (!donnees) {
    return <main className="p-8"><div className="mx-auto max-w-6xl space-y-6">
      <div><h1 className="text-xl font-semibold">Rentabilité des chantiers</h1></div>
      <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">La rentabilité n’a pas pu être calculée pour le moment. Aucun total partiel n’est affiché ; réessayez dans quelques instants.</div>
    </div></main>;
  }
  const [totaux, lignesPage, lignesMeilleures] = donnees;
  const idsAffiches = [...new Set([...lignesPage, ...lignesMeilleures].map((l) => l.chantierId))];
  const [{ data: chantiersAffiches }, { data: chantiersIA }] = await Promise.all([
    idsAffiches.length
      ? supabase.from("chantiers").select("id, reference_interne, nom, statut, client:clients(nom, prenom, societe)").eq("entreprise_id", ctx.entrepriseId).in("id", idsAffiches)
      : Promise.resolve({ data: [] as ChantierAffiche[] }),
    peutUtiliserIA
      ? supabase.from("chantiers").select("id, nom").eq("entreprise_id", ctx.entrepriseId).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; nom: string }[] }),
  ]);
  const chantierParId = new Map(((chantiersAffiches ?? []) as ChantierAffiche[]).map((c) => [c.id, c]));
  const avecChantier = (ligne: RentabiliteLigne) => {
    const chantier = chantierParId.get(ligne.chantierId);
    const client = un(chantier?.client ?? null);
    const clientNom = client ? client.societe || [client.prenom, client.nom].filter(Boolean).join(" ") : "—";
    return { ...ligne, id: ligne.chantierId, nom: chantier?.nom ?? "Chantier", reference_interne: chantier?.reference_interne ?? null, clientNom };
  };
  const lignes = lignesPage.map(avecChantier);
  const meilleursChantiers = lignesMeilleures.map(avecChantier);
  const chantiersCoutHoraireManquant = totaux.nbChantiersCoutHoraireManquant;
  const totalFacture = totaux.factureHt;
  const totalCoutMo = totaux.coutMainOeuvre; const totalAchats = totaux.coutAchats; const totalSousTraitance = totaux.coutSousTraitance; const totalIndemnitesPaie = totaux.coutIndemnitesPaie; const totalStock = totaux.coutStock; const totalNotesFrais = totaux.coutNotesFrais;
  const totalMarge = totaux.marge;
  const tauxGlobal = totaux.taux;
  const plusGrandVolume = Math.max(1, ...meilleursChantiers.map((ligne) => Math.max(ligne.factureHt, ligne.factureHt - ligne.marge)));
  const nbPages = Math.max(1, Math.ceil(totaux.nbChantiers / TAILLE_PAGE));
  const heures = (valeur: number) => `${Math.round(valeur * 100) / 100} h`;

  return <main className="p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div><h1 className="text-xl font-semibold">Rentabilité des chantiers</h1><p className="text-sm text-neutral-500">Chiffre d’affaires moins main-d’œuvre pointée et dépenses fournisseurs réelles.</p></div>
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-9"><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">CA HT</div><div className="mt-1 font-mono text-lg font-semibold">{euros(totalFacture)}</div></div><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">Main-d’œuvre</div><div className="mt-1 font-mono text-lg font-semibold">{euros(totalCoutMo)}</div></div><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">Achats / charges</div><div className="mt-1 font-mono text-lg font-semibold">{euros(totalAchats)}</div></div><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">Stock consommé</div><div className="mt-1 font-mono text-lg font-semibold">{euros(totalStock)}</div></div><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">Sous-traitance</div><div className="mt-1 font-mono text-lg font-semibold">{euros(totalSousTraitance)}</div></div><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">Notes de frais</div><div className="mt-1 font-mono text-lg font-semibold">{euros(totalNotesFrais)}</div></div><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">Indemnités paie</div><div className="mt-1 font-mono text-lg font-semibold">{euros(totalIndemnitesPaie)}</div></div><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">Marge</div><div className={`mt-1 font-mono text-lg font-semibold ${totalMarge>=0?"text-green-700":"text-red-700"}`}>{euros(totalMarge)}</div></div><div className="rounded-md border p-4"><div className="text-xs text-neutral-500">Taux</div><div className="mt-1 font-mono text-lg font-semibold">{tauxGlobal.toFixed(1)} %</div></div></div>
    <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">La marge inclut désormais les factures fournisseurs rattachées au chantier, le stock sorti vers le chantier, les notes de frais validées, ainsi que les indemnités de trajet, panier et grand déplacement issues de la paie. Les frais généraux non affectés restent hors marge chantier.</div>
    {chantiersCoutHoraireManquant > 0 && <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">⚠ {chantiersCoutHoraireManquant} chantier(s) ont des heures pointées par un salarié sans coût horaire renseigné : leur coût de main-d’œuvre est sous-estimé (compté à 0 €/h). <Link href="/employes" className="font-semibold underline">Renseigner le coût horaire</Link> dans la fiche du salarié concerné.</div>}
    {peutUtiliserIA && <AnalyseRentabiliteIA chantiers={(chantiersIA ?? []).map((c) => ({ id: c.id, nom: c.nom }))} />}
    <section className="rounded-md border p-4 dark:border-neutral-800">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><h2 className="font-semibold">Lecture rapide des chantiers</h2><p className="text-xs text-neutral-500">Les huit chantiers ayant le plus de marge. Bleu : chiffre d’affaires, orange : coûts engagés.</p></div><div className="flex gap-3 text-xs text-neutral-500"><span><i className="mr-1 inline-block h-2 w-2 bg-blue-500"/>CA HT</span><span><i className="mr-1 inline-block h-2 w-2 bg-orange-400"/>Coûts</span></div></div>
      <div className="space-y-3">{meilleursChantiers.length ? meilleursChantiers.map((ligne) => { const cout = ligne.factureHt-ligne.marge; return <Link key={ligne.id} href={`/chantiers/${ligne.id}`} className="grid gap-2 rounded-md p-2 hover:bg-neutral-50 dark:hover:bg-neutral-900 sm:grid-cols-[180px_1fr_110px] sm:items-center"><div className="min-w-0"><p className="truncate text-sm font-medium">{ligne.nom}</p><p className="truncate text-xs text-neutral-500">{ligne.clientNom}</p></div><div className="space-y-1"><div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800"><div className="h-2 rounded-full bg-blue-500" style={{width:`${ligne.factureHt/plusGrandVolume*100}%`}}/></div><div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800"><div className="h-2 rounded-full bg-orange-400" style={{width:`${Math.max(0,cout)/plusGrandVolume*100}%`}}/></div></div><div className={`text-right text-sm font-semibold ${ligne.marge>=0?"text-green-700":"text-red-700"}`}>{euros(ligne.marge)}<p className="text-xs font-normal text-neutral-500">{ligne.taux===null?"non facturé":`${ligne.taux.toFixed(1)} %`}</p></div></Link> }) : <p className="py-8 text-center text-sm text-neutral-500">Aucune activité chiffrée à afficher.</p>}</div>
    </section>
    <div>
      <h2 className="mb-2 font-semibold">Détail de tous les chantiers</h2>
      <p className="mb-1 text-xs text-neutral-500">{totaux.nbChantiers} chantier(s){nbPages > 1 ? ` — page ${page}/${nbPages}` : ""}. Les totaux ci-dessus portent sur tous les chantiers.</p>
      <p className="mb-3 text-xs text-neutral-500">Faites glisser le tableau horizontalement sur téléphone.</p>
      <div className="overflow-x-auto rounded-md border dark:border-neutral-800"><table className="w-full min-w-[1380px] table-fixed text-sm"><thead className="sticky top-0 bg-neutral-100 text-left text-xs uppercase text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300"><tr><th className="w-52 px-3 py-3">Chantier</th><th className="w-40 px-3">Client</th><th className="w-28 px-3 text-right">Facturé HT</th><th className="w-20 px-3 text-right">Heures</th><th className="w-28 px-3 text-right">Coût MO</th><th className="w-28 px-3 text-right">Achats</th><th className="w-28 px-3 text-right">Stock</th><th className="w-32 px-3 text-right">Sous-traitance</th><th className="w-28 px-3 text-right">Frais</th><th className="w-28 px-3 text-right">Indemnités</th><th className="w-28 px-3 text-right">Marge</th><th className="w-24 px-3 text-right">Taux</th></tr></thead><tbody>{lignes.map((ligne,index)=><tr key={ligne.id} className={`border-t dark:border-neutral-800 ${index%2?"bg-neutral-50/60 dark:bg-neutral-900/40":""}`}><td className="px-3 py-3"><Link href={`/chantiers/${ligne.id}`} className="font-medium hover:underline">{ligne.nom}</Link><div className="font-mono text-xs text-neutral-400">{ligne.reference_interne}</div></td><td className="truncate px-3" title={ligne.clientNom}>{ligne.clientNom}</td><td className="px-3 text-right font-mono">{euros(ligne.factureHt)}</td><td className="px-3 text-right font-mono">{heures(ligne.heures)}</td><td className="px-3 text-right font-mono">{euros(ligne.coutMainOeuvre)}{ligne.coutHoraireManquant && <span title="Coût horaire manquant pour au moins un salarié : coût sous-estimé" className="ml-1 text-amber-600">⚠</span>}</td><td className="px-3 text-right font-mono">{euros(ligne.coutAchats)}</td><td className="px-3 text-right font-mono">{euros(ligne.coutStock)}</td><td className="px-3 text-right font-mono">{euros(ligne.coutSousTraitance)}</td><td className="px-3 text-right font-mono">{euros(ligne.coutNotesFrais)}</td><td className="px-3 text-right font-mono">{euros(ligne.coutIndemnitesPaie)}</td><td className={`px-3 text-right font-mono font-semibold ${ligne.marge>=0?"bg-green-50 text-green-700 dark:bg-green-950/30":"bg-red-50 text-red-700 dark:bg-red-950/30"}`}>{euros(ligne.marge)}</td><td className="px-3 text-right"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${ligne.taux===null?"bg-neutral-100 text-neutral-500":ligne.taux>=20?"bg-green-100 text-green-800":ligne.taux>=0?"bg-amber-100 text-amber-800":"bg-red-100 text-red-800"}`}>{ligne.taux===null?"—":`${ligne.taux.toFixed(1)} %`}</span></td></tr>)}</tbody></table></div>
      {nbPages > 1 && <nav aria-label="Pagination des chantiers" className="mt-3 flex items-center justify-between text-sm">{page > 1 ? <Link href={page === 2 ? "/rentabilite" : `/rentabilite?page=${page - 1}`} className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700">← Page précédente</Link> : <span />}<span className="text-neutral-500">Page {page} sur {nbPages}</span>{page < nbPages ? <Link href={`/rentabilite?page=${page + 1}`} className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700">Page suivante →</Link> : <span />}</nav>}
    </div>
  </div></main>;
}
