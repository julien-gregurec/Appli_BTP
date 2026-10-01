import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { euros } from "@/lib/devis";
import { TYPES_JUSTIFICATIF, statutNoteFrais } from "@/lib/notes-frais";
import { creerNoteFraisAction } from "@/app/actions/notes-frais";
import { permissionsUtilisateur } from "@/lib/permissions";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { ExpenseAmountFields } from "@/components/ExpenseAmountFields";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Lien as Link } from "@/components/Lien";
import { LIEUX_HORS_CHANTIER, libelleAffectationDepense } from "@/lib/expenses/affectation";
import { lirePageNotesFrais, lireSyntheseNotesFraisParEmploye, type GroupeNotesFrais } from "@/lib/pilotage-agregats";
import { lireCurseur, lireOptionsChantiers } from "@/lib/fiches-agregats";

const TAILLE_PAGE = 300;

const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export default async function NotesFraisPage({ searchParams }: { searchParams: Promise<{ error?: string; statut?: string; categorie?: string; chantier?: string; employe?: string; apres?: string }> }) {
  const filtres = await searchParams;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const prototype = isEmailLoginDisabled();
  const permissions = await permissionsUtilisateur(ctx);
  const peutExporter = permissions?.includes("exporter_notes_frais") ?? false;
  const peutAdministrer = permissions?.includes("administrer_archivage_notes_frais") ?? false;
  const peutGererEquipe = permissions === null || permissions.includes("gerer_notes_frais") || permissions.includes("verifier_notes_frais") || permissions.includes("comptabiliser_notes_frais");
  if (prototype) return <main className="p-8"><div className="mx-auto max-w-4xl space-y-4"><h1 className="text-xl font-semibold">Notes de frais et justificatifs</h1><p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><strong>Compte utilisateur individuel requis.</strong><br />Les justificatifs personnels nécessitent une identité individuelle et ne sont pas disponibles depuis un accès partagé.</p></div></main>;

  const [{ data: employe }, { data: categories }, { data: chantiers }, { data: grandsDeplacements }] = await Promise.all([
    supabase.from("employes").select("id,prenom,nom").eq("entreprise_id", ctx.entrepriseId).eq("utilisateur_id", ctx.userId).maybeSingle(),
    supabase.from("categories_notes_frais").select("code,libelle").eq("entreprise_id", ctx.entrepriseId).eq("actif", true).order("ordre"),
    lireOptionsChantiers(supabase,ctx.entrepriseId).then((data)=>({data})),
    supabase.from("grands_deplacements").select("id,destination,date_debut,date_fin").eq("entreprise_id", ctx.entrepriseId).in("statut", ["brouillon","soumis","valide"]).order("date_debut", { ascending: false }).limit(100),
  ]);
  // Liste paginée par curseur (300 par page, notes_frais_page) ; groupes de
  // validation par salarié calculés en base sur TOUTES les notes visibles et
  // filtrées (notes_frais_synthese_employes) : ils ne portaient que sur les 300
  // notes les plus récentes de l'entreprise, et une note en attente plus
  // ancienne disparaissait de la validation. Visibilité RLS évaluée une fois.
  const curseur = lireCurseur(filtres.apres);
  const filtresListe = { statut: filtres.statut, categorie: filtres.categorie, chantierId: filtres.chantier, employeId: peutGererEquipe ? filtres.employe : undefined };
  const [page, syntheses] = await Promise.all([
    lirePageNotesFrais(supabase, ctx.entrepriseId, filtresListe, TAILLE_PAGE, curseur),
    peutGererEquipe
      ? lireSyntheseNotesFraisParEmploye(supabase, ctx.entrepriseId, { statut: filtres.statut, categorie: filtres.categorie, chantierId: filtres.chantier, employeId: filtres.employe }).catch((err): GroupeNotesFrais[] | null => { console.error("[notes-frais] synthèse indisponible", err instanceof Error ? err.message : err); return null; })
      : Promise.resolve([] as GroupeNotesFrais[]),
  ]);
  const liste = page.lignes;
  const un = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;
  const notesParEmploye = liste.reduce((map, note) => { const emp = un(note.employe as {id:string}|{id:string}[]|null); const cle = emp?.id ?? "sans-employe"; map.set(cle, [...(map.get(cle) ?? []), note]); return map; }, new Map<string, typeof liste>());
  const groupes = (syntheses ?? []).map((s) => { const id = s.employeId ?? "sans-employe"; return { id, employeId: s.employeId, nom: s.nom ?? "Employé non relié", notes: notesParEmploye.get(id) ?? [], nb: s.nb, total: s.total, aVerifier: s.aVerifier }; });
  const lienFiltres = (extra: Record<string, string>) => { const q = new URLSearchParams(); for (const cle of ["statut", "categorie", "chantier", "employe"] as const) { if (filtres[cle]) q.set(cle, filtres[cle]!); } for (const [cle, valeur] of Object.entries(extra)) q.set(cle, valeur); const t = q.toString(); return `/notes-frais${t ? `?${t}` : ""}`; };

  return <main className="p-8"><div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-semibold">Notes de frais et justificatifs</h1><p className="text-sm text-neutral-500">Création personnelle, validation, intégrité et transmission comptable.</p></div><div className="flex gap-2">{peutExporter && <Link href="/notes-frais/exports" className="rounded-md border px-3 py-2 text-sm font-medium">Exports comptables</Link>}{peutAdministrer && <Link href="/parametres/notes-frais" className="rounded-md border px-3 py-2 text-sm font-medium">Paramètres d’archivage</Link>}</div></div>
    {filtres.error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{filtres.error}</p>}
    {!employe && <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">Votre compte doit être lié à une fiche employé active pour créer une dépense.</p>}

    <section className="rounded-lg border p-4"><h2 className="font-semibold">Nouvelle dépense</h2><p className="mt-1 text-xs text-neutral-500">Le brouillon sera créé d’abord. Vous pourrez ensuite photographier ou importer plusieurs pages.</p>
      <form action={creerNoteFraisAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-neutral-500">Date du justificatif<input name="date_frais" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={`${input} mt-1`} /></label>
        <label className="text-xs text-neutral-500">Fournisseur / commerçant<input name="fournisseur" placeholder="Nom du fournisseur" className={`${input} mt-1`} /></label>
        <label className="text-xs text-neutral-500">Catégorie<select name="categorie" className={`${input} mt-1`}>{(categories ?? []).map((c) => <option key={c.code} value={c.code}>{c.libelle}</option>)}</select></label>
        <label className="text-xs text-neutral-500">Type de justificatif<select name="type_document_principal" className={`${input} mt-1`}>{TYPES_JUSTIFICATIF.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}</select></label>
        <ExpenseAmountFields />
        <label className="text-xs text-neutral-500">Affectation<SearchableSelect name="chantier_id" defaultValue={(chantiers??[]).some((c)=>c.id===filtres.chantier)?filtres.chantier:"hors:sans_chantier"} options={[...LIEUX_HORS_CHANTIER.map((lieu) => ({ value: lieu.valeur, label: lieu.libelle, search: "hors chantier frais généraux" })), ...(chantiers ?? []).map((c) => ({ value: c.id, label: c.nom }))]} placeholder="Chantier, dépôt ou bureau…" required className="mt-1" /></label>
        <label className="text-xs text-neutral-500">Grand déplacement<select name="grand_deplacement_id" className={`${input} mt-1`}><option value="">Aucun</option>{(grandsDeplacements??[]).map((mission)=><option key={mission.id} value={mission.id}>{mission.destination} · {mission.date_debut} → {mission.date_fin}</option>)}</select></label>
        <label className="text-xs text-neutral-500">Moyen de paiement<select name="moyen_paiement" className={`${input} mt-1`}><option value="">Non renseigné</option><option value="carte_entreprise">Carte entreprise</option><option value="carte_personnelle">Carte personnelle</option><option value="especes">Espèces</option><option value="virement">Virement</option><option value="autre">Autre</option></select></label>
        <label className="text-xs text-neutral-500">Devise<select name="devise" className={`${input} mt-1`}><option value="EUR">EUR</option><option value="CHF">CHF</option><option value="GBP">GBP</option><option value="USD">USD</option></select></label>
        <label className="text-xs text-neutral-500 sm:col-span-2 lg:col-span-4">Commentaire<textarea name="commentaire_salarie" rows={2} className={`${input} mt-1`} /></label>
        <button disabled={!employe} className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 sm:col-span-2 lg:col-span-4">Créer le brouillon et ajouter le justificatif</button>
      </form>
    </section>

    <form method="get" className="flex flex-wrap gap-2 rounded-lg border p-3"><select name="statut" defaultValue={filtres.statut ?? ""} className="rounded-md border px-3 py-2 text-sm"><option value="">Tous les statuts</option>{["brouillon","soumis","en_verification","correction_demandee","valide","refuse","exporte_comptabilite","verrouille","archive"].map((s) => <option key={s} value={s}>{statutNoteFrais(s).libelle}</option>)}</select><select name="categorie" defaultValue={filtres.categorie ?? ""} className="rounded-md border px-3 py-2 text-sm"><option value="">Toutes les catégories</option>{(categories ?? []).map((c) => <option key={c.code} value={c.code}>{c.libelle}</option>)}</select><button className="rounded-md border px-3 py-2 text-sm">Filtrer</button>{(filtres.statut||filtres.categorie||filtres.chantier||filtres.employe)&&<Link href="/notes-frais" className="rounded-md border px-3 py-2 text-sm">Effacer</Link>}</form>

    {peutGererEquipe&&<section className="space-y-3"><div><h2 className="font-semibold">Validation regroupée par employé</h2><p className="text-sm text-neutral-500">Ouvrez une ligne pour contrôler les justificatifs d’un employé avant validation. Nombres et totaux portent sur toutes les notes filtrées.</p>{syntheses===null&&<p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">Synthèse par employé indisponible : réessayez.</p>}</div><div className="grid gap-3">{groupes.map(groupe=><details key={groupe.id} open={filtres.employe===groupe.id||groupe.aVerifier>0} className="rounded-lg border"><summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4"><div><strong>{groupe.nom}</strong><p className="text-xs text-neutral-500">{groupe.nb} dépense{groupe.nb>1?"s":""} · {groupe.aVerifier} à contrôler</p></div><div className="flex items-center gap-3"><span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">{groupe.aVerifier} en attente</span><strong className="font-mono">{euros(groupe.total)}</strong></div></summary><div className="divide-y border-t dark:divide-neutral-800">{groupe.notes.map(note=>{const statut=statutNoteFrais(note.statut);const chantier=un(note.chantier as {nom:string}|{nom:string}[]|null);return <Link key={note.id} href={`/notes-frais/${note.id}`} className="grid gap-1 p-3 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900 sm:grid-cols-[120px_1fr_1fr_auto_auto] sm:items-center"><span className="font-mono font-semibold">{note.reference}</span><span>{note.fournisseur??"Sans fournisseur"}</span><span className="text-neutral-500">{libelleAffectationDepense(chantier?.nom,note.lieu_hors_chantier)}</span><span style={{color:statut.couleur}}>{statut.libelle}</span><strong className="font-mono">{euros(note.montant_ttc)}</strong></Link>})}{groupe.nb>groupe.notes.length&&<p className="p-3 text-xs text-neutral-500">{groupe.notes.length} affichée{groupe.notes.length>1?"s":""} sur {groupe.nb} sur cette page. {groupe.employeId&&<><Link href={lienFiltres({employe:groupe.employeId})} className="underline">Toutes ses notes</Link>{groupe.aVerifier>0&&<> · <Link href={lienFiltres({employe:groupe.employeId,statut:"soumis"})} className="underline">ses notes soumises</Link></>}</>}</p>}</div></details>)}</div></section>}

    {!peutGererEquipe&&<div className="grid gap-3 md:hidden">{liste.map((n) => { const st = statutNoteFrais(n.statut); const emp = un(n.employe as {prenom:string;nom:string}|{prenom:string;nom:string}[]|null); const chantier = un(n.chantier as {nom:string}|{nom:string}[]|null); return <Link key={n.id} href={`/notes-frais/${n.id}`} className="rounded-lg border p-4"><div className="flex justify-between gap-3"><strong>{n.reference}</strong><span className="text-xs" style={{color:st.couleur}}>{st.libelle}</span></div><p className="mt-2 text-sm">{n.fournisseur ?? "Sans fournisseur"} · {euros(n.montant_ttc)}</p><p className="mt-1 text-xs text-neutral-500">{n.date_frais} · {emp ? `${emp.prenom} ${emp.nom}` : "—"} · {libelleAffectationDepense(chantier?.nom,n.lieu_hors_chantier)}</p>{n.verrouille_at && <span className="mt-2 inline-block rounded-full bg-neutral-900 px-2 py-1 text-[10px] text-white">Document verrouillé</span>}</Link>; })}{!liste.length && <p className="rounded-lg border border-dashed p-8 text-center text-sm text-neutral-500">Aucune dépense accessible.</p>}</div>}
    <div className="hidden overflow-x-auto rounded-lg border md:block"><table className="w-full text-sm"><thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500"><tr><th className="px-3 py-2">Référence</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Employé</th><th className="px-3 py-2">Fournisseur</th><th className="px-3 py-2">Affectation</th><th className="px-3 py-2 text-right">TTC</th><th className="px-3 py-2">Statut</th></tr></thead><tbody>{liste.map((n) => { const st = statutNoteFrais(n.statut); const emp = un(n.employe as {prenom:string;nom:string}|{prenom:string;nom:string}[]|null); const chantier = un(n.chantier as {nom:string}|{nom:string}[]|null); return <tr key={n.id} className="border-t"><td className="px-3 py-2"><Link href={`/notes-frais/${n.id}`} className="font-mono font-semibold hover:underline">{n.reference}</Link></td><td className="px-3 py-2">{n.date_frais}</td><td className="px-3 py-2">{emp ? `${emp.prenom} ${emp.nom}` : "—"}</td><td className="px-3 py-2">{n.fournisseur ?? "—"}</td><td className="px-3 py-2">{libelleAffectationDepense(chantier?.nom,n.lieu_hors_chantier)}</td><td className="px-3 py-2 text-right font-mono">{euros(n.montant_ttc)}</td><td className="px-3 py-2"><span style={{color:st.couleur}}>{st.libelle}</span>{n.verrouille_at && " 🔒"}</td></tr>; })}{!liste.length && <tr><td colSpan={7} className="p-8 text-center text-neutral-500">Aucune dépense accessible.</td></tr>}</tbody></table></div>
    {(curseur||page.suivant)&&<nav aria-label="Pagination des notes de frais" className="mb-20 flex items-center justify-between text-sm">{curseur?<Link href={lienFiltres({})} className="rounded-md border px-3 py-2">← Plus récentes</Link>:<span/>}{page.suivant?<Link href={lienFiltres({apres:page.suivant})} className="rounded-md border px-3 py-2">Plus anciennes →</Link>:<span/>}</nav>}
  </div></main>;
}
