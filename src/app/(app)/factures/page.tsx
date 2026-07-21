import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { FACTURE_STATUTS, statutFacture } from "@/lib/factures";
import { euros } from "@/lib/devis";
import { nomClient } from "@/lib/chantier-statuts";
import { permissionsUtilisateur } from "@/lib/permissions";
import { DEPENSE_CATEGORIES, DEPENSE_STATUTS } from "@/lib/depenses";
import { Lien as Link } from "@/components/Lien";

const TAILLE_PAGE = 25;

type LigneFacture = {
  id: string; numero: string | null; statut: string; date_emission: string; date_echeance: string | null;
  montant_ttc: number; montant_paye: number;
  client_nom: string | null; client_prenom: string | null; client_societe: string | null;
};
type LigneDepense = {
  id: string; numero_piece: string; categorie: string; date_piece: string; date_echeance: string | null;
  statut: string; montant_ttc: number; montant_regle: number;
  fournisseur_nom: string | null; chantier_id: string | null; chantier_nom: string | null;
};

function parametresPage(base: string, q: string, statut: string, p: number, extra?: Record<string, string>) {
  const sp = new URLSearchParams(extra);
  if (q) sp.set("q", q);
  if (statut) sp.set("statut", statut);
  if (p > 1) sp.set("page", String(p));
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

export default async function FacturesPage({ searchParams }: { searchParams: Promise<{ q?: string; statut?: string; origine?: string; page?: string }> }) {
  const { q = "", statut = "", origine = "clients", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const permissions = await permissionsUtilisateur(ctx);
  const peutVoirAchats = permissions === null || permissions.includes("acces_achats");
  const vueFournisseurs = origine === "fournisseurs" && peutVoirAchats;

  if (vueFournisseurs) {
    const { data } = await supabase.rpc("depenses_fournisseurs_liste_paginee", {
      p_entreprise_id: ctx.entrepriseId, p_recherche: q, p_statut: statut, p_page: page, p_taille: TAILLE_PAGE,
    });
    const resultat = (data ?? {}) as { lignes?: LigneDepense[]; total?: number; montant_ttc?: number; montant_regle?: number; pages?: number };
    const liste = resultat.lignes ?? [];
    const total = resultat.montant_ttc ?? 0;
    const regle = resultat.montant_regle ?? 0;
    const nbTotal = resultat.total ?? 0;
    const nbPages = resultat.pages ?? 1;

    return <main className="p-4 sm:p-8"><div className="mx-auto max-w-6xl space-y-6">
      <EnteteFactures fournisseurActif afficherFournisseurs />
      <p className="text-sm text-neutral-500">{nbTotal} facture(s) fournisseur{nbPages > 1 ? ` — page ${page}/${nbPages}` : ""}</p>
      <div className="grid gap-3 sm:grid-cols-3"><Indicateur label="Total fournisseurs" valeur={total}/><Indicateur label="Total réglé" valeur={regle} couleur="text-green-700"/><Indicateur label="Reste à payer" valeur={Math.max(0,total-regle)} couleur="text-amber-700"/></div>
      <form method="get" className="flex flex-wrap gap-2 rounded-md border p-3 dark:border-neutral-800"><input type="hidden" name="origine" value="fournisseurs"/><input name="q" defaultValue={q} placeholder="Numéro, fournisseur ou chantier" className="min-w-56 flex-1 rounded-md border px-3 py-2 text-sm dark:bg-neutral-900"/><select name="statut" defaultValue={statut} className="rounded-md border px-3 py-2 text-sm dark:bg-neutral-900"><option value="">Tous les statuts</option>{Object.entries(DEPENSE_STATUTS).map(([cle,valeur])=><option key={cle} value={cle}>{valeur.label}</option>)}</select><button className="rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white">Filtrer</button>{(q||statut)&&<Link href="/factures?origine=fournisseurs" className="rounded-md border px-4 py-2 text-sm">Réinitialiser</Link>}</form>
      {!liste.length?<p className="rounded-md border border-dashed p-8 text-center text-sm text-neutral-500">Aucune facture fournisseur ne correspond aux filtres.</p>:<>
        <div className="grid gap-3 md:hidden">{liste.map(facture=>{const infoStatut=DEPENSE_STATUTS[facture.statut];return <article key={facture.id} className="space-y-3 rounded-lg border p-4 dark:border-neutral-800"><div className="flex items-start justify-between gap-3"><div><Link href={`/depenses/${facture.id}`} className="font-mono text-sm font-semibold hover:underline">{facture.numero_piece}</Link><p className="text-sm">{facture.fournisseur_nom??"Fournisseur"}</p></div><span className="text-xs" style={{color:infoStatut?.couleur}}>{infoStatut?.label??facture.statut}</span></div><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-neutral-500">Date</dt><dd>{facture.date_piece}</dd></div><div><dt className="text-xs text-neutral-500">Chantier</dt><dd>{facture.chantier_id?<Link href={`/chantiers/${facture.chantier_id}`} className="hover:underline">{facture.chantier_nom}</Link>:"Frais généraux"}</dd></div><div><dt className="text-xs text-neutral-500">TTC</dt><dd className="font-mono font-semibold">{euros(facture.montant_ttc)}</dd></div><div><dt className="text-xs text-neutral-500">Reste</dt><dd className="font-mono font-semibold text-amber-700">{euros(Math.max(0,Number(facture.montant_ttc)-Number(facture.montant_regle)))}</dd></div></dl><Link href={`/depenses/${facture.id}`} className="block rounded-md border px-3 py-2 text-center text-sm font-medium">Ouvrir et classer la facture</Link></article>;})}</div>
        <div className="hidden overflow-x-auto rounded-md border dark:border-neutral-800 md:block"><table className="w-full text-sm"><thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900"><tr><th className="px-4 py-2">Numéro</th><th>Fournisseur</th><th>Chantier</th><th>Catégorie</th><th>Statut</th><th className="text-right">TTC</th><th className="px-4 text-right">Reste</th></tr></thead><tbody>{liste.map(facture=>{const infoStatut=DEPENSE_STATUTS[facture.statut];return <tr key={facture.id} className="border-t dark:border-neutral-800"><td className="px-4 py-2"><Link href={`/depenses/${facture.id}`} className="font-mono text-xs font-medium hover:underline">{facture.numero_piece}</Link><span className="block text-xs text-neutral-500">{facture.date_piece}</span></td><td>{facture.fournisseur_nom??"—"}</td><td>{facture.chantier_id?<Link href={`/chantiers/${facture.chantier_id}`} className="hover:underline">{facture.chantier_nom}</Link>:<span className="text-neutral-500">Frais généraux</span>}</td><td>{DEPENSE_CATEGORIES[facture.categorie]??facture.categorie}</td><td style={{color:infoStatut?.couleur}}>{infoStatut?.label??facture.statut}</td><td className="text-right font-mono">{euros(facture.montant_ttc)}</td><td className="px-4 text-right font-mono">{euros(Math.max(0,Number(facture.montant_ttc)-Number(facture.montant_regle)))}</td></tr>;})}</tbody></table></div>
      </>}
      {nbPages > 1 && <Pagination base="/factures" q={q} statut={statut} page={page} nbPages={nbPages} extra={{ origine: "fournisseurs" }} />}
    </div></main>;
  }

  const { data } = await supabase.rpc("factures_liste_paginee", {
    p_entreprise_id: ctx.entrepriseId, p_recherche: q, p_statut: statut, p_page: page, p_taille: TAILLE_PAGE,
  });
  const resultat = (data ?? {}) as { lignes?: LigneFacture[]; total?: number; montant_ttc?: number; montant_paye?: number; pages?: number };
  const liste = resultat.lignes ?? [];
  const total = resultat.montant_ttc ?? 0;
  const paye = resultat.montant_paye ?? 0;
  const nbTotal = resultat.total ?? 0;
  const nbPages = resultat.pages ?? 1;

  return <main className="p-4 sm:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <EnteteFactures fournisseurActif={false} afficherFournisseurs={peutVoirAchats}/>
    <p className="text-sm text-neutral-500">{nbTotal} facture(s) client{nbPages > 1 ? ` — page ${page}/${nbPages}` : ""}</p>
    <div className="grid gap-3 sm:grid-cols-3"><Indicateur label="Total facturé" valeur={total}/><Indicateur label="Total encaissé" valeur={paye} couleur="text-green-700"/><Indicateur label="Reste à encaisser" valeur={Math.max(0,total-paye)} couleur="text-amber-700"/></div>
    <form method="get" className="flex flex-wrap gap-2 rounded-md border p-3 dark:border-neutral-800"><input name="q" defaultValue={q} placeholder="Numéro ou client" className="min-w-56 flex-1 rounded-md border px-3 py-2 text-sm dark:bg-neutral-900"/><select name="statut" defaultValue={statut} className="rounded-md border px-3 py-2 text-sm dark:bg-neutral-900"><option value="">Tous les statuts</option>{FACTURE_STATUTS.map(option=><option key={option.cle} value={option.cle}>{option.libelle}</option>)}</select><button className="rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white">Filtrer</button>{(q||statut)&&<Link href="/factures" className="rounded-md border px-4 py-2 text-sm">Réinitialiser</Link>}</form>
    {!liste.length?<p className="rounded-md border border-dashed p-8 text-center text-sm text-neutral-500">{nbTotal===0 && !q && !statut?"Aucune facture client.":"Aucune facture ne correspond aux filtres."}</p>:<>
      <div className="grid gap-3 md:hidden">{liste.map(facture=>{const info=statutFacture(facture.statut);const client={nom:facture.client_nom,prenom:facture.client_prenom,societe:facture.client_societe};const restant=Math.max(0,Number(facture.montant_ttc)-Number(facture.montant_paye));return <article key={facture.id} className="space-y-3 rounded-lg border p-4 dark:border-neutral-800"><div className="flex items-start justify-between gap-3"><div><Link href={`/factures/${facture.id}`} className="font-mono text-sm font-semibold hover:underline">{facture.numero??"— brouillon —"}</Link><p className="text-sm">{facture.client_nom||facture.client_societe?nomClient(client):"Client non renseigné"}</p></div><span className="text-xs" style={{color:info.couleur}}>{info.libelle}</span></div><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-neutral-500">Date</dt><dd>{facture.date_emission}</dd></div><div><dt className="text-xs text-neutral-500">Échéance</dt><dd>{facture.date_echeance??"—"}</dd></div><div><dt className="text-xs text-neutral-500">TTC</dt><dd className="font-mono font-semibold">{euros(facture.montant_ttc)}</dd></div><div><dt className="text-xs text-neutral-500">Reste</dt><dd className="font-mono font-semibold text-amber-700">{euros(restant)}</dd></div></dl><Link href={`/factures/${facture.id}`} className="block rounded-md border px-3 py-2 text-center text-sm font-medium">Ouvrir, envoyer ou télécharger</Link></article>;})}</div>
      <div className="hidden overflow-x-auto rounded-md border dark:border-neutral-800 md:block"><table className="w-full text-sm"><thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900"><tr><th className="px-4 py-2">Numéro</th><th>Client</th><th>Date</th><th>Statut</th><th className="text-right">TTC</th><th className="px-4 text-right">Payé</th></tr></thead><tbody>{liste.map(facture=>{const info=statutFacture(facture.statut);const client={nom:facture.client_nom,prenom:facture.client_prenom,societe:facture.client_societe};return <tr key={facture.id} className="border-t dark:border-neutral-800"><td className="px-4 py-2"><Link href={`/factures/${facture.id}`} className="font-mono text-xs font-medium hover:underline">{facture.numero??"— brouillon —"}</Link></td><td>{facture.client_nom||facture.client_societe?nomClient(client):"—"}</td><td>{facture.date_emission}</td><td style={{color:info.couleur}}>{info.libelle}</td><td className="text-right font-mono">{euros(facture.montant_ttc)}</td><td className="px-4 text-right font-mono">{euros(facture.montant_paye)}</td></tr>;})}</tbody></table></div>
    </>}
    {nbPages > 1 && <Pagination base="/factures" q={q} statut={statut} page={page} nbPages={nbPages} />}
  </div></main>;
}

function EnteteFactures({fournisseurActif,afficherFournisseurs}:{fournisseurActif:boolean;afficherFournisseurs:boolean}){return <div className="space-y-4"><div><h1 className="text-xl font-semibold">Factures</h1><p className="text-sm text-neutral-500">Classement séparé des ventes clients et des achats fournisseurs.</p></div><nav className="flex gap-2 border-b"><Link href="/factures" className={`border-b-2 px-3 py-2 text-sm font-medium ${!fournisseurActif?"border-[#cfa846] text-[#8a6718]":"border-transparent text-neutral-500"}`}>Factures clients</Link>{afficherFournisseurs&&<Link href="/factures?origine=fournisseurs" className={`border-b-2 px-3 py-2 text-sm font-medium ${fournisseurActif?"border-[#cfa846] text-[#8a6718]":"border-transparent text-neutral-500"}`}>Factures fournisseurs</Link>}</nav></div>}
function Indicateur({label,valeur,couleur=""}:{label:string;valeur:number;couleur?:string}){return <div className="rounded-md border p-4 dark:border-neutral-800"><div className="text-xs text-neutral-500">{label}</div><div className={`mt-1 font-mono text-xl font-semibold ${couleur}`}>{euros(valeur)}</div></div>}
function Pagination({base,q,statut,page,nbPages,extra}:{base:string;q:string;statut:string;page:number;nbPages:number;extra?:Record<string,string>}){return <div className="flex items-center justify-between text-sm">{page>1?<Link href={parametresPage(base,q,statut,page-1,extra)} className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700">← Page précédente</Link>:<span/>}<span className="text-neutral-500">Page {page} sur {nbPages}</span>{page<nbPages?<Link href={parametresPage(base,q,statut,page+1,extra)} className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700">Page suivante →</Link>:<span/>}</div>;}
